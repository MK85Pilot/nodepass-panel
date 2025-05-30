
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
import { Loader2, RefreshCw, AlertTriangle, BarChartHorizontalBig, List } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Server, Smartphone } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';


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
  const { toast } = useToast();
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
            return []; 
          }
          
          try {
            const data = await nodePassApi.getInstances(apiRootVal, tokenVal);
            return data.map(inst => ({ ...inst, apiId: config.id, apiName: config.name }));
          } catch (error: any) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`TrafficPage: Failed to load instances from API "${config.name}" (ID: ${config.id}). Error:`, errorMessage);
            toast({
              title: `加载 "${config.name}" 失败`,
              description: errorMessage.length > 100 ? errorMessage.substring(0, 97) + "..." : errorMessage,
              variant: 'destructive',
            });
            return [];
          }
        })
      );

      results.forEach(result => {
        if (result.status === 'fulfilled' && result.value) {
          combinedInstances.push(...result.value);
        } else if (result.status === 'rejected') {
          console.warn(`TrafficPage: One or more API fetches failed (already handled and toast shown). Reason: ${result.reason?.message || String(result.reason)}`);
        }
      });
      // Filter out the special API Key instance
      return combinedInstances.filter(inst => inst.id !== '********');
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
        <div className="flex-grow container mx-auto px-4 py-8 flex items-center justify-center h-[calc(100vh-var(--header-height)-var(--footer-height)-4rem)]">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="ml-4 text-lg font-sans">加载主控配置...</p>
        </div>
      </AppLayout>
    );
  }

  if (fetchErrorGlobal && !isLoadingData) { 
    return (
      <AppLayout>
        <Card className="max-w-md mx-auto mt-10 shadow-lg">
          <CardHeader><CardTitle className="text-destructive flex items-center justify-center font-title"><AlertTriangle className="h-6 w-6 mr-2" />错误</CardTitle></CardHeader>
          <CardContent><p className="font-sans">加载流量数据失败: {fetchErrorGlobal.message}</p></CardContent>
        </Card>
      </AppLayout>
    );
  }


  return (
    <AppLayout>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold font-title">流量统计</h1>
        <div className="flex items-center gap-2">
          {lastRefreshed && <span className="text-xs text-muted-foreground font-sans">刷新: {lastRefreshed.toLocaleTimeString()}</span>}
          <Button variant="outline" onClick={handleRefresh} disabled={isLoadingData} className="font-sans">
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoadingData ? 'animate-spin' : ''}`} />
            {isLoadingData ? '刷新中...' : '刷新数据'}
          </Button>
        </div>
      </div>

      {isLoadingData && !isLoadingApiConfig && (
        <div className="flex-grow container mx-auto px-4 py-8 flex items-center justify-center h-[calc(100vh-var(--header-height)-var(--footer-height)-4rem)]">
          <Loader2 className="h-16 w-16 animate-spin text-primary" />
          <p className="ml-4 text-xl font-sans">加载流量数据...</p>
        </div>
      )}

      {!isLoadingData && allInstances.length === 0 && !fetchErrorGlobal && (
        <Card className="text-center py-10 shadow-lg card-hover-shadow">
          <CardHeader><CardTitle className="font-title">无数据显示</CardTitle></CardHeader>
          <CardContent><p className="text-muted-foreground font-sans">{apiConfigsList.length > 0 ? "未找到任何实例或所有实例流量为0。" : "请先配置主控连接。"}</p></CardContent>
        </Card>
      )}

      {!isLoadingData && allInstances.length > 0 && (
        <div className="space-y-8">
          <Card className="shadow-lg card-hover-shadow">
            <CardHeader>
              <CardTitle className="flex items-center font-title"><BarChartHorizontalBig className="mr-2 h-5 w-5 text-primary" />整体流量用量</CardTitle>
              <CardDescription className="font-sans mt-1">所有实例的总流量统计。</CardDescription>
            </CardHeader>
            <CardContent className="pl-2">
              {overallTrafficData.length > 0 ? (
                <ChartContainer config={chartConfig} className="h-[250px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={overallTrafficData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false}/>
                      <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} className="font-sans" />
                      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => formatBytes(value)} className="font-sans"/>
                      <RechartsTooltip
                        cursor={{ fill: 'hsl(var(--muted))', radius: 4 }}
                        content={<ChartTooltipContent formatter={(value) => formatBytes(value as number)} className="font-sans"/>}
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
                <p className="text-muted-foreground text-center py-4 font-sans">无流量数据可用于图表。</p>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-lg card-hover-shadow">
            <CardHeader>
              <CardTitle className="flex items-center font-title"><List className="mr-2 h-5 w-5 text-primary" />各实例流量详情</CardTitle>
              <CardDescription className="font-sans mt-1">每个单独实例的流量统计。</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="font-sans">来源主控</TableHead>
                      <TableHead className="font-sans">实例 ID</TableHead>
                      <TableHead className="font-sans">类型</TableHead>
                      <TableHead className="text-right font-sans">TCP 接收</TableHead>
                      <TableHead className="text-right font-sans">TCP 发送</TableHead>
                      <TableHead className="text-right font-sans">UDP 接收</TableHead>
                      <TableHead className="text-right font-sans">UDP 发送</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allInstances.map((instance) => (
                      <TableRow key={`${instance.apiId}-${instance.id}`}>
                        <TableCell className="truncate max-w-[150px] font-sans">{instance.apiName}</TableCell>
                        <TableCell className="font-mono text-xs truncate max-w-[100px]">{instance.id.substring(0,12)}...</TableCell>
                        <TableCell>
                           <Badge
                            variant={instance.type === 'server' ? 'default' : 'accent'}
                            className="items-center whitespace-nowrap text-xs font-sans"
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
