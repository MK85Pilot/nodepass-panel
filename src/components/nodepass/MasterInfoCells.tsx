
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
import { MASTER_TLS_MODE_DISPLAY_MAP } from './create-instance-dialog/constants';

interface MasterInfoCellsProps {
  apiConfig: NamedApiConfig;
}

const mapLogLevel = (logLevel: string | undefined): string => {
  if (!logLevel) return 'N/A';
  const lowerLogLevel = logLevel.toLowerCase();
  if (lowerLogLevel === 'master') return '主控默认';
  return lowerLogLevel.charAt(0).toUpperCase() + lowerLogLevel.slice(1);
}

const mapTlsMode = (tlsMode: string | undefined): string => {
  if (!tlsMode) return 'N/A';
  if (tlsMode in MASTER_TLS_MODE_DISPLAY_MAP) {
    return MASTER_TLS_MODE_DISPLAY_MAP[tlsMode as keyof typeof MASTER_TLS_MODE_DISPLAY_MAP];
  }
  return tlsMode; // Fallback to raw value if not in map
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
    staleTime: 5 * 60 * 1000, 
    refetchOnWindowFocus: false,
  });

  if (isLoading) {
    return (
      <>
        <TableCell><Skeleton className="h-4 w-16" /></TableCell>
        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
        <TableCell><Skeleton className="h-4 w-16" /></TableCell>
        <TableCell><Skeleton className="h-4 w-20" /></TableCell>
      </>
    );
  }

  const errorContent = (
    <>
      <TableCell className="text-xs text-destructive" colSpan={2} title={error?.message}>
        <div className="flex items-center">
          <AlertTriangle className="h-3.5 w-3.5 mr-1 inline-block" />
          错误
        </div>
      </TableCell>
      <TableCell className="text-xs text-destructive" colSpan={2}>
        <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isRefetching} className="h-auto p-1 text-xs text-destructive hover:text-destructive">
          <RefreshCw className={`h-3 w-3 ${isRefetching ? 'animate-spin' : ''}`} />
        </Button>
      </TableCell>
    </>
  );

  if (error) {
    return errorContent;
  }

  if (!data) {
    return (
      <>
        <TableCell className="text-xs text-muted-foreground">N/A</TableCell>
        <TableCell className="text-xs text-muted-foreground">N/A</TableCell>
        <TableCell className="text-xs text-muted-foreground">N/A</TableCell>
        <TableCell className="text-xs text-muted-foreground">N/A</TableCell>
      </>
    );
  }

  const systemInfoDisplay = `${data.os} ${data.arch}`;

  return (
    <>
      <TableCell className="text-xs font-mono" title={data.ver}>{data.ver}</TableCell>
      <TableCell className="text-xs font-mono truncate max-w-[150px]" title={systemInfoDisplay}>
        {systemInfoDisplay}
      </TableCell>
      <TableCell className="text-xs font-sans" title={`主控当前日志级别: ${data.log}`}>
        {mapLogLevel(data.log)}
      </TableCell>
      <TableCell className="text-xs font-sans" title={`主控当前TLS模式: ${data.tls}`}>
        {mapTlsMode(data.tls)}
      </TableCell>
    </>
  );
}
