
"use client";

import type { NextPage } from 'next';
import React, { useState, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useApiConfig } from '@/hooks/use-api-key';
import { nodePassApi } from '@/lib/api';
import type { Instance } from '@/types/nodepass';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PieChart, Pie, Tooltip as RechartsTooltip, Cell, Label, Sector } from 'recharts';
import { ChartContainer, ChartTooltipContent, type ChartConfig, ChartLegend, ChartLegendContent } from "@/components/ui/chart";
import { Loader2, RefreshCw, AlertTriangle, List, ArrowDownCircle, ArrowUpCircle, PieChart as PieChartIcon, Server, Smartphone } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';

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
  totalRx: {
    label: "总接收",
    color: "hsl(var(--chart-1))",
    icon: ArrowDownCircle,
  },
  totalTx: {
    label: "总发送",
    color: "hsl(var(--chart-2))",
    icon: ArrowUpCircle,
  },
} satisfies ChartConfig;

const TrafficPage: NextPage = () => {
  const { apiConfigsList, isLoading: isLoadingApiConfig, getApiRootUrl, getToken } = useApiConfig();
  const { toast } = useToast();
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const isMobile = useIsMobile();
  const [activeIndex, setActiveIndex] = useState<number | undefined>(undefined);

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

    const totals = allInstances.reduce(
      (acc, inst) => {
        acc.totalRx += inst.tcprx + inst.udprx;
        acc.totalTx += inst.tcptx + inst.udptx;
        return acc;
      },
      { totalRx: 0, totalTx: 0 }
    );

    const data = [
      { type: 'totalRx', value: totals.totalRx, label: chartConfig.totalRx.label },
      { type: 'totalTx', value: totals.totalTx, label: chartConfig.totalTx.label },
    ].filter((d) => d.value > 0);
    
    const total = data.reduce((acc, curr) => acc + curr.value, 0);

    return { chartData: data, totalTraffic: total };
  }, [allInstances]);

  const handleRefresh = () => {
    refetch();
  };
  
  const onPieEnter = (_: any, index: number) => {
    setActiveIndex(index);
  };
  
  const onPieLeave = () => {
    setActiveIndex(undefined);
  };
  
  const ActiveShape = (props: any) => {
    const RADIAN = Math.PI / 180;
    const { cx, cy, midAngle, innerRadius, outerRadius, startAngle, endAngle, fill, payload, percent, value } = props;
    const sin = Math.sin(-RADIAN * midAngle);
    const cos = Math.cos(-RADIAN * midAngle);
    const sx = cx + (outerRadius + 10) * cos;
    const sy = cy + (outerRadius + 10) * sin;
    const mx = cx + (outerRadius + 30) * cos;
    const my = cy + (outerRadius + 30) * sin;
    const ex = mx + (cos >= 0 ? 1 : -1) * 22;
    const ey = my;
    const textAnchor = cos >= 0 ? 'start' : 'end';

    return (
      <g>
        <Sector
          cx={cx}
          cy={cy}
          innerRadius={innerRadius}
          outerRadius={outerRadius}
          startAngle={startAngle}
          endAngle={endAngle}
          fill={fill}
        />
        <Sector
          cx={cx}
          cy={cy}
          startAngle={startAngle}
          endAngle={endAngle}
          innerRadius={outerRadius + 6}
          outerRadius={outerRadius + 10}
          fill={fill}
        />
        <path d={`M${sx},${sy}L${mx},${my}L${ex},${ey}`} stroke={fill} fill="none" />
        <circle cx={ex} cy={ey} r={2} fill={fill} stroke="none" />
        <text x={ex + (cos >= 0 ? 1 : -1) * 12} y={ey} textAnchor={textAnchor} fill="hsl(var(--foreground))" className="text-xs font-sans">{`${payload.label}`}</text>
        <text x={ex + (cos >= 0 ? 1 : -1) * 12} y={ey} dy={18} textAnchor={textAnchor} fill="hsl(var(--muted-foreground))" className="text-xs font-mono">
          {`${formatBytes(value)} (${(percent * 100).toFixed(2)}%)`}
        </text>
      </g>
    );
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
              <CardDescription className="font-sans mt-1">所有实例的总流量按接收/发送分布。将鼠标悬停在扇区上可查看详细信息。</CardDescription>
            </CardHeader>
             <CardContent className="flex-1 pb-0">
                <ChartContainer
                  config={chartConfig}
                  className="mx-auto aspect-square max-h-[350px]"
                >
                  <PieChart>
                    <RechartsTooltip
                      cursor={false}
                      content={<ChartTooltipContent hideLabel />}
                    />
                    <Pie
                      data={chartData}
                      dataKey="value"
                      nameKey="label"
                      innerRadius={80}
                      outerRadius={110}
                      strokeWidth={5}
                      stroke="hsl(var(--background))"
                      activeIndex={activeIndex}
                      activeShape={ActiveShape}
                      onMouseEnter={onPieEnter}
                      onMouseLeave={onPieLeave}
                    >
                       {chartData.map((entry) => (
                        <Cell key={`cell-${entry.type}`} fill={`var(--color-${entry.type})`} />
                       ))}
                       {activeIndex === undefined && (
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
                                    className="fill-foreground text-3xl font-bold font-title"
                                  >
                                    {formatBytes(totalTraffic)}
                                  </tspan>
                                  <tspan
                                    x={viewBox.cx}
                                    y={(viewBox.cy || 0) + 24}
                                    className="fill-muted-foreground font-sans text-sm"
                                  >
                                    总用量
                                  </tspan>
                                </text>
                              );
                            }
                            return null;
                          }}
                        />
                       )}
                    </Pie>
                    <ChartLegend content={<ChartLegendContent nameKey="label" />} />
                  </PieChart>
                </ChartContainer>
            </CardContent>
          </Card>
          
           <Card className="shadow-lg card-hover-shadow">
            <CardHeader>
              <CardTitle className="flex items-center font-title"><List className="mr-2 h-5 w-5 text-primary" />各实例流量详情</CardTitle>
              <CardDescription className="font-sans mt-1">每个单独实例的流量统计。</CardDescription>
            </CardHeader>
            <CardContent>
              {isMobile ? (
                 <div className="space-y-3">
                  {allInstances.map((instance) => (
                    <Card key={`${instance.apiId}-${instance.id}`} className="p-3 shadow-sm border">
                       <div className="flex justify-between items-start">
                          <div className="flex-grow min-w-0 pr-2">
                             <div className="text-sm font-semibold truncate" title={instance.apiName}>{instance.apiName}</div>
                             <div className="text-xs font-mono text-muted-foreground truncate" title={instance.id}>{instance.id}</div>
                          </div>
                          <Badge
                            variant={instance.type === 'server' ? 'default' : 'accent'}
                            className="items-center whitespace-nowrap text-xs font-sans flex-shrink-0"
                          >
                            {instance.type === 'server' ? <Server className="h-3 w-3 mr-1" /> : <Smartphone className="h-3 w-3 mr-1" />}
                            {instance.type === 'server' ? '服务端' : '客户端'}
                          </Badge>
                       </div>
                       <div className="mt-2 pt-2 border-t flex justify-between items-center text-sm font-mono">
                          <span className="text-muted-foreground">用量 (↓/↑):</span>
                          <span className="flex items-center space-x-1 whitespace-nowrap">
                            <ArrowDownCircle className="h-4 w-4 text-blue-500 flex-shrink-0" />
                            <span title="接收">{formatBytes(instance.tcprx + instance.udprx)}</span>
                            <span className="text-muted-foreground">/</span>
                            <ArrowUpCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                            <span title="发送">{formatBytes(instance.tcptx + instance.udptx)}</span>
                           </span>
                       </div>
                    </Card>
                  ))}
                 </div>
              ) : (
                <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="font-sans min-w-[120px]">来源主控</TableHead>
                      <TableHead className="font-sans min-w-[120px]">实例 ID</TableHead>
                      <TableHead className="font-sans">类型</TableHead>
                      <TableHead className="text-right font-sans min-w-[180px]">用量 (↓ 接收 / ↑ 发送)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allInstances.map((instance) => (
                      <TableRow key={`${instance.apiId}-${instance.id}`}>
                        <TableCell className="truncate max-w-[200px] font-sans">{instance.apiName}</TableCell>
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
                         <TableCell className="text-right font-mono text-xs">
                           <span className="flex items-center justify-end space-x-1 whitespace-nowrap">
                            <ArrowDownCircle className="h-4 w-4 text-blue-500 flex-shrink-0" />
                            <span title="接收">{formatBytes(instance.tcprx + instance.udprx)}</span>
                            <span className="text-muted-foreground mx-2">/</span>
                            <ArrowUpCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                            <span title="发送">{formatBytes(instance.tcptx + instance.udptx)}</span>
                           </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

    </AppLayout>
  );
};

export default TrafficPage;
