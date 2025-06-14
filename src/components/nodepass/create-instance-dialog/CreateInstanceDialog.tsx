
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
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { nodePassApi } from '@/lib/api';
import { useApiConfig, type NamedApiConfig } from '@/hooks/use-api-key';
import type { AppLogEntry } from '../EventLog';
import { extractHostname, extractPort, isWildcardHostname, parseNodePassUrl } from '@/lib/url-utils';

import { CreateInstanceFormFields } from './CreateInstanceFormFields';
import { buildUrlFromFormValues, type BuildUrlParams, prepareClientUrlParams, prepareServerUrlParams, formatHostForUrl } from './utils';


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

interface InstanceUrlConfig {
  url: string;
  masterConfig: NamedApiConfig;
}

interface SubmissionPlan {
  primary: InstanceUrlConfig;
  secondary?: InstanceUrlConfig; // For auto-created server
}

export function CreateInstanceDialog({ open, onOpenChange, apiId, apiRoot, apiToken, apiName, activeApiConfig, onLog }: CreateInstanceDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { apiConfigsList, getApiConfigById, getApiRootUrl, getToken } = useApiConfig();
  const [externalApiSuggestion, setExternalApiSuggestion] = useState<string | null>(null);
  const [showDetailedDescriptions, setShowDetailedDescriptions] = useState(false);

  const form = useForm<CreateInstanceFormValues>({
    resolver: zodResolver(createInstanceFormSchema),
    defaultValues: {
      instanceType: '入口(c)',
      isSingleEndedForward: false,
      autoCreateServer: false,
      serverApiId: undefined,
      tunnelAddress: '',
      targetAddress: '',
      serverTargetAddressForAutoCreate: '',
      logLevel: 'master',
      tlsMode: 'master',
      certPath: '',
      keyPath: '',
    },
  });

  const instanceType = form.watch("instanceType");
  const tlsModeWatch = form.watch("tlsMode");
  const autoCreateServerWatched = form.watch("autoCreateServer");
  const isSingleEndedForwardWatched = form.watch("isSingleEndedForward");
  const tunnelAddressValue = form.watch("tunnelAddress");

  useEffect(() => {
    if (open) {
      form.reset({
        instanceType: '入口(c)',
        isSingleEndedForward: false,
        autoCreateServer: false,
        serverApiId: undefined,
        tunnelAddress: '',
        targetAddress: '',
        serverTargetAddressForAutoCreate: '',
        logLevel: 'master',
        tlsMode: 'master',
        certPath: '',
        keyPath: '',
      });
      setExternalApiSuggestion(null);
      setShowDetailedDescriptions(false);
    }
  }, [open, form]);

 useEffect(() => {
    // When instanceType changes, or related flags change, reset some fields to avoid invalid states
    if (instanceType === "入口(c)") {
        if (isSingleEndedForwardWatched) {
            // If single-ended is true, autoCreateServer must be false.
            if (autoCreateServerWatched) { // if autoCreateServer is true
                 form.setValue("autoCreateServer", false, { shouldDirty: true });
            }
        }
        // If TLS mode is not '2', clear cert and key paths.
        if (tlsModeWatch !== '2') {
            if (form.getValues("certPath") !== '') form.setValue("certPath", '');
            if (form.getValues("keyPath") !== '') form.setValue("keyPath", '');
        }
    } else if (instanceType === "出口(s)") {
        // If type is server, client-specific flags must be false.
        if (isSingleEndedForwardWatched) {
            form.setValue("isSingleEndedForward", false, {shouldDirty: true});
        }
        if (autoCreateServerWatched) {
            form.setValue("autoCreateServer", false, {shouldDirty: true});
        }
        // Server doesn't use serverApiId or serverTargetAddressForAutoCreate for itself.
        if (form.getValues("serverApiId") !== undefined) {
            form.setValue("serverApiId", undefined);
        }
        if (form.getValues("serverTargetAddressForAutoCreate") !== '') {
            form.setValue("serverTargetAddressForAutoCreate", '');
        }

        // If TLS mode is not '2', clear cert and key paths for server.
        if (tlsModeWatch !== '2') {
            if (form.getValues("certPath") !== '') form.setValue("certPath", '');
            if (form.getValues("keyPath") !== '') form.setValue("keyPath", '');
        }
    }
  }, [instanceType, form, isSingleEndedForwardWatched, autoCreateServerWatched, tlsModeWatch]);


  useEffect(() => {
    // Effect for autoCreateServerWatched logic (selecting serverApiId, etc.)
    if (instanceType === "入口(c)" && autoCreateServerWatched && !isSingleEndedForwardWatched) {
      const otherMasters = apiConfigsList.filter(c => c.id !== activeApiConfig?.id);
      if (otherMasters.length > 0) {
        const currentServerApiId = form.getValues("serverApiId");
        if (!currentServerApiId || !otherMasters.some(m => m.id === currentServerApiId)) {
          form.setValue("serverApiId", otherMasters[0].id, { shouldValidate: true, shouldDirty: true });
        }
      } else {
        form.setValue("serverApiId", undefined, { shouldValidate: true, shouldDirty: true });
      }
       if (!form.formState.dirtyFields.serverTargetAddressForAutoCreate) {
         form.setValue("serverTargetAddressForAutoCreate", "", {shouldDirty: true});
       }

    } else if (instanceType === "入口(c)" && (!autoCreateServerWatched || isSingleEndedForwardWatched) ) {
       if (form.getValues("serverApiId") !== undefined) form.setValue("serverApiId", undefined);
       if (form.getValues("serverTargetAddressForAutoCreate") !== '') form.setValue("serverTargetAddressForAutoCreate", '');
    }
  }, [instanceType, autoCreateServerWatched, isSingleEndedForwardWatched, apiConfigsList, activeApiConfig, form]);


  useEffect(() => {
    if (instanceType === '入口(c)' && tunnelAddressValue && !autoCreateServerWatched && !isSingleEndedForwardWatched) {
      const clientTunnelHost = extractHostname(tunnelAddressValue);
      if (!clientTunnelHost) {
        setExternalApiSuggestion(null);
        return;
      }

      const localHostnames = ['localhost', '127.0.0.1', '::', '::1', ''];
      if (localHostnames.includes(clientTunnelHost.toLowerCase()) || isWildcardHostname(clientTunnelHost)) {
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
  }, [tunnelAddressValue, instanceType, apiConfigsList, autoCreateServerWatched, isSingleEndedForwardWatched]);

  const { data: serverInstancesForDropdown, isLoading: isLoadingServerInstances } = useQuery<
    Array<{id: string, display: string, tunnelAddr: string, masterName: string}>,
    Error
  >({
    queryKey: ['otherMastersServersForDropdown', apiConfigsList.map(c => c.id).join('-'), activeApiConfig?.id],
    queryFn: async () => {
      if (!activeApiConfig) return [];

      const otherMasters = apiConfigsList.filter(config => config.id !== activeApiConfig.id);
      if (otherMasters.length === 0) {
        onLog?.('无其他主控可供选择出口(s)隧道。', 'INFO');
        return [];
      }
      onLog?.('为入口(c)获取其他主控 (' + otherMasters.map(m=>m.name).join(', ') + ') 的出口(s)列表...', 'INFO');

      let combinedServers: Array<{id: string, display: string, tunnelAddr: string, masterName: string}> = [];

      for (const master of otherMasters) {
        const masterApiRoot = getApiRootUrl(master.id);
        const masterApiToken = getToken(master.id);
        if (!masterApiRoot || !masterApiToken) {
          console.warn('跳过主控 ' + master.name + ' (出口(s)下拉列表): API信息不完整。');
          onLog?.('跳过主控 ' + master.name + ' (出口(s)下拉列表): API信息不完整。', 'WARN');
          continue;
        }
        try {
          const instances = await nodePassApi.getInstances(masterApiRoot, masterApiToken);
          const serversFromThisMaster = instances
            .filter(inst => inst.type === 'server')
            .map(serverInst => {
              const parsedUrl = parseNodePassUrl(serverInst.url);
              if (!parsedUrl.tunnelAddress) return null;
              return {
                id: serverInst.id,
                display: '主控: ' + master.name + ' - ID: ' + serverInst.id.substring(0,8) + '... (' + parsedUrl.tunnelAddress + ')',
                tunnelAddr: parsedUrl.tunnelAddress,
                masterName: master.name,
              };
            })
            .filter(Boolean) as Array<{id: string, display: string, tunnelAddr: string, masterName: string}>;

          const clientInstancesOnThisOtherMaster = instances.filter(inst => inst.type === 'client');
          const usedServerTunnelAddressesOnThisOtherMaster = new Set<string>();
          clientInstancesOnThisOtherMaster.forEach(clientInst => {
            const parsedClientUrl = parseNodePassUrl(clientInst.url);
            if (parsedClientUrl.tunnelAddress) { usedServerTunnelAddressesOnThisOtherMaster.add(parsedClientUrl.tunnelAddress.toLowerCase()); }
          });

          const availableServers = serversFromThisMaster.filter(server =>
            !usedServerTunnelAddressesOnThisOtherMaster.has(server.tunnelAddr.toLowerCase())
          );
          combinedServers.push(...availableServers);

        } catch (error: any) {
          console.error('从主控 ' + master.name + ' 获取出口(s)失败:', error.message);
          onLog?.('从主控 ' + master.name + ' 获取出口(s)失败: ' + error.message, 'ERROR');
        }
      }
      onLog?.('为入口(c)获取到 ' + combinedServers.length + ' 个来自其他主控的可用出口(s)隧道。', 'INFO');
      return combinedServers;
    },
    enabled: !!(open && instanceType === '入口(c)' && !autoCreateServerWatched && !isSingleEndedForwardWatched && apiConfigsList.length > 0 && activeApiConfig),
  });


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
      onLog?.('实例创建成功于 ' + masterNameForToast + ': ' + (createdInstance.type === 'server' ? '出口(s)' : '入口(c)') + ' - ' + createdInstance.id.substring(0,8) + '... (URL: ' + shortUrl + ')', 'SUCCESS');

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
    let secondaryUrlParams: BuildUrlParams | null = null;
    let secondaryMasterConfig: NamedApiConfig | null = null;
    
    const localOnLog = (message: string, type: 'INFO' | 'WARN' | 'ERROR') => {
      if (type === 'ERROR') toast({ title: "配置错误", description: message, variant: "destructive" });
      onLog?.(message, type);
    };

    if (values.instanceType === '入口(c)') {
      const clientSubmission = prepareClientUrlParams(values, activeApiConfig, getApiConfigById, localOnLog);
      if (!clientSubmission) return;

      primaryUrlParams = clientSubmission.clientParams;
      if (clientSubmission.serverParamsForAutoCreate && clientSubmission.serverMasterForAutoCreate) {
        secondaryUrlParams = clientSubmission.serverParamsForAutoCreate;
        secondaryMasterConfig = clientSubmission.serverMasterForAutoCreate;
      }
    } else { // '出口(s)'
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

    let secondaryInstanceUrl: string | null = null;
    if (secondaryUrlParams && secondaryMasterConfig) {
      secondaryInstanceUrl = buildUrlFromFormValues(secondaryUrlParams, secondaryMasterConfig);
      onLog?.('准备创建从实例于 "' + secondaryMasterConfig.name + '": ' + secondaryInstanceUrl, 'INFO');
    }

    try {
      let serverCreationOk = true;
      if (secondaryInstanceUrl && secondaryMasterConfig) {
        const serverTargetApiRoot = getApiRootUrl(secondaryMasterConfig.id);
        const serverTargetApiToken = getToken(secondaryMasterConfig.id);

        if (!serverTargetApiRoot || !serverTargetApiToken) {
          toast({title: "配置错误", description: '无法为出口(s)找到有效的API配置 (主控ID: ' + secondaryMasterConfig.id + ')', variant: "destructive"});
          serverCreationOk = false;
        } else {
          try {
            await createInstanceMutation.mutateAsync({
              data: { url: secondaryInstanceUrl },
              useApiRoot: serverTargetApiRoot,
              useApiToken: serverTargetApiToken,
            });
          } catch (e) {
            serverCreationOk = false;
          }
        }
      }

      if (primaryInstanceUrl && serverCreationOk) {
        await createInstanceMutation.mutateAsync({
            data: { url: primaryInstanceUrl },
            useApiRoot: apiRoot, 
            useApiToken: apiToken,
         });
      }

      const wasAnyMutationInErrorState = createInstanceMutation.isError;

      if (!wasAnyMutationInErrorState && serverCreationOk) {
         form.reset();
         onOpenChange(false);
      }
    } catch (error: any) {
       console.error("创建实例序列中发生错误:", error);
       onLog?.('创建实例序列中发生错误: ' + error.message, 'ERROR');
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
            instanceType={instanceType as "入口(c)" | "出口(s)"}
            tlsMode={tlsModeWatch}
            isSingleEndedForward={isSingleEndedForwardWatched}
            autoCreateServer={autoCreateServerWatched}
            activeApiConfig={activeApiConfig}
            apiConfigsList={apiConfigsList}
            serverInstancesForDropdown={serverInstancesForDropdown}
            isLoadingServerInstances={isLoadingServerInstances}
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

    