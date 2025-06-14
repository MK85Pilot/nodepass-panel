
"use client";

import React,  { useState, useEffect, useRef, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import type { Instance } from '@/types/nodepass';
import { InstanceStatusBadge } from './InstanceStatusBadge';
import { ArrowDownCircle, ArrowUpCircle, ServerIcon, SmartphoneIcon, Fingerprint, Cable, KeyRound, Eye, EyeOff, ScrollText, Network, AlertTriangle, Info as InfoIcon, MessageSquare, AlertCircle, Bug, HelpCircle, FileText } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getEventsUrl } from '@/lib/api';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from "@/lib/utils";
// Removed import of parseNodePassUrlForTopology from topology-utils as it's no longer needed here or specific parsing handled internally.

interface InstanceDetailsModalProps {
  instance: Instance | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apiRoot: string | null;
  apiToken: string | null;
}

const MAX_LOG_LINES = 200;
const RECONNECT_DELAY = 5000;

const INITIAL_MESSAGE_TEXT = "正在初始化实例日志流...";
const CONNECTED_MESSAGE_TEXT = "SSE事件流已连接。";

interface ParsedLogEntry {
  id: string;
  fullTimestamp: string;
  time: string;
  level: 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' | 'FATAL' | 'EVENT' | 'UNKNOWN';
  message: string;
}

function formatBytes(bytes: number, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function stripAnsiCodes(str: string): string {
  if (typeof str !== 'string') return str;
  // eslint-disable-next-line no-control-regex
  const ansiRegex = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
  return str.replace(ansiRegex, '');
}

const logLineRegex = /^(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}\.\d{3})\s+([A-Z]+)\s+(.*)$/s;
const bracketedLevelRegex = /^\[?([A-Z]+)\]?\s+(.*)$/s;
const KNOWN_LOG_LEVELS: ReadonlyArray<ParsedLogEntry['level']> = ['ERROR', 'WARN', 'INFO', 'DEBUG', 'FATAL', 'EVENT'];


function parseAndFormatLogLine(
  rawLog: string,
  index: number,
  forcedLevel?: ParsedLogEntry['level']
): ParsedLogEntry {
  const cleanedLog = stripAnsiCodes(rawLog).trim();
  const now = new Date();
  const currentTimeString = now.toLocaleTimeString('zh-CN', { hour12: false });
  const fullTimestampString = now.toISOString();

  if (forcedLevel && forcedLevel !== 'UNKNOWN') {
    return {
      id: `${fullTimestampString}-${index}-${Math.random()}`,
      fullTimestamp: fullTimestampString,
      time: currentTimeString,
      level: forcedLevel,
      message: cleanedLog.trim(),
    };
  }

  const standardLogMatch = cleanedLog.match(logLineRegex);
  if (standardLogMatch) {
    const matchedFullTimestamp = standardLogMatch[1].trim();
    const levelString = standardLogMatch[2].trim().toUpperCase();
    let message = standardLogMatch[3].trim();
    const time = new Date(matchedFullTimestamp).toLocaleTimeString('zh-CN', { hour12: false });
    
    let parsedLevel = KNOWN_LOG_LEVELS.includes(levelString as any)
      ? (levelString as ParsedLogEntry['level'])
      : 'INFO'; 

    if (message.startsWith("Exchange complete: TRAFFIC_STATS|")) {
      try {
        const statsPart = message.substring("Exchange complete: TRAFFIC_STATS|".length);
        const parts = statsPart.split('|');
        const trafficData: Record<string, number> = {};
        parts.forEach(part => {
          const [key, value] = part.split('=');
          if (key && value !== undefined) {
            trafficData[key.trim()] = parseInt(value.trim(), 10);
          }
        });

        const tcpRx = trafficData['TCP_RX'] || 0;
        const tcpTx = trafficData['TCP_TX'] || 0;
        const udpRx = trafficData['UDP_RX'] || 0;
        const udpTx = trafficData['UDP_TX'] || 0;

        const formattedMessage = 
`TCP 流量: ${formatBytes(tcpRx)} / ${formatBytes(tcpTx)}
UDP 流量: ${formatBytes(udpRx)} / ${formatBytes(udpTx)}`;
        
        return { 
          id: `${matchedFullTimestamp}-${index}-traffic-${Math.random()}`, 
          fullTimestamp: matchedFullTimestamp, 
          time, 
          level: 'EVENT', 
          message: formattedMessage 
        };
      } catch (parseError) {
        console.warn("Failed to parse traffic stats from log message:", message, parseError);
        return { id: `${matchedFullTimestamp}-${index}-trafficfail-${Math.random()}`, fullTimestamp: matchedFullTimestamp, time, level: parsedLevel, message };
      }
    }
    return { id: `${matchedFullTimestamp}-${index}-${Math.random()}`, fullTimestamp: matchedFullTimestamp, time, level: parsedLevel, message };
  }

  const diagnosticLevelMatch = cleanedLog.match(bracketedLevelRegex);
  if (diagnosticLevelMatch) {
    const levelString = diagnosticLevelMatch[1].trim().toUpperCase();
    const messageContent = diagnosticLevelMatch[2].trim();
    if (KNOWN_LOG_LEVELS.includes(levelString as any)) {
       return {
        id: `${fullTimestampString}-${index}-${Math.random()}`,
        fullTimestamp: fullTimestampString,
        time: currentTimeString,
        level: levelString as ParsedLogEntry['level'],
        message: messageContent,
      };
    }
  }
  
  return {
    id: `${fullTimestampString}-${index}-${Math.random()}`,
    fullTimestamp: fullTimestampString,
    time: currentTimeString,
    level: 'UNKNOWN',
    message: cleanedLog.trim(),
  };
}


export function InstanceDetailsModal({ instance, open, onOpenChange, apiRoot, apiToken }: InstanceDetailsModalProps) {
  const [showApiKey, setShowApiKey] = useState(false);
  const { toast } = useToast();
  const [instanceLogs, setInstanceLogs] = useState<ParsedLogEntry[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const logCounterRef = useRef(0);
  const hasConnectedAtLeastOnceRef = useRef(false);

  const addLogEntry = useCallback((entry: ParsedLogEntry) => {
    setInstanceLogs(prevLogs => {
      const newLogs = [entry, ...prevLogs];
      return newLogs.slice(0, MAX_LOG_LINES);
    });
  }, []);


  const connectToSse = useCallback(async () => {
    if (!instance || !apiRoot || !apiToken || !open) {
      return;
    }
    if(instance.id === '********') {
      setInstanceLogs([]); 
      addLogEntry(parseAndFormatLogLine("此为特殊API Key实例，不展示实时日志。", logCounterRef.current++, 'INFO'));
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort("Starting new connection attempt");
    }
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    const eventsUrl = getEventsUrl(apiRoot);
    if (!eventsUrl) {
        addLogEntry(parseAndFormatLogLine(`事件流URL无效，无法连接。 Root: ${apiRoot}`, logCounterRef.current++, 'ERROR'));
        return;
    }

    try {
      if (!hasConnectedAtLeastOnceRef.current) {
        setInstanceLogs([]); 
        addLogEntry(parseAndFormatLogLine(INITIAL_MESSAGE_TEXT, logCounterRef.current++, 'INFO'));
      }

      const response = await fetch(eventsUrl, {
        method: 'GET',
        headers: {
          'X-API-Key': apiToken,
          'Accept': 'text/event-stream',
          'Cache-Control': 'no-cache'
        },
        signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => `HTTP error ${response.status}`);
        throw new Error(`HTTP error ${response.status}: ${errorText}`);
      }
      if (!response.body) {
        throw new Error("Response body is null.");
      }
      
      if (!hasConnectedAtLeastOnceRef.current) {
        setInstanceLogs([]); 
        addLogEntry(parseAndFormatLogLine(CONNECTED_MESSAGE_TEXT, logCounterRef.current++, 'INFO'));
        hasConnectedAtLeastOnceRef.current = true;
      }


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
            addLogEntry(parseAndFormatLogLine(`事件流已关闭，${RECONNECT_DELAY / 1000}秒后尝试重连...`, logCounterRef.current++, 'INFO'));
            if (!signal.aborted) reconnectTimeoutRef.current = setTimeout(connectToSse, RECONNECT_DELAY);
          }
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const messageBlocks = buffer.split('\n\n');
        buffer = messageBlocks.pop() || '';

        for (const block of messageBlocks) {
          if (block.trim() === '') continue;

          let eventName = 'message'; 
          let eventData = '';
          const messageLines = block.split('\n');

          for (const line of messageLines) {
            if (line.startsWith('event:')) {
              eventName = line.substring('event:'.length).trim();
            } else if (line.startsWith('data:')) {
               if (eventData !== '') eventData += '\n'; 
               eventData += line.substring('data:'.length).trimStart(); 
            }
          }
          
          if (eventName === 'instance' && eventData) {
            try {
              const jsonData = JSON.parse(eventData);
              const eventInstanceId = jsonData.instance?.id || 
                                    (Array.isArray(jsonData.instance) && jsonData.instance.length > 0 ? jsonData.instance[0]?.id : null);
              
              if (eventInstanceId === '********' && ['initial', 'create', 'update', 'delete'].includes(jsonData.type)) {
                continue;
              }

              if (jsonData.type === 'log') {
                if (jsonData.instance?.id === instance.id) {
                  let rawLogData = jsonData.logs || '';
                  if (typeof rawLogData === 'string') {
                    addLogEntry(parseAndFormatLogLine(rawLogData, logCounterRef.current++)); 
                  } else {
                    addLogEntry(parseAndFormatLogLine(`收到实例 ${instance.id.substring(0,8)} 的日志，但'logs'字段非字符串。类型: ${typeof rawLogData}`, logCounterRef.current++, 'WARN'));
                  }
                }
              } else if (jsonData.type === 'shutdown') {
                addLogEntry(parseAndFormatLogLine(`主控服务已关闭事件流。连接将不会自动重试。`, logCounterRef.current++, 'INFO'));
                if (abortControllerRef.current && !abortControllerRef.current.signal.aborted) {
                    abortControllerRef.current.abort("Server shutdown event received");
                }
                if (reconnectTimeoutRef.current) {
                    clearTimeout(reconnectTimeoutRef.current);
                    reconnectTimeoutRef.current = null;
                }
                return; 
              } else if (jsonData.type === 'initial') {
                  if (Array.isArray(jsonData.instance)) {
                    addLogEntry(parseAndFormatLogLine(`收到初始实例数据 (${jsonData.instance.length} 个)。`, logCounterRef.current++, 'INFO'));
                  } else if (typeof jsonData.instance === 'object' && jsonData.instance !== null && jsonData.instance.id !== '********') {
                    addLogEntry(parseAndFormatLogLine(`收到单个实例初始数据: ${jsonData.instance.id.substring(0,8)}...`, logCounterRef.current++, 'INFO'));
                  }
              } else if (jsonData.type === 'create' && jsonData.instance && jsonData.instance.id !== '********') {
                  addLogEntry(parseAndFormatLogLine(`实例已创建: ${jsonData.instance.id.substring(0,8)}...`, logCounterRef.current++, 'INFO'));
              } else if (jsonData.type === 'update' && jsonData.instance && jsonData.instance.id !== '********') {
                  addLogEntry(parseAndFormatLogLine(`实例已更新: ${jsonData.instance.id.substring(0,8)}... 状态: ${jsonData.instance.status}`, logCounterRef.current++, 'INFO'));
              } else if (jsonData.type === 'delete' && jsonData.instance && jsonData.instance.id !== '********') {
                  addLogEntry(parseAndFormatLogLine(`实例已删除: ${jsonData.instance.id.substring(0,8)}...`, logCounterRef.current++, 'INFO'));
              } else if (eventInstanceId !== '********') { 
                addLogEntry(parseAndFormatLogLine(`未识别的 'instance' 事件数据类型: ${jsonData.type}. Data: ${JSON.stringify(jsonData).substring(0,100)}...`, logCounterRef.current++, 'WARN'));
              }

            } catch (e: any) {
                 if (instance.id !== '********') {
                    addLogEntry(parseAndFormatLogLine(`解析 'instance' 事件数据错误: ${e.message}. Data snippet: ${eventData.substring(0,100)}...`, logCounterRef.current++, 'ERROR'));
                 }
            }
          } else if (eventData && eventName !== 'instance' && instance.id !== '********') { 
             addLogEntry(parseAndFormatLogLine(`收到事件 "${eventName}" (预期 "instance"). Data: ${eventData.substring(0, 50)}...`, logCounterRef.current++, 'WARN'));
          }
        }
      }
    } catch (error: any) {
      if (signal.aborted && error.name === 'AbortError') {
        // This is an expected abort
      } else {
        let displayError = typeof error.message === 'string' ? error.message : '未知连接错误。';
        if (typeof error.message === 'string' && (error.message.toLowerCase().includes('failed to fetch') || error.message.toLowerCase().includes('networkerror'))) {
            displayError = '网络错误。请检查连接或服务器CORS设置。';
        }
        if (instance.id !== '********') {
          addLogEntry(parseAndFormatLogLine(`事件流连接错误: ${displayError} ${RECONNECT_DELAY / 1000}秒后尝试重连...`, logCounterRef.current++, 'ERROR'));
          if (!signal.aborted) {
            reconnectTimeoutRef.current = setTimeout(connectToSse, RECONNECT_DELAY);
          }
        }
      }
    }
  }, [instance, apiRoot, apiToken, open, addLogEntry]);


  useEffect(() => {
    if (open && instance && apiRoot && apiToken ) {
      logCounterRef.current = 0;
      connectToSse(); 
    } else {
      if (abortControllerRef.current && !abortControllerRef.current.signal.aborted) {
        abortControllerRef.current.abort("Modal closed or instance invalid");
      }
      abortControllerRef.current = null;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if(!open || !instance){ 
        setInstanceLogs([]);
        hasConnectedAtLeastOnceRef.current = false;
      }
    }

    return () => {
      if (abortControllerRef.current && !abortControllerRef.current.signal.aborted) {
        abortControllerRef.current.abort("Component unmounting or dependencies changed");
      }
      abortControllerRef.current = null;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, instance, apiRoot, apiToken]); 


  useEffect(() => {
    if (open) {
      setShowApiKey(false);
    }
  }, [open, instance]);

  const handleCopyToClipboard = async (textToCopy: string, entity: string) => {
    if (!navigator.clipboard) {
      toast({ title: '复制失败', description: '浏览器不支持剪贴板。', variant: 'destructive' });
      return;
    }
    try {
      await navigator.clipboard.writeText(textToCopy);
      toast({ title: '复制成功', description: `${entity} 已复制到剪贴板。` });
    } catch (err) {
      toast({ title: '复制失败', description: `无法复制 ${entity}。`, variant: 'destructive' });
      console.error('复制失败: ', err);
    }
  };

  if (!instance) return null;
  const isApiKeyInstance = instance.id === '********';

  const detailItems = [
    {
      label: "ID",
      value: (
        <span
          className="font-mono text-xs cursor-pointer hover:text-primary transition-colors duration-150"
          title={`点击复制: ${instance.id}`}
          onClick={() => handleCopyToClipboard(instance.id, "ID")}
        >
          {instance.id}
        </span>
      ),
      icon: <Fingerprint className="h-4 w-4 text-muted-foreground" />
    },
    {
      label: "类型",
      value: isApiKeyInstance ? (
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
          {instance.type === 'server' ? '出口(s)' : '入口(c)'}
        </Badge>
      ),
      icon: isApiKeyInstance ? <KeyRound className="h-4 w-4 text-muted-foreground" /> : (instance.type === 'server' ? <ServerIcon className="h-4 w-4 text-muted-foreground" /> : <SmartphoneIcon className="h-4 w-4 text-muted-foreground" />)
    },
    {
      label: "状态",
      value: isApiKeyInstance ? (
         <Badge variant="outline" className="border-yellow-500 text-yellow-600 whitespace-nowrap font-sans text-xs">
            <KeyRound className="mr-1 h-3.5 w-3.5" />
            监听中
          </Badge>
      ) : <InstanceStatusBadge status={instance.status} />,
      icon: <Cable className="h-4 w-4 text-muted-foreground" />
    },
    {
      label: isApiKeyInstance ? "API 密钥" : "URL",
      value: (
        <div className="flex items-center justify-between w-full">
          <span
            className={`font-mono text-xs break-all ${isApiKeyInstance ? 'flex-grow' : ''} cursor-pointer hover:text-primary transition-colors duration-150`}
            title={`点击复制: ${instance.url}`}
            onClick={() => handleCopyToClipboard(instance.url, isApiKeyInstance ? 'API 密钥' : 'URL')}
          >
            {isApiKeyInstance ? (showApiKey ? instance.url : '••••••••••••••••••••••••••••••••') : instance.url}
          </span>
          {isApiKeyInstance && (
            <button
              className="p-1 ml-2 rounded-md hover:bg-muted flex-shrink-0"
              onClick={(e) => { e.stopPropagation(); setShowApiKey(!showApiKey);}}
              aria-label={showApiKey ? "隐藏密钥" : "显示密钥"}
            >
              {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          )}
        </div>
      ),
      icon: <Network className="h-4 w-4 text-muted-foreground" />,
      fullWidth: true
    },
    ...(!isApiKeyInstance ? [
      {
        label: "TCP 流量 (接收/发送)",
        value: (
          <span className="font-mono text-xs">
            <ArrowDownCircle className="inline-block h-3.5 w-3.5 mr-1 text-blue-500" />{formatBytes(instance.tcprx)}
            <span className="mx-1">/</span>
            <ArrowUpCircle className="inline-block h-3.5 w-3.5 mr-1 text-green-500" />{formatBytes(instance.tcptx)}
          </span>
        ),
        icon: <Cable className="h-4 w-4 text-muted-foreground" />
      },
      {
        label: "UDP 流量 (接收/发送)",
        value: (
          <span className="font-mono text-xs">
            <ArrowDownCircle className="inline-block h-3.5 w-3.5 mr-1 text-blue-500" />{formatBytes(instance.udprx)}
            <span className="mx-1">/</span>
            <ArrowUpCircle className="inline-block h-3.5 w-3.5 mr-1 text-green-500" />{formatBytes(instance.udptx)}
          </span>
        ),
        icon: <Cable className="h-4 w-4 text-muted-foreground" />
      },
    ] : [])
  ];

  const getLogLevelClass = (level: ParsedLogEntry['level']): string => {
    switch (level) {
      case 'ERROR':
      case 'FATAL':
        return 'text-destructive';
      case 'WARN':
        return 'text-yellow-500 dark:text-yellow-400';
      case 'INFO':
        return 'text-blue-500 dark:text-blue-400';
      case 'DEBUG':
        return 'text-purple-500 dark:text-purple-400';
      case 'EVENT':
        return 'text-teal-500 dark:text-teal-400';
      default:
        return 'text-muted-foreground';
    }
  };

  const getLogLevelIcon = (level: ParsedLogEntry['level']): React.ReactNode => {
    switch (level) {
      case 'ERROR':
      case 'FATAL':
        return <AlertTriangle className="h-3.5 w-3.5 mr-1" />;
      case 'WARN':
        return <AlertCircle className="h-3.5 w-3.5 mr-1" />;
      case 'INFO':
        return <InfoIcon className="h-3.5 w-3.5 mr-1" />;
      case 'DEBUG':
        return <Bug className="h-3.5 w-3.5 mr-1" />;
      case 'EVENT':
        return <FileText className="h-3.5 w-3.5 mr-1" />; 
      default: 
        return <HelpCircle className="h-3.5 w-3.5 mr-1" />;
    }
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-title">实例详情</DialogTitle>
          <DialogDescription className="font-sans">
            实例 <span
                    className="font-semibold font-mono cursor-pointer hover:text-primary transition-colors duration-150"
                    title={`点击复制: ${instance.id}`}
                    onClick={() => handleCopyToClipboard(instance.id, "ID")}
                  >
                    {instance.id.substring(0,12)}...
                  </span> 详细信息。
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4 space-y-3 overflow-y-auto pr-1">
          {detailItems.map((item, index) => (
            <div key={index} className={`flex ${item.fullWidth ? 'flex-col' : 'items-center justify-between'} py-2 border-b border-border/50 last:border-b-0`}>
              <div className="flex items-center">
                {item.icon && <span className="mr-2 shrink-0">{item.icon}</span>}
                <span className="text-sm font-medium text-muted-foreground font-sans shrink-0">{item.label}:</span>
              </div>
              <div className={`text-xs ${item.fullWidth ? 'mt-1 w-full' : 'ml-2 text-right break-all'}`}>{item.value}</div>
            </div>
          ))}
        </div>

        {!isApiKeyInstance && (
          <div className="mt-4 pt-4 border-t border-border/50 flex-shrink-0 flex flex-col min-h-0">
            <h3 className="text-md font-semibold mb-2 flex items-center font-title">
              <ScrollText size={18} className="mr-2 text-primary" />
              实例日志
            </h3>
            <ScrollArea className="h-48 w-full rounded-md border border-border/30 p-3 bg-muted/20 flex-grow">
              {instanceLogs.length === 0 && <p className="text-xs text-muted-foreground text-center py-2 font-sans">等待日志...</p>}
              {instanceLogs.map((log) => (
                <div key={log.id} className="flex items-start text-xs font-mono py-0.5 whitespace-pre-wrap break-words">
                  <TooltipProvider delayDuration={100}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-muted-foreground/80 mr-1.5 shrink-0 cursor-default">{log.time}</span>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="text-xs font-sans p-1.5">
                        {log.fullTimestamp}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <span className={cn("font-semibold mr-1.5 shrink-0 flex items-center", getLogLevelClass(log.level))}>
                    {getLogLevelIcon(log.level)}
                    {log.level}
                  </span>
                  <span className="flex-grow">{log.message}</span>
                </div>
              ))}
            </ScrollArea>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

    
