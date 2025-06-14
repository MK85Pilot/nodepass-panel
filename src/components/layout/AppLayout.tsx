
"use client";

import React, { type ReactNode } from 'react';
import { Header } from '@/components/layout/Header';
import { useApiConfig, type NamedApiConfig } from '@/hooks/use-api-key';
import { useToast } from '@/hooks/use-toast';
import { ApiConfigDialog } from '@/components/nodepass/ApiKeyDialog';
import type { AppLogEntry } from '@/components/nodepass/EventLog';

interface AppLayoutProps {
  children: ReactNode;
  onLog?: (message: string, type: AppLogEntry['type']) => void; // Added onLog prop
}

export function AppLayout({ children, onLog }: AppLayoutProps) {
  const { 
    activeApiConfig, 
    addOrUpdateApiConfig, 
    clearActiveApiConfig, 
    setActiveApiConfigId 
  } = useApiConfig();
  const { toast } = useToast();
  const [isApiConfigDialogOpen, setIsApiConfigDialogOpen] = React.useState(false);
  const [editingApiConfig, setEditingApiConfig] = React.useState<NamedApiConfig | null>(null);

  const handleSaveApiConfig = (configToSave: Omit<NamedApiConfig, 'id'> & { id?: string }) => {
    const isNew = !configToSave.id;
    const savedConfig = addOrUpdateApiConfig(configToSave);
    setActiveApiConfigId(savedConfig.id); 
    setEditingApiConfig(null);
    setIsApiConfigDialogOpen(false);
    const actionText = isNew ? '添加' : '更新';
    toast({
      title: `主控已${actionText}`,
      description: `“${savedConfig.name}”已保存并激活。`,
    });
    onLog?.(`主控 "${savedConfig.name}" 已${actionText}并激活。`, 'SUCCESS');
  };
  
  const handleOpenApiConfigDialog = (configToEdit?: NamedApiConfig | null) => {
    setEditingApiConfig(configToEdit || null);
    setIsApiConfigDialogOpen(true);
  };

  const handleClearActiveConfig = () => { 
    if (activeApiConfig) {
      onLog?.(`断开与主控 "${activeApiConfig.name}" 的连接。`, 'INFO');
    }
    clearActiveApiConfig();
    toast({
      title: '已断开连接',
      description: '活动主控连接已断开。',
    });
  };

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header 
        onManageApiConfigs={handleOpenApiConfigDialog}
        hasActiveApiConfig={!!activeApiConfig} 
        onClearActiveConfig={handleClearActiveConfig} // Changed from onLogout to onClearActiveConfig
        onLog={onLog}
      />
      <main className="flex flex-col flex-grow container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
      <ApiConfigDialog
        open={isApiConfigDialogOpen}
        onOpenChange={setIsApiConfigDialogOpen}
        onSave={handleSaveApiConfig}
        currentConfig={editingApiConfig}
        isEditing={!!editingApiConfig}
        // onLog prop will be handled by the parent if needed, or ApiConfigDialog can log itself
      />
      <footer className="py-6 text-center text-sm text-muted-foreground border-t border-border bg-muted/30">
        NodePass 管理器 &copy; {new Date().getFullYear()} | 
        由 <a 
            href="https://github.com/yosebyte/nodepass" 
            target="_blank" 
            rel="noopener noreferrer"
            className="font-medium text-primary hover:text-primary/80 transition-colors"
          >
          NodePass
        </a> 驱动
      </footer>
    </div>
  );
}
