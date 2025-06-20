"use client";

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, AlertTriangle, HelpCircle } from 'lucide-react';
import type { Instance } from '@/types/nodepass';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface InstanceStatusBadgeProps {
  status: Instance['status'];
  compact?: boolean; 
}

export function InstanceStatusBadge({ status, compact = false }: InstanceStatusBadgeProps) {
  if (compact) {
    let colorClass = 'bg-yellow-400'; // Default for unknown
    let tooltipText = '未知';

    switch (status) {
      case 'running':
        colorClass = 'bg-green-500';
        tooltipText = '运行中';
        break;
      case 'stopped':
        colorClass = 'bg-gray-500';
        tooltipText = '已停止';
        break;
      case 'error':
        colorClass = 'bg-destructive';
        tooltipText = '错误';
        break;
    }
    return (
      <TooltipProvider delayDuration={100}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={`h-3 w-3 rounded-full ${colorClass}`} />
          </TooltipTrigger>
          <TooltipContent className="text-xs font-sans p-1.5">
            {tooltipText}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Full badge rendering
  switch (status) {
    case 'running':
      return (
        <Badge variant="default" className="bg-green-500 hover:bg-green-600 text-white whitespace-nowrap">
          <CheckCircle className="mr-1 h-3.5 w-3.5" />
          运行中
        </Badge>
      );
    case 'stopped':
      return (
        <Badge variant="secondary" className="bg-gray-500 hover:bg-gray-600 text-white whitespace-nowrap">
          <XCircle className="mr-1 h-3.5 w-3.5" />
          已停止
        </Badge>
      );
    case 'error':
      return (
        <Badge variant="destructive" className="whitespace-nowrap">
          <AlertTriangle className="mr-1 h-3.5 w-3.5" />
          错误
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="whitespace-nowrap">
          <HelpCircle className="mr-1 h-3.5 w-3.5" />
          未知
        </Badge>
      );
  }
}

