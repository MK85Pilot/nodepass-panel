
"use client";

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, AlertTriangle, HelpCircle } from 'lucide-react';
import type { Instance } from '@/types/nodepass';

interface InstanceStatusBadgeProps {
  status: Instance['status'];
}

export function InstanceStatusBadge({ status }: InstanceStatusBadgeProps) {
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
