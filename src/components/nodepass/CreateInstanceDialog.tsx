
"use client";

import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
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
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { createInstanceFormSchema, createInstanceApiSchema } from '@/zod-schemas/nodepass';
import type { CreateInstanceRequest, Instance } from '@/types/nodepass';
import { PlusCircle, Loader2 } from 'lucide-react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { nodePassApi } from '@/lib/api';

type CreateInstanceFormValues = z.infer<typeof createInstanceFormSchema>;

interface CreateInstanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apiId: string | null;
  apiRoot: string | null;
  apiToken: string | null;
  apiName: string | null;
}

function parseTunnelAddr(urlString: string): string | null {
  try {
    const url = new URL(urlString); 
    return url.host; 
  } catch (e) {
    const schemeSeparator = "://";
    const schemeIndex = urlString.indexOf(schemeSeparator);
    if (schemeIndex === -1) return null;

    const restOfString = urlString.substring(schemeIndex + schemeSeparator.length);
    
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
    
    return endOfTunnelAddr !== -1 ? restOfString.substring(0, endOfTunnelAddr) : restOfString;
  }
}


export function CreateInstanceDialog({ open, onOpenChange, apiId, apiRoot, apiToken, apiName }: CreateInstanceDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<CreateInstanceFormValues>({
    resolver: zodResolver(createInstanceFormSchema),
    defaultValues: {
      instanceType: 'server',
      tunnelAddress: '',
      targetAddress: '',
      logLevel: 'info',
      tlsMode: '0', 
      certPath: '',
      keyPath: '',
    },
  });

  const instanceType = form.watch("instanceType");
  const tlsMode = form.watch("tlsMode");

  useEffect(() => {
    if (open) {
      form.reset({
        instanceType: 'server',
        tunnelAddress: '',
        targetAddress: '',
        logLevel: 'info',
        tlsMode: '0',
        certPath: '',
        keyPath: '',
      });
    }
  }, [open, form]);

  const { data: serverInstances, isLoading: isLoadingServerInstances } = useQuery<Instance[], Error, {id: string, display: string, tunnelAddr: string}[]>({
    queryKey: ['instances', apiId, 'serversForTunnelSelection'],
    queryFn: async () => {
      if (!apiId || !apiRoot || !apiToken) throw new Error("API configuration is incomplete for fetching server instances.");
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
      if (!apiId || !apiRoot || !apiToken) throw new Error("没有活动的或有效的 API 配置用于创建实例。");
      const validatedApiData = createInstanceApiSchema.parse(data);
      return nodePassApi.createInstance(validatedApiData, apiRoot, apiToken);
    },
    onSuccess: () => {
      toast({
        title: '实例已创建',
        description: '新实例已创建。',
      });
      queryClient.invalidateQueries({ queryKey: ['instances', apiId] }); 
      form.reset();
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: '创建实例出错',
        description: error.message || '未知错误。',
        variant: 'destructive',
      });
    },
  });

  function buildUrl(values: CreateInstanceFormValues): string {
    let url = `${values.instanceType}://${values.tunnelAddress}/${values.targetAddress}?log=${values.logLevel}`;
    if (values.instanceType === 'server') {
      if (values.tlsMode) {
        url += `&tls=${values.tlsMode}`;
        if (values.tlsMode === '2') {
          url += `&crt=${values.certPath || '/path/to/your/cert.pem'}&key=${values.keyPath || '/path/to/your/key.pem'}`;
        }
      }
    }
    return url;
  }

  function onSubmit(values: CreateInstanceFormValues) {
    const constructedUrl = buildUrl(values);
    createInstanceMutation.mutate({ url: constructedUrl });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center text-xl">
            <PlusCircle className="mr-2 h-6 w-6 text-primary" />
            创建新实例
          </DialogTitle>
          <DialogDescription>
            提供实例详情进行配置 (API: {apiName || 'N/A'})。
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-2 max-h-[70vh] overflow-y-auto pr-2">
            <FormField
              control={form.control}
              name="instanceType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>实例类型</FormLabel>
                  <Select onValueChange={(value) => {
                      field.onChange(value);
                      if (value === "client") {
                          form.setValue("tlsMode", undefined);
                          form.setValue("certPath", undefined);
                          form.setValue("keyPath", undefined);
                      } else {
                          form.setValue("tlsMode", "0"); 
                      }
                  }} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="选择实例类型" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="server">服务器</SelectItem>
                      <SelectItem value="client">客户端</SelectItem>
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
                  <FormLabel>隧道地址</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder={instanceType === "server" ? "服务器监听控制通道地址, 例: 0.0.0.0:10101" : "连接的 NodePass 服务器隧道地址, 例: your.server.com:10101"} 
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    {instanceType === "server"
                      ? "服务器模式: 监听客户端控制连接的地址 (例 '0.0.0.0:10101')。"
                      : "客户端模式: NodePass 服务器隧道地址 (例 'server.example.com:10101')。"}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {instanceType === 'client' && (
              <FormItem>
                <FormLabel>或从现有服务器选择</FormLabel>
                <Select 
                  onValueChange={(value) => {
                    if (value) {
                      form.setValue('tunnelAddress', value, { shouldValidate: true, shouldDirty: true });
                    }
                  }}
                  disabled={isLoadingServerInstances || !serverInstances || serverInstances.length === 0}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder={
                        isLoadingServerInstances ? "加载服务器中..." : 
                        (!serverInstances || serverInstances.length === 0) ? "无可用服务器" : "选择服务器隧道"
                      } />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {isLoadingServerInstances && (
                        <div className="flex items-center justify-center p-2">
                            <Loader2 className="h-4 w-4 animate-spin mr-2"/> 加载中...
                        </div>
                    )}
                    {serverInstances && serverInstances.map(server => (
                      <SelectItem key={server.id} value={server.tunnelAddr}>
                        {server.display}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {serverInstances && serverInstances.length === 0 && !isLoadingServerInstances && (
                    <FormDescription>当前 API 无可用服务器实例。</FormDescription>
                )}
              </FormItem>
            )}


            <FormField
              control={form.control}
              name="targetAddress"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>目标地址</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder={instanceType === "server" ? "服务器监听流量转发地址, 例: 0.0.0.0:8080" : "本地流量转发地址, 例: 127.0.0.1:8000"} 
                      {...field} 
                    />
                  </FormControl>
                   <FormDescription>
                    {instanceType === "server"
                      ? "服务器模式: 监听隧道流量的地址 (例 '0.0.0.0:8080')。"
                      : "客户端模式: 接收流量的本地转发地址 (例 '127.0.0.1:8000')。"}
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
                  <FormLabel>日志级别</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="选择日志级别" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="debug">Debug</SelectItem>
                      <SelectItem value="info">Info</SelectItem>
                      <SelectItem value="warn">Warn</SelectItem>
                      <SelectItem value="error">Error</SelectItem>
                      <SelectItem value="fatal">Fatal</SelectItem>
                    </SelectContent>
                  </Select>
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
                      <FormLabel>TLS 模式 (服务器)</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="选择 TLS 模式" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="0">0: 无 TLS (明文)</SelectItem>
                          <SelectItem value="1">1: 自签名证书</SelectItem>
                          <SelectItem value="2">2: 自定义证书</SelectItem>
                        </SelectContent>
                      </Select>
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
                          <FormLabel>证书路径 (TLS 2)</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="例: /path/to/cert.pem" 
                              {...field} 
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
                          <FormLabel>密钥路径 (TLS 2)</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="例: /path/to/key.pem" 
                              {...field} 
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
          </form>
        </Form>
        <DialogFooter className="pt-4">
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={createInstanceMutation.isPending}>
              取消
            </Button>
          </DialogClose>
          <Button type="submit" onClick={form.handleSubmit(onSubmit)} disabled={createInstanceMutation.isPending || !apiId}>
            {createInstanceMutation.isPending ? '创建中...' : '创建实例'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
