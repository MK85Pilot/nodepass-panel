
"use client";

import type { NextPage } from 'next';
import React, { useState, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useApiConfig } from '@/hooks/use-api-key';
import { nodePassApi } from '@/lib/api';
import type { Instance } from '@/types/nodepass';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PieChart, Pie, Tooltip as RechartsTooltip, Cell, Label } from 'recharts';
import { ChartContainer, ChartTooltipContent, type ChartConfig, ChartLegend, ChartLegendContent } from "@/components/ui/chart";
import { Loader2, RefreshCw, AlertTriangle, List, ArrowDown, ArrowUp, PieChart as PieChartIcon } from 'lucide-react';
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

  const { chartData, totalTraffic } = useMemo(() => {
    if (allInstances.length === 0) return { chartData: [], totalTraffic: 0 };
    
    const totals = allInstances.reduce((acc, inst) => {
      acc.tcpRx += inst.tcprx;
      acc.tcpTx += inst.tcptx;
      acc.udpRx += inst.udprx;
      acc.udpTx += inst.udptx;
      return acc;
    }, { tcpRx: 0, tcpTx: 0, udpRx: 0, udpTx: 0 });

    const data = [
      { type: 'tcpRx', value: totals.tcpRx, label: chartConfig.tcpRx.label },
      { type: 'tcpTx', value: totals.tcpTx, label: chartConfig.tcpTx.label },
      { type: 'udpRx', value: totals.udpRx, label: chartConfig.udpRx.label },
      { type: 'udpTx', value: totals.udpTx, label: chartConfig.udpTx.label },
    ].filter(d => d.value > 0);

    const total = data.reduce((acc, curr) => acc + curr.value, 0);

    return { chartData: data, totalTraffic: total };
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
              <CardTitle className="flex items-center font-title"><PieChartIcon className="mr-2 h-5 w-5 text-primary" />整体流量分布</CardTitle>
              <CardDescription className="font-sans mt-1">所有实例的总流量按类型分布。</CardDescription>
            </CardHeader>
             <CardContent className="flex-1 pb-0">
                <ChartContainer
                  config={chartConfig}
                  className="mx-auto aspect-square max-h-[300px]"
                >
                  <PieChart>
                    <RechartsTooltip
                      cursor={false}
                      content={<ChartTooltipContent 
                        hideLabel 
                        formatter={(value, name) => `${chartConfig[name as keyof typeof chartConfig].label}: ${formatBytes(value as number)}`} 
                        className="font-sans"
                      />}
                    />
                    <Pie
                      data={chartData}
                      dataKey="value"
                      nameKey="type"
                      innerRadius={60}
                      outerRadius={80}
                      strokeWidth={5}
                      stroke="hsl(var(--background))"
                    >
                       {chartData.map((entry) => (
                        <Cell key={`cell-${entry.type}`} fill={`var(--color-${entry.type})`} />
                       ))}
                       <Label
                          content={({ viewBox }) => {
                            if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                              return (
                                <text
                                  x={viewBox.cx}
                                  y={viewBox.cy}
                                  textAnchor="middle"
                                  dominantBaseline="middle"
                                >
                                  <tspan
                                    x={viewBox.cx}
                                    y={viewBox.cy}
                                    className="fill-foreground text-2xl font-bold font-title"
                                  >
                                    {formatBytes(totalTraffic)}
                                  </tspan>
                                  <tspan
                                    x={(viewBox.cx || 0)}
                                    y={(viewBox.cy || 0) + 20}
                                    className="fill-muted-foreground font-sans text-xs"
                                  >
                                    总用量
                                  </tspan>
                                </text>
                              )
                            }
                          }}
                        />
                    </Pie>
                    <ChartLegend content={<ChartLegendContent nameKey="type" className="font-sans" />} />
                  </PieChart>
                </ChartContainer>
            </CardContent>
            <CardFooter className="flex-col gap-2 text-sm pt-4">
              {/* Footer is intentionally empty as legend is now in the chart */}
            </CardFooter>
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
                      <TableHead className="font-sans min-w-[120px]">来源主控</TableHead>
                      <TableHead className="font-sans min-w-[120px]">实例 ID</TableHead>
                      <TableHead className="font-sans">类型</TableHead>
                      <TableHead className="font-sans min-w-[140px]">TCP (↓/↑)</TableHead>
                      <TableHead className="font-sans min-w-[140px]">UDP (↓/↑)</TableHead>
                      <TableHead className="text-right font-sans min-w-[140px]">总计 (↓/↑)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allInstances.map((instance) => (
                      <TableRow key={`${instance.apiId}-${instance.id}`}>
                        <TableCell className="truncate max-w-[150px] font-sans">{instance.apiName}</TableCell>
                        <TableCell className="font-mono text-xs break-all">{instance.id}</TableCell>
                        <TableCell>
                           <Badge
                            variant={instance.type === 'server' ? 'default' : 'accent'}
                            className="items-center whitespace-nowrap text-xs font-sans"
                          >
                            {instance.type === 'server' ? <Server className="h-3 w-3 mr-1" /> : <Smartphone className="h-3 w-3 mr-1" />}
                            {instance.type === 'server' ? '服务端' : '客户端'}
                          </Badge>
                        </TableCell>
                         <TableCell className="font-mono text-xs">
                          <span className="flex items-center space-x-1 whitespace-nowrap">
                            <ArrowDown className="h-3 w-3 text-blue-500 flex-shrink-0" />
                            <span>{formatBytes(instance.tcprx)}</span>
                            <span className="text-muted-foreground">/</span>
                            <ArrowUp className="h-3 w-3 text-green-500 flex-shrink-0" />
                            <span>{formatBytes(instance.tcptx)}</span>
                          </span>
                        </TableCell>
                         <TableCell className="font-mono text-xs">
                          <span className="flex items-center space-x-1 whitespace-nowrap">
                            <ArrowDown className="h-3 w-3 text-blue-500 flex-shrink-0" />
                            <span>{formatBytes(instance.udprx)}</span>
                            <span className="text-muted-foreground">/</span>
                            <ArrowUp className="h-3 w-3 text-green-500 flex-shrink-0" />
                            <span>{formatBytes(instance.udptx)}</span>
                          </span>
                        </TableCell>
                         <TableCell className="text-right font-mono text-xs">
                           <span className="flex items-center justify-end space-x-1 whitespace-nowrap">
                            <ArrowDown className="h-3 w-3 text-blue-500 flex-shrink-0" />
                            <span>{formatBytes(instance.tcprx + instance.udprx)}</span>
                            <span className="text-muted-foreground">/</span>
                            <ArrowUp className="h-3 w-3 text-green-500 flex-shrink-0" />
                            <span>{formatBytes(instance.tcptx + instance.udptx)}</span>
                           </span>
                        </TableCell>
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
