
"use client";

import React, { useState, useEffect, useRef } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { ApiConfigDialog } from '@/components/nodepass/ApiKeyDialog';
import { CreateInstanceDialog } from '@/components/nodepass/create-instance-dialog';
import { InstanceList } from '@/components/nodepass/InstanceList';
import { EventLog, type AppLogEntry } from '@/components/nodepass/EventLog';
import { useApiConfig, type NamedApiConfig } from '@/hooks/use-api-key';
import { Loader2, PlusCircle, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';


export default function HomePage() {
  const {
    activeApiConfig,
    apiConfigsList,
    addOrUpdateApiConfig,
    isLoading: isLoadingApiConfig,
    setActiveApiConfigId,
    getApiRootUrl,
    getToken
  } = useApiConfig();
  const { toast } = useToast();

  const [isApiConfigDialogOpenForSetup, setIsApiConfigDialogOpenForSetup] = useState(false);
  const [editingApiConfigForSetup, setEditingApiConfigForSetup] = useState<NamedApiConfig | null>(null);
  
  const [isCreateInstanceDialogOpen, setIsCreateInstanceDialogOpen] = useState(false);

  const [pageLogs, setPageLogs] = useState<AppLogEntry[]>([]);
  const prevApiIdRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);


  const addPageLog = (message: string, type: AppLogEntry['type'], details?: Record<string, any> | string) => {
    setPageLogs(prevLogs => [
      { timestamp: new Date().toISOString(), message, type, details },
      ...prevLogs
    ].slice(0, 100)); 
  };

  useEffect(() => {
    if (activeApiConfig && prevApiIdRef.current !== activeApiConfig.id) {
      if (prevApiIdRef.current !== null) { 
        addPageLog('活动主控已切换至: "' + activeApiConfig.name + '"', 'INFO', { previousApiId: prevApiIdRef.current, newApiId: activeApiConfig.id });
      } else {
        addPageLog('活动主控已设置为: "' + activeApiConfig.name + '"', 'INFO', { newApiId: activeApiConfig.id });
      }
      prevApiIdRef.current = activeApiConfig.id;
    } else if (!activeApiConfig && prevApiIdRef.current !== null) {
        addPageLog('活动主控已断开连接。', 'INFO', { previousApiId: prevApiIdRef.current });
        prevApiIdRef.current = null;
    }
  }, [activeApiConfig]);


  const handleSaveApiConfigForSetup = (configToSave: Omit<NamedApiConfig, 'id'> & { id?: string }) => {
    const savedConfig = addOrUpdateApiConfig(configToSave);
    setActiveApiConfigId(savedConfig.id);
    setEditingApiConfigForSetup(null);
    setIsApiConfigDialogOpenForSetup(false);
    toast({
      title: '主控已添加',
      description: `“${configToSave.name}”已保存并激活。`,
    });
    addPageLog(`主控 "${savedConfig.name}" 已添加并激活。`, 'SUCCESS', { configId: savedConfig.id, name: savedConfig.name });
  };

  const handleOpenApiConfigDialogForSetup = () => {
    setEditingApiConfigForSetup(null); 
    setIsApiConfigDialogOpenForSetup(true);
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
        addPageLog(`主控配置导入完成: ${importSummary}`, 'INFO');
        if (importedCount > 0 && !activeApiConfig) {
            // If configs were imported and none was active, try to set the first imported/available one as active
            const firstAvailable = apiConfigsList.find(c => c.id === importedConfigsUntyped.find(ic => ic.id)?.id) || apiConfigsList[0];
            if (firstAvailable) {
                setActiveApiConfigId(firstAvailable.id);
                 toast({
                    title: '主控已激活',
                    description: `“${firstAvailable.name}”已自动激活。`,
                });
                addPageLog(`主控 "${firstAvailable.name}" 已自动激活。`, 'INFO');
            }
        }

      } catch (error: any) {
        toast({
          title: '导入失败',
          description: error.message || '解析文件失败或文件格式不正确。',
          variant: 'destructive',
        });
        addPageLog(`主控配置导入失败: ${error.message || '未知错误'}`, 'ERROR');
      }
    };
    reader.onerror = () => {
       toast({
        title: '导入失败',
        description: '读取文件时发生错误。',
        variant: 'destructive',
      });
      addPageLog('主控配置导入失败: 读取文件错误。', 'ERROR');
    }
    reader.readAsText(file);
    if (event.target) {
      event.target.value = ''; 
    }
  };


  const currentApiId = activeApiConfig?.id || null;
  const currentApiName = activeApiConfig?.name || null;
  const currentApiRoot = activeApiConfig ? getApiRootUrl(activeApiConfig.id) : null;
  const currentToken = activeApiConfig ? getToken(activeApiConfig.id) : null;


  if (isLoadingApiConfig) {
    return (
      <AppLayout onLog={addPageLog}>
        <div className="flex-grow container mx-auto px-4 py-8 flex items-center justify-center h-[calc(100vh-var(--header-height)-var(--footer-height)-4rem)]">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="ml-4 text-lg font-sans">加载主控配置...</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout onLog={addPageLog}>
        {activeApiConfig ? (
          <div className="space-y-8">
            <InstanceList
              key={activeApiConfig.id} 
              apiId={currentApiId}
              apiName={currentApiName}
              apiRoot={currentApiRoot}
              apiToken={currentToken}
              activeApiConfig={activeApiConfig}
              apiConfigsList={apiConfigsList}
              onLog={addPageLog}
              onOpenCreateInstanceDialog={() => setIsCreateInstanceDialogOpen(true)}
            />
          </div>
        ) : (
           <div className="flex flex-col items-center justify-center text-center h-[calc(100vh-var(--header-height)-var(--footer-height)-8rem-20rem)]">
            <h2 className="text-2xl font-semibold mb-4 font-title">
              {apiConfigsList.length > 0 ? '未选择主控' : '需要主控连接'}
            </h2>
            <p className="text-muted-foreground mb-6 font-sans">
              {apiConfigsList.length > 0
                ? '请从头部菜单选择或添加一个主控连接。'
                : '请先通过头部菜单添加主控连接或导入配置以开始使用。'}
            </p>
            {apiConfigsList.length === 0 && (
              <div className="flex flex-col sm:flex-row gap-4">
                <Button onClick={handleOpenApiConfigDialogForSetup} size="lg" className="font-sans">
                  <PlusCircle className="mr-2 h-5 w-5" />
                  添加主控
                </Button>
                <Button onClick={() => fileInputRef.current?.click()} size="lg" variant="outline" className="font-sans">
                  <Upload className="mr-2 h-5 w-5" />
                  导入配置
                </Button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImportFileSelected}
                  style={{ display: 'none' }}
                  accept=".json"
                />
              </div>
            )}
             {apiConfigsList.length > 0 && !activeApiConfig && (
              <p className="text-sm text-muted-foreground mt-4 font-sans">
                点击右上角设置图标管理或选择主控连接。
              </p>
            )}
          </div>
        )}

      <div className="mt-8">
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="font-title">应用事件日志</CardTitle>
            <CardDescription className="font-sans mt-1">
              记录应用内的关键操作和状态变更。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EventLog logs={pageLogs} />
          </CardContent>
        </Card>
      </div>
      
      <ApiConfigDialog
        open={isApiConfigDialogOpenForSetup}
        onOpenChange={setIsApiConfigDialogOpenForSetup}
        onSave={handleSaveApiConfigForSetup}
        currentConfig={editingApiConfigForSetup}
        isEditing={!!editingApiConfigForSetup}
        onLog={addPageLog}
      />
      <CreateInstanceDialog
        open={isCreateInstanceDialogOpen}
        onOpenChange={setIsCreateInstanceDialogOpen}
        apiId={currentApiId}
        apiRoot={currentApiRoot}
        apiToken={currentToken}
        apiName={currentApiName}
        activeApiConfig={activeApiConfig}
        onLog={addPageLog}
      />
    </AppLayout>
  );
}
