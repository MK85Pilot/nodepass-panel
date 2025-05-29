
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
import { Rss, ChevronRight, ChevronDown, Server, Smartphone, Filter, XCircle, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';
import type { Instance, InstanceEvent } from '@/types/nodepass';
import { getEventsUrl } from '@/lib/api';
import { InstanceStatusBadge } from './InstanceStatusBadge';

interface EventLogProps {
  apiId: string | null;
  apiRoot: string | null;
  apiToken: string | null;
  apiName: string | null;
}

const ALL_EVENT_TYPES: InstanceEvent['type'][] = ['initial', 'create', 'update', 'delete', 'log', 'shutdown', 'error'];
const ALL_LOG_LEVELS = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'];
const RECONNECT_DELAY_MS = 5000;

const STATUS_MESSAGE_KEYWORDS = ['正在初始化', '错误', '已连接', '已禁用', '无法建立', '服务器关闭', '事件流连接已由服务器关闭', '连接已断开'];


function parseLogLevel(logMessage: string): string | undefined {
  if (typeof logMessage !== 'string') return undefined;
  const match = logMessage.match(/\b(DEBUG|INFO|WARN|ERROR|FATAL)\b/i);
  return match ? match[1].toUpperCase() : undefined;
}

export function EventLog({ apiId, apiRoot, apiToken, apiName }: EventLogProps) {
  const [events, setEvents] = useState<InstanceEvent[]>([]);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false); // For the very initial connection attempt
  const [uiConnectionStatus, setUiConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error' | 'idle'>('idle');


  const abortControllerRef = useRef<AbortController | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef<number>(0);
  const hasLoggedInitialConnectionRef = useRef<boolean>(false);
  const currentApiIdRef = useRef<string | null>(null);


  const [selectedEventTypes, setSelectedEventTypes] = useState<Set<InstanceEvent['type']>>(new Set());
  const [selectedLogLevels, setSelectedLogLevels] = useState<Set<string>>(new Set());

  const addEventToLog = useCallback((newEvent: InstanceEvent) => {
    setEvents((prevEvents) => {
      let filteredPrevEvents = prevEvents;
      // If the new event is a status message, filter out old status messages
      if (typeof newEvent.data === 'string' && STATUS_MESSAGE_KEYWORDS.some(kw => newEvent.data.includes(kw))) {
        filteredPrevEvents = prevEvents.filter(e => 
          !(typeof e.data === 'string' && STATUS_MESSAGE_KEYWORDS.some(kw => e.data.includes(kw)))
        );
      }
      return [newEvent, ...filteredPrevEvents.slice(0, 199)];
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
            frontendEventData = instanceDetailsPayload || serverEventPayload.data || {};
            break;
          case 'log':
            frontendEventType = 'log';
            frontendEventData = serverEventPayload.logs || `日志事件，但缺少 .logs 字段: ${JSON.stringify(serverEventPayload)}`;
            if (typeof frontendEventData === 'string') {
              parsedLevel = parseLogLevel(frontendEventData);
            }
            break;
          case 'shutdown':
            frontendEventType = 'shutdown';
            frontendEventData = "主控服务即将关闭。事件流已停止。";
            if (abortControllerRef.current && !abortControllerRef.current.signal.aborted) {
              abortControllerRef.current.abort("Server shutdown event received");
            }
            break;
          default:
            console.warn("未知服务器事件类型 (fetch):", serverEventPayload.type, serverEventPayload);
            frontendEventType = 'log';
            frontendEventData = `未知事件 ${serverEventPayload.type}: ${JSON.stringify(serverEventPayload.data || serverEventPayload.instance || serverEventPayload)}`;
            if (typeof frontendEventData === 'string') {
              parsedLevel = parseLogLevel(frontendEventData);
            }
            break;
        }
        
        const newEventToLog: InstanceEvent = {
          type: frontendEventType,
          data: frontendEventData,
          instanceDetails: instanceDetailsPayload,
          level: parsedLevel,
          timestamp: serverEventPayload.time || new Date().toISOString(),
        };
        addEventToLog(newEventToLog);

      } catch (error) {
        console.error("无法解析事件数据 (fetch):", error, "原始数据:", eventDataLine);
        const errorEventToLog: InstanceEvent = { type: 'log', data: `解析事件错误 (fetch): ${eventDataLine}`, timestamp: new Date().toISOString() };
        addEventToLog(errorEventToLog);
      }
    } else if (eventDataLine) {
      // Handle plain messages without 'event: instance'
      // This might include 'retry: XXXX' messages or other server hints
      if (eventDataLine.startsWith('retry:')) {
        // Potentially adjust reconnect delay based on server advice, though EventSource handles 'retry' natively.
        // For fetch, this is informational unless we implement custom retry timing based on it.
        // console.log('SSE server advised retry interval:', eventDataLine);
      } else {
        const genericEvent: InstanceEvent = {
          type: 'log',
          data: `通用消息 (fetch): ${eventDataLine}`,
          timestamp: new Date().toISOString()
        };
        addEventToLog(genericEvent);
      }
    }
  }, [addEventToLog]);

  const connectWithFetch = useCallback(async (isInitialAttemptForCurrentApi: boolean) => {
    if (!apiId || !apiRoot || !apiToken || !apiName) {
      setUiConnectionStatus('idle');
      const configInvalidEvent: InstanceEvent = { type: 'log', data: `API 配置无效，事件流禁用。`, timestamp: new Date().toISOString() };
      addEventToLog(configInvalidEvent);
      return;
    }

    if (abortControllerRef.current && !abortControllerRef.current.signal.aborted) {
      abortControllerRef.current.abort("Reconnecting or new connection attempt");
    }
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    const eventsUrl = getEventsUrl(apiRoot);
    
    if (isInitialAttemptForCurrentApi) {
      setIsConnecting(true); // Show "连接中..." in CardDescription
      setUiConnectionStatus('connecting');
      // Only add "正在初始化" message to UI log for the very first attempt for this API config
      addEventToLog({ type: 'log', data: `正在初始化事件流 (fetch) 到 ${eventsUrl} (携带 X-API-Key)...`, timestamp: new Date().toISOString() });
    }
    
    // Clear any pending reconnect timeout
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
        },
        signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP错误 ${response.status}: ${response.statusText}. 详情: ${errorText.substring(0, 200)}`);
      }

      if (!response.body) {
        throw new Error("响应体为空，无法读取事件流。");
      }
      
      setIsConnected(true);
      setIsConnecting(false);
      setUiConnectionStatus('connected');
      retryCountRef.current = 0; // Reset retry count on successful connection

      if (!hasLoggedInitialConnectionRef.current) {
        addEventToLog({ type: 'log', data: `事件流 (fetch) 已连接。等待事件... (目标: ${eventsUrl})`, timestamp: new Date().toISOString() });
        hasLoggedInitialConnectionRef.current = true;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { value, done } = await reader.read();
        if (signal.aborted) {
          // console.log('Fetch aborted by signal');
          break;
        }
        if (done) {
          setIsConnected(false);
          // Don't log to UI immediately, schedule reconnect
          // console.log('SSE Stream closed by server.');
          if (!signal.aborted) { // Only reconnect if not deliberately aborted
             scheduleReconnect("服务器关闭");
          }
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const messageBlocks = buffer.split('\n\n');
        buffer = messageBlocks.pop() || ''; // Keep the last partial message in buffer

        for (const block of messageBlocks) {
          if (block.trim() !== '') {
            processSseMessageData(block);
          }
        }
      }
    } catch (error: any) {
      setIsConnected(false);
      setIsConnecting(false);
      if (signal.aborted && error.name === 'AbortError') {
         // console.log(`Fetch aborted: ${error.message}`);
         // If aborted by component unmount or new API, don't attempt reconnect from here
      } else {
        // console.error(`Fetch error during connectWithFetch:`, error);
        if (!signal.aborted) { // Only schedule reconnect if not deliberately aborted by user action
           scheduleReconnect(error.message || "未知错误");
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiId, apiRoot, apiToken, apiName, processSseMessageData, addEventToLog]);


  const scheduleReconnect = useCallback((reason: string) => {
    if (abortControllerRef.current?.signal.aborted) return; // Don't reconnect if intentionally aborted

    retryCountRef.current++;
    setIsConnected(false); // Ensure isConnected is false before retrying
    setUiConnectionStatus('disconnected');


    const eventsUrl = apiRoot ? getEventsUrl(apiRoot) : '未知目标';
    let uiErrorMessage = "";

    if (reason.startsWith("服务器关闭")) {
      uiErrorMessage = `事件流连接已由服务器关闭。${RECONNECT_DELAY_MS / 1000}秒后尝试第 ${retryCountRef.current} 次重连... (目标: ${eventsUrl})`;
    } else {
      const corsHint = reason.toLowerCase().includes('failed to fetch') || reason.toLowerCase().includes('networkerror') 
        ? '这通常由于目标服务器的CORS策略阻止了请求 (缺少 Access-Control-Allow-Origin 头部), 或网络连接问题。'
        : '';
      uiErrorMessage = `无法建立 SSE 连接 (fetch) 到 ${eventsUrl}. 原因: ${reason.substring(0, 100)}... ${corsHint} ${RECONNECT_DELAY_MS / 1000}秒后尝试第 ${retryCountRef.current} 次重连...`;
    }
    
    if (retryCountRef.current > 1) { // Show error in UI log only after the first silent retry fails
      addEventToLog({ type: 'log', data: uiErrorMessage, timestamp: new Date().toISOString(), level: 'ERROR' });
    } else {
      // console.log(`Silent retry attempt ${retryCountRef.current} for: ${reason}`);
    }

    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    reconnectTimeoutRef.current = setTimeout(() => {
       // console.log(`Attempting reconnect #${retryCountRef.current}`);
      connectWithFetch(false); // false because it's not the initial attempt for this API
    }, RECONNECT_DELAY_MS);

  }, [apiRoot, connectWithFetch, addEventToLog]);


  useEffect(() => {
    // This effect runs when apiId, apiRoot, etc. change, or on mount.
    if (apiId && apiRoot && apiToken && apiName) {
      // If API config changes, reset state related to previous connection
      if (currentApiIdRef.current !== apiId) {
        // console.log(`API ID changed from ${currentApiIdRef.current} to ${apiId}. Resetting SSE state.`);
        if (abortControllerRef.current && !abortControllerRef.current.signal.aborted) {
          abortControllerRef.current.abort("API configuration changed");
        }
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
        setEvents([]); // Clear logs from previous API
        setIsConnected(false);
        setIsConnecting(true); // Set true for the new API's initial attempt
        setUiConnectionStatus('connecting');
        retryCountRef.current = 0;
        hasLoggedInitialConnectionRef.current = false; // Reset for the new API
        currentApiIdRef.current = apiId;
        connectWithFetch(true); // true because it's the initial attempt for this new API
      } else if (!isConnected && !isConnecting && !reconnectTimeoutRef.current) {
        // If not connected, not currently trying, and no reconnect scheduled,
        // it might be the initial mount for an already set API ID.
        // console.log('Initial mount or re-attempt for existing API ID, not connected and no reconnect scheduled.');
        setIsConnecting(true);
        setUiConnectionStatus('connecting');
        retryCountRef.current = 0; // Reset retry count for fresh attempts
        connectWithFetch(true);
      }
    } else {
      // API config is not valid, clear everything
      setEvents([]);
      setIsConnected(false);
      setIsConnecting(false);
      setUiConnectionStatus('idle');
      if (abortControllerRef.current && !abortControllerRef.current.signal.aborted) {
        abortControllerRef.current.abort("API configuration invalid or missing");
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      currentApiIdRef.current = null; // Reset current API ID
    }

    return () => { // Cleanup function
      if (abortControllerRef.current && !abortControllerRef.current.signal.aborted) {
        abortControllerRef.current.abort("Component unmounted or dependencies changed");
        // Don't add to log here as it's a cleanup, not necessarily an error for the user
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiId, apiRoot, apiToken, apiName]); // connectWithFetch is memoized and handles its own state

  const getBadgeTextAndVariant = (type: InstanceEvent['type']): { text: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'accent' } => {
    switch (type) {
      case 'initial': return { text: '初始', variant: 'default' };
      case 'create': return { text: '创建', variant: 'default' }; // Consider 'success' or a green-like variant if available
      case 'update': return { text: '更新', variant: 'secondary' };
      case 'delete': return { text: '删除', variant: 'destructive' };
      case 'log': return { text: '日志', variant: 'outline' };
      case 'shutdown': return { text: '关闭', variant: 'destructive'};
      case 'error': return { text: '错误', variant: 'destructive'};
      default: return { text: String(type).toUpperCase(), variant: 'outline'};
    }
  };

  const isExpandable = (event: InstanceEvent): boolean => {
    if (event.instanceDetails) return true;
    if (event.type === 'log' && typeof event.data === 'string' && event.data.length > 100) return true;
    if (['initial', 'create', 'update', 'delete'].includes(event.type) && typeof event.data === 'object' && event.data !== null && Object.keys(event.data).length > 0 && !event.instanceDetails) return true;
    return false;
  };

  let statusText = "等待配置...";
  let StatusIcon = AlertTriangle;
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
      case 'error':
        statusText = retryCountRef.current > 1 ? "连接已断开" : "尝试连接...";
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
    setSelectedEventTypes(new Set());
    setSelectedLogLevels(new Set());
  };

  return (
    <Card className="shadow-lg mt-6">
      <CardHeader>
        <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-4">
          <div className="flex-grow">
            <CardTitle className="flex items-center text-xl">
              <Rss className="mr-2 h-5 w-5 text-primary" />
              实时事件日志
            </CardTitle>
             <CardDescription className="flex items-center">
              来自 NodePass 实例 (API: {apiName || 'N/A'})。
              状态: <StatusIcon className={`ml-1.5 mr-1 h-4 w-4 ${statusColorClass}`} />
              <span className={`font-semibold ${statusColorClass.split(' ')[0]}`}>{statusText}</span>
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap sm:flex-nowrap justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Filter className="mr-2 h-4 w-4" />
                  事件类型 ({selectedEventTypes.size > 0 ? selectedEventTypes.size : '全部'})
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56">
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
                <Button variant="outline" size="sm">
                  <Filter className="mr-2 h-4 w-4" />
                  日志级别 ({selectedLogLevels.size > 0 ? selectedLogLevels.size : '全部'})
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56">
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

            {(selectedEventTypes.size > 0 || selectedLogLevels.size > 0) && (
              <Button variant="ghost" size="sm" onClick={handleClearFilters} className="text-muted-foreground hover:text-foreground">
                <XCircle className="mr-1.5 h-4 w-4" />
                清除
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-80 w-full rounded-md border p-3 bg-muted/20 text-xs">
          {filteredEvents.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">无匹配事件。</p>}
          {filteredEvents.map((event, index) => {
            const isExpanded = expandedIndex === index;
            const { text: badgeText, variant: badgeVariant } = getBadgeTextAndVariant(event.type);
            const instance = event.instanceDetails;
            const canExpand = isExpandable(event);

            return (
              <div key={`${event.timestamp}-${index}`} className="py-1.5 border-b border-border/30 last:border-b-0 last:pb-0 first:pt-0">
                <div
                  className={`flex items-start space-x-2 ${canExpand ? 'cursor-pointer' : ''}`}
                  onClick={() => canExpand && setExpandedIndex(isExpanded ? null : index)}
                  role={canExpand ? "button" : undefined}
                  tabIndex={canExpand ? 0 : undefined}
                  onKeyDown={(e) => {
                    if (canExpand && (e.key === 'Enter' || e.key === ' ')) {
                      setExpandedIndex(isExpanded ? null : index);
                    }
                  }}
                >
                  <div className="flex items-center shrink-0 w-6 h-[1.125rem]">
                    {canExpand && (
                      isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <Badge variant={badgeVariant} className="py-0.5 px-1.5 shadow-sm whitespace-nowrap shrink-0 self-start">
                    {badgeText}
                  </Badge>
                  {event.type === 'log' && event.level && (
                    <Badge variant={
                      event.level === 'ERROR' || event.level === 'FATAL' ? 'destructive' :
                      event.level === 'WARN' ? 'secondary' : 'outline'
                    } className="py-0.5 px-1.5 shadow-sm whitespace-nowrap shrink-0 self-start">
                      {event.level}
                    </Badge>
                  )}
                  <div className="flex-grow min-w-0">
                    {event.type !== 'log' && instance ? (
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 leading-tight">
                        <Badge
                            variant={instance.type === 'server' ? 'default' : 'accent'}
                            className="items-center whitespace-nowrap text-xs shrink-0"
                          >
                            {instance.type === 'server' ? <Server size={12} className="mr-1" /> : <Smartphone size={12} className="mr-1" />}
                            {instance.type === 'server' ? '服务器' : '客户端'}
                        </Badge>
                        <span className="font-mono text-foreground/90">ID: {instance.id.substring(0, 8)}...</span>
                        <InstanceStatusBadge status={instance.status} />
                        <span className="font-mono truncate text-foreground/70" title={instance.url}>{instance.url.length > 30 ? instance.url.substring(0, 27) + '...' : instance.url}</span>
                      </div>
                    ) : (
                       <p className="font-mono break-words whitespace-pre-wrap text-foreground/90 leading-relaxed">
                        {typeof event.data === 'string' && (isExpanded || !canExpand || event.data.length <= 70) ? event.data : `${String(event.data).substring(0, 70)}...`}
                      </p>
                    )}
                  </div>
                  <span className="text-muted-foreground whitespace-nowrap ml-auto pl-2 self-start shrink-0">
                    {new Date(event.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </div>
                {isExpanded && canExpand && (
                  <div className="mt-2 ml-8 pl-4 border-l-2 border-muted/50 py-2 bg-background/30 rounded-r-md">
                    {instance ? (
                      <pre className="text-xs p-2 rounded-md overflow-x-auto bg-muted/40 whitespace-pre-wrap break-all">
                        {JSON.stringify(instance, null, 2)}
                      </pre>
                    ) : event.type === 'log' && typeof event.data === 'string' ? (
                      <p className="font-mono break-all whitespace-pre-wrap text-foreground/90 leading-relaxed text-xs">
                        {event.data}
                      </p>
                    ) : typeof event.data === 'object' && event.data !== null && Object.keys(event.data).length > 0 ? (
                       <pre className="text-xs p-2 rounded-md overflow-x-auto bg-muted/40 whitespace-pre-wrap break-all">
                        {JSON.stringify(event.data, null, 2)}
                      </pre>
                    ) : (
                       <p className="text-xs text-muted-foreground italic">无详情。</p>
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


    