
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { AlertTriangle, Eye, Trash2, ArrowDown, ArrowUp, Server, Smartphone, Search, Pencil } from 'lucide-react';
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
}

export function InstanceList({ apiId, apiName, apiRoot, apiToken }: InstanceListProps) {
  // console.log(`InstanceList rendering with API ID: ${apiId}, API Name: ${apiName}`); // Diagnostic log
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedInstanceForDetails, setSelectedInstanceForDetails] = useState<Instance | null>(null);
  const [selectedInstanceForDelete, setSelectedInstanceForDelete] = useState<Instance | null>(null);
  const [selectedInstanceForModify, setSelectedInstanceForModify] = useState<Instance | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const { data: instances, isLoading: isLoadingInstances, error: instancesError } = useQuery<Instance[], Error>({
    queryKey: ['instances', apiId],
    queryFn: () => {
      if (!apiId || !apiRoot || !apiToken) throw new Error("API 配置不完整，无法获取实例。");
      return nodePassApi.getInstances(apiRoot, apiToken);
    },
    enabled: !!apiId && !!apiRoot && !!apiToken,
    refetchInterval: 15000,
  });


  const updateInstanceMutation = useMutation({
    mutationFn: ({ instanceId, action }: { instanceId: string, action: UpdateInstanceRequest['action']}) => {
      if (!apiId || !apiRoot || !apiToken) throw new Error("API 配置不完整，无法更新实例。");
      return nodePassApi.updateInstance(instanceId, { action }, apiRoot, apiToken);
    },
    onSuccess: (data) => {
      toast({
        title: '实例已更新',
        description: `实例 ${data.id} 状态已改为 ${data.status}。`,
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
      if (!apiId || !apiRoot || !apiToken) throw new Error("API 配置不完整，无法删除实例。");
      return nodePassApi.deleteInstance(instanceId, apiRoot, apiToken);
    },
    onSuccess: (_, instanceId) => {
      toast({
        title: '实例已删除',
        description: `实例 ${instanceId} 已删除。`,
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


  const filteredInstances = instances?.filter(instance =>
    instance.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    instance.url.toLowerCase().includes(searchTerm.toLowerCase()) ||
    instance.type.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const renderSkeletons = () => {
    return Array.from({ length: 3 }).map((_, i) => (
      <TableRow key={`skeleton-${i}`}>
        {[
          <TableCell key={`skc1-${i}`}><Skeleton className="h-4 w-24" /></TableCell>,
          <TableCell key={`skc2-${i}`}><Skeleton className="h-4 w-16" /></TableCell>,
          <TableCell key={`skc3-${i}`}><Skeleton className="h-4 w-20" /></TableCell>,
          <TableCell key={`skc4-${i}`}><Skeleton className="h-4 w-40" /></TableCell>,
          <TableCell key={`skc5-${i}`}><Skeleton className="h-4 w-16" /></TableCell>,
          <TableCell key={`skc6-${i}`}><Skeleton className="h-4 w-16" /></TableCell>,
          <TableCell key={`skc7-${i}`}><Skeleton className="h-4 w-24" /></TableCell>
        ]}
      </TableRow>
    ));
  };


  return (
    <Card className="shadow-lg mt-6">
      <CardHeader className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
        <div>
          <CardTitle className="text-xl">实例概览 (API: {apiName || 'N/A'})</CardTitle>
          <CardDescription>管理和监控 NodePass 实例。</CardDescription>
        </div>
        <div className="relative mt-4 sm:mt-0 w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="搜索实例..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8 w-full"
          />
        </div>
      </CardHeader>
      <CardContent>
        {!apiId && (
          <div className="text-center py-10 text-muted-foreground">
            请先选择活动 API 连接。
          </div>
        )}
        {apiId && instancesError && (
          <div className="text-destructive-foreground bg-destructive p-4 rounded-md flex items-center">
            <AlertTriangle className="h-5 w-5 mr-2" />
            加载实例错误: {instancesError.message}
          </div>
        )}
        {apiId && !instancesError && (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>URL</TableHead>
                <TableHead className="text-center whitespace-nowrap"><ArrowDown className="inline mr-1 h-4 w-4"/>TCP Rx/Tx</TableHead>
                <TableHead className="text-center whitespace-nowrap"><ArrowUp className="inline mr-1 h-4 w-4"/>UDP Rx/Tx</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoadingInstances ? renderSkeletons() :
                filteredInstances && filteredInstances.length > 0 ? (
                filteredInstances.map((instance) => (
                  <TableRow key={instance.id}>
                    <TableCell className="font-medium truncate max-w-xs">{instance.id}</TableCell>
                    <TableCell>
                      <Badge
                        variant={instance.type === 'server' ? 'default' : 'accent'}
                        className="items-center whitespace-nowrap text-xs"
                      >
                        {instance.type === 'server' ? <Server className="h-3 w-3 mr-1" /> : <Smartphone className="h-3 w-3 mr-1" />}
                        {instance.type === 'server' ? '服务器' : '客户端'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <InstanceStatusBadge status={instance.status} />
                    </TableCell>
                    <TableCell className="truncate max-w-sm text-xs font-mono">{instance.url}</TableCell>
                    <TableCell className="text-center text-xs whitespace-nowrap">
                      {formatBytes(instance.tcprx)} / {formatBytes(instance.tcptx)}
                    </TableCell>
                    <TableCell className="text-center text-xs whitespace-nowrap">
                      {formatBytes(instance.udprx)} / {formatBytes(instance.udptx)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end items-center space-x-1">
                        <InstanceControls
                            instance={instance}
                            onAction={(id, action) => updateInstanceMutation.mutate({ instanceId: id, action })}
                            isLoading={updateInstanceMutation.isPending && updateInstanceMutation.variables?.instanceId === instance.id}
                        />
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedInstanceForDetails(instance)} aria-label="查看详情">
                          <Eye className="h-4 w-4" />
                        </Button>
                         <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedInstanceForModify(instance)} aria-label="修改">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setSelectedInstanceForDelete(instance)} aria-label="删除">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="text-center h-24">
                    {isLoadingInstances
                      ? "加载中..."
                      : !apiId
                        ? "请选择或添加一个API连接。"
                        : searchTerm && (!filteredInstances || filteredInstances.length === 0)
                          ? "无匹配搜索结果的实例。"
                          : instances && instances.length === 0
                            ? "当前API连接下无实例。"
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
      />
    </Card>
  );
}
