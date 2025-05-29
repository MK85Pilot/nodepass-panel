
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
import type { Instance, InstanceEvent } from '@/types/nodepass';
import { InstanceStatusBadge } from './InstanceStatusBadge';
import { ArrowDownCircle, ArrowUpCircle, ServerIcon, SmartphoneIcon, Fingerprint, Cable, KeyRound, Eye, EyeOff, ScrollText, Network } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getEventsUrl } from '@/lib/api'; // Assuming getEventsUrl is correctly exported

interface InstanceDetailsModalProps {
  instance: Instance | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apiRoot: string | null;
  apiToken: string | null;
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


export function InstanceDetailsModal({ instance, open, onOpenChange, apiRoot, apiToken }: InstanceDetailsModalProps) {
  const [showApiKey, setShowApiKey] = useState(false);
  const { toast } = useToast();
  const [instanceLogs, setInstanceLogs] = useState<string[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const MAX_LOG_LINES = 100;

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
        if (serverEventPayload.type === 'log' && serverEventPayload.instance?.id === instance?.id) {
          let rawLogData = serverEventPayload.logs || '';
          if (typeof rawLogData === 'string') {
            const cleanedLog = stripAnsiCodes(rawLogData);
            const timestamp = new Date(serverEventPayload.time || Date.now()).toLocaleTimeString('zh-CN', { hour12: false });
            setInstanceLogs(prevLogs => [`[${timestamp}] ${cleanedLog}`, ...prevLogs.slice(0, MAX_LOG_LINES - 1)]);
          }
        }
      } catch (error) {
        console.error("Modal SSE: Error parsing event data:", error, "Raw data:", eventDataLine);
      }
    }
  }, [instance?.id]);


  const connectToSse = useCallback(async () => {
    if (!instance || !apiRoot || !apiToken || !open || instance.id === '********') { // Do not connect SSE for API Key 'instance'
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort("New connection or modal closed");
    }
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    const eventsUrl = getEventsUrl(apiRoot);
    if (!eventsUrl) {
        console.error("Modal SSE: Invalid events URL derived from apiRoot", apiRoot);
        return;
    }
    
    console.log(`Modal SSE: Attempting to connect to ${eventsUrl} for instance ${instance.id}`);

    try {
      const response = await fetch(eventsUrl, {
        method: 'GET',
        headers: { 'X-API-Key': apiToken, 'Accept': 'text/event-stream', 'Cache-Control': 'no-cache' },
        signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}: ${await response.text()}`);
      }
      if (!response.body) {
        throw new Error("Response body is null.");
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
            console.log(`Modal SSE for ${instance.id}: Stream closed by server.`);
            setInstanceLogs(prev => [`[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] 事件流已由服务端关闭。`, ...prev.slice(0, MAX_LOG_LINES -1)]);
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
      if (signal.aborted && error.name === 'AbortError') {
        console.log(`Modal SSE for ${instance.id}: Fetch aborted as expected.`);
      } else {
        console.error(`Modal SSE for ${instance.id}: Connection error:`, error.message);
        setInstanceLogs(prev => [`[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] 事件流连接错误: ${error.message}`, ...prev.slice(0, MAX_LOG_LINES -1)]);
      }
    }
  }, [instance, apiRoot, apiToken, open, processSseMessageData]);


  useEffect(() => {
    if (open && instance && apiRoot && apiToken) {
      setInstanceLogs([`[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] 正在初始化实例日志流...`]);
      connectToSse();
    }

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort("Modal closing or instance changed");
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [open, instance, apiRoot, apiToken, connectToSse]);


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
          {instance.type === 'server' ? '服务端' : '客户端'}
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
  ];

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
              {instanceLogs.map((log, index) => (
                <p key={index} className="text-xs font-mono py-0.5 whitespace-pre-wrap break-all">
                  {log}
                </p>
              ))}
            </ScrollArea>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

