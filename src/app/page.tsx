
"use client";

import React, { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { ApiConfigDialog } from '@/components/nodepass/ApiKeyDialog';
import { CreateInstanceDialog } from '@/components/nodepass/CreateInstanceDialog';
import { InstanceList } from '@/components/nodepass/InstanceList';
import { ConnectionsManager } from '@/components/nodepass/ConnectionsManager'; // Import the new manager
import { useApiConfig, type NamedApiConfig } from '@/hooks/use-api-key';
import { Loader2, PlusCircle } from 'lucide-react';
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

  useEffect(() => {
    if (!isLoadingApiConfig && apiConfigsList.length === 0 && !activeApiConfig) {
      setEditingApiConfigForSetup(null);
      setIsApiConfigDialogOpenForSetup(true);
    }
  }, [apiConfigsList, isLoadingApiConfig, activeApiConfig]);

  const handleSaveApiConfigForSetup = (configToSave: Omit<NamedApiConfig, 'id'> & { id?: string }) => {
    const savedConfig = addOrUpdateApiConfig(configToSave);
    setActiveApiConfigId(savedConfig.id);
    setEditingApiConfigForSetup(null);
    setIsApiConfigDialogOpenForSetup(false);
    toast({
      title: '主控已添加',
      description: `“${savedConfig.name}”已保存并激活。`,
    });
  };

  const handleOpenApiConfigDialogForSetup = () => {
    setEditingApiConfigForSetup(null);
    setIsApiConfigDialogOpenForSetup(true);
  };

  const currentApiRoot = activeApiConfig ? getApiRootUrl(activeApiConfig.id) : null;
  const currentToken = activeApiConfig ? getToken(activeApiConfig.id) : null;


  if (isLoadingApiConfig) {
    return (
      <AppLayout>
        <div className="flex-grow container mx-auto px-4 py-8 flex items-center justify-center h-[calc(100vh-var(--header-height)-var(--footer-height)-4rem)]">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="ml-4 text-lg font-sans">加载主控配置...</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
        {activeApiConfig ? (
          <div className="space-y-8">
            <div className="text-right">
              <Button onClick={() => setIsCreateInstanceDialogOpen(true)} disabled={!currentApiRoot || !currentToken} className="font-sans">
                <PlusCircle className="mr-2 h-5 w-5" />
                创建新实例
              </Button>
            </div>
            <InstanceList
              key={activeApiConfig.id} 
              apiId={activeApiConfig.id}
              apiName={activeApiConfig.name}
              apiRoot={currentApiRoot}
              apiToken={currentToken}
              activeApiConfig={activeApiConfig}
            />
            {/* EventLog section replaced */}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-center h-[calc(100vh-var(--header-height)-var(--footer-height)-4rem)]">
            <h2 className="text-2xl font-semibold mb-4 font-title">
              {apiConfigsList.length > 0 ? '未选择主控' : '需要主控连接'}
            </h2>
            <p className="text-muted-foreground mb-6 font-sans">
              {apiConfigsList.length > 0
                ? '请选择或添加一个主控连接。'
                : '请先添加主控连接以开始使用。'}
            </p>
            {apiConfigsList.length === 0 && (
              <Button onClick={handleOpenApiConfigDialogForSetup} size="lg" className="font-sans">
                添加主控连接
              </Button>
            )}
             {apiConfigsList.length > 0 && !activeApiConfig && (
              <p className="text-sm text-muted-foreground mt-4 font-sans">
                点击右上角设置图标管理主控连接。
              </p>
            )}
          </div>
        )}

      {/* This card now holds the ConnectionsManager */}
      <Card className="shadow-lg mt-8">
        <CardHeader>
          <CardTitle className="font-title">主控连接管理</CardTitle>
          <CardDescription className="font-sans">
            查看、添加、编辑或切换您的主控连接。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ConnectionsManager />
        </CardContent>
      </Card>

      <ApiConfigDialog
        open={isApiConfigDialogOpenForSetup}
        onOpenChange={setIsApiConfigDialogOpenForSetup}
        onSave={handleSaveApiConfigForSetup}
        currentConfig={editingApiConfigForSetup}
        isEditing={!!editingApiConfigForSetup}
      />
      <CreateInstanceDialog
        open={isCreateInstanceDialogOpen}
        onOpenChange={setIsCreateInstanceDialogOpen}
        apiId={activeApiConfig?.id || null}
        apiRoot={currentApiRoot}
        apiToken={currentToken}
        apiName={activeApiConfig?.name || null}
        activeApiConfig={activeApiConfig}
      />
    </AppLayout>
  );
}


    