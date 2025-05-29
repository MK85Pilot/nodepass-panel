
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
import { PlusCircle, Edit3, Trash2, Power, CheckCircle, Loader2, Upload, Download } from 'lucide-react'; // AlertTriangle removed
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
  };

  const handleSetActive = (id: string) => {
    const config = apiConfigsList.find(c => c.id === id);
    setActiveApiConfigId(id);
    toast({
      title: '活动主控已切换',
      description: `已连接到 “${config?.name}”。`,
    });
    onLog?.(`活动主控已切换至: "${config?.name}"`, 'INFO');
    window.location.href = '/'; // Force reload to ensure all components pick up new active config
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
        
        const importedConfigs = JSON.parse(content) as Partial<NamedApiConfig>[];
        if (!Array.isArray(importedConfigs)) throw new Error("导入文件格式无效，应为JSON数组。");

        let importedCount = 0;
        let skippedCount = 0;
        let invalidCount = 0;

        importedConfigs.forEach(importedConfig => {
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
                prefixPath: importedConfig.prefixPath === undefined ? null : importedConfig.prefixPath,
                masterDefaultLogLevel: importedConfig.masterDefaultLogLevel || 'master',
                masterDefaultTlsMode: importedConfig.masterDefaultTlsMode || 'master',
                // ignoreSslErrors removed
              };
              addOrUpdateApiConfig(configToAdd);
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
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          <Button onClick={() => fileInputRef.current?.click()} variant="outline" size="sm" className="font-sans">
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
          <Button onClick={handleExportConfigs} variant="outline" size="sm" className="font-sans">
            <Download className="mr-2 h-4 w-4" />
            导出配置
          </Button>
          <Button onClick={() => handleOpenApiConfigDialog(null)} size="sm" className="font-sans">
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
          <CardContent>
            <p className="text-muted-foreground font-sans">未添加任何主控连接。</p>
            <p className="text-muted-foreground font-sans">点击“添加新主控”或“导入配置”开始。</p>
          </CardContent>
        </Card>
      ) : (
        <div className="border rounded-lg shadow-md overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[60px] text-center font-sans">状态</TableHead>
                <TableHead className="font-sans">主控名称</TableHead>
                <TableHead className="font-sans">主控 API 地址</TableHead>
                <TableHead className="font-sans">API 前缀</TableHead>
                {/* Removed "忽略SSL" column */}
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
                  <TableCell className="text-xs break-all font-mono">{config.prefixPath || '无 (默认/api)'}</TableCell>
                  {/* Removed TableCell for ignoreSslErrors */}
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
        onLog={onLog}
      />
    </div>
  );
}
