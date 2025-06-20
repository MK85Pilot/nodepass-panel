
"use client";

import React from 'react';
import { useApiConfig, type NamedApiConfig } from '@/hooks/use-api-key';
import { Cog, RefreshCw, Loader2 } from 'lucide-react'; 
import { Skeleton } from '@/components/ui/skeleton';
import { useQuery } from '@tanstack/react-query';
import { nodePassApi } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

interface MasterPaletteItemProps {
  config: NamedApiConfig;
  isMobileClickToAdd?: boolean;
  onItemClick?: (type: 'master', data: NamedApiConfig) => void;
}

const MasterPaletteItem: React.FC<MasterPaletteItemProps> = ({ config, isMobileClickToAdd, onItemClick }) => {
  const { getApiRootUrl, getToken } = useApiConfig();
  const { toast } = useToast();

  const { data: instanceCounts, isLoading: isLoadingInstances, error, refetch } = useQuery<
    { totalInstanceCount: number }, 
    Error
  >({
    queryKey: ['masterInstancesCount', config.id],
    queryFn: async () => {
      const apiRoot = getApiRootUrl(config.id);
      const token = getToken(config.id);
      if (!apiRoot || !token) {
        throw new Error(`API configuration for master ${config.name} is incomplete.`);
      }
      const fetchedInstances = await nodePassApi.getInstances(apiRoot, token);
      const totalInstanceCount = fetchedInstances.filter(inst => inst.id !== '********').length;
      return { totalInstanceCount };
    },
    enabled: !!config.id,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    onError: (err) => {
        toast({
            title: `获取主控 ${config.name} 实例计数失败`,
            description: err.message,
            variant: "destructive"
        })
    }
  });

  const handleDragStart = (event: React.DragEvent<HTMLDivElement>, masterConfig: NamedApiConfig) => {
    if (isMobileClickToAdd) return;
    event.dataTransfer.setData('application/nodepass-master-config', JSON.stringify(masterConfig));
    event.dataTransfer.effectAllowed = 'move';
  };
  
  const handleClick = (masterConfig: NamedApiConfig) => {
    if (isMobileClickToAdd && onItemClick) {
      onItemClick('master', masterConfig);
    }
  };

  const countsDisplay = isLoadingInstances
    ? <Loader2 className="h-3 w-3 animate-spin ml-1" />
    : error
    ? <RefreshCw className="h-3 w-3 ml-1 text-destructive cursor-pointer" onClick={(e) => { e.stopPropagation(); refetch(); }} title="点击重试计数"/>
    : instanceCounts
    ? `(${instanceCounts.totalInstanceCount} 个实例)` 
    : '';


  return (
    <div
      draggable={!isMobileClickToAdd}
      onDragStart={!isMobileClickToAdd ? (event) => handleDragStart(event, config) : undefined}
      onClick={isMobileClickToAdd ? () => handleClick(config) : undefined}
      className={`group flex items-center justify-between p-2 border rounded-md bg-card text-card-foreground hover:bg-muted/50 transition-colors text-xs font-sans shadow-sm ${isMobileClickToAdd ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'}`}
      title={isMobileClickToAdd ? `点按添加主控 "${config.name}" 到画布` :`拖拽主控 "${config.name}" 到画布`}
    >
      <div className="flex items-center truncate">
        <Cog className="mr-2 h-4 w-4 text-primary flex-shrink-0" />
        <span className="truncate mr-1">{config.name}</span>
        {config.id && <span className="text-muted-foreground text-[10px]">{countsDisplay}</span>}
      </div>
    </div>
  );
};

interface MastersPaletteProps {
  isMobileClickToAdd?: boolean;
  onItemClick?: (type: 'master', data: NamedApiConfig) => void;
}

export function MastersPalette({ isMobileClickToAdd, onItemClick }: MastersPaletteProps) {
  const { apiConfigsList, isLoading } = useApiConfig();

  return (
    <div className="h-full">
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-md" />
          ))}
        </div>
      ) : apiConfigsList.length === 0 ? (
        <p className="text-xs text-muted-foreground font-sans text-center">未配置任何主控。</p>
      ) : (
        <div className="space-y-2">
          {apiConfigsList.map((config) => (
            <MasterPaletteItem
              key={config.id}
              config={config}
              isMobileClickToAdd={isMobileClickToAdd}
              onItemClick={onItemClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}
