
"use client";

import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
// import type { z } from 'zod'; // No longer needed if type is imported
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { createInstanceFormSchema, type CreateInstanceFormValues, createInstanceApiSchema } from '@/zod-schemas/nodepass';
import type { CreateInstanceRequest, Instance } from '@/types/nodepass';
import { PlusCircle, Loader2, Info } from 'lucide-react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { nodePassApi } from '@/lib/api';
import { useApiConfig, type NamedApiConfig, type MasterLogLevel, type MasterTlsMode } from '@/hooks/use-api-key';
import type { AppLogEntry } from './EventLog';


interface CreateInstanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apiId: string | null;
  apiRoot: string | null;
  apiToken: string | null;
  apiName: string | null;
  activeApiConfig: NamedApiConfig | null;
  onLog?: (message: string, type: AppLogEntry['type']) => void;
}

function parseTunnelAddr(urlString: string): string | null {
  try {
    const url = new URL(urlString.includes('://') ? urlString : `http://${urlString}`);
    return url.host;
  } catch (e) {
    const schemeSeparator = "://";
    const schemeIndex = urlString.indexOf(schemeSeparator);
    let restOfString = urlString;

    if (schemeIndex !== -1) {
      restOfString = urlString.substring(schemeIndex + schemeSeparator.length);
    }
    
    const pathSeparatorIndex = restOfString.indexOf('/');
    const querySeparatorIndex = restOfString.indexOf('?');
    let endOfTunnelAddr = -1;

    if (pathSeparatorIndex !== -1 && querySeparatorIndex !== -1) {
      endOfTunnelAddr = Math.min(pathSeparatorIndex, querySeparatorIndex);
    } else if (pathSeparatorIndex !== -1) {
      endOfTunnelAddr = pathSeparatorIndex;
    } else if (querySeparatorIndex !== -1) {
      endOfTunnelAddr = querySeparatorIndex;
    }
    
    const tunnelAddrCandidate = endOfTunnelAddr !== -1 ? restOfString.substring(0, endOfTunnelAddr) : restOfString;
    if (tunnelAddrCandidate.includes(':') || (!tunnelAddrCandidate.includes(':') && tunnelAddrCandidate.length > 0) ) {
        return tunnelAddrCandidate;
    }
    return null;
  }
}

const MASTER_TLS_MODE_DISPLAY_MAP: Record<MasterTlsMode, string> = {
  'master': '主控配置',
  '0': '0: 无TLS',
  '1': '1: 自签名',
  '2': '2: 自定义',
};

function buildUrl(values: CreateInstanceFormValues): string {
  let url = `${values.instanceType}://${values.tunnelAddress}/${values.targetAddress}`;
  const queryParams = new URLSearchParams();

  if (values.logLevel !== "master") {
    queryParams.append('log', values.logLevel);
  }

  if (values.instanceType === 'server') {
    if (values.tlsMode && values.tlsMode !== "master") {
      queryParams.append('tls', values.tlsMode);
      if (values.tlsMode === '2') {
        if (values.certPath && values.certPath.trim() !== '') queryParams.append('crt', values.certPath.trim());
        if (values.keyPath && values.keyPath.trim() !== '') queryParams.append('key', values.keyPath.trim());
      }
    }
  }
  const queryString = queryParams.toString();
  return queryString ? `${url}?${queryString}` : url;
}

function extractHostname(urlOrHostPort: string): string | null {
  if (!urlOrHostPort) return null;
  try {
    const fullUrl = urlOrHostPort.includes('://') ? urlOrHostPort : `scheme://${urlOrHostPort}`;
    const url = new URL(fullUrl);
    return url.hostname.replace(/^\[|\]$/g, '');
  } catch (e) {
    const parts = urlOrHostPort.split(':');
    if (parts.length > 0) {
        let hostCandidate = parts[0];
        if (urlOrHostPort.includes('[')) { 
            const match = urlOrHostPort.match(/^\[(.*?)\]/);
            if (match && match[1]) {
                hostCandidate = match[1];
            }
        }
        return hostCandidate.length > 0 ? hostCandidate : null;
    }
    return null;
  }
}


export function CreateInstanceDialog({ open, onOpenChange, apiId, apiRoot, apiToken, apiName, activeApiConfig, onLog }: CreateInstanceDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { apiConfigsList } = useApiConfig();
  const [externalApiSuggestion, setExternalApiSuggestion] = useState<string | null>(null);

  const form = useForm<CreateInstanceFormValues>({
    resolver: zodResolver(createInstanceFormSchema),
    defaultValues: {
      instanceType: 'server',
      tunnelAddress: '',
      targetAddress: '',
      logLevel: 'master',
      tlsMode: 'master',
      certPath: '',
      keyPath: '',
      autoCreateServer: false,
    },
  });

  const instanceType = form.watch("instanceType");
  const tlsMode = form.watch("tlsMode");
  const tunnelAddressValue = form.watch("tunnelAddress");

  useEffect(() => {
    if (open) {
      form.reset({
        instanceType: 'server',
        tunnelAddress: '',
        targetAddress: '',
        logLevel: 'master',
        tlsMode: 'master',
        certPath: '',
        keyPath: '',
        autoCreateServer: false,
      });
      setExternalApiSuggestion(null);
    }
  }, [open, form]);
  
  useEffect(() => {
    if (instanceType === "client") {
        form.setValue("tlsMode", undefined); 
        form.setValue("certPath", '');
        form.setValue("keyPath", '');
    } else if (instanceType === "server") {
        if (form.getValues("tlsMode") === undefined) {
            form.setValue("tlsMode", "master");
        }
        form.setValue("autoCreateServer", false); 
    }
  }, [instanceType, form]);

  useEffect(() => {
    if (instanceType === 'client' && tunnelAddressValue) {
      const clientTunnelHost = extractHostname(tunnelAddressValue);
      if (!clientTunnelHost) {
        setExternalApiSuggestion(null);
        return;
      }

      const localHostnames = ['localhost', '127.0.0.1', '::', '::1', '']; // Added empty string for cases like ":port"
      if (localHostnames.includes(clientTunnelHost.toLowerCase())) {
        setExternalApiSuggestion(null);
        return;
      }

      const isKnownHost = apiConfigsList.some(config => {
        const configuredApiHost = extractHostname(config.apiUrl);
        return configuredApiHost && configuredApiHost.toLowerCase() === clientTunnelHost.toLowerCase();
      });

      if (!isKnownHost) {
        setExternalApiSuggestion(`提示: 您似乎正在连接到一个外部主控 (${clientTunnelHost})。考虑将其添加为主控连接以便于管理。`);
      } else {
        setExternalApiSuggestion(null);
      }
    } else {
      setExternalApiSuggestion(null);
    }
  }, [tunnelAddressValue, instanceType, apiConfigsList]);


  const { data: serverInstancesForDropdown, isLoading: isLoadingServerInstances } = useQuery<Instance[], Error, {id: string, display: string, tunnelAddr: string}[]>({
    queryKey: ['instances', apiId, 'serversForTunnelSelection'],
    queryFn: async () => {
      if (!apiId || !apiRoot || !apiToken) throw new Error("主控配置不完整，无法获取服务端实例。");
      const instances = await nodePassApi.getInstances(apiRoot, apiToken);
      return instances.filter(inst => inst.type === 'server');
    },
    select: (data) => data
        .map(server => {
            const tunnelAddr = parseTunnelAddr(server.url);
            if (!tunnelAddr) return null;
            return {
                id: server.id,
                display: `ID: ${server.id.substring(0,8)}... (${tunnelAddr})`,
                tunnelAddr: tunnelAddr
            };
        })
        .filter(Boolean) as {id: string, display: string, tunnelAddr: string}[],
    enabled: !!(open && instanceType === 'client' && apiId && apiRoot && apiToken),
  });


  const createInstanceMutation = useMutation({
    mutationFn: (data: CreateInstanceRequest) => {
      if (!apiId || !apiRoot || !apiToken) throw new Error("没有活动的或有效的主控配置用于创建实例。");
      const validatedApiData = createInstanceApiSchema.parse(data);
      return nodePassApi.createInstance(validatedApiData, apiRoot, apiToken);
    },
    onSuccess: (data, variables) => {
      const shortUrl = variables.url.length > 40 ? variables.url.substring(0,37) + "..." : variables.url;
      toast({
        title: '实例已创建',
        description: `实例 (URL: ${shortUrl}) 已成功创建。`,
      });
      onLog?.(`实例创建成功: ${data.type} - ${data.id.substring(0,8)}... (URL: ${shortUrl})`, 'SUCCESS');
      queryClient.invalidateQueries({ queryKey: ['instances', apiId] });
      queryClient.invalidateQueries({ queryKey: ['allInstancesForTopology']}); // Invalidate topology data
      queryClient.invalidateQueries({ queryKey: ['allInstancesForTraffic']}); // Invalidate traffic data
    },
    onError: (error: any, variables) => {
      const shortUrl = variables.url.length > 40 ? variables.url.substring(0,37) + "..." : variables.url;
      toast({
        title: '创建实例出错',
        description: `创建实例 (URL: ${shortUrl}) 失败: ${error.message || '未知错误。'}`,
        variant: 'destructive',
      });
      onLog?.(`实例创建失败: (URL: ${shortUrl}) - ${error.message || '未知错误'}`, 'ERROR');
      // Do not throw error here to allow form to remain open for corrections if desired
    },
  });

  async function onSubmit(values: CreateInstanceFormValues) {
    if (!apiId || !apiRoot || !apiToken) {
        toast({ title: "操作失败", description: "未选择活动主控或主控配置无效。", variant: "destructive"});
        onLog?.('尝试创建实例失败: 未选择活动主控或主控配置无效。', 'ERROR');
        return;
    }

    const isAutoCreatingServer = values.instanceType === 'client' && values.autoCreateServer;
    let serverUrlToCreate = '';
    let clientUrlToCreate = buildUrl(values);

    if (isAutoCreatingServer) {
      const clientTunnelParts = values.tunnelAddress.split(':');
      const clientTargetParts = values.targetAddress.split(':');

      const clientTunnelPort = clientTunnelParts.pop();
      const clientTargetPort = clientTargetParts.pop();

      if (!clientTunnelPort || !clientTargetPort) {
        const errorMsg = '无法从客户端地址解析端口以自动创建服务端。';
        toast({ title: '错误', description: errorMsg, variant: 'destructive' });
        form.control.setError("tunnelAddress", {type: "manual", message: "端口解析失败"});
        form.control.setError("targetAddress", {type: "manual", message: "端口解析失败"});
        onLog?.(`自动创建服务端失败: ${errorMsg}`, 'ERROR');
        return;
      }
      
      const effectiveMasterTlsMode = (activeApiConfig?.masterDefaultTlsMode && activeApiConfig.masterDefaultTlsMode !== 'master') 
                                      ? activeApiConfig.masterDefaultTlsMode 
                                      : '1'; 

      const serverConfigForAutoCreate: CreateInstanceFormValues = {
        instanceType: 'server',
        tunnelAddress: `0.0.0.0:${clientTunnelPort}`,
        targetAddress: `0.0.0.0:${clientTargetPort}`, 
        logLevel: values.logLevel,
        tlsMode: effectiveMasterTlsMode,
        certPath: '', 
        keyPath: '',  
      };
      serverUrlToCreate = buildUrl(serverConfigForAutoCreate);
      onLog?.(`准备自动创建服务端: ${serverUrlToCreate}`, 'INFO');
    }
    
    onLog?.(`准备创建实例: ${clientUrlToCreate}`, 'INFO');

    try {
      if (isAutoCreatingServer && serverUrlToCreate) {
        await createInstanceMutation.mutateAsync({ url: serverUrlToCreate });
        // Success toast for server is handled by mutation's onSuccess
      }
      await createInstanceMutation.mutateAsync({ url: clientUrlToCreate });
      // Success toast for client is handled by mutation's onSuccess

      // Only reset and close if the final operation (client creation) was part of the sequence
      // If only server was auto-created and client failed, or only client was created, 
      // it would have been handled by individual mutateAsync calls.
      // This ensures dialog closes only if the intended sequence completes or a single creation is successful.
      if (!createInstanceMutation.isError) { // Check if the last mutation call had an error
        form.reset();
        onOpenChange(false); 
      }
    } catch (error: any) {
       // Errors are handled by mutation's onError, including logging.
       // No need to re-log or re-toast here.
       console.error("创建实例序列中发生错误:", error);
    }
  }
  
  const masterLogLevelDisplay = activeApiConfig?.masterDefaultLogLevel && activeApiConfig.masterDefaultLogLevel !== 'master'
    ? activeApiConfig.masterDefaultLogLevel.toUpperCase()
    : '主控配置';

  const masterTlsModeDisplay = activeApiConfig?.masterDefaultTlsMode && activeApiConfig.masterDefaultTlsMode !== 'master'
    ? MASTER_TLS_MODE_DISPLAY_MAP[activeApiConfig.masterDefaultTlsMode]
    : '主控配置';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center font-title">
            <PlusCircle className="mr-2 h-6 w-6 text-primary" />
            创建新实例
          </DialogTitle>
          <DialogDescription className="font-sans">
            为当前主控 “{apiName || 'N/A'}” 配置新实例。
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-2 max-h-[70vh] overflow-y-auto pr-2">
            <FormField
              control={form.control}
              name="instanceType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-sans">实例类型</FormLabel>
                  <Select onValueChange={(value) => {
                      field.onChange(value);
                  }} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger className="text-sm font-sans">
                        <SelectValue placeholder="选择实例类型" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="server" className="font-sans">服务端</SelectItem>
                      <SelectItem value="client" className="font-sans">客户端</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="tunnelAddress"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-sans">隧道地址</FormLabel>
                  <FormControl>
                    <Input 
                      className="text-sm font-mono"
                      placeholder={instanceType === "server" ? "服务端监听控制通道地址, 例: 0.0.0.0:10101" : "连接的 NodePass 服务端隧道地址, 例: your.server.com:10101"} 
                      {...field}
                    />
                  </FormControl>
                  <FormDescription className="font-sans text-xs">
                    {instanceType === "server"
                      ? "服务端模式: 监听客户端控制连接的地址。"
                      : "客户端模式: NodePass 服务端隧道地址。"}
                  </FormDescription>
                  {externalApiSuggestion && (
                    <FormDescription className="text-xs text-amber-600 dark:text-amber-400 mt-1 font-sans">
                      <Info size={14} className="inline-block mr-1.5 align-text-bottom" />
                      {externalApiSuggestion}
                    </FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            {instanceType === 'client' && (
              <FormItem>
                <FormLabel className="font-sans">或从现有服务端选择</FormLabel>
                <Select 
                  onValueChange={(value) => {
                    if (value) {
                      form.setValue('tunnelAddress', value, { shouldValidate: true, shouldDirty: true });
                    }
                  }}
                  disabled={isLoadingServerInstances || !serverInstancesForDropdown || serverInstancesForDropdown.length === 0}
                >
                  <FormControl>
                    <SelectTrigger className="text-sm font-sans">
                      <SelectValue placeholder={
                        isLoadingServerInstances ? "加载服务端中..." : 
                        (!serverInstancesForDropdown || serverInstancesForDropdown.length === 0) ? "当前主控无可用服务端" : "选择服务端隧道"
                      } />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {isLoadingServerInstances && (
                        <div className="flex items-center justify-center p-2 font-sans">
                            <Loader2 className="h-4 w-4 animate-spin mr-2"/> 加载中...
                        </div>
                    )}
                    {serverInstancesForDropdown && serverInstancesForDropdown.map(server => (
                      <SelectItem key={server.id} value={server.tunnelAddr} className="font-sans">
                        {server.display}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {serverInstancesForDropdown && serverInstancesForDropdown.length === 0 && !isLoadingServerInstances && (
                    <FormDescription className="font-sans text-xs">当前主控无可用服务端实例。</FormDescription>
                )}
              </FormItem>
            )}


            <FormField
              control={form.control}
              name="targetAddress"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-sans">目标地址</FormLabel>
                  <FormControl>
                    <Input 
                      className="text-sm font-mono"
                      placeholder={instanceType === "server" ? "服务端监听流量转发地址, 例: 0.0.0.0:8080" : "本地流量转发地址, 例: 127.0.0.1:8000"} 
                      {...field} 
                    />
                  </FormControl>
                   <FormDescription className="font-sans text-xs">
                    {instanceType === "server"
                      ? "服务端模式: 监听隧道流量的地址。"
                      : "客户端模式: 接收流量的本地转发地址。"}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="logLevel"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-sans">日志级别</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger className="text-sm font-sans">
                        <SelectValue placeholder="选择日志级别" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                       <SelectItem value="master" className="font-sans">
                         默认 ({masterLogLevelDisplay})
                      </SelectItem>
                      <SelectItem value="debug" className="font-sans">Debug</SelectItem>
                      <SelectItem value="info" className="font-sans">Info</SelectItem>
                      <SelectItem value="warn" className="font-sans">Warn</SelectItem>
                      <SelectItem value="error" className="font-sans">Error</SelectItem>
                      <SelectItem value="fatal" className="font-sans">Fatal</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription className="font-sans text-xs">
                    选择“默认”将继承主控实际启动时应用的设置。
                    {activeApiConfig?.masterDefaultLogLevel && activeApiConfig.masterDefaultLogLevel !== 'master' && ` (当前主控记录的默认级别为: ${activeApiConfig.masterDefaultLogLevel.toUpperCase()})`}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {instanceType === 'server' && (
              <>
                <FormField
                  control={form.control}
                  name="tlsMode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-sans">TLS 模式 (服务端)</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value || "master"}>
                        <FormControl>
                          <SelectTrigger className="text-sm font-sans">
                            <SelectValue placeholder="选择 TLS 模式" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="master" className="font-sans">
                            默认 ({masterTlsModeDisplay})
                          </SelectItem>
                          <SelectItem value="0" className="font-sans">0: 无TLS (明文)</SelectItem>
                          <SelectItem value="1" className="font-sans">1: 自签名证书</SelectItem>
                          <SelectItem value="2" className="font-sans">2: 自定义证书</SelectItem>
                        </SelectContent>
                      </Select>
                       <FormDescription className="font-sans text-xs">
                        选择“默认”将继承主控实际启动时应用的设置。
                        {activeApiConfig?.masterDefaultTlsMode && activeApiConfig.masterDefaultTlsMode !== 'master' && ` (当前主控记录的默认TLS模式为: ${MASTER_TLS_MODE_DISPLAY_MAP[activeApiConfig.masterDefaultTlsMode]})`}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {tlsMode === '2' && (
                  <>
                    <FormField
                      control={form.control}
                      name="certPath"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-sans">证书路径 (TLS 2)</FormLabel>
                          <FormControl>
                            <Input 
                              className="text-sm font-mono"
                              placeholder="例: /path/to/cert.pem" 
                              {...field} 
                              value={field.value || ""}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="keyPath"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-sans">密钥路径 (TLS 2)</FormLabel>
                          <FormControl>
                            <Input 
                              className="text-sm font-mono"
                              placeholder="例: /path/to/key.pem" 
                              {...field} 
                              value={field.value || ""}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}
              </>
            )}

            {instanceType === 'client' && (
              <FormField
                control={form.control}
                name="autoCreateServer"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4 shadow-sm">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel className="font-sans cursor-pointer">
                        自动创建匹配的服务端
                      </FormLabel>
                      <FormDescription className="font-sans text-xs">
                        如果勾选，将在创建此客户端实例前，尝试自动创建一个匹配的服务端实例。
                        服务端将使用与客户端相同的日志级别，并根据当前活动主控记录的默认TLS模式进行配置 (若主控未记录特定TLS模式，则默认为 '1' 自签名证书)。
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />
            )}

          </form>
        </Form>
        <DialogFooter className="pt-4 font-sans">
          <DialogClose asChild>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={createInstanceMutation.isPending}>
              取消
            </Button>
          </DialogClose>
          <Button type="submit" onClick={form.handleSubmit(onSubmit)} disabled={createInstanceMutation.isPending || !apiId}>
            {createInstanceMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                创建中...
              </>
            ) : (
              '创建实例'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
