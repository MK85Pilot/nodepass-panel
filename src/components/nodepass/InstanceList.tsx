
"use client";

import React, { useState, useMemo, useRef } from 'react'; // useRef removed as aliasInputRef is no longer needed
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
import { AlertTriangle, Eye, Trash2, ServerIcon, SmartphoneIcon, Search, KeyRound, PlusCircle, CheckCircle, ArrowDown, ArrowUp, Tag, Pencil } from 'lucide-react';
import type { Instance, UpdateInstanceRequest } from '@/types/nodepass';
import { InstanceStatusBadge } from './InstanceStatusBadge';
import { InstanceControls } from './InstanceControls';
import { DeleteInstanceDialog } from './DeleteInstanceDialog';
import { InstanceDetailsModal } from './InstanceDetailsModal';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { nodePassApi } from '@/lib/api';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import type { NamedApiConfig } from '@/hooks/use-api-key';
import type { AppLogEntry } from './EventLog';
import { extractHostname, extractPort, parseNodePassUrl, isWildcardHostname, formatHostForDisplay } from '@/lib/url-utils';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { BulkDeleteInstancesDialog } from './BulkDeleteInstancesDialog';
import { useInstanceAliases } from '@/hooks/use-instance-aliases';
import { EditAliasDialog } from './EditAliasDialog';


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
  apiConfigsList: NamedApiConfig[];
  onLog?: (message: string, type: AppLogEntry['type']) => void;
  onOpenCreateInstanceDialog: () => void;
}

export function InstanceList({ apiId, apiName, apiRoot, apiToken, activeApiConfig, apiConfigsList, onLog, onOpenCreateInstanceDialog }: InstanceListProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { setAlias, isLoadingAliases, removeAlias, aliases: allAliasesObject } = useInstanceAliases();

  const [selectedInstanceForDetails, setSelectedInstanceForDetails] = useState<Instance | null>(null);
  const [selectedInstanceForDelete, setSelectedInstanceForDelete] = useState<Instance | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedInstanceIds, setSelectedInstanceIds] = useState(new Set<string>());
  const [isBulkDeleteDialogOpen, setIsBulkDeleteDialogOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  const [isEditAliasDialogOpen, setIsEditAliasDialogOpen] = useState(false);
  const [editingAliasContext, setEditingAliasContext] = useState<{ id: string; alias?: string } | null>(null);


  const { data: instances, isLoading: isLoadingInstances, error: instancesError } = useQuery<Instance[], Error>({
    queryKey: ['instances', apiId],
    queryFn: () => {
      if (!apiId || !apiRoot || !apiToken) throw new Error("主控配置不完整。");
      return nodePassApi.getInstances(apiRoot, apiToken);
    },
    enabled: !!apiId && !!apiRoot && !!apiToken,
    refetchInterval: 15000,
  });


  const updateInstanceMutation = useMutation({
    mutationFn: ({ instanceId, action }: { instanceId: string, action: UpdateInstanceRequest['action']}) => {
      if (!apiId || !apiRoot || !apiToken) throw new Error("主控配置不完整。");
      return nodePassApi.updateInstance(instanceId, { action }, apiRoot, apiToken);
    },
    onSuccess: (data, variables) => {
      const actionTextMap = { start: '启动', stop: '停止', restart: '重启' };
      const actionText = actionTextMap[variables.action] || variables.action;
      toast({
        title: `实例操作: ${actionText}`,
        description: `实例 ${data.id.substring(0,8)}... 状态已改为 ${data.status}。`,
      });
      onLog?.(`实例 ${data.id.substring(0,8)}... ${actionText}成功，状态: ${data.status}`, 'SUCCESS');
      queryClient.invalidateQueries({ queryKey: ['instances', apiId] });
    },
    onError: (error: any, variables) => {
      const actionTextMap = { start: '启动', stop: '停止', restart: '重启' };
      const actionText = actionTextMap[variables.action] || variables.action;
      toast({
        title: '实例操作失败',
        description: `实例 ${variables.instanceId.substring(0,8)}... ${actionText}失败: ${error.message || '未知错误。'}`,
        variant: 'destructive',
      });
      onLog?.(`实例 ${variables.instanceId.substring(0,8)}... ${actionText}失败: ${error.message || '未知错误'}`, 'ERROR');
    },
  });

  const deleteInstanceMutation = useMutation({
    mutationFn: (instanceId: string) => {
      if (!apiId || !apiRoot || !apiToken) throw new Error("主控配置不完整。");
      return nodePassApi.deleteInstance(instanceId, apiRoot, apiToken);
    },
    onSuccess: (_, instanceId) => {
      toast({
        title: '实例已删除',
        description: `实例 ${instanceId.substring(0,8)}... 已删除。`,
      });
      onLog?.(`实例 ${instanceId.substring(0,8)}... 已删除。`, 'SUCCESS');
      removeAlias(instanceId);
      queryClient.invalidateQueries({ queryKey: ['instances', apiId] });
      queryClient.invalidateQueries({ queryKey: ['allInstancesForTraffic']});
      setSelectedInstanceForDelete(null);
      setSelectedInstanceIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(instanceId);
        return newSet;
      });
    },
    onError: (error: any, instanceId) => {
      toast({
        title: '删除实例出错',
        description: `删除实例 ${instanceId.substring(0,8)}... 失败: ${error.message || '未知错误。'}`,
        variant: 'destructive',
      });
       onLog?.(`删除实例 ${instanceId.substring(0,8)}... 失败: ${error.message || '未知错误'}`, 'ERROR');
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

  const filteredInstances = useMemo(() => {
    return instances?.filter(instance => {
      const instanceAlias = (instance.id !== '********' && !isLoadingAliases) ? allAliasesObject[instance.id] : '';
      return (
        instance.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (instanceAlias || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        instance.url.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (instance.id !== '********' && instance.type.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (instance.id === '********' && ('api key'.includes(searchTerm.toLowerCase()) || '密钥'.includes(searchTerm.toLowerCase()) || (apiName && apiName.toLowerCase().includes(searchTerm.toLowerCase())) ))
      );
    });
  }, [instances, searchTerm, isLoadingAliases, allAliasesObject, apiName]);


  const deletableInstances = useMemo(() => filteredInstances?.filter(inst => inst.id !== '********') || [], [filteredInstances]);

  const apiKeyInstance = filteredInstances?.find(inst => inst.id === '********');
  const otherInstances = filteredInstances?.filter(inst => inst.id !== '********');


  const handleSelectInstance = (instanceId: string) => {
    setSelectedInstanceIds(prevSelectedIds => {
      const newSelectedIds = new Set(prevSelectedIds);
      if (newSelectedIds.has(instanceId)) {
        newSelectedIds.delete(instanceId);
      } else {
        newSelectedIds.add(instanceId);
      }
      return newSelectedIds;
    });
  };

  const handleSelectAllInstances = (checked: boolean | 'indeterminate') => {
    if (checked === true) {
      setSelectedInstanceIds(new Set(deletableInstances.map(inst => inst.id)));
    } else {
      setSelectedInstanceIds(new Set());
    }
  };

  const handleConfirmBulkDelete = async () => {
    if (selectedInstanceIds.size === 0) return;
    setIsBulkDeleting(true);
    onLog?.(`开始批量删除 ${selectedInstanceIds.size} 个实例...`, 'ACTION');

    const results = await Promise.allSettled(
      Array.from(selectedInstanceIds).map(id => deleteInstanceMutation.mutateAsync(id))
    );

    let successCount = 0;
    let errorCount = 0;
    results.forEach(result => {
      if (result.status === 'fulfilled') successCount++;
      else errorCount++;
    });

    if (successCount > 0) {
      toast({ title: '批量删除成功', description: `${successCount} 个实例已删除。` });
    }
    if (errorCount > 0) {
      toast({ title: '批量删除部分失败', description: `${errorCount} 个实例删除失败，请检查日志。`, variant: 'destructive' });
    }
    onLog?.(`批量删除完成: ${successCount} 成功, ${errorCount} 失败。`, errorCount > 0 ? 'ERROR' : 'SUCCESS');

    queryClient.invalidateQueries({ queryKey: ['instances', apiId] });
    queryClient.invalidateQueries({ queryKey: ['allInstancesForTraffic'] });
    setSelectedInstanceIds(new Set());
    setIsBulkDeleting(false);
    setIsBulkDeleteDialogOpen(false);
  };

  const handleOpenEditAliasDialog = (instanceId: string, currentAlias: string | undefined) => {
    if (instanceId === '********') return;
    setEditingAliasContext({ id: instanceId, alias: currentAlias });
    setIsEditAliasDialogOpen(true);
  };

  const handleSaveAliasFromDialog = (instanceId: string, newAlias: string) => {
    setAlias(instanceId, newAlias);
    toast({
      title: '别名已更新',
      description: newAlias ? `实例 ${instanceId.substring(0,8)}... 的别名已设为 "${newAlias}"。` : `实例 ${instanceId.substring(0,8)}... 的别名已清除。`,
    });
    onLog?.(newAlias ? `为实例 ${instanceId.substring(0,8)}... 设置别名: "${newAlias}"` : `已清除实例 ${instanceId.substring(0,8)}... 的别名`, 'INFO');
    setIsEditAliasDialogOpen(false);
    setEditingAliasContext(null);
  };


  const renderSkeletons = () => {
    return Array.from({ length: 3 }).map((_, i) => (
      <TableRow key={`skeleton-${i}`}>
        <TableCell className="w-10"><Skeleton className="h-4 w-4" /></TableCell>{/*
     */}<TableCell><Skeleton className="h-4 w-24" /></TableCell>{/*
     */}<TableCell><Skeleton className="h-4 w-20" /></TableCell>{/*
     */}<TableCell><Skeleton className="h-4 w-16" /></TableCell>{/*
     */}<TableCell><Skeleton className="h-4 w-16" /></TableCell>{/*
     */}<TableCell><Skeleton className="h-4 w-32" /></TableCell>{/*
     */}<TableCell><Skeleton className="h-4 w-32" /></TableCell>{/*
     */}<TableCell className="text-left">
          <div className="text-left">
            <Skeleton className="h-4 w-20 mb-1" />
            <Skeleton className="h-4 w-20" />
          </div>
        </TableCell>{/*
     */}<TableCell className="text-right"><Skeleton className="h-8 w-24 ml-auto" /></TableCell>
      </TableRow>
    ));
  };

  const renderInstanceRow = (instance: Instance) => {
    const parsedUrl = instance.id !== '********' ? parseNodePassUrl(instance.url) : null;
    const currentAlias = (instance.id !== '********' && !isLoadingAliases) ? allAliasesObject[instance.id] : undefined;


    let displayTargetAddress: React.ReactNode = "N/A";
    let copyTargetTitle = "目标地址";
    let targetStringToCopy = "";

    let displayTunnelAddress: React.ReactNode = "N/A";
    let copyTunnelTitle = "隧道地址";
    let tunnelStringToCopy = "";

    const totalRx = instance.tcprx + instance.udprx;
    const totalTx = instance.tcptx + instance.udptx;


    if (instance.id === '********') {
      targetStringToCopy = "-";
      copyTargetTitle = "目标地址 (不适用)";
      displayTargetAddress = <span className="text-xs font-mono text-muted-foreground">-</span>;

      tunnelStringToCopy = "-";
      copyTunnelTitle = "隧道地址 (不适用)";
      displayTunnelAddress = <span className="text-xs font-mono text-muted-foreground">-</span>;

    } else if (instance.type === 'server' && parsedUrl) {
        targetStringToCopy = parsedUrl.targetAddress || "N/A";
        copyTargetTitle = "服务端目标地址 (业务数据)";
        displayTargetAddress = (
           <span
            className="font-mono text-xs cursor-pointer hover:text-primary transition-colors duration-150"
            title={`点击复制: ${targetStringToCopy}`}
            onClick={(e) => { e.stopPropagation(); if (targetStringToCopy !== "N/A") { handleCopyToClipboard(targetStringToCopy, copyTargetTitle); }}}
            >
            {targetStringToCopy}
            </span>
        );

        tunnelStringToCopy = parsedUrl.tunnelAddress || "N/A";
        copyTunnelTitle = "服务端监听隧道地址";
        displayTunnelAddress = (
           <span
            className="font-mono text-xs cursor-pointer hover:text-primary transition-colors duration-150"
            title={`点击复制: ${tunnelStringToCopy}`}
            onClick={(e) => { e.stopPropagation(); if (tunnelStringToCopy !== "N/A") { handleCopyToClipboard(tunnelStringToCopy, copyTunnelTitle); }}}
            >
            {tunnelStringToCopy}
            </span>
        );

    } else if (instance.type === 'client' && parsedUrl && activeApiConfig) {
        const isSingleEnded = parsedUrl.scheme === 'client' && parsedUrl.targetAddress && parsedUrl.tunnelAddress && isWildcardHostname(extractHostname(parsedUrl.tunnelAddress));

        if (isSingleEnded) {
            targetStringToCopy = parsedUrl.targetAddress || "N/A";
            copyTargetTitle = "客户端单端转发目标地址";
            displayTargetAddress = (
               <span
                className="font-mono text-xs cursor-pointer hover:text-primary transition-colors duration-150"
                title={`点击复制: ${targetStringToCopy}`}
                onClick={(e) => { e.stopPropagation(); if (targetStringToCopy !== "N/A") { handleCopyToClipboard(targetStringToCopy, copyTargetTitle); }}}
                >
                {targetStringToCopy}
                </span>
            );

            const clientLocalListeningPort = extractPort(parsedUrl.tunnelAddress || '');
            const clientMasterApiHost = extractHostname(activeApiConfig.apiUrl);
            if (clientMasterApiHost && clientLocalListeningPort) {
                tunnelStringToCopy = `${formatHostForDisplay(clientMasterApiHost)}:${clientLocalListeningPort}`;
                copyTunnelTitle = `客户端本地监听 (单端模式, 主控: ${activeApiConfig.name})`;
            } else {
                tunnelStringToCopy = `${parsedUrl.tunnelAddress || '[::]:????'}`;
                copyTunnelTitle = `客户端本地监听 (单端模式, 主控地址未知)`;
            }
            displayTunnelAddress = (
               <span
                className="font-mono text-xs cursor-pointer hover:text-primary transition-colors duration-150"
                title={`点击复制: ${tunnelStringToCopy}`}
                onClick={(e) => { e.stopPropagation(); if(tunnelStringToCopy && !tunnelStringToCopy.includes("????")) {handleCopyToClipboard(tunnelStringToCopy, copyTunnelTitle); }}}
               >
                 {tunnelStringToCopy}
               </span>
            );

        } else {
            const clientLocalForwardPort = extractPort(parsedUrl.targetAddress || '');
            const clientMasterApiHost = extractHostname(activeApiConfig.apiUrl);
             if (clientMasterApiHost && clientLocalForwardPort) {
                targetStringToCopy = `${formatHostForDisplay(clientMasterApiHost)}:${clientLocalForwardPort}`;
                copyTunnelTitle = `客户端本地转发 (主控: ${activeApiConfig.name})`;
            } else if (clientLocalForwardPort) {
                targetStringToCopy = `127.0.0.1:${clientLocalForwardPort}`;
                copyTunnelTitle = `客户端本地转发 (主控地址未知)`;
            } else {
                targetStringToCopy = parsedUrl.targetAddress || "N/A (解析失败)";
                copyTunnelTitle = "客户端本地转发目标";
            }
            displayTargetAddress = (
               <span
                className="font-mono text-xs cursor-pointer hover:text-primary transition-colors duration-150"
                title={`点击复制: ${targetStringToCopy}`}
                onClick={(e) => { e.stopPropagation(); if(targetStringToCopy && !targetStringToCopy.startsWith("N/A")) {handleCopyToClipboard(targetStringToCopy, copyTunnelTitle); }}}
               >
                 {targetStringToCopy}
               </span>
            );

            tunnelStringToCopy = parsedUrl.tunnelAddress || "N/A";
            copyTunnelTitle = "客户端连接的服务端隧道地址";
            displayTunnelAddress = (
               <span
                className="font-mono text-xs cursor-pointer hover:text-primary transition-colors duration-150"
                title={`点击复制: ${tunnelStringToCopy}`}
                onClick={(e) => { e.stopPropagation(); if (tunnelStringToCopy !== "N/A") { handleCopyToClipboard(tunnelStringToCopy, copyTunnelTitle); }}}
                >
                {tunnelStringToCopy}
                </span>
            );
        }
    }


    return (
      <TableRow
        key={instance.id}
        className="text-foreground/90 hover:text-foreground"
        onDoubleClick={instance.id !== '********' ? () => handleOpenEditAliasDialog(instance.id, currentAlias) : () => setSelectedInstanceForDetails(instance)}
        data-state={selectedInstanceIds.has(instance.id) ? "selected" : ""}
      >
        <TableCell className="w-10">
          {instance.id !== '********' ? (
            <Checkbox
              checked={selectedInstanceIds.has(instance.id)}
              onCheckedChange={() => handleSelectInstance(instance.id)}
              aria-label={`选择实例 ${instance.id}`}
              disabled={isBulkDeleting}
            />
          ) : null}
        </TableCell>
        <TableCell className="font-medium font-mono text-xs break-all" title={instance.id}>{instance.id}</TableCell>
        <TableCell
            className="text-xs font-sans truncate max-w-[150px]"
            title={currentAlias || "双击编辑别名"}
            onDoubleClick={(e) => {
                e.stopPropagation(); // Prevent row's onDoubleClick if targeting alias cell specifically for edit
                if (instance.id !== '********') handleOpenEditAliasDialog(instance.id, currentAlias);
            }}
        >
            {isLoadingAliases && instance.id !== '********' ? <Skeleton className="h-4 w-20" /> :
            currentAlias ? <span className="flex items-center cursor-pointer"><Pencil size={10} className="mr-1 text-muted-foreground opacity-50 group-hover:opacity-100" />{currentAlias}</span> :
            (instance.id !== '********' ? <span className="text-muted-foreground cursor-pointer hover:text-primary"><Pencil size={10} className="mr-1 text-muted-foreground opacity-50 group-hover:opacity-100" />编辑别名</span> : null)
            }
        </TableCell>
        <TableCell>
          {instance.id === '********' ? (
            <Badge variant="outline" className="border-yellow-500 text-yellow-600 items-center whitespace-nowrap text-xs py-0.5 px-1.5 font-sans">
              <KeyRound className="h-3 w-3 mr-1" />API 密钥
            </Badge>
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
            <Badge variant="outline" className="border-green-500 text-green-600 whitespace-nowrap font-sans text-xs py-0.5 px-1.5">
              <CheckCircle className="mr-1 h-3.5 w-3.5" />
              可用
            </Badge>
          ) : (
            <InstanceStatusBadge status={instance.status} />
          )}
        </TableCell>
        <TableCell
          className="truncate max-w-[200px] text-xs font-mono"
          title={copyTunnelTitle}
        >
          {instance.id === '********' ? (
             <span className="text-muted-foreground">-</span>
          ) : (
            <span
              className="cursor-pointer hover:text-primary transition-colors duration-150"
              onClick={(e) => { e.stopPropagation(); if (tunnelStringToCopy && tunnelStringToCopy !== "N/A" && !tunnelStringToCopy.startsWith("N/A (")) { handleCopyToClipboard(tunnelStringToCopy, copyTunnelTitle); }}}
            >
             {displayTunnelAddress}
            </span>
          )}
        </TableCell>
        <TableCell
          className="truncate max-w-[200px] text-xs font-mono"
          title={copyTargetTitle}
        >
          {instance.id === '********' ? (
             <span className="text-muted-foreground">-</span>
          ) : (
            <span
              className="cursor-pointer hover:text-primary transition-colors duration-150"
              onClick={(e) => { e.stopPropagation(); if (targetStringToCopy && targetStringToCopy !== "N/A" && !targetStringToCopy.startsWith("N/A (")) { handleCopyToClipboard(targetStringToCopy, copyTargetTitle); }}}
            >
              {displayTargetAddress}
            </span>
          )}
        </TableCell>
        <TableCell className="text-left">
          <div className="text-xs whitespace-nowrap font-mono">
            {instance.id === '********' ? (
              <span className="text-muted-foreground">-</span>
            ) : (
              <div className="flex items-center space-x-2">
                <span className="flex items-center" title={`接收: TCP ${formatBytes(instance.tcprx)}, UDP ${formatBytes(instance.udprx)}`}>
                  <ArrowDown className="h-3 w-3 mr-1 text-blue-500" />
                  {formatBytes(totalRx)}
                </span>
                <span className="text-muted-foreground">/</span>
                <span className="flex items-center" title={`发送: TCP ${formatBytes(instance.tcptx)}, UDP ${formatBytes(instance.udptx)}`}>
                  <ArrowUp className="h-3 w-3 mr-1 text-green-500" />
                  {formatBytes(totalTx)}
                </span>
              </div>
            )}
          </div>
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
                onClick={(e) => { e.stopPropagation(); setSelectedInstanceForDetails(instance);}}
                aria-label="查看详情"
            >
                <Eye className="h-4 w-4" />
            </button>
            {instance.id !== '********' && (
              <button
                  className="p-2 rounded-md hover:bg-destructive/10 text-destructive"
                  onClick={(e) => { e.stopPropagation(); setSelectedInstanceForDelete(instance);}}
                  aria-label="删除"
                  disabled={isBulkDeleting || deleteInstanceMutation.isPending && deleteInstanceMutation.variables === instance.id}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </TableCell>
      </TableRow>
    );
  }

  const getTableBodyContent = () => {
    const rowsToRender: React.ReactNode[] = [];

    if (isLoadingInstances && !instancesError) {
      return renderSkeletons();
    }

    if (filteredInstances && filteredInstances.length > 0) {
      if (apiKeyInstance) {
        rowsToRender.push(renderInstanceRow(apiKeyInstance));
      }
      if (otherInstances) {
        otherInstances.forEach(instance => {
            rowsToRender.push(renderInstanceRow(instance));
        });
      }
    }

    if (rowsToRender.length > 0) {
      return rowsToRender;
    }

    let message = "加载中或无可用实例数据。";
    if (apiId && !isLoadingInstances && !instancesError) {
      if (instances && instances.length === 0) {
          message = `主控 "${activeApiConfig?.name || apiName}" 下无实例。`;
      } else if (searchTerm) {
          message = `在 "${activeApiConfig?.name || apiName}" 中未找到与 "${searchTerm}" 匹配的实例。`;
      }
    } else if (!apiId) {
        message = "请选择活动主控以查看实例。";
    } else if (instancesError) {
        return null;
    }
    return (
      <TableRow>
        <TableCell colSpan={9} className="text-center h-24 font-sans">
          {message}
        </TableCell>
      </TableRow>
    );
  };


  return (
    <Card className="shadow-lg mt-6">
      <CardHeader className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
        <div>
          <CardTitle className="font-title">实例概览 (主控: {apiName || 'N/A'})</CardTitle>
          <CardDescription className="font-sans">管理和监控 NodePass 实例。</CardDescription>
        </div>
        <div className="flex items-center gap-2 mt-4 sm:mt-0 w-full sm:w-auto">
           {selectedInstanceIds.size > 1 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setIsBulkDeleteDialogOpen(true)}
              disabled={isBulkDeleting}
              className="font-sans h-9"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              删除选中 ({selectedInstanceIds.size})
            </Button>
          )}
          <div className="relative w-full sm:w-auto flex-grow sm:flex-grow-0">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="搜索实例..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 w-full font-sans h-9"
            />
          </div>
          <Button onClick={onOpenCreateInstanceDialog} disabled={!apiRoot || !apiToken} className="font-sans h-9">
            <PlusCircle className="mr-2 h-4 w-4" />
            创建新实例
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!apiId && (
          <div className="text-center py-10 text-muted-foreground font-sans">
            请选择活动主控以查看实例。
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
                <TableHead className="w-10">
                  <Checkbox
                    checked={
                      deletableInstances.length > 0 &&
                      selectedInstanceIds.size === deletableInstances.length
                        ? true
                        : deletableInstances.length > 0 && selectedInstanceIds.size > 0
                        ? "indeterminate"
                        : false
                    }
                    onCheckedChange={handleSelectAllInstances}
                    aria-label="全选/取消全选实例"
                    disabled={deletableInstances.length === 0 || isBulkDeleting}
                  />
                </TableHead>
                <TableHead className="font-sans">ID</TableHead>
                <TableHead className="font-sans">别名</TableHead>
                <TableHead className="font-sans">类型</TableHead>
                <TableHead className="font-sans">状态</TableHead>
                <TableHead className="font-sans">隧道地址</TableHead>
                <TableHead className="font-sans">目标地址</TableHead>
                <TableHead className="text-left whitespace-nowrap font-sans">实例用量</TableHead>
                <TableHead className="text-right font-sans">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {getTableBodyContent()}
            </TableBody>
          </Table>
        </div>
        )}
      </CardContent>

      <InstanceDetailsModal
        instance={selectedInstanceForDetails}
        open={!!selectedInstanceForDetails}
        onOpenChange={(open) => !open && setSelectedInstanceForDetails(null)}
        apiRoot={apiRoot}
        apiToken={apiToken}
      />
      <DeleteInstanceDialog
        instance={selectedInstanceForDelete}
        open={!!selectedInstanceForDelete}
        onOpenChange={(open) => !open && setSelectedInstanceForDelete(null)}
        onConfirmDelete={(id) => deleteInstanceMutation.mutate(id)}
        isLoading={deleteInstanceMutation.isPending && deleteInstanceMutation.variables === selectedInstanceForDelete?.id}
      />
      <BulkDeleteInstancesDialog
        selectedInstances={
          instances?.filter(inst => selectedInstanceIds.has(inst.id))
            .map(inst => ({ id: inst.id, url: inst.url }))
          || []
        }
        open={isBulkDeleteDialogOpen}
        onOpenChange={setIsBulkDeleteDialogOpen}
        isLoading={isBulkDeleting}
        onConfirmDelete={handleConfirmBulkDelete}
      />
      {editingAliasContext && (
        <EditAliasDialog
            open={isEditAliasDialogOpen}
            onOpenChange={(open) => {
                setIsEditAliasDialogOpen(open);
                if (!open) setEditingAliasContext(null);
            }}
            instanceId={editingAliasContext.id}
            currentAlias={editingAliasContext.alias}
            onSave={handleSaveAliasFromDialog}
        />
      )}
    </Card>
  );
}
