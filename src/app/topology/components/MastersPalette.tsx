
"use client";

import React from 'react';
import { useApiConfig, type NamedApiConfig } from '@/hooks/use-api-key';
import { Cog, RefreshCw, Loader2 } from 'lucide-react'; // MoreVertical removed
import { Skeleton } from '@/components/ui/skeleton';
// Button and DropdownMenu components are no longer needed here
import { useQuery } from '@tanstack/react-query';
import { nodePassApi } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
// parseNodePassUrl, extractHostname, isWildcardHostname removed as they are not used for total count

interface MasterPaletteItemProps {
  config: NamedApiConfig;
}

const MasterPaletteItem: React.FC<MasterPaletteItemProps> = ({ config }) => {
  const { getApiRootUrl, getToken } = useApiConfig();
  const { toast } = useToast();
  // queryClient removed as individual refresh is no longer here

  const { data: instanceCounts, isLoading: isLoadingInstances, error, refetch } = useQuery<
    { totalInstanceCount: number }, // Updated return type
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
    event.dataTransfer.setData('application/nodepass-master-config', JSON.stringify(masterConfig));
    event.dataTransfer.effectAllowed = 'move';
  };

  const countsDisplay = isLoadingInstances
    ? <Loader2 className="h-3 w-3 animate-spin ml-1" />
    : error
    ? <RefreshCw className="h-3 w-3 ml-1 text-destructive cursor-pointer" onClick={() => refetch()} title="点击重试计数"/>
    : instanceCounts
    ? `(${instanceCounts.totalInstanceCount} 个实例)` // Updated display format
    : '';


  return (
    <div
      draggable={true}
      onDragStart={(event) => handleDragStart(event, config)}
      className="group flex items-center justify-between p-2 border rounded-md bg-card text-card-foreground hover:bg-muted/50 cursor-grab active:cursor-grabbing transition-colors text-xs font-sans shadow-sm"
      title={`拖拽主控 "${config.name}" 到画布`}
    >
      <div className="flex items-center truncate">
        <Cog className="mr-2 h-4 w-4 text-primary flex-shrink-0" />
        <span className="truncate mr-1">{config.name}</span>
        {config.id && <span className="text-muted-foreground text-[10px]">{countsDisplay}</span>}
      </div>
    </div>
  );
};


export function MastersPalette() {
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
            />
          ))}
        </div>
      )}
    </div>
  );
}
    

    
