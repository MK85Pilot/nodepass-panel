
"use client";

import type { NextPage } from 'next';
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useApiConfig } from '@/hooks/use-api-key';
import { nodePassApi } from '@/lib/api';
import type { Instance } from '@/types/nodepass';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell } from 'recharts';
import { ChartContainer, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Loader2, RefreshCw, AlertTriangle, BarChart3, List } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Server, Smartphone } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';


interface InstanceWithApiDetails extends Instance {
  apiId: string;
  apiName: string;
}

function formatBytes(bytes: number, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

const chartConfig = {
  bytes: {
    label: "字节",
  },
  tcpRx: {
    label: "TCP 接收",
    color: "hsl(var(--chart-1))",
  },
  tcpTx: {
    label: "TCP 发送",
    color: "hsl(var(--chart-2))",
  },
  udpRx: {
    label: "UDP 接收",
    color: "hsl(var(--chart-3))",
  },
  udpTx: {
    label: "UDP 发送",
    color: "hsl(var(--chart-4))",
  },
} satisfies ChartConfig;


const TrafficPage: NextPage = () => {
  const { apiConfigsList, isLoading: isLoadingApiConfig, getApiRootUrl, getToken } = useApiConfig();
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const { data: allInstancesData, isLoading: isLoadingData, error: fetchErrorGlobal, refetch } = useQuery<
    InstanceWithApiDetails[],
    Error,
    InstanceWithApiDetails[]
  >({
    queryKey: ['allInstancesForTraffic', apiConfigsList.map(c => c.id).join(',')],
    queryFn: async () => {
      if (apiConfigsList.length === 0) {
        return [];
      }
      let combinedInstances: InstanceWithApiDetails[] = [];
      
      const results = await Promise.allSettled(
        apiConfigsList.map(async (config) => {
          const apiRootVal = getApiRootUrl(config.id);
          const tokenVal = getToken(config.id);
          
          if (!apiRootVal || !tokenVal) {
            console.warn(`TrafficPage: API config "${config.name}" (ID: ${config.id}) is invalid. Skipping.`);
            // Return an empty array for this promise if config is bad, so Promise.allSettled still works.
            // Or, you could choose to reject it to mark it as a failure for this specific API.
            // For simplicity in combining results, an empty array is fine if it's a config issue.
            return []; 
          }
          
          try {
            const data = await nodePassApi.getInstances(apiRootVal, tokenVal);
            return data.map(inst => ({ ...inst, apiId: config.id, apiName: config.name }));
          } catch (error) {
            // Log the specific error for this API config
            console.error(`TrafficPage: Failed to load instances from API "${config.name}" (ID: ${config.id}). Error:`, error instanceof Error ? error.message : String(error));
            // Important: Do NOT re-throw here if you want the page to show partial data.
            // Instead, let this promise be 'rejected' in Promise.allSettled.
            // We will filter out rejected promises or handle them later.
            // To make Promise.allSettled reflect this as a specific failure, we can make this inner promise reject.
            return Promise.reject(new Error(`Failed to fetch from ${config.name}: ${error instanceof Error ? error.message : String(error)}`));
          }
        })
      );

      results.forEach(result => {
        if (result.status === 'fulfilled' && result.value) {
          combinedInstances.push(...result.value);
        } else if (result.status === 'rejected') {
          // The specific error was already logged in the catch block above.
          // We are choosing to not let one API failure stop the entire page load.
          // console.warn(`TrafficPage: One or more API fetches failed. Reason:`, result.reason);
        }
      });
      return combinedInstances;
    },
    enabled: !isLoadingApiConfig && apiConfigsList.length > 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    onSuccess: () => {
      setLastRefreshed(new Date());
    }
  });

  const allInstances = allInstancesData || [];

  const overallTrafficData = useMemo(() => {
    if (allInstances.length === 0) return [];
    const totals = allInstances.reduce((acc, inst) => {
      acc.tcpRx += inst.tcprx;
      acc.tcpTx += inst.tcptx;
      acc.udpRx += inst.udprx;
      acc.udpTx += inst.udptx;
      return acc;
    }, { tcpRx: 0, tcpTx: 0, udpRx: 0, udpTx: 0 });

    return [
      { name: chartConfig.tcpRx.label, total: totals.tcpRx, fill: "var(--color-tcpRx)" },
      { name: chartConfig.tcpTx.label, total: totals.tcpTx, fill: "var(--color-tcpTx)" },
      { name: chartConfig.udpRx.label, total: totals.udpRx, fill: "var(--color-udpRx)" },
      { name: chartConfig.udpTx.label, total: totals.udpTx, fill: "var(--color-udpTx)" },
    ];
  }, [allInstances]);

  const handleRefresh = () => {
    refetch();
  };

  if (isLoadingApiConfig) {
    return (
      <AppLayout>
        <div className="text-center py-10 flex flex-col items-center justify-center h-[calc(100vh-10rem-4rem)]">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="mt-3">加载API配置...</p>
        </div>
      </AppLayout>
    );
  }

  // Note: fetchErrorGlobal from useQuery might not be set if we handle rejections within queryFn without re-throwing.
  // However, if a critical error occurs before Promise.allSettled (e.g., apiConfigsList is bad), it might be set.
  if (fetchErrorGlobal && !isLoadingData) { 
    return (
      <AppLayout>
        <Card className="max-w-md mx-auto mt-10 shadow-lg">
          <CardHeader><CardTitle className="text-destructive flex items-center justify-center"><AlertTriangle className="h-6 w-6 mr-2" />错误</CardTitle></CardHeader>
          <CardContent><p>加载数据失败: {fetchErrorGlobal.message}</p></CardContent>
        </Card>
      </AppLayout>
    );
  }


  return (
    <AppLayout>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">流量统计</h1>
        <div className="flex items-center gap-2">
          {lastRefreshed && <span className="text-xs text-muted-foreground">刷新: {lastRefreshed.toLocaleTimeString()}</span>}
          <Button variant="outline" onClick={handleRefresh} disabled={isLoadingData}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoadingData ? 'animate-spin' : ''}`} />
            {isLoadingData ? '刷新中...' : '刷新数据'}
          </Button>
        </div>
      </div>

      {isLoadingData && (
        <div className="text-center py-10 flex flex-col items-center justify-center h-[calc(100vh-10rem-4rem)]">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="mt-3">加载流量数据...</p>
        </div>
      )}

      {!isLoadingData && allInstances.length === 0 && !fetchErrorGlobal && (
        <Card className="text-center py-10 shadow-lg">
          <CardHeader><CardTitle>无数据显示</CardTitle></CardHeader>
          <CardContent><p className="text-muted-foreground">{apiConfigsList.length > 0 ? "未找到任何实例或所有实例流量为0。" : "请先配置API连接。"}</p></CardContent>
        </Card>
      )}

      {!isLoadingData && allInstances.length > 0 && (
        <div className="space-y-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center"><BarChart3 className="mr-2 h-5 w-5 text-primary" />整体流量用量</CardTitle>
              <CardDescription>所有实例的总流量统计。</CardDescription>
            </CardHeader>
            <CardContent className="pl-2">
              {overallTrafficData.length > 0 ? (
                <ChartContainer config={chartConfig} className="h-[250px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={overallTrafficData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false}/>
                      <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => formatBytes(value)} />
                      <RechartsTooltip
                        cursor={{ fill: 'hsl(var(--muted))', radius: 4 }}
                        content={<ChartTooltipContent formatter={(value) => formatBytes(value as number)} />}
                      />
                      <Bar dataKey="total" radius={4}>
                        {overallTrafficData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartContainer>
              ) : (
                <p className="text-muted-foreground text-center py-4">无流量数据可用于图表。</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center"><List className="mr-2 h-5 w-5 text-primary" />各实例流量详情</CardTitle>
              <CardDescription>每个单独实例的流量统计。</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>API 名称</TableHead>
                      <TableHead>实例 ID</TableHead>
                      <TableHead>类型</TableHead>
                      <TableHead className="text-right">TCP 接收</TableHead>
                      <TableHead className="text-right">TCP 发送</TableHead>
                      <TableHead className="text-right">UDP 接收</TableHead>
                      <TableHead className="text-right">UDP 发送</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allInstances.map((instance) => (
                      <TableRow key={instance.id}>
                        <TableCell className="truncate max-w-[150px]">{instance.apiName}</TableCell>
                        <TableCell className="font-mono text-xs truncate max-w-[100px]">{instance.id.substring(0,12)}...</TableCell>
                        <TableCell>
                           <Badge
                            variant={instance.type === 'server' ? 'default' : 'accent'}
                            className="items-center whitespace-nowrap text-xs"
                          >
                            {instance.type === 'server' ? <Server className="h-3 w-3 mr-1" /> : <Smartphone className="h-3 w-3 mr-1" />}
                            {instance.type === 'server' ? '服务器' : '客户端'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">{formatBytes(instance.tcprx)}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{formatBytes(instance.tcptx)}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{formatBytes(instance.udprx)}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{formatBytes(instance.udptx)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </AppLayout>
  );
};

export default TrafficPage;

    