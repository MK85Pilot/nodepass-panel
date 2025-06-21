"use client";

import React, { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useApiConfig, type NamedApiConfig } from '@/hooks/use-api-key';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiConfigDialog } from '@/components/nodepass/ApiKeyDialog';
import { PlusCircle, Edit3, Trash2, Power, CheckCircle, Loader2, Upload, Download, MoreVertical, AlertTriangle, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import type { AppLogEntry } from './EventLog';
import { MasterInfoCells } from './MasterInfoCells';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuery } from '@tanstack/react-query';
import { nodePassApi } from '@/lib/api';
import type { MasterInfo } from '@/types/nodepass';
import { MASTER_TLS_MODE_DISPLAY_MAP } from './create-instance-dialog/constants';


const mapLogLevelMobile = (logLevel: string | undefined): string => {
  if (!logLevel) return 'N/A';
  const lowerLogLevel = logLevel.toLowerCase();
  if (lowerLogLevel === 'master') return '主控默认';
  return lowerLogLevel.charAt(0).toUpperCase() + lowerLogLevel.slice(1);
}

const mapTlsModeMobile = (tlsMode: string | undefined): string => {
  if (!tlsMode) return 'N/A';
  if (tlsMode in MASTER_TLS_MODE_DISPLAY_MAP) {
    return MASTER_TLS_MODE_DISPLAY_MAP[tlsMode as keyof typeof MASTER_TLS_MODE_DISPLAY_MAP];
  }
  return tlsMode;
}

const CompactMasterInfo: React.FC<{ config: NamedApiConfig, isActive: boolean }> = ({ config, isActive }) => {
  const { getApiRootUrl, getToken } = useApiConfig();

  const { data: masterInfo, isLoading: isLoadingMasterInfo, error: masterInfoError, refetch: refetchMasterInfo, isRefetching: isRefetchingMasterInfo } = useQuery<MasterInfo, Error>({
    queryKey: ['masterInfo', config.id, 'compact'], // Unique key for compact view
    queryFn: () => {
      const apiRoot = getApiRootUrl(config.id);
      const token = getToken(config.id);
      if (!apiRoot || !token) {
        throw new Error(`API configuration for master ${config.name} is incomplete.`);
      }
      return nodePassApi.getMasterInfo(apiRoot, token);
    },
    enabled: !!config.id,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const defaultLogLevel = mapLogLevelMobile(config.masterDefaultLogLevel || 'master');
  const defaultTlsMode = mapTlsModeMobile(config.masterDefaultTlsMode || 'master');

  const renderInfoLine = (label: string, value: React.ReactNode, isLoading?: boolean, hasError?: boolean, onRetry?: () => void) => (
    <div className="flex justify-between items-center">
      <span className="text-muted-foreground">{label}:</span>
      {isLoading ? <Skeleton className="h-3 w-16 ml-1" /> :
       hasError ? (
          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onRetry?.(); }} disabled={isRefetchingMasterInfo} className="h-auto p-0 text-xs text-destructive hover:text-destructive ml-1">
            <AlertTriangle className="h-3 w-3 mr-0.5" />错误 <RefreshCw className={`h-2.5 w-2.5 ml-0.5 ${isRefetchingMasterInfo ? 'animate-spin' : ''}`} />
          </Button>
        ) : (
          <span className="font-mono text-right truncate" title={typeof value === 'string' ? value : undefined}>{value}</span>
        )
      }
    </div>
  );

  return (
    <div className="text-xs space-y-1.5 mt-2 pt-2 border-t border-border/30">
       {isActive && (
         <div className="absolute top-0 right-0" style={{ width: "24px", height: "24px" }}>
            <TooltipProvider delayDuration={100}>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <svg width="24px" height="24px" viewBox="0 0 20 20" className="overflow-visible">
                            <polygon points="0,0 20,0 20,20" className="fill-green-500 dark:fill-green-600" />
                        </svg>
                    </TooltipTrigger>
                    <TooltipContent className="text-xs font-sans p-1.5">
                        当前活动
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
        </div>
       )}
      {renderInfoLine("默认日志", defaultLogLevel)}
      {renderInfoLine("默认TLS", defaultTlsMode)}
      {renderInfoLine("版本", masterInfo?.ver || "N/A", isLoadingMasterInfo, !!masterInfoError, refetchMasterInfo)}
      {renderInfoLine("系统", masterInfo ? `${masterInfo.os} ${masterInfo.arch}` : "N/A", isLoadingMasterInfo, !!masterInfoError, refetchMasterInfo)}
    </div>
  );
};

interface ConnectionsManagerProps {
  onLog?: (message: string, type: AppLogEntry['type']) => void;
}

export function ConnectionsManager({ onLog }: ConnectionsManagerProps) {
  const router = useRouter();
  const { toast } = useToast();
  const {
    apiConfigsList,
    activeApiConfig,
    addOrUpdateApiConfig,
    deleteApiConfig,
    setActiveApiConfigId,
    isLoading: isLoadingApiConfig,
  } = useApiConfig();

  const isMobile = useIsMobile();
  const [isApiConfigDialogOpen, setIsApiConfigDialogOpen] = useState(false);
  const [editingApiConfig, setEditingApiConfig] = useState<NamedApiConfig | null>(null);
  const [deletingConfig, setDeletingConfig] = useState<NamedApiConfig | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleOpenApiConfigDialog = (configToEdit?: NamedApiConfig | null) => {
    setEditingApiConfig(configToEdit || null);
    setIsApiConfigDialogOpen(true);
  };

  const handleSaveApiConfig = (configToSave: Omit<NamedApiConfig, 'id'> & { id?: string }) => {
    const isNew = !configToSave.id;
    const savedConfig = addOrUpdateApiConfig(configToSave);
    setEditingApiConfig(null);
    setIsApiConfigDialogOpen(false);
    const actionText = isNew ? '添加' : '更新';
    toast({
      title: `主控已${actionText}`,
      description: `“${savedConfig.name}”已保存。`,
    });
    onLog?.(`主控配置 "${savedConfig.name}" 已${actionText}。`, 'SUCCESS');
    if (isNew && apiConfigsList.length === 0) { 
        setActiveApiConfigId(savedConfig.id);
        onLog?.(`主控 "${savedConfig.name}" 已自动激活。`, 'INFO');
    }
  };

  const handleSetActive = (id: string) => {
    const config = apiConfigsList.find(c => c.id === id);
    setActiveApiConfigId(id);
    toast({
      title: '活动主控已切换',
      description: `已连接到 “${config?.name}”。`,
    });
    onLog?.(`活动主控已切换至: "${config?.name}"`, 'INFO');
  };

  const handleDeleteConfirm = () => {
    if (deletingConfig) {
      const name = deletingConfig.name;
      deleteApiConfig(deletingConfig.id);
      toast({
        title: '主控已删除',
        description: `“${name}”已被删除。`,
        variant: 'destructive',
      });
      onLog?.(`主控配置 "${name}" 已删除。`, 'SUCCESS');
      setDeletingConfig(null);
    }
  };

  const handleExportConfigs = () => {
    if (apiConfigsList.length === 0) {
      toast({
        title: '无配置可导出',
        description: '请先添加主控连接。',
        variant: 'destructive',
      });
      onLog?.('尝试导出主控配置失败: 列表为空。', 'WARNING');
      return;
    }
    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
      JSON.stringify(apiConfigsList, null, 2)
    )}`;
    const link = document.createElement('a');
    link.href = jsonString;
    link.download = 'nodepass-connections.json';
    link.click();
    toast({
      title: '配置已导出',
      description: '主控连接配置已成功下载。',
    });
    onLog?.('主控配置已导出。', 'INFO');
  };

  const handleImportFileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result;
        if (typeof content !== 'string') throw new Error("无法读取文件内容。");

        const importedConfigsUntyped = JSON.parse(content) as any[];
        if (!Array.isArray(importedConfigsUntyped)) throw new Error("导入文件格式无效，应为JSON数组。");

        let importedCount = 0;
        let skippedCount = 0;
        let invalidCount = 0;
        let firstNewlyImportedConfig: NamedApiConfig | null = null;
        const currentActiveConfigBeforeImport = activeApiConfig;

        importedConfigsUntyped.forEach(importedConfig => {
          if (
            typeof importedConfig.id === 'string' &&
            typeof importedConfig.name === 'string' &&
            typeof importedConfig.apiUrl === 'string' &&
            typeof importedConfig.token === 'string'
          ) {
            const existingConfig = apiConfigsList.find(c => c.id === importedConfig.id);
            if (existingConfig) {
              skippedCount++;
            } else {
              const configToAdd: Omit<NamedApiConfig, 'id'> & { id?: string } = {
                id: importedConfig.id,
                name: importedConfig.name,
                apiUrl: importedConfig.apiUrl,
                token: importedConfig.token,
                masterDefaultLogLevel: importedConfig.masterDefaultLogLevel || 'master',
                masterDefaultTlsMode: importedConfig.masterDefaultTlsMode || 'master',
              };
              const saved = addOrUpdateApiConfig(configToAdd); 
              if (importedCount === 0) {
                  firstNewlyImportedConfig = saved;
              }
              importedCount++;
            }
          } else {
            console.warn("跳过无效的导入配置项:", importedConfig);
            invalidCount++;
          }
        });

        let importSummary = `成功导入 ${importedCount} 条配置。`;
        if (skippedCount > 0) importSummary += ` 跳过 ${skippedCount} 条重复ID配置。`;
        if (invalidCount > 0) importSummary += ` ${invalidCount} 条配置格式无效被忽略。`;

        toast({
          title: '导入完成',
          description: importSummary,
        });
        onLog?.(`主控配置导入完成: ${importSummary}`, 'INFO');

        if (firstNewlyImportedConfig && !currentActiveConfigBeforeImport) {
            setActiveApiConfigId(firstNewlyImportedConfig.id);
            toast({
                title: '主控已激活',
                description: `“${firstNewlyImportedConfig.name}”已自动激活。`,
            });
            onLog?.(`主控 "${firstNewlyImportedConfig.name}" 已自动激活。`, 'INFO');
        }

      } catch (error: any) {
        toast({
          title: '导入失败',
          description: error.message || '解析文件失败或文件格式不正确。',
          variant: 'destructive',
        });
        onLog?.(`主控配置导入失败: ${error.message || '未知错误'}`, 'ERROR');
      }
    };
    reader.onerror = () => {
       toast({
        title: '导入失败',
        description: '读取文件时发生错误。',
        variant: 'destructive',
      });
      onLog?.('主控配置导入失败: 读取文件错误。', 'ERROR');
    }
    reader.readAsText(file);
    if (event.target) {
      event.target.value = '';
    }
  };

  if (isLoadingApiConfig) {
    return (
      <div className="flex-grow container mx-auto px-4 py-8 flex items-center justify-center h-[calc(100vh-var(--header-height)-var(--footer-height)-4rem)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg font-sans">加载主控连接...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex flex-wrap gap-2 sm:ml-auto w-full sm:w-auto">
          <Button onClick={() => fileInputRef.current?.click()} variant="outline" size="sm" className="font-sans flex-grow sm:flex-grow-0">
            <Upload className="mr-2 h-4 w-4" />
            导入配置
          </Button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImportFileSelected}
            style={{ display: 'none' }}
            accept=".json"
          />
          <Button onClick={handleExportConfigs} variant="outline" size="sm" className="font-sans flex-grow sm:flex-grow-0">
            <Download className="mr-2 h-4 w-4" />
            导出配置
          </Button>
          <Button onClick={() => handleOpenApiConfigDialog(null)} size="sm" className="font-sans flex-grow sm:flex-grow-0">
            <PlusCircle className="mr-2 h-4 w-4" />
            添加新主控
          </Button>
        </div>
      </div>

      {apiConfigsList.length === 0 ? (
        <Card className="text-center py-10 shadow-lg card-hover-shadow">
          <CardHeader>
            <CardTitle className="font-title">无主控连接</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground font-sans">未添加任何主控连接。</p>
            <p className="text-muted-foreground font-sans">点击上面的“添加新主控”或“导入配置”开始。</p>
          </CardContent>
        </Card>
      ) : isMobile ? (
        // Mobile Card Layout
        <div className="space-y-3">
          {apiConfigsList.map((config) => {
            const isActive = activeApiConfig?.id === config.id;
            return (
              <Card key={config.id} className={`shadow-md card-hover-shadow relative overflow-hidden ${isActive ? 'border-primary ring-2 ring-primary' : ''}`}>
                <CardHeader className="p-3 pb-2">
                  <div className="flex justify-between items-start space-x-2">
                    <div className="flex-grow min-w-0">
                      <div
                        className="text-sm font-semibold cursor-pointer hover:text-primary truncate"
                        onClick={() => !isActive && handleSetActive(config.id)}
                        title={isActive ? config.name : `点击激活: ${config.name}`}
                      >
                        {config.name}
                      </div>
                      <div className="font-mono text-xs text-muted-foreground/80 break-all" title={config.apiUrl}>
                        {config.apiUrl}
                      </div>
                    </div>
                    <div className="flex items-center space-x-1 flex-shrink-0">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="管理主控">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {!isActive && (
                            <DropdownMenuItem onClick={() => handleSetActive(config.id)}>
                              <Power className="mr-2 h-4 w-4" /> 设为活动
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => handleOpenApiConfigDialog(config)}>
                            <Edit3 className="mr-2 h-4 w-4" /> 编辑
                          </DropdownMenuItem>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <DropdownMenuItem
                                    onSelect={(e) => e.preventDefault()} 
                                    disabled={isActive}
                                    className={isActive ? "" : "text-destructive hover:!text-destructive focus:!text-destructive focus:!bg-destructive/10"}
                                >
                                 <Trash2 className="mr-2 h-4 w-4" /> 删除
                                </DropdownMenuItem>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                <AlertDialogTitle className="font-title">确认删除</AlertDialogTitle>
                                <AlertDialogDescription className="font-sans">
                                    确定删除主控 “{config.name}”？此操作无法撤销。
                                </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                <AlertDialogCancel className="font-sans">取消</AlertDialogCancel>
                                <AlertDialogAction
                                    onClick={() => {
                                        setDeletingConfig(config); 
                                        handleDeleteConfirm();
                                    }}
                                    className="bg-destructive hover:bg-destructive/90 font-sans text-destructive-foreground"
                                >
                                    删除
                                </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-3 pt-1">
                  <CompactMasterInfo config={config} isActive={isActive} />
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        // Desktop Table Layout
        <div className="border rounded-lg shadow-md overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[60px] text-center font-sans">状态</TableHead>
                <TableHead className="font-sans">主控名称</TableHead>
                <TableHead className="font-sans">主控 API 地址</TableHead>
                <TableHead className="font-sans">版本</TableHead>
                <TableHead className="font-sans">系统信息</TableHead>
                <TableHead className="font-sans">默认日志</TableHead>
                <TableHead className="font-sans">默认TLS</TableHead>
                <TableHead className="text-right w-[250px] font-sans">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {apiConfigsList.map((config) => (
                <TableRow key={config.id} className={activeApiConfig?.id === config.id ? 'bg-muted/50' : ''}>
                  <TableCell className="text-center">
                    {activeApiConfig?.id === config.id && (
                      <CheckCircle className="h-5 w-5 text-green-500 inline-block" />
                    )}
                  </TableCell>
                  <TableCell className="font-medium break-all font-sans">{config.name}</TableCell>
                  <TableCell className="text-xs break-all font-mono">{config.apiUrl}</TableCell>
                  <MasterInfoCells apiConfig={config} />
                  <TableCell className="text-right">
                    <div className="flex justify-end items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenApiConfigDialog(config)}
                        aria-label={`编辑主控 ${config.name}`}
                        className="font-sans"
                      >
                        <Edit3 className="mr-1 h-3.5 w-3.5" />
                        编辑
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => setDeletingConfig(config)}
                            aria-label={`删除主控 ${config.name}`}
                            disabled={activeApiConfig?.id === config.id}
                            className="font-sans"
                          >
                            <Trash2 className="mr-1 h-3.5 w-3.5" />
                            删除
                          </Button>
                        </AlertDialogTrigger>
                        {deletingConfig && deletingConfig.id === config.id && (
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle className="font-title">确认删除</AlertDialogTitle>
                              <AlertDialogDescription className="font-sans">
                                确定删除主控 “{deletingConfig.name}”？此操作无法撤销。
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel onClick={() => setDeletingConfig(null)} className="font-sans">取消</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={handleDeleteConfirm}
                                className="bg-destructive hover:bg-destructive/90 font-sans text-destructive-foreground"
                              >
                                删除
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        )}
                      </AlertDialog>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => handleSetActive(config.id)}
                        disabled={activeApiConfig?.id === config.id}
                        aria-label={`激活主控 ${config.name}`}
                        className="font-sans"
                      >
                        <Power className="mr-1 h-3.5 w-3.5" />
                        {activeApiConfig?.id === config.id ? '当前活动' : '设为活动'}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ApiConfigDialog
        open={isApiConfigDialogOpen}
        onOpenChange={setIsApiConfigDialogOpen}
        onSave={handleSaveApiConfig}
        currentConfig={editingApiConfig}
        isEditing={!!editingApiConfig}
      />
    </div>
  );
}
