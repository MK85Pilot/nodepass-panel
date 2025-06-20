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
    let color = 'bg-yellow-400 dark:bg-yellow-500'; // Default for unknown
    let tooltipText = '未知';
    const triangleSize = "24px"; // Size of the SVG container, triangle will fill this

    switch (status) {
      case 'running':
        color = 'fill-green-500 dark:fill-green-600';
        tooltipText = '运行中';
        break;
      case 'stopped':
        color = 'fill-gray-500 dark:fill-gray-600';
        tooltipText = '已停止';
        break;
      case 'error':
        color = 'fill-destructive';
        tooltipText = '错误';
        break;
    }
    return (
      <TooltipProvider delayDuration={100}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="absolute top-0 right-0" style={{ width: triangleSize, height: triangleSize }}>
              <svg width={triangleSize} height={triangleSize} viewBox="0 0 20 20" className="overflow-visible">
                {/* Triangle points: top-left, top-right, bottom-right of the SVG box */}
                <polygon points="0,0 20,0 20,20" className={color} />
              </svg>
            </div>
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

