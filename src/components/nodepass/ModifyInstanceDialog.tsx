
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
import { modifyInstanceFormSchema, type ModifyInstanceFormValues, modifyInstanceConfigApiSchema } from '@/zod-schemas/nodepass';
import type { Instance, ModifyInstanceConfigRequest } from '@/types/nodepass';
import { Pencil } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { nodePassApi } from '@/lib/api';

interface ModifyInstanceDialogProps {
  instance: Instance | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apiId: string | null;
  apiRoot: string | null;
  apiToken: string | null;
  apiName: string | null;
}

interface ParsedNodePassUrl {
  instanceType: 'server' | 'client' | null;
  tunnelAddress: string | null;
  targetAddress: string | null;
  logLevel: 'master' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | null;
  tlsMode: 'master' | '0' | '1' | '2' | null;
  certPath: string | null;
  keyPath: string | null;
}

function parseNodePassUrl(url: string): ParsedNodePassUrl {
  const result: ParsedNodePassUrl = {
    instanceType: null,
    tunnelAddress: '',
    targetAddress: '',
    logLevel: 'master',
    tlsMode: null, // Will be 'master' for server if not specified
    certPath: '',
    keyPath: '',
  };

  if (!url) return result;

  try {
    const schemeMatch = url.match(/^([a-zA-Z]+):\/\//);
    if (schemeMatch && (schemeMatch[1] === 'server' || schemeMatch[1] === 'client')) {
      result.instanceType = schemeMatch[1] as 'server' | 'client';
    } else {
      console.warn("无法从 URL 解析实例类型:", url);
      // Attempt to guess type if scheme is missing but format is recognizable
      if (url.includes("?tls=") || url.includes("&tls=")) result.instanceType = "server";
      else result.instanceType = "client"; // Best guess
    }

    const restOfUrl = schemeMatch ? url.substring(schemeMatch[0].length) : url;
    const parts = restOfUrl.split('?');
    const pathPart = parts[0];
    const queryPart = parts[1];

    const addresses = pathPart.split('/');
    if (addresses.length > 0) {
      result.tunnelAddress = addresses[0] || '';
    }
    if (addresses.length > 1) {
      result.targetAddress = addresses.slice(1).join('/') || '';
    }


    if (queryPart) {
      const params = new URLSearchParams(queryPart);
      const log = params.get('log');
      if (log && ['debug', 'info', 'warn', 'error', 'fatal'].includes(log)) {
        result.logLevel = log as 'debug' | 'info' | 'warn' | 'error' | 'fatal';
      } else {
        result.logLevel = 'master'; 
      }

      if (result.instanceType === 'server') {
        const tls = params.get('tls');
        if (tls && ['0', '1', '2'].includes(tls)) {
          result.tlsMode = tls as '0' | '1' | '2';
        } else {
           result.tlsMode = 'master'; 
        }
        if (result.tlsMode === '2') {
          result.certPath = params.get('crt') || '';
          result.keyPath = params.get('key') || '';
        }
      }
    } else {
      // Defaults if no query part
      result.logLevel = 'master';
      if (result.instanceType === 'server') {
        result.tlsMode = 'master';
      }
    }
  } catch (e) {
    console.error("解析 NodePass URL 错误:", url, e);
  }
  return result;
}

function buildUrl(values: ModifyInstanceFormValues): string {
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


export function ModifyInstanceDialog({ instance, open, onOpenChange, apiId, apiRoot, apiToken, apiName }: ModifyInstanceDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<ModifyInstanceFormValues>({
    resolver: zodResolver(modifyInstanceFormSchema),
    defaultValues: { // These will be overwritten by parsed URL
      instanceType: 'server', 
      tunnelAddress: '',
      targetAddress: '',
      logLevel: 'master',
      tlsMode: 'master',
      certPath: '',
      keyPath: '',
    },
  });

  const instanceType = form.watch("instanceType");
  const tlsMode = form.watch("tlsMode");


  useEffect(() => {
    if (instance && open) {
      const parsedUrl = parseNodePassUrl(instance.url);
      form.reset({
        instanceType: parsedUrl.instanceType || instance.type,
        tunnelAddress: parsedUrl.tunnelAddress || '',
        targetAddress: parsedUrl.targetAddress || '',
        logLevel: parsedUrl.logLevel || 'master',
        tlsMode: parsedUrl.instanceType === 'server' ? (parsedUrl.tlsMode || 'master') : undefined,
        certPath: parsedUrl.certPath || '',
        keyPath: parsedUrl.keyPath || '',
      });
    }
  }, [instance, open, form]);

  const modifyInstanceMutation = useMutation({
    mutationFn: (data: { instanceId: string; config: ModifyInstanceConfigRequest }) => {
      if (!apiId || !apiRoot || !apiToken) throw new Error("主控配置不完整。");
      if (!data.instanceId) throw new Error("实例ID未提供。");
      
      const validatedApiData = modifyInstanceConfigApiSchema.parse(data.config);
      return nodePassApi.modifyInstanceConfig(data.instanceId, validatedApiData, apiRoot, apiToken);
    },
    onSuccess: (updatedInstance) => {
      toast({
        title: '实例已修改',
        description: `实例 ${updatedInstance.id} 配置已更新。`,
      });
      queryClient.invalidateQueries({ queryKey: ['instances', apiId] });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: '修改实例配置出错',
        description: error.message || '未知错误。',
        variant: 'destructive',
      });
    },
  });

  function onSubmit(values: ModifyInstanceFormValues) {
    if (instance) {
      const newUrl = buildUrl(values);
      modifyInstanceMutation.mutate({ instanceId: instance.id, config: { url: newUrl } });
    }
  }

  if (!instance) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center font-title">
            <Pencil className="mr-2 h-6 w-6 text-primary" />
            修改实例配置
          </DialogTitle>
          <DialogDescription className="font-sans">
            编辑实例 <span className="font-semibold font-mono">{instance.id.substring(0,12)}...</span> 的配置 (主控: {apiName || 'N/A'})。
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-2 max-h-[70vh] overflow-y-auto pr-2">
            <FormField
              control={form.control}
              name="instanceType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>实例类型 (只读)</FormLabel>
                  <Select 
                    onValueChange={field.onChange} 
                    value={field.value} 
                    disabled // Instance type is not changeable
                  >
                    <FormControl>
                      <SelectTrigger className="text-sm">
                        <SelectValue placeholder="选择实例类型" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="server">服务端</SelectItem>
                      <SelectItem value="client">客户端</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription className="font-sans">实例的类型创建后不可更改。</FormDescription>
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
                      className="text-sm font-mono"
                      placeholder={instanceType === "server" ? "服务端监听控制通道地址" : "连接的 NodePass 服务端隧道地址"}
                      {...field}
                    />
                  </FormControl>
                   <FormDescription className="font-sans">
                    {instanceType === "server"
                      ? "服务端模式: 监听控制连接 (例 '0.0.0.0:10101')。"
                      : "客户端模式: NodePass 服务端隧道地址 (例 'server.example.com:10101')。"}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="targetAddress"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>目标地址</FormLabel>
                  <FormControl>
                    <Input
                      className="text-sm font-mono"
                      placeholder={instanceType === "server" ? "服务端监听流量转发地址" : "本地流量转发地址"}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription className="font-sans">
                    {instanceType === "server"
                      ? "服务端模式: 监听隧道流量 (例 '0.0.0.0:8080')。"
                      : "客户端模式: 本地接收流量转发地址 (例 '127.0.0.1:8000')。"}
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
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="text-sm">
                        <SelectValue placeholder="选择日志级别" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="master">默认 (主控配置)</SelectItem>
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
                      <FormLabel>TLS 模式 (服务端)</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || "master"}>
                        <FormControl>
                          <SelectTrigger className="text-sm">
                            <SelectValue placeholder="选择TLS模式" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="master">默认 (主控配置)</SelectItem>
                          <SelectItem value="0">0: 无TLS (明文)</SelectItem>
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
                          <FormLabel>密钥路径 (TLS 2)</FormLabel>
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
          </form>
        </Form>
        <DialogFooter className="pt-4">
          <DialogClose asChild>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={modifyInstanceMutation.isPending}>
              取消
            </Button>
          </DialogClose>
          <Button type="submit" onClick={form.handleSubmit(onSubmit)} disabled={modifyInstanceMutation.isPending || !apiId || !apiRoot || !apiToken}>
            {modifyInstanceMutation.isPending ? '保存中...' : '保存更改'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
