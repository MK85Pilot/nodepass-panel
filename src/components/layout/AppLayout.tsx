
"use client";

import React, { type ReactNode } from 'react';
import { Header } from '@/components/layout/Header';
import { useApiConfig, type NamedApiConfig } from '@/hooks/use-api-key';
import { useToast } from '@/hooks/use-toast';
import { ApiConfigDialog } from '@/components/nodepass/ApiKeyDialog'; // For Header props

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { 
    activeApiConfig, 
    apiConfigsList,
    addOrUpdateApiConfig, 
    clearActiveApiConfig, 
    setActiveApiConfigId 
  } = useApiConfig();
  const { toast } = useToast();
  const [isApiConfigDialogOpen, setIsApiConfigDialogOpen] = React.useState(false);
  const [editingApiConfig, setEditingApiConfig] = React.useState<NamedApiConfig | null>(null);

  const handleSaveApiConfig = (configToSave: Omit<NamedApiConfig, 'id'> & { id?: string }) => {
    const savedConfig = addOrUpdateApiConfig(configToSave);
    setActiveApiConfigId(savedConfig.id); 
    setEditingApiConfig(null);
    setIsApiConfigDialogOpen(false);
    toast({
      title: configToSave.id ? '主控已更新' : '主控已添加',
      description: `“${savedConfig.name}”已保存并激活。`,
    });
  };
  
  const handleOpenApiConfigDialog = (configToEdit?: NamedApiConfig | null) => {
    setEditingApiConfig(configToEdit || null);
    setIsApiConfigDialogOpen(true);
  };

  const handleLogout = () => { 
    clearActiveApiConfig();
    toast({
      title: '已断开连接',
      description: '主控连接已断开。',
    });
  };

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header 
        onManageApiConfigs={handleOpenApiConfigDialog}
        hasActiveApiConfig={!!activeApiConfig} 
        onClearActiveConfig={handleLogout}
      />
      <main className="flex-grow container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
      <ApiConfigDialog
        open={isApiConfigDialogOpen}
        onOpenChange={setIsApiConfigDialogOpen}
        onSave={handleSaveApiConfig}
        currentConfig={editingApiConfig}
        isEditing={!!editingApiConfig}
      />
      <footer className="py-6 text-center text-sm text-muted-foreground border-t border-border bg-muted/30">
        NodePass 管理器 &copy; {new Date().getFullYear()} | 
        由 <a 
            href="https://github.com/yosebyte/nodepass" 
            target="_blank" 
            rel="noopener noreferrer"
            className="font-medium text-primary hover:underline"
          >
          NodePass
        </a> 驱动
      </footer>
    </div>
  );
}
