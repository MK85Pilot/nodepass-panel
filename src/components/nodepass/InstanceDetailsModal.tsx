
"use client";

import React, { useState, useEffect } from 'react';
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
import { ArrowDownCircle, ArrowUpCircle, ServerIcon, SmartphoneIcon, Fingerprint, Cable, KeyRound, Eye, EyeOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface InstanceDetailsModalProps {
  instance: Instance | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatBytes(bytes: number, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}


export function InstanceDetailsModal({ instance, open, onOpenChange }: InstanceDetailsModalProps) {
  const [showApiKey, setShowApiKey] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      setShowApiKey(false); 
    }
  }, [open, instance]);

  const handleCopyToClipboard = async (textToCopy: string, entity: string) => {
    if (!navigator.clipboard) {
      toast({
        title: '复制失败',
        description: '您的浏览器不支持剪贴板操作。',
        variant: 'destructive',
      });
      return;
    }
    try {
      await navigator.clipboard.writeText(textToCopy);
      toast({
        title: '复制成功',
        description: `${entity} 已复制到剪贴板。`,
      });
    } catch (err) {
      toast({
        title: '复制失败',
        description: `无法将 ${entity} 复制到剪贴板。`,
        variant: 'destructive',
      });
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
      fullWidth: true 
    },
    { label: "TCP 接收", value: <span className="font-mono text-xs">{formatBytes(instance.tcprx)}</span>, icon: <ArrowDownCircle className="h-4 w-4 text-blue-500" /> },
    { label: "TCP 发送", value: <span className="font-mono text-xs">{formatBytes(instance.tcptx)}</span>, icon: <ArrowUpCircle className="h-4 w-4 text-green-500" /> },
    { label: "UDP 接收", value: <span className="font-mono text-xs">{formatBytes(instance.udprx)}</span>, icon: <ArrowDownCircle className="h-4 w-4 text-blue-500" /> },
    { label: "UDP 发送", value: <span className="font-mono text-xs">{formatBytes(instance.udptx)}</span>, icon: <ArrowUpCircle className="h-4 w-4 text-green-500" /> },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-title">实例详情</DialogTitle>
          <DialogDescription className="font-sans">
            实例 <span 
                    className="font-semibold font-mono cursor-pointer hover:text-primary transition-colors duration-150"
                    title={`点击复制: ${instance.id}`}
                    onClick={() => handleCopyToClipboard(instance.id, "ID")}
                  >
                    {instance.id.substring(0,12)}...
                  </span> 详情。
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4 space-y-3">
          {detailItems.map((item, index) => (
            <div key={index} className={`flex ${item.fullWidth ? 'flex-col' : 'items-center justify-between'} py-2 border-b last:border-b-0`}>
              <div className="flex items-center">
                {item.icon && <span className="mr-2">{item.icon}</span>}
                <span className="text-sm font-medium text-muted-foreground font-sans">{item.label}:</span>
              </div>
              <div className={`text-sm ${item.fullWidth ? 'mt-1 w-full' : ''}`}>{item.value}</div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
