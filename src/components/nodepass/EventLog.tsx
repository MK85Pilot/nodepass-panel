
"use client";

import React, { useState, useEffect, useRef } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ServerIcon, SmartphoneIcon, Info, AlertTriangle, CheckCircle, Settings, Trash2, Pencil, Play, Square, RotateCcw, ChevronDown, ChevronRight, Copy, KeyRound, Loader2 } from 'lucide-react';
import type { Instance } from '@/types/nodepass';
import { InstanceStatusBadge } from './InstanceStatusBadge';
import { useToast } from '@/hooks/use-toast';

export interface AppLogEntry {
  timestamp: string;
  message: string;
  type: 'SUCCESS' | 'ERROR' | 'INFO' | 'ACTION'; // ACTION for general operations
  details?: Record<string, any> | string; // Optional detailed information
}

interface EventLogProps {
  logs: AppLogEntry[];
}

const MAX_LOG_ENTRIES = 100; // Keep a reasonable number of logs
const LOG_LINE_TRUNCATE_LENGTH = 150; // Max length for a single log line before truncation

// Helper to strip ANSI escape codes
function stripAnsiCodes(str: string): string {
  if (typeof str !== 'string') return str;
  // eslint-disable-next-line no-control-regex
  const ansiRegex = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
  return str.replace(ansiRegex, '');
}

export function EventLog({ logs }: EventLogProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const { toast } = useToast();

  const toggleExpand = (index: number) => {
    setExpandedIndex(expandedIndex === index ? null : index);
  };

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

  const getBadgeVariant = (type: AppLogEntry['type']): 'default' | 'secondary' | 'destructive' | 'outline' | 'accent' => {
    switch (type) {
      case 'SUCCESS': return 'default';
      case 'ERROR': return 'destructive';
      case 'INFO': return 'secondary';
      case 'ACTION': return 'outline';
      default: return 'outline';
    }
  };

  const getIconForType = (type: AppLogEntry['type'], message: string) => {
    switch (type) {
      case 'SUCCESS': return <CheckCircle className="h-3.5 w-3.5 mr-1.5 text-green-500" />;
      case 'ERROR': return <AlertTriangle className="h-3.5 w-3.5 mr-1.5 text-destructive" />;
      case 'INFO': return <Info className="h-3.5 w-3.5 mr-1.5 text-blue-500" />;
      case 'ACTION':
        if (message.includes('创建')) return <Pencil className="h-3.5 w-3.5 mr-1.5 text-muted-foreground"/>;
        if (message.includes('删除')) return <Trash2 className="h-3.5 w-3.5 mr-1.5 text-muted-foreground"/>;
        if (message.includes('启动')) return <Play className="h-3.5 w-3.5 mr-1.5 text-muted-foreground"/>;
        if (message.includes('停止')) return <Square className="h-3.5 w-3.5 mr-1.5 text-muted-foreground"/>;
        if (message.includes('重启')) return <RotateCcw className="h-3.5 w-3.5 mr-1.5 text-muted-foreground"/>;
        return <Settings className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />;
      default: return <Info className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />;
    }
  };

  return (
    <ScrollArea className="h-60 w-full rounded-md border p-3 bg-muted/20">
      {logs.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4 font-sans">
          暂无应用操作记录。
        </p>
      )}
      {logs.slice(0, MAX_LOG_ENTRIES).map((log, index) => {
        const isExpanded = expandedIndex === index;
        let displayMessage = log.message;
        let hasDetails = !!log.details;

        if (typeof log.message === 'string' && log.message.length > LOG_LINE_TRUNCATE_LENGTH && !isExpanded) {
          displayMessage = `${log.message.substring(0, LOG_LINE_TRUNCATE_LENGTH)}...`;
          hasDetails = true; // Force details if message was truncated
        }
        
        return (
          <div
            key={`${log.timestamp}-${index}`}
            className="py-1.5 border-b border-border/30 last:border-b-0 last:pb-0 first:pt-0"
          >
            <div 
              className="flex items-start space-x-2 text-sm cursor-pointer group"
              onClick={() => hasDetails && toggleExpand(index)}
            >
              {hasDetails ? (
                isExpanded ? <ChevronDown className="h-4 w-4 mt-0.5 text-muted-foreground group-hover:text-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 mt-0.5 text-muted-foreground group-hover:text-foreground shrink-0" />
              ) : (
                <span className="w-4 h-4 shrink-0"></span> // Placeholder for alignment
              )}
              <span className="font-mono text-xs text-muted-foreground whitespace-nowrap pt-0.5">
                {new Date(log.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
              </span>
              <Badge variant={getBadgeVariant(log.type)} className="py-0.5 px-1.5 shadow-sm whitespace-nowrap self-start text-xs font-sans items-center">
                {getIconForType(log.type, log.message)}
                {log.type.charAt(0).toUpperCase() + log.type.slice(1).toLowerCase()}
              </Badge>
              <p className="font-sans text-xs text-foreground/90 break-words whitespace-pre-wrap leading-relaxed flex-grow pt-0.5">
                {stripAnsiCodes(displayMessage)}
              </p>
            </div>
            {isExpanded && hasDetails && (
              <div className="ml-10 mt-1 p-2 rounded-md bg-background border text-xs">
                <h4 className="font-semibold mb-1 text-muted-foreground">详细信息:</h4>
                {typeof log.details === 'string' ? (
                  <pre className="whitespace-pre-wrap break-all font-mono">{stripAnsiCodes(log.details)}</pre>
                ) : typeof log.details === 'object' ? (
                  <pre className="whitespace-pre-wrap break-all font-mono">{JSON.stringify(log.details, null, 2)}</pre>
                ) : typeof log.message === 'string' && log.message.length > LOG_LINE_TRUNCATE_LENGTH ? (
                  <pre className="whitespace-pre-wrap break-all font-mono">{stripAnsiCodes(log.message)}</pre>
                ) : (
                  <p className="text-muted-foreground font-mono">无更多详情。</p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </ScrollArea>
  );
}
