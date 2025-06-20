
"use client";

import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
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
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { createInstanceFormSchema, type CreateInstanceFormValues, createInstanceApiSchema } from '@/zod-schemas/nodepass';
import type { CreateInstanceRequest, Instance } from '@/types/nodepass';
import { PlusCircle, Loader2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { nodePassApi } from '@/lib/api';
import { useApiConfig, type NamedApiConfig } from '@/hooks/use-api-key';
import type { AppLogEntry } from '../EventLog';
import { extractHostname } from '@/lib/url-utils';
import { useInstanceAliases } from '@/hooks/use-instance-aliases';

import { CreateInstanceFormFields } from './CreateInstanceFormFields';
import { buildUrlFromFormValues, type BuildUrlParams, prepareClientUrlParams, prepareServerUrlParams } from './utils';

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

export function CreateInstanceDialog({ open, onOpenChange, apiId, apiRoot, apiToken, apiName, activeApiConfig, onLog }: CreateInstanceDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { apiConfigsList, getApiRootUrl, getToken } = useApiConfig();
  const { setAlias: saveInstanceAlias } = useInstanceAliases();
  const [externalApiSuggestion, setExternalApiSuggestion] = useState<string | null>(null);
  const [showDetailedDescriptions, setShowDetailedDescriptions] = useState(false);

  const form = useForm<CreateInstanceFormValues>({
    resolver: zodResolver(createInstanceFormSchema),
    defaultValues: {
      instanceType: '客户端',
      alias: '',
      tunnelKey: '',
      isSingleEndedForward: false,
      tunnelAddress: '',
      targetAddress: '',
      logLevel: 'master',
      tlsMode: 'master',
      certPath: '',
      keyPath: '',
      minPoolSize: undefined,
      maxPoolSize: undefined,
    },
  });

  const instanceType = form.watch("instanceType");
  const tlsModeWatch = form.watch("tlsMode");
  const isSingleEndedForwardWatched = form.watch("isSingleEndedForward");
  const tunnelAddressValue = form.watch("tunnelAddress");

  useEffect(() => {
    if (open) {
      form.reset({
        instanceType: '客户端',
        alias: '',
        tunnelKey: '',
        isSingleEndedForward: false,
        tunnelAddress: '',
        targetAddress: '',
        logLevel: 'master',
        tlsMode: 'master',
        certPath: '',
        keyPath: '',
        minPoolSize: undefined,
        maxPoolSize: undefined,
      });
      setExternalApiSuggestion(null);
      setShowDetailedDescriptions(false);
    }
  }, [open, form]);

 useEffect(() => {
    if (instanceType === "客户端") {
        if (isSingleEndedForwardWatched) {
            if (form.getValues("tlsMode") !== '0') form.setValue("tlsMode", "0", { shouldDirty: true });
            if (form.getValues("certPath") !== '') form.setValue("certPath", '', { shouldDirty: true });
            if (form.getValues("keyPath") !== '') form.setValue("keyPath", '', { shouldDirty: true });
        } else {
            if (tlsModeWatch !== '2') {
                if (form.getValues("certPath") !== '') form.setValue("certPath", '');
                if (form.getValues("keyPath") !== '') form.setValue("keyPath", '');
            }
        }
    } else if (instanceType === "服务端") {
        if (isSingleEndedForwardWatched) {
            form.setValue("isSingleEndedForward", false, {shouldDirty: true});
        }
        if (tlsModeWatch !== '2') {
            if (form.getValues("certPath") !== '') form.setValue("certPath", '');
            if (form.getValues("keyPath") !== '') form.setValue("keyPath", '');
        }
        // For server, min/max pool size are not applicable, ensure they are undefined
        if (form.getValues("minPoolSize") !== undefined) form.setValue("minPoolSize", undefined);
        if (form.getValues("maxPoolSize") !== undefined) form.setValue("maxPoolSize", undefined);
    }
  }, [instanceType, form, isSingleEndedForwardWatched, tlsModeWatch]);


  useEffect(() => {
    if (instanceType === '客户端' && tunnelAddressValue && !isSingleEndedForwardWatched) {
      const clientTunnelHost = extractHostname(tunnelAddressValue);
      if (!clientTunnelHost) {
        setExternalApiSuggestion(null);
        return;
      }

      const localHostnames = ['localhost', '127.0.0.1', '::', '::1', ''];
      if (localHostnames.includes(clientTunnelHost.toLowerCase())) {
        setExternalApiSuggestion(null);
        return;
      }

      const isKnownHost = apiConfigsList.some(config => {
        const configuredApiHost = extractHostname(config.apiUrl);
        return configuredApiHost && configuredApiHost.toLowerCase() === clientTunnelHost.toLowerCase();
      });

      if (!isKnownHost) {
        setExternalApiSuggestion('提示: 连接到外部主控 (' + clientTunnelHost + ')。可考虑将其添加为主控连接。');
      } else {
        setExternalApiSuggestion(null);
      }
    } else {
      setExternalApiSuggestion(null);
    }
  }, [tunnelAddressValue, instanceType, apiConfigsList, isSingleEndedForwardWatched]);

  const createInstanceMutation = useMutation({
    mutationFn: (params: { data: CreateInstanceRequest, useApiRoot?: string, useApiToken?: string }) => {
      const effectiveApiRoot = params.useApiRoot || apiRoot;
      const effectiveApiToken = params.useApiToken || apiToken;

      if (!effectiveApiRoot || !effectiveApiToken) throw new Error("API configuration is incomplete.");
      const validatedApiData = createInstanceApiSchema.parse(params.data);
      return nodePassApi.createInstance(validatedApiData, effectiveApiRoot, effectiveApiToken);
    },
    onSuccess: (createdInstance, variables) => {
      const shortUrl = variables.data.url.length > 40 ? variables.data.url.substring(0,37) + "..." : variables.data.url;
      const masterNameForToast = variables.useApiRoot === apiRoot ? apiName : apiConfigsList.find(c => getApiRootUrl(c.id) === variables.useApiRoot)?.name || 'a master';

      toast({
        title: '实例创建于 ' + masterNameForToast,
        description: '实例 (URL: ' + shortUrl + ') -> ID: ' + createdInstance.id.substring(0,8) + '...',
      });
      onLog?.('实例创建成功于 ' + masterNameForToast + ': ' + (createdInstance.type === 'server' ? '服务端' : '客户端') + ' - ' + createdInstance.id.substring(0,8) + '... (URL: ' + shortUrl + ')', 'SUCCESS');

      queryClient.invalidateQueries({ queryKey: ['instances', variables.useApiRoot === apiRoot ? apiId : apiConfigsList.find(c => getApiRootUrl(c.id) === variables.useApiRoot)?.id] });
      queryClient.invalidateQueries({ queryKey: ['allInstancesForTraffic']});
    },
    onError: (error: any, variables) => {
      const shortUrl = variables.data.url.length > 40 ? variables.data.url.substring(0,37) + "..." : variables.data.url;
      const masterNameForToast = variables.useApiRoot === apiRoot ? apiName : apiConfigsList.find(c => getApiRootUrl(c.id) === variables.useApiRoot)?.name || 'a master';
      toast({
        title: '创建实例失败于 ' + masterNameForToast,
        description: '创建 (URL: ' + shortUrl + ') 失败: ' + (error.message || '未知错误。'),
        variant: 'destructive',
      });
      onLog?.('创建实例失败于 ' + masterNameForToast + ': (URL: ' + shortUrl + ') - ' + (error.message || '未知错误'), 'ERROR');
    },
  });

 async function onSubmitHandler(values: CreateInstanceFormValues) {
    if (!apiId || !apiRoot || !apiToken || !activeApiConfig) {
        toast({ title: "操作失败", description: "当前主控配置无效。", variant: "destructive"});
        onLog?.('尝试创建实例失败: 当前主控配置无效。', 'ERROR');
        return;
    }

    let primaryUrlParams: BuildUrlParams | null = null;
    let primaryCreatedInstance: Instance | null = null;

    const localOnLog = (message: string, type: 'INFO' | 'WARN' | 'ERROR') => {
      if (type === 'ERROR') toast({ title: "配置错误", description: message, variant: "destructive" });
      onLog?.(message, type);
    };

    if (values.instanceType === '客户端') {
      const clientSubmission = prepareClientUrlParams(values, activeApiConfig, localOnLog);
      if (!clientSubmission) return;
      primaryUrlParams = clientSubmission.clientParams;
    } else { // '服务端'
      const serverSubmission = prepareServerUrlParams(values, localOnLog);
      if (!serverSubmission) return;
      primaryUrlParams = serverSubmission.serverParams;
    }

    if (!primaryUrlParams) {
      onLog?.('主实例URL参数未能正确准备。', 'ERROR');
      toast({ title: "内部错误", description: "主实例URL未能构建。", variant: "destructive" });
      return;
    }

    const primaryInstanceUrl = buildUrlFromFormValues(primaryUrlParams, activeApiConfig);
    onLog?.('准备创建主实例于 "' + activeApiConfig.name + '": ' + primaryInstanceUrl, 'INFO');

    try {
      if (primaryInstanceUrl) {
        primaryCreatedInstance = await createInstanceMutation.mutateAsync({
            data: { url: primaryInstanceUrl },
            useApiRoot: apiRoot,
            useApiToken: apiToken,
         });

         if (primaryCreatedInstance && values.alias && values.alias.trim() !== "") {
            saveInstanceAlias(primaryCreatedInstance.id, values.alias.trim());
            onLog?.(`为实例 ${primaryCreatedInstance.id.substring(0,8)}... 设置别名: "${values.alias.trim()}"`, 'INFO');
         }
      }

      if (!createInstanceMutation.isError) {
         form.reset();
         onOpenChange(false);
      }
    } catch (error: any) {
       console.error("创建实例或保存别名时发生错误:", error);
       if (!createInstanceMutation.isError) {
          toast({ title: "操作失败", description: "创建实例过程中发生意外错误。", variant: "destructive" });
          onLog?.('创建实例或保存别名时发生错误: ' + error.message, 'ERROR');
       }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg p-4">
        <DialogHeader className="pb-2">
          <DialogTitle className="flex items-center font-title">
            <PlusCircle className="mr-2 h-5 w-5 text-primary" />
            创建新实例
          </DialogTitle>
          <div className="flex justify-between items-center mt-1">
            <DialogDescription className="font-sans text-xs mr-4">
              为当前主控 “{apiName || 'N/A'}” 配置新实例。
            </DialogDescription>
            <div className="flex items-center space-x-2 flex-shrink-0">
              <Switch
                id="toggle-descriptions"
                checked={showDetailedDescriptions}
                onCheckedChange={setShowDetailedDescriptions}
                aria-label="切换详细参数说明"
                className="h-4 w-7 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input [&_span]:h-3 [&_span]:w-3 [&_span]:data-[state=checked]:translate-x-3.5 [&_span]:data-[state=unchecked]:translate-x-0.5"
              />
              <Label htmlFor="toggle-descriptions" className="font-sans text-xs cursor-pointer">参数说明</Label>
            </div>
          </div>
        </DialogHeader>

        <CreateInstanceFormFields
            form={form}
            instanceType={instanceType as "客户端" | "服务端"}
            tlsMode={tlsModeWatch}
            isSingleEndedForward={isSingleEndedForwardWatched}
            activeApiConfig={activeApiConfig}
            apiConfigsList={apiConfigsList}
            serverInstancesForDropdown={undefined}
            isLoadingServerInstances={false}
            externalApiSuggestion={externalApiSuggestion}
            onSubmitHandler={onSubmitHandler}
            showDetailedDescriptions={showDetailedDescriptions}
        />

        <DialogFooter className="pt-3 font-sans">
          <DialogClose asChild>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={createInstanceMutation.isPending}>
              取消
            </Button>
          </DialogClose>
          <Button type="submit" form="create-instance-form" disabled={createInstanceMutation.isPending || !apiId}>
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
