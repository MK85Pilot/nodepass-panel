
"use client";

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { TableCell } from "@/components/ui/table";
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { nodePassApi } from '@/lib/api';
import type { NamedApiConfig } from '@/hooks/use-api-key';
import type { MasterInfo } from '@/types/nodepass';
import { Button } from '@/components/ui/button';

interface MasterInfoCellsProps {
  apiConfig: NamedApiConfig;
}

export function MasterInfoCells({ apiConfig }: MasterInfoCellsProps) {
  const { data, isLoading, error, refetch, isRefetching } = useQuery<MasterInfo, Error>({
    queryKey: ['masterInfo', apiConfig.id],
    queryFn: () => {
      if (!apiConfig.apiUrl || !apiConfig.token) {
        throw new Error("主控配置不完整。");
      }
      return nodePassApi.getMasterInfo(apiConfig.apiUrl, apiConfig.token);
    },
    enabled: !!apiConfig.apiUrl && !!apiConfig.token,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });

  if (isLoading) {
    return (
      <>
        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
        <TableCell><Skeleton className="h-4 w-32" /></TableCell>
      </>
    );
  }

  if (error) {
    return (
      <>
        <TableCell className="text-xs text-destructive" title={error.message}>
          <div className="flex items-center">
            <AlertTriangle className="h-3.5 w-3.5 mr-1 inline-block" />
            错误
          </div>
        </TableCell>
        <TableCell className="text-xs text-destructive">
          <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isRefetching} className="h-auto p-1 text-xs text-destructive hover:text-destructive">
            <RefreshCw className={`h-3 w-3 ${isRefetching ? 'animate-spin' : ''}`} />
          </Button>
        </TableCell>
      </>
    );
  }

  if (!data) {
    return (
      <>
        <TableCell className="text-xs text-muted-foreground">N/A</TableCell>
        <TableCell className="text-xs text-muted-foreground">N/A</TableCell>
      </>
    );
  }

  return (
    <>
      <TableCell className="text-xs font-mono" title={data.version}>{data.version}</TableCell>
      <TableCell className="text-xs font-mono truncate max-w-[200px]" title={`${data.system_info}, ${data.go_version}`}>
        {data.system_info}, {data.go_version}
      </TableCell>
    </>
  );
}
