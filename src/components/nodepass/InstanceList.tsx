
"use client";

import React, { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { AlertTriangle, Eye, Trash2, ArrowDown, ArrowUp, ServerIcon, SmartphoneIcon, Search, Pencil, KeyRound, ClipboardCopy } from 'lucide-react';
import type { Instance, UpdateInstanceRequest } from '@/types/nodepass';
import { InstanceStatusBadge } from './InstanceStatusBadge';
import { InstanceControls } from './InstanceControls';
import { DeleteInstanceDialog } from './DeleteInstanceDialog';
import { InstanceDetailsModal } from './InstanceDetailsModal';
import { ModifyInstanceDialog } from './ModifyInstanceDialog';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { nodePassApi } from '@/lib/api';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import type { NamedApiConfig } from '@/hooks/use-api-key';

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

interface InstanceListProps {
  apiId: string | null;
  apiName: string | null;
  apiRoot: string | null;
  apiToken: string | null;
  activeApiConfig: NamedApiConfig | null; 
}

export function InstanceList({ apiId, apiName, apiRoot, apiToken, activeApiConfig }: InstanceListProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedInstanceForDetails, setSelectedInstanceForDetails] = useState<Instance | null>(null);
  const [selectedInstanceForDelete, setSelectedInstanceForDelete] = useState<Instance | null>(null);
  const [selectedInstanceForModify, setSelectedInstanceForModify] = useState<Instance | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const { data: instances, isLoading: isLoadingInstances, error: instancesError } = useQuery<Instance[], Error>({
    queryKey: ['instances', apiId], 
    queryFn: () => {
      if (!apiId || !apiRoot || !apiToken) throw new Error("主控配置不完整，无法获取实例。");
      return nodePassApi.getInstances(apiRoot, apiToken);
    },
    enabled: !!apiId && !!apiRoot && !!apiToken,
    refetchInterval: 15000,
  });


  const updateInstanceMutation = useMutation({
    mutationFn: ({ instanceId, action }: { instanceId: string, action: UpdateInstanceRequest['action']}) => {
      if (!apiId || !apiRoot || !apiToken) throw new Error("主控配置不完整，无法更新实例。");
      return nodePassApi.updateInstance(instanceId, { action }, apiRoot, apiToken);
    },
    onSuccess: (data) => {
      toast({
        title: '实例已更新',
        description: `实例 ${data.id.substring(0,8)}... 状态已改为 ${data.status}。`,
      });
      queryClient.invalidateQueries({ queryKey: ['instances', apiId] });
    },
    onError: (error: any) => {
      toast({
        title: '更新实例出错',
        description: error.message || '未知错误。',
        variant: 'destructive',
      });
    },
  });

  const deleteInstanceMutation = useMutation({
    mutationFn: (instanceId: string) => {
      if (!apiId || !apiRoot || !apiToken) throw new Error("主控配置不完整，无法删除实例。");
      return nodePassApi.deleteInstance(instanceId, apiRoot, apiToken);
    },
    onSuccess: (_, instanceId) => {
      toast({
        title: '实例已删除',
        description: `实例 ${instanceId.substring(0,8)}... 已删除。`,
      });
      queryClient.invalidateQueries({ queryKey: ['instances', apiId] });
      setSelectedInstanceForDelete(null);
    },
    onError: (error: any) => {
      toast({
        title: '删除实例出错',
        description: error.message || '未知错误。',
        variant: 'destructive',
      });
    },
  });

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


  const filteredInstances = instances?.filter(instance =>
    instance.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    instance.url.toLowerCase().includes(searchTerm.toLowerCase()) ||
    instance.type.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const renderSkeletons = () => {
    return Array.from({ length: 3 }).map((_, i) => (
      <TableRow key={`skeleton-${i}`}>
        {[...Array(7)].map((_, cellIndex) => (
          <TableCell key={`skeleton-cell-${i}-${cellIndex}`}>
            <Skeleton className={`h-4 ${cellIndex === 3 ? 'w-40' : cellIndex === 0 ? 'w-24' : 'w-16'}`} />
          </TableCell>
        ))}
      </TableRow>
    ));
  };


  return (
    <Card className="shadow-lg mt-6">
      <CardHeader className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
        <div>
          <CardTitle className="font-title">实例概览 (主控: {apiName || 'N/A'})</CardTitle>
          <CardDescription className="font-sans">管理和监控 NodePass 实例。</CardDescription>
        </div>
        <div className="relative mt-4 sm:mt-0 w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="搜索实例..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8 w-full font-sans"
          />
        </div>
      </CardHeader>
      <CardContent>
        {!apiId && (
          <div className="text-center py-10 text-muted-foreground font-sans">
            请先选择活动主控。
          </div>
        )}
        {apiId && instancesError && (
          <div className="text-destructive-foreground bg-destructive p-4 rounded-md flex items-center font-sans">
            <AlertTriangle className="h-5 w-5 mr-2" />
            加载实例错误: {instancesError.message}
          </div>
        )}
        {apiId && !instancesError && (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="font-sans">ID</TableHead>
                <TableHead className="font-sans">类型</TableHead>
                <TableHead className="font-sans">状态</TableHead>
                <TableHead className="font-sans">URL / 密钥</TableHead>
                <TableHead className="text-center whitespace-nowrap font-sans"><ArrowDown className="inline mr-1 h-4 w-4"/>TCP Rx/Tx</TableHead>
                <TableHead className="text-center whitespace-nowrap font-sans"><ArrowUp className="inline mr-1 h-4 w-4"/>UDP Rx/Tx</TableHead>
                <TableHead className="text-right font-sans">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoadingInstances ? renderSkeletons() :
                filteredInstances && filteredInstances.length > 0 ? (
                filteredInstances.map((instance) => (
                  <TableRow key={instance.id} className="text-foreground/90 hover:text-foreground">
                    <TableCell className="font-medium truncate max-w-xs font-mono text-xs">{instance.id}</TableCell>
                     <TableCell>
                      {instance.id === '********' ? (
                        <span className="flex items-center text-xs font-sans whitespace-nowrap">
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
                    </TableCell>
                    <TableCell>
                      {instance.id === '********' ? (
                        <Badge variant="outline" className="border-yellow-500 text-yellow-600 whitespace-nowrap font-sans text-xs">
                          <KeyRound className="mr-1 h-3.5 w-3.5" />
                          监听中
                        </Badge>
                      ) : (
                        <InstanceStatusBadge status={instance.status} />
                      )}
                    </TableCell>
                    <TableCell 
                      className="truncate max-w-sm text-xs font-mono"
                    >
                        <span 
                          className="cursor-pointer hover:text-primary transition-colors duration-150"
                          title={`点击复制: ${instance.url}`}
                          onClick={(e) => {
                            e.stopPropagation(); 
                            handleCopyToClipboard(instance.url, instance.id === '********' ? 'API 密钥' : 'URL');
                          }}
                        >
                          {instance.id === '********' ? 'API 密钥 (已隐藏)' : instance.url}
                        </span>
                    </TableCell>
                    <TableCell className="text-center text-xs whitespace-nowrap font-mono">
                      {formatBytes(instance.tcprx)} / {formatBytes(instance.tcptx)}
                    </TableCell>
                    <TableCell className="text-center text-xs whitespace-nowrap font-mono">
                      {formatBytes(instance.udprx)} / {formatBytes(instance.udptx)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end items-center space-x-1">
                        {instance.id !== '********' && (
                          <InstanceControls
                              instance={instance}
                              onAction={(id, action) => updateInstanceMutation.mutate({ instanceId: id, action })}
                              isLoading={updateInstanceMutation.isPending && updateInstanceMutation.variables?.instanceId === instance.id}
                          />
                        )}
                        <button
                            className="p-2 rounded-md hover:bg-muted"
                            onClick={() => setSelectedInstanceForDetails(instance)}
                            aria-label="查看详情"
                        >
                            <Eye className="h-4 w-4" />
                        </button>
                        {instance.id !== '********' && (
                          <>
                            <button
                                className="p-2 rounded-md hover:bg-muted"
                                onClick={() => setSelectedInstanceForModify(instance)}
                                aria-label="修改"
                            >
                                <Pencil className="h-4 w-4" />
                            </button>
                            <button
                                className="p-2 rounded-md hover:bg-destructive/10 text-destructive"
                                onClick={() => setSelectedInstanceForDelete(instance)}
                                aria-label="删除"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="text-center h-24 font-sans">
                    {isLoadingInstances
                      ? "加载中..."
                      : !apiId
                        ? "请先选择或添加一个主控。"
                        : searchTerm && (!filteredInstances || filteredInstances.length === 0)
                          ? "无匹配搜索结果的实例。"
                          : instances && instances.length === 0
                            ? "当前主控下无实例。"
                            : "加载中或无实例。"
                    }
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        )}
      </CardContent>

      <InstanceDetailsModal
        instance={selectedInstanceForDetails}
        open={!!selectedInstanceForDetails}
        onOpenChange={(open) => !open && setSelectedInstanceForDetails(null)}
        apiRoot={apiRoot} // Pass apiRoot
        apiToken={apiToken} // Pass apiToken
      />
      <DeleteInstanceDialog
        instance={selectedInstanceForDelete}
        open={!!selectedInstanceForDelete}
        onOpenChange={(open) => !open && setSelectedInstanceForDelete(null)}
        onConfirmDelete={(id) => deleteInstanceMutation.mutate(id)}
        isLoading={deleteInstanceMutation.isPending}
      />
      <ModifyInstanceDialog
        instance={selectedInstanceForModify}
        open={!!selectedInstanceForModify}
        onOpenChange={(open) => {
          if (!open) setSelectedInstanceForModify(null);
        }}
        apiId={apiId}
        apiName={apiName}
        apiRoot={apiRoot}
        apiToken={apiToken}
        activeApiConfig={activeApiConfig}
      />
    </Card>
  );
}

    