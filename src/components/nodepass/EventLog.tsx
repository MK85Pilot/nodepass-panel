
"use client";

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { ServerIcon, SmartphoneIcon, Info, AlertTriangle, CheckCircle, Settings, Trash2, Pencil, Play, Square, RotateCcw } from 'lucide-react';

export interface AppLogEntry {
  timestamp: string;
  message: string;
  type: 'SUCCESS' | 'ERROR' | 'INFO' | 'ACTION'; // ACTION for general operations
}

interface EventLogProps {
  logs: AppLogEntry[];
  title?: string;
  description?: string;
}

const MAX_LOG_ENTRIES = 100;

export function EventLog({ 
  logs,
  title = "应用操作日志",
  description = "记录在应用内执行的关键操作和状态变更。"
}: EventLogProps) {

  const getBadgeVariant = (type: AppLogEntry['type']): 'default' | 'secondary' | 'destructive' | 'outline' | 'accent' => {
    switch (type) {
      case 'SUCCESS':
        return 'default'; // Greenish if using primary for success
      case 'ERROR':
        return 'destructive';
      case 'INFO':
        return 'secondary'; // Or 'outline' for less emphasis
      case 'ACTION':
        return 'outline';
      default:
        return 'outline';
    }
  };

  const getIconForType = (type: AppLogEntry['type']) => {
    switch (type) {
      case 'SUCCESS':
        return <CheckCircle className="h-3.5 w-3.5 mr-1.5 text-green-500" />;
      case 'ERROR':
        return <AlertTriangle className="h-3.5 w-3.5 mr-1.5 text-destructive" />;
      case 'INFO':
        return <Info className="h-3.5 w-3.5 mr-1.5 text-blue-500" />;
      case 'ACTION': // Example icons for actions
        if (logs.find(log => log.type === type)?.message.includes('创建')) return <Pencil className="h-3.5 w-3.5 mr-1.5 text-muted-foreground"/>;
        if (logs.find(log => log.type === type)?.message.includes('删除')) return <Trash2 className="h-3.5 w-3.5 mr-1.5 text-muted-foreground"/>;
        if (logs.find(log => log.type === type)?.message.includes('启动')) return <Play className="h-3.5 w-3.5 mr-1.5 text-muted-foreground"/>;
        if (logs.find(log => log.type === type)?.message.includes('停止')) return <Square className="h-3.5 w-3.5 mr-1.5 text-muted-foreground"/>;
        if (logs.find(log => log.type === type)?.message.includes('重启')) return <RotateCcw className="h-3.5 w-3.5 mr-1.5 text-muted-foreground"/>;
        return <Settings className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />; // Default action icon
      default:
        return <Info className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />;
    }
  };

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-2">
          <div>
            <CardTitle className="font-title">{title}</CardTitle>
            <CardDescription className="font-sans mt-1">
              {description}
            </CardDescription>
          </div>
          {/* Filter buttons were here, now removed as per request to not use SSE */}
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-72 w-full rounded-md border p-3 bg-muted/20">
          {logs.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4 font-sans">
              暂无应用操作记录。
            </p>
          )}
          {logs.slice(0, MAX_LOG_ENTRIES).map((log, index) => (
            <div
              key={`${log.timestamp}-${index}`}
              className="py-1.5 border-b border-border/30 last:border-b-0 last:pb-0 first:pt-0 text-sm"
            >
              <div className="flex items-start space-x-2">
                <span className="font-mono text-xs text-muted-foreground whitespace-nowrap pt-0.5">
                  {new Date(log.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                </span>
                <Badge variant={getBadgeVariant(log.type)} className="py-0.5 px-1.5 shadow-sm whitespace-nowrap self-start text-xs font-sans items-center">
                  {getIconForType(log.type)}
                  {log.type.charAt(0) + log.type.slice(1).toLowerCase()}
                </Badge>
                <p className="font-sans text-xs text-foreground/90 break-all whitespace-pre-wrap leading-relaxed flex-grow pt-0.5">
                  {log.message}
                </p>
              </div>
            </div>
          ))}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
