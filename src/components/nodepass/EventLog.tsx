
"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Rss, ChevronRight, ChevronDown, ServerIcon, SmartphoneIcon, Filter, XCircle, AlertTriangle, CheckCircle, Loader2, KeyRound } from 'lucide-react';
import type { Instance, InstanceEvent } from '@/types/nodepass';
import { getEventsUrl } from '@/lib/api';
import { InstanceStatusBadge } from './InstanceStatusBadge';
import { useToast } from '@/hooks/use-toast';

const ALL_EVENT_TYPES: InstanceEvent['type'][] = ['initial', 'create', 'update', 'delete', 'shutdown', 'error'];
const ALL_LOG_LEVELS = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'];
const RECONNECT_DELAY_MS = 5000;
const MAX_LOG_LINES = 200;
const LOG_LINE_TRUNCATE_LENGTH = 150; 

function stripAnsiCodes(str: string): string {
  if (typeof str !== 'string') return str;
  // eslint-disable-next-line no-control-regex
  const ansiRegex = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
  return str.replace(ansiRegex, '');
}

function parseLogLevel(logMessage: string): string | undefined {
  if (typeof logMessage !== 'string') return undefined;
  const cleanedMessage = stripAnsiCodes(logMessage);
  const match = cleanedMessage.match(/\b(DEBUG|INFO|WARN|ERROR|FATAL)\b/i);
  return match ? match[1].toUpperCase() : undefined;
}

interface EventLogProps {
  apiId: string | null;
  apiName: string | null;
  apiRoot: string | null;
  apiToken: string | null;
}

export function EventLog({ apiId, apiRoot, apiToken, apiName }: EventLogProps) {
  const [events, setEvents] = useState<InstanceEvent[]>([]);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [uiConnectionStatus, setUiConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error' | 'idle'>('idle');
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);


  const { toast } = useToast();

  const abortControllerRef = useRef<AbortController | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef<number>(0);
  const hasLoggedSuccessfulConnectionRef = useRef<boolean>(false);
  const currentApiIdRef = useRef<string | null>(null);
  const isMountedRef = useRef<boolean>(false);

  const [selectedEventTypes, setSelectedEventTypes] = useState<Set<InstanceEvent['type']>>(new Set(ALL_EVENT_TYPES.filter(t => t !== 'log')));
  const [selectedLogLevels, setSelectedLogLevels] = useState<Set<string>>(new Set());

  const addEventToLog = useCallback((newEvent: InstanceEvent) => {
    setEvents(prevEvents => {
      let updatedEvents = [newEvent, ...prevEvents];
      // Filter out old status messages if the new one is a status message
      const statusKeywords = ['正在初始化', '错误', '已连接', '已禁用', '无法建立', '服务端关闭', '事件流连接已由服务端关闭', '连接已断开'];
      if (typeof newEvent.data === 'string' && statusKeywords.some(kw => newEvent.data.includes(kw))) {
        updatedEvents = updatedEvents.filter(e => {
          if (e.id === newEvent.id) return true; // Keep the new event itself
          if (typeof e.data === 'string') {
            return !statusKeywords.some(kw => e.data.includes(kw));
          }
          return true;
        });
      }

      if (updatedEvents.length > MAX_LOG_LINES) {
        updatedEvents = updatedEvents.slice(0, MAX_LOG_LINES);
      }
      return updatedEvents;
    });
  }, []);

  const processSseMessageData = useCallback((messageBlock: string) => {
    let eventTypeFromServer = 'message'; 
    let eventDataLine = '';

    const lines = messageBlock.split('\n');
    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventTypeFromServer = line.substring('event:'.length).trim();
      } else if (line.startsWith('data:')) {
        eventDataLine = line.substring('data:'.length).trim();
      }
    }

    if (eventTypeFromServer === 'instance' && eventDataLine) {
      try {
        const serverEventPayload = JSON.parse(eventDataLine);
        let frontendEventType: InstanceEvent['type'];
        let frontendEventData: any = serverEventPayload;
        let instanceDetailsPayload: Instance | undefined = serverEventPayload.instance;
        let parsedLevel: string | undefined;

        switch (serverEventPayload.type) {
          case 'initial':
          case 'create':
          case 'update':
          case 'delete':
            frontendEventType = serverEventPayload.type;
            frontendEventData = serverEventPayload.instance || {}; 
            instanceDetailsPayload = serverEventPayload.instance;
            break;
          case 'log':
            frontendEventType = 'log';
            const rawLog = serverEventPayload.logs || '';
            parsedLevel = parseLogLevel(rawLog);
            frontendEventData = stripAnsiCodes(rawLog);
            instanceDetailsPayload = serverEventPayload.instance;
            break;
          case 'shutdown':
            frontendEventType = 'shutdown';
            frontendEventData = "主控服务已关闭，事件流中断。";
            if (abortControllerRef.current && !abortControllerRef.current.signal.aborted) {
              abortControllerRef.current.abort("Server shutdown event received");
            }
            break;
          case 'error': 
            frontendEventType = 'error';
            frontendEventData = serverEventPayload.error || serverEventPayload.message || `主控报告错误: ${JSON.stringify(serverEventPayload)}`;
            break;
          default:
            console.warn("未知服务端事件类型 (fetch):", serverEventPayload.type, serverEventPayload);
            frontendEventType = 'log';
            let genericData = `未知事件 ${serverEventPayload.type}: ${JSON.stringify(serverEventPayload.data || serverEventPayload.instance || serverEventPayload)}`;
            parsedLevel = parseLogLevel(genericData);
            frontendEventData = stripAnsiCodes(genericData);
            instanceDetailsPayload = serverEventPayload.instance;
            break;
        }
        
        const newEventToLog: InstanceEvent = {
          id: `${frontendEventType}-${Date.now()}-${Math.random()}`, // Unique ID for event
          type: frontendEventType,
          data: frontendEventData, 
          instanceDetails: instanceDetailsPayload, 
          level: parsedLevel,
          timestamp: serverEventPayload.time || new Date().toISOString(),
        };
        addEventToLog(newEventToLog);

      } catch (error) {
        console.error("解析SSE事件数据错误:", error, "原始数据:", eventDataLine);
        const errorEventToLog: InstanceEvent = {id: `parse-error-${Date.now()}`, type: 'error', data: `解析事件错误: ${stripAnsiCodes(eventDataLine)}`, timestamp: new Date().toISOString() };
        addEventToLog(errorEventToLog);
      }
    } else if (eventDataLine && !eventDataLine.startsWith('retry:')) { 
        const genericEvent: InstanceEvent = {
          id: `generic-msg-${Date.now()}`,
          type: 'log', 
          data: `通用消息: ${stripAnsiCodes(eventDataLine)}`,
          level: parseLogLevel(eventDataLine),
          timestamp: new Date().toISOString()
        };
        addEventToLog(genericEvent);
    }
  }, [addEventToLog]);

  const connectWithFetch = useCallback(async () => {
    if (!apiId || !apiRoot || !apiToken || !apiName) {
      setUiConnectionStatus('idle');
      setIsConnecting(false);
      setIsConnected(false);
      return;
    }

    if (abortControllerRef.current && !abortControllerRef.current.signal.aborted) {
      abortControllerRef.current.abort("New connection attempt or API config change, aborting previous.");
    }
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal; // Signal for this specific fetch attempt
    
    const eventsUrl = getEventsUrl(apiRoot);

    if (retryCountRef.current === 0) { 
      addEventToLog({ id: `init-${Date.now()}`, type: 'log', data: `正在初始化事件流 (fetch) 到 ${eventsUrl} (携带 X-API-Key)...`, timestamp: new Date().toISOString() });
    }
    
    setUiConnectionStatus('connecting');
    setIsConnecting(true);
    setIsConnected(false);

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    try {
      const response = await fetch(eventsUrl, {
        method: 'GET',
        headers: {
          'X-API-Key': apiToken,
          'Accept': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
        signal, // Pass the signal for this attempt
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '无法读取响应体');
        throw new Error(`HTTP ${response.status}: ${response.statusText}. ${errorBody.substring(0, 200)}`);
      }

      if (!response.body) {
        throw new Error("响应体为空，无法读取事件流。");
      }
      
      retryCountRef.current = 0; 
      if (!hasLoggedSuccessfulConnectionRef.current) {
        addEventToLog({ id: `connected-${Date.now()}`, type: 'log', data: `事件流 (fetch) 已连接。等待事件... (目标: ${eventsUrl})`, timestamp: new Date().toISOString() });
        hasLoggedSuccessfulConnectionRef.current = true;
      }
      setUiConnectionStatus('connected');
      setIsConnected(true);
      setIsConnecting(false);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (signal.aborted) break;
        const { value, done } = await reader.read();
        if (signal.aborted) break; 
        if (done) {
          if (!signal.aborted) { 
            scheduleReconnect("服务端关闭");
          }
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const messageBlocks = buffer.split('\n\n');
        buffer = messageBlocks.pop() || ''; 

        for (const block of messageBlocks) {
          if (block.trim() !== '') processSseMessageData(block);
        }
      }
    } catch (error: any) {
      if (signal.aborted) {
        // Fetch was aborted by OUR AbortController for THIS fetch attempt.
        // This is usually intentional (e.g., component unmount, new API config selected).
        // No error logging to UI or console, no reconnection attempt needed for this specific failure.
        // console.debug(`EventLog: Fetch for API "${apiName}" was intentionally aborted. Reason: ${signal.reason || 'No specific reason.'}`);
      } else {
        // This is an unexpected network or server error, and it happened while the component was mounted.
        if (isMountedRef.current) {
            setUiConnectionStatus('error');
            setIsConnected(false);
            setIsConnecting(false);

            let uiErrorMessage = `错误: ${error.message || "未知错误"}.`;
            if (String(error.message).toLowerCase().includes('failed to fetch')) {
                uiErrorMessage = `网络错误或CORS策略问题。请检查目标服务器 (${eventsUrl}) 的CORS配置及网络连通性。错误: ${error.message}`;
            }
            
            console.error(`EventLog connectWithFetch error (API: ${apiName}, URL: ${eventsUrl}): ${uiErrorMessage}`);
            
            scheduleReconnect(uiErrorMessage);
        }
      }
    }
  }, [apiId, apiRoot, apiToken, apiName, processSseMessageData, addEventToLog /* scheduleReconnect is implicitly included */]);

  const scheduleReconnect = useCallback((reason: string) => {
    if (!isMountedRef.current || (abortControllerRef.current?.signal.aborted && abortControllerRef.current.signal.reason !== "Server shutdown event received")) {
        return;
    }

    retryCountRef.current++;
    setUiConnectionStatus('disconnected'); 
    setIsConnected(false);
    setIsConnecting(false);

    const eventsUrl = apiRoot ? getEventsUrl(apiRoot) : '未知目标';
    let uiErrorMessageForLog = "";
    
    if (reason === "服务端关闭") {
      uiErrorMessageForLog = `事件流连接已由服务端关闭。`;
    } else {
      uiErrorMessageForLog = `无法建立 SSE 连接 (fetch) 到 ${eventsUrl}。原因: ${reason.substring(0,150)}... 查看服务端日志了解详情。`;
    }
    
    if (retryCountRef.current > 1) { 
      const reconnectMessage = `${uiErrorMessageForLog} ${RECONNECT_DELAY_MS / 1000}秒后尝试第 ${retryCountRef.current} 次重连...`;
      addEventToLog({ id: `reconnect-attempt-${Date.now()}`, type: 'log', data: reconnectMessage, timestamp: new Date().toISOString(), level: 'ERROR' });
    } else if (retryCountRef.current === 1 && reason !== "服务端关闭") {
        addEventToLog({ id: `first-reconnect-info-${Date.now()}`, type: 'log', data: `${uiErrorMessageForLog} 将在 ${RECONNECT_DELAY_MS / 1000}秒后尝试重连...`, timestamp: new Date().toISOString(), level: 'WARN' });
    }


    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    reconnectTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current && (!abortControllerRef.current?.signal.aborted || abortControllerRef.current?.signal.reason === "Server shutdown event received" )) {
         connectWithFetch(); 
      }
    }, RECONNECT_DELAY_MS);

  }, [apiRoot, connectWithFetch, addEventToLog, apiName]);


  useEffect(() => {
    isMountedRef.current = true;
    if (apiId && apiRoot && apiToken && apiName) {
      if (currentApiIdRef.current !== apiId) { 
        if (abortControllerRef.current && !abortControllerRef.current.signal.aborted) {
          abortControllerRef.current.abort("主控配置已更改，中止旧连接。");
        }
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
        setEvents([]); 
        retryCountRef.current = 0;
        hasLoggedSuccessfulConnectionRef.current = false; 
        currentApiIdRef.current = apiId;
        connectWithFetch(); 
      } else if (!isConnected && !isConnecting && uiConnectionStatus !== 'connected' && uiConnectionStatus !== 'connecting') {
        connectWithFetch();
      }
    } else { 
      setEvents([]);
      setUiConnectionStatus('idle');
      setIsConnected(false);
      setIsConnecting(false);
      if (abortControllerRef.current && !abortControllerRef.current.signal.aborted) {
        abortControllerRef.current.abort("主控配置无效或缺失，中止连接。");
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      currentApiIdRef.current = null;
      retryCountRef.current = 0;
      hasLoggedSuccessfulConnectionRef.current = false;
    }

    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current && !abortControllerRef.current.signal.aborted) {
        abortControllerRef.current.abort("组件卸载或依赖项更改");
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [apiId, apiRoot, apiToken, apiName, connectWithFetch, isConnected, isConnecting, uiConnectionStatus]);


  const getBadgeTextAndVariant = (type: InstanceEvent['type']): { text: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'accent' } => {
    switch (type) {
      case 'initial': return { text: '初始', variant: 'default' };
      case 'create': return { text: '已创建', variant: 'default' };
      case 'update': return { text: '已更新', variant: 'secondary' };
      case 'delete': return { text: '已删除', variant: 'destructive' };
      case 'log': return { text: '日志', variant: 'outline' };
      case 'shutdown': return { text: '关闭', variant: 'destructive'};
      case 'error': return { text: '错误', variant: 'destructive'};
      default: return { text: String(type).toUpperCase(), variant: 'outline'};
    }
  };

  const getLogLevelBadgeVariant = (level?: string): 'default' | 'secondary' | 'destructive' | 'outline' | 'accent' => {
    switch (level?.toUpperCase()) {
      case 'DEBUG': return 'secondary';
      case 'INFO': return 'default'; 
      case 'WARN': return 'accent'; 
      case 'ERROR':
      case 'FATAL':
        return 'destructive';
      default: return 'outline';
    }
  };


  const isExpandable = (event: InstanceEvent): boolean => {
    if (event.instanceDetails && (event.type === 'initial' || event.type === 'create' || event.type === 'update' || event.type === 'delete')) return true; 
    if (event.type === 'log' && typeof event.data === 'string' && event.data.length > LOG_LINE_TRUNCATE_LENGTH) return true; 
    if (event.type === 'error' && typeof event.data === 'string' && event.data.length > 0) return true; 
    return false;
  };

  let statusText = "等待配置...";
  let StatusIcon: React.ElementType = AlertTriangle; 
  let statusColorClass = "text-yellow-500";

  if (apiId && apiRoot && apiToken) {
    switch (uiConnectionStatus) {
      case 'connecting':
        statusText = "连接中...";
        StatusIcon = Loader2;
        statusColorClass = "text-yellow-500 animate-spin";
        break;
      case 'connected':
        statusText = "已连接";
        StatusIcon = CheckCircle;
        statusColorClass = "text-green-500";
        break;
      case 'disconnected':
        statusText = "连接已断开"; 
        StatusIcon = AlertTriangle;
        statusColorClass = "text-red-500";
        break;
      case 'error':
         statusText = "连接错误"; 
         StatusIcon = AlertTriangle;
         statusColorClass = "text-red-500";
        break;
      case 'idle':
      default:
        statusText = "未连接";
        StatusIcon = AlertTriangle;
        statusColorClass = "text-muted-foreground";
        break;
    }
  }

  const filteredEvents = events.filter(event => {
    if (selectedEventTypes.size > 0 && !selectedEventTypes.has(event.type)) {
      return false;
    }
    if (selectedLogLevels.size > 0 && event.type === 'log') { 
      if (!event.level || !selectedLogLevels.has(event.level)) {
        return false;
      }
    }
    return true;
  });

  const handleClearFilters = () => {
    setSelectedEventTypes(new Set(ALL_EVENT_TYPES.filter(t => t !== 'log')));
    setSelectedLogLevels(new Set());
  };

  return (
    <Card className="shadow-lg mt-6">
      <CardHeader>
        <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-4">
          <div className="flex-grow">
            <CardTitle className="flex items-center text-xl font-title">
              <Rss className="mr-2 h-5 w-5 text-primary" />
              实时事件日志
            </CardTitle>
             <CardDescription className="flex items-center font-sans">
              来自 NodePass 主控: {apiName || 'N/A'}。
              状态: <StatusIcon className={`ml-1.5 mr-1 h-4 w-4 ${statusColorClass}`} />
              <span className={`font-semibold ${statusColorClass.split(' ')[0]}`}>{statusText}</span>
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="font-sans">
                  <Filter className="mr-2 h-4 w-4" />
                  事件类型 ({selectedEventTypes.size > 0 ? selectedEventTypes.size : '全部'})
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56 font-sans">
                <DropdownMenuLabel>筛选事件类型</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {ALL_EVENT_TYPES.map((type) => (
                  <DropdownMenuCheckboxItem
                    key={type}
                    checked={selectedEventTypes.has(type)}
                    onCheckedChange={(checked) => {
                      setSelectedEventTypes((prev) => {
                        const next = new Set(prev);
                        if (checked) next.add(type);
                        else next.delete(type);
                        return next;
                      });
                    }}
                  >
                    {getBadgeTextAndVariant(type).text}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="font-sans">
                  <Filter className="mr-2 h-4 w-4" />
                  日志级别 ({selectedLogLevels.size > 0 ? selectedLogLevels.size : '全部'})
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56 font-sans">
                <DropdownMenuLabel>筛选日志级别</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {ALL_LOG_LEVELS.map((level) => (
                  <DropdownMenuCheckboxItem
                    key={level}
                    checked={selectedLogLevels.has(level)}
                    onCheckedChange={(checked) => {
                      setSelectedLogLevels((prev) => {
                        const next = new Set(prev);
                        if (checked) next.add(level);
                        else next.delete(level);
                        return next;
                      });
                    }}
                  >
                    {level}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {(selectedEventTypes.size < ALL_EVENT_TYPES.length || selectedLogLevels.size > 0) && (
              <Button variant="ghost" size="sm" onClick={handleClearFilters} className="text-muted-foreground hover:text-foreground font-sans">
                <XCircle className="mr-1.5 h-4 w-4" />
                清除
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-80 w-full rounded-md border p-3 bg-muted/20">
          {filteredEvents.length === 0 && <p className="text-sm text-muted-foreground text-center py-4 font-sans">无匹配事件。</p>}
          {filteredEvents.map((event, index) => {
            const isExpanded = expandedIndex === index;
            const { text: badgeText, variant: badgeVariant } = getBadgeTextAndVariant(event.type);
            const instance = event.instanceDetails;
            const canExpand = isExpandable(event);

            return (
              <div key={event.id || `${event.timestamp}-${index}-${event.type}`} className="py-1.5 border-b border-border/30 last:border-b-0 last:pb-0 first:pt-0">
                <div
                  className={`flex items-start space-x-2 text-sm font-sans ${canExpand ? 'cursor-pointer hover:bg-muted/50 -mx-1 px-1 rounded-sm' : ''}`}
                  onClick={() => canExpand && setExpandedIndex(isExpanded ? null : index)}
                  role={canExpand ? "button" : undefined}
                  tabIndex={canExpand ? 0 : undefined}
                  onKeyDown={(e) => {
                    if (canExpand && (e.key === 'Enter' || e.key === ' ')) {
                      setExpandedIndex(isExpanded ? null : index);
                    }
                  }}
                >
                  <div className="flex items-center shrink-0 w-6 h-[1.25rem]">
                    {canExpand && (
                      isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <Badge variant={badgeVariant} className="py-0.5 px-1.5 shadow-sm whitespace-nowrap shrink-0 self-start text-xs font-sans">
                    {badgeText}
                  </Badge>
                  {event.type === 'log' && event.level && (
                    <Badge variant={getLogLevelBadgeVariant(event.level)} className="py-0.5 px-1.5 shadow-sm whitespace-nowrap shrink-0 self-start text-xs font-sans">
                      {event.level}
                    </Badge>
                  )}
                  
                  <div className="flex-grow min-w-0">
                    {instance && (event.type === 'initial' || event.type === 'create' || event.type === 'update' || event.type === 'delete') ? (
                       <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 leading-tight">
                        <span className="font-medium text-sm">ID:</span>
                        <span
                          className="font-mono text-xs cursor-pointer hover:text-primary transition-colors duration-150"
                          title={instance.id}
                          onClick={(e) => { e.stopPropagation(); toast({ title: '已复制', description: `实例 ID ${instance.id.substring(0,12)}... 已复制。`}); navigator.clipboard.writeText(instance.id); }}
                        >
                          {instance.id === '********' ? instance.id : instance.id.substring(0, 8)}...
                        </span>
                        {instance.id === '********' ? (
                           <span className="flex items-center text-xs font-sans">
                            <KeyRound className="h-4 w-4 mr-1.5 text-yellow-500" />
                            API 密钥
                          </span>
                        ) : (
                          <Badge
                            variant={instance.type === 'server' ? 'default' : 'accent'}
                            className="items-center whitespace-nowrap text-xs font-sans"
                          >
                            {instance.type === 'server' ? <ServerIcon size={12} className="mr-1" /> : <SmartphoneIcon size={12} className="mr-1" />}
                            {instance.type === 'server' ? '服务端' : '客户端'}
                          </Badge>
                        )}
                        {instance.id === '********' ? (
                            <Badge variant="outline" className="border-yellow-500 text-yellow-600 whitespace-nowrap font-sans text-xs">
                                <KeyRound className="mr-1 h-3.5 w-3.5" />
                                监听中
                            </Badge>
                        ) : (
                            <InstanceStatusBadge status={instance.status} />
                        )}
                        <div className="flex items-center">
                          <span className="font-medium text-sm mr-1">URL:</span>
                          <span
                             className="font-mono truncate text-xs cursor-pointer hover:text-primary transition-colors duration-150"
                             title={instance.url}
                             onClick={(e) => {
                               e.stopPropagation();
                               toast({ title: '已复制', description: `URL 已复制。` });
                               navigator.clipboard.writeText(instance.url);
                             }}
                           >
                            {instance.id === '********' ? 'API 密钥 (已隐藏)' : (instance.url.length > 30 ? instance.url.substring(0, 27) + '...' : instance.url)}
                          </span>
                        </div>
                      </div>
                    ) : (
                       <p className="font-mono text-xs text-foreground/90 break-all whitespace-pre-wrap leading-relaxed">
                        {typeof event.data === 'string' && (isExpanded || !canExpand || event.data.length <= LOG_LINE_TRUNCATE_LENGTH) ? event.data : `${String(event.data).substring(0, LOG_LINE_TRUNCATE_LENGTH)}...`}
                      </p>
                    )}
                  </div>
                  <span className="font-mono text-xs text-muted-foreground whitespace-nowrap ml-auto pl-2 self-start shrink-0">
                    {new Date(event.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                  </span>
                </div>
                {isExpanded && canExpand && (
                  <div className="mt-2 ml-8 pl-4 border-l-2 border-muted/50 py-2 bg-background/30 rounded-r-md">
                    {event.instanceDetails && (event.type === 'initial' || event.type === 'create' || event.type === 'update' || event.type === 'delete') ? ( 
                      <pre className="text-xs p-2 rounded-md overflow-x-auto bg-muted/40 whitespace-pre-wrap break-all font-mono">
                        {JSON.stringify(event.instanceDetails, null, 2)}
                      </pre>
                    ) : typeof event.data === 'string' ? (
                      <p className="font-mono break-all whitespace-pre-wrap text-foreground/90 leading-relaxed text-xs">
                        {event.data}
                      </p>
                    ) : (
                       <p className="text-xs text-muted-foreground italic font-sans">无更多详情。</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
