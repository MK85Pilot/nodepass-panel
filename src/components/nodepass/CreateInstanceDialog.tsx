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
import { useToast } from '@/hooks/use-toast';
import { createInstanceFormSchema, type CreateInstanceFormValues, createInstanceApiSchema } from '@/zod-schemas/nodepass';
import type { CreateInstanceRequest, Instance } from '@/types/nodepass';
import { PlusCircle, Loader2 } from 'lucide-react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { nodePassApi } from '@/lib/api';
import { useApiConfig, type NamedApiConfig } from '@/hooks/use-api-key';
import type { AppLogEntry } from '../EventLog';
import { extractHostname, extractPort, parseNodePassUrlForTopology } from '@/app/topology/lib/topology-utils';

import { CreateInstanceFormFields } from './CreateInstanceFormFields';
import { buildUrlFromFormValues, formatHostForUrl } from './utils';
import { MASTER_TLS_MODE_DISPLAY_MAP } from './constants';


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
  const { apiConfigsList, getApiConfigById, getApiRootUrl, getToken } = useApiConfig();
  const [externalApiSuggestion, setExternalApiSuggestion] = useState<string | null>(null);

  const form = useForm<CreateInstanceFormValues>({
    resolver: zodResolver(createInstanceFormSchema),
    defaultValues: {
      instanceType: 'server',
      autoCreateServer: false,
      serverApiId: activeApiConfig?.id || undefined,
      tunnelAddress: '',
      targetAddress: '',
      logLevel: 'master',
      tlsMode: 'master',
      certPath: '',
      keyPath: '',
    },
  });

  const instanceType = form.watch("instanceType");
  const tlsModeWatch = form.watch("tlsMode");
  const autoCreateServer = form.watch("autoCreateServer");
  const tunnelAddressValue = form.watch("tunnelAddress");

  useEffect(() => {
    if (open) {
      form.reset({
        instanceType: 'server',
        autoCreateServer: false,
        serverApiId: activeApiConfig?.id || apiConfigsList[0]?.id || undefined,
        tunnelAddress: '',
        targetAddress: '',
        logLevel: 'master',
        tlsMode: 'master',
        certPath: '',
        keyPath: '',
      });
      setExternalApiSuggestion(null);
    }
  }, [open, form, activeApiConfig, apiConfigsList]);

 useEffect(() => {
    if (instanceType === "client") {
        if (!form.formState.dirtyFields.tlsMode) form.setValue("tlsMode", "master");
        if (!form.formState.dirtyFields.certPath) form.setValue("certPath", '');
        if (!form.formState.dirtyFields.keyPath) form.setValue("keyPath", '');
        if (!form.formState.dirtyFields.serverApiId && activeApiConfig?.id) {
           form.setValue("serverApiId", activeApiConfig.id);
        }
    } else if (instanceType === "server") {
        if (form.getValues("tlsMode") !== '2') {
            if (!form.formState.dirtyFields.certPath) form.setValue("certPath", '');
            if (!form.formState.dirtyFields.keyPath) form.setValue("keyPath", '');
        }
        if (!form.formState.dirtyFields.autoCreateServer) form.setValue("autoCreateServer", false);
        if (!form.formState.dirtyFields.serverApiId) form.setValue("serverApiId", undefined);
    }
  }, [instanceType, form, activeApiConfig]);


  useEffect(() => {
    if (instanceType === 'client' && tunnelAddressValue && !autoCreateServer) {
      const clientTunnelHost = extractHostname(tunnelAddressValue);
      if (!clientTunnelHost) { setExternalApiSuggestion(null); return; }
      const localHostnames = ['localhost', '127.0.0.1', '::', '::1', ''];
      if (localHostnames.includes(clientTunnelHost.toLowerCase())) { setExternalApiSuggestion(null); return; }
      const isKnownHost = apiConfigsList.some(config => {
        const configuredApiHost = extractHostname(config.apiUrl);
        return configuredApiHost && configuredApiHost.toLowerCase() === clientTunnelHost.toLowerCase();
      });
      if (!isKnownHost) {
        setExternalApiSuggestion(`提示: 您似乎正在连接到一个外部主控 (${clientTunnelHost})。考虑将其添加为主控连接以便于管理。`);
      } else { setExternalApiSuggestion(null); }
    } else { setExternalApiSuggestion(null); }
  }, [tunnelAddressValue, instanceType, apiConfigsList, autoCreateServer]);


  const { data: serverInstancesForDropdown, isLoading: isLoadingServerInstances } = useQuery<Instance[], Error, {id: string, display: string, tunnelAddr: string}[]>({
    queryKey: ['instances', apiId, 'serversForTunnelSelection'],
    queryFn: async () => {
      if (!apiId || !apiRoot || !apiToken) throw new Error("主控配置不完整，无法获取服务端实例。");
      const allInstancesRaw = await nodePassApi.getInstances(apiRoot, apiToken);
      const clientInstancesOnCurrentMaster = allInstancesRaw.filter(inst => inst.type === 'client');
      const usedServerTunnelAddresses = new Set<string>();
      clientInstancesOnCurrentMaster.forEach(clientInst => {
        const parsedClientUrl = parseNodePassUrlForTopology(clientInst.url);
        if (parsedClientUrl.tunnelAddress) { usedServerTunnelAddresses.add(parsedClientUrl.tunnelAddress.toLowerCase()); }
      });
      return allInstancesRaw.filter(inst => {
        if (inst.type !== 'server') return false;
        const parsedServerUrl = parseNodePassUrlForTopology(inst.url);
        if (!parsedServerUrl.tunnelAddress) return true;
        const serverListenAddress = parsedServerUrl.tunnelAddress.toLowerCase();
        return !usedServerTunnelAddresses.has(serverListenAddress);
      });
    },
    select: (data) => data
        .map(server => {
            const parsedUrl = parseNodePassUrlForTopology(server.url);
            if (!parsedUrl.tunnelAddress) return null;
            const displayTunnelAddr = parsedUrl.tunnelAddress;
            return { id: server.id, display: `ID: ${server.id.substring(0,8)}... (${displayTunnelAddr})`, tunnelAddr: displayTunnelAddr };
        })
        .filter(Boolean) as {id: string, display: string, tunnelAddr: string}[],
    enabled: !!(open && instanceType === 'client' && !autoCreateServer && apiId && apiRoot && apiToken),
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
      toast({ title: `实例创建于 ${masterNameForToast}`, description: `实例 (URL: ${shortUrl}) -> ID: ${createdInstance.id.substring(0,8)}...` });
      onLog?.(`实例创建成功于 ${masterNameForToast}: ${createdInstance.type} - ${createdInstance.id.substring(0,8)}... (URL: ${variables.data.url})`, 'SUCCESS');
      queryClient.invalidateQueries({ queryKey: ['instances', variables.useApiRoot === apiRoot ? apiId : apiConfigsList.find(c => getApiRootUrl(c.id) === variables.useApiRoot)?.id] });
      queryClient.invalidateQueries({ queryKey: ['allInstancesForTopologyPage']});
      queryClient.invalidateQueries({ queryKey: ['allInstancesForTraffic']});
    },
    onError: (error: any, variables) => {
      const shortUrl = variables.data.url.length > 40 ? variables.data.url.substring(0,37) + "..." : variables.data.url;
      const masterNameForToast = variables.useApiRoot === apiRoot ? apiName : apiConfigsList.find(c => getApiRootUrl(c.id) === variables.useApiRoot)?.name || 'a master';
      toast({ title: `创建实例失败于 ${masterNameForToast}`, description: `创建 (URL: ${shortUrl}) 失败: ${error.message || '未知错误。'}`, variant: 'destructive' });
      onLog?.(`实例创建失败于 ${masterNameForToast}: (URL: ${variables.data.url}) - ${error.message || '未知错误'}`, 'ERROR');
    },
  });

 async function onSubmitHandler(values: CreateInstanceFormValues) {
    const clientMasterApiId = apiId; 
    const clientMasterApiRoot = apiRoot;
    const clientMasterApiToken = apiToken;

    if (!clientMasterApiId || !clientMasterApiRoot || !clientMasterApiToken || !activeApiConfig) {
        toast({ title: "操作失败", description: "当前客户端主控配置无效。", variant: "destructive"});
        onLog?.('尝试创建实例失败: 当前客户端主控配置无效。', 'ERROR');
        return;
    }

    let clientInstanceUrl = '';
    let serverInstanceUrlForAutoCreate: string | null = null;
    
    if (values.instanceType === 'client') {
        if (values.autoCreateServer) {
            // ==============================================================================
            // [FIXED] 自动创建服务端和客户端的场景
            // ==============================================================================

            // --- 1. 准备【服务端】参数 ---
            const serverListenAddressFromForm = values.tunnelAddress; // e.g., '[::]:10101'
            const serverForwardAddressFromForm = values.targetAddress;
            const serverListenPort = extractPort(serverListenAddressFromForm);

            if (!serverListenPort) {
                toast({ title: "错误", description: "无法从隧道地址提取端口以创建服务端。", variant: "destructive" }); return;
            }
            if (!serverForwardAddressFromForm) {
                toast({ title: "错误", description: "自动创建服务端时，服务端转发目标地址是必需的。", variant: "destructive" }); return;
            }

            const serverTargetMasterId = values.serverApiId || clientMasterApiId;
            const serverMasterConfig = getApiConfigById(serverTargetMasterId);
            if (!serverMasterConfig) {
                toast({ title: "错误", description: `选择的服务端主控 (ID: ${serverTargetMasterId}) 未找到。`, variant: "destructive" }); return;
            }
            
            // 服务端URL使用用户输入的原始监听地址，这是正确的。
            serverInstanceUrlForAutoCreate = buildUrlFromFormValues({
                instanceType: 'server',
                tunnelAddress: serverListenAddressFromForm,
                targetAddress: serverForwardAddressFromForm,
                logLevel: values.logLevel,
                tlsMode: values.tlsMode,
                certPath: values.tlsMode === '2' ? values.certPath : '',
                keyPath: values.tlsMode === '2' ? values.keyPath : '',
            }, serverMasterConfig);
            onLog?.(`准备自动创建服务端于 "${serverMasterConfig.name}": ${serverInstanceUrlForAutoCreate}`, 'INFO');


            // --- 2. 准备【客户端】参数 (核心修复) ---
            
            // a. 客户端的【远程连接地址】 (tunnelAddress)
            //    主机必须是服务端的【主控地址】，而不是'[::]'。
            const clientRemoteHost = extractHostname(serverMasterConfig.apiUrl);
            if (!clientRemoteHost) {
                toast({ title: "错误", description: `无法从服务端主控 "${serverMasterConfig.name}" API URL提取主机名。`, variant: "destructive" }); return;
            }
            const clientRemotePort = serverListenPort; // 端口与服务端保持一致
            const clientRemoteFullAddress = `${formatHostForUrl(clientRemoteHost)}:${clientRemotePort}`;

            // b. 客户端的【本地转发地址】 (targetAddress)
            //    主机必须是安全的'127.0.0.1'，端口自增。
            const clientLocalHost = '127.0.0.1'; 
            const clientLocalPort = (parseInt(serverListenPort, 10) + 1).toString();
            const clientLocalFullAddress = `${formatHostForUrl(clientLocalHost)}:${clientLocalPort}`;

            // 使用全新计算出的、正确的地址来构建客户端URL
            clientInstanceUrl = buildUrlFromFormValues({
                instanceType: 'client',
                tunnelAddress: clientRemoteFullAddress,
                targetAddress: clientLocalFullAddress,
                logLevel: values.logLevel,
            }, activeApiConfig); // 客户端在它自己的主控上创建
            onLog?.(`准备创建客户端实例于 "${activeApiConfig.name}": ${clientInstanceUrl}`, 'INFO');

        } else { // 场景: 客户端连接到一个已存在的服务端
            const clientRemoteFullAddress = values.tunnelAddress;
            const clientRemotePort = extractPort(clientRemoteFullAddress);

            if (!clientRemotePort) {
                toast({ title: "错误", description: "无法从连接的服务端隧道地址提取端口。", variant: "destructive" }); return;
            }

            // 同样，为本地转发设置安全的默认值
            const clientLocalHost = '127.0.0.1';
            const clientLocalPort = (parseInt(clientRemotePort, 10) + 1).toString();
            const clientLocalFullAddress = `${formatHostForUrl(clientLocalHost)}:${clientLocalPort}`;
            
            clientInstanceUrl = buildUrlFromFormValues({
                instanceType: 'client',
                tunnelAddress: clientRemoteFullAddress,
                targetAddress: clientLocalFullAddress,
                logLevel: values.logLevel,
            }, activeApiConfig);
            onLog?.(`准备创建客户端实例于 "${activeApiConfig.name}": ${clientInstanceUrl}`, 'INFO');
        }

    } else { // 场景: 只创建服务端
        if (!values.targetAddress) {
             toast({ title: "错误", description: "创建服务端时，目标地址 (业务数据) 是必需的。", variant: "destructive" }); return;
        }
        clientInstanceUrl = buildUrlFromFormValues({ 
            instanceType: 'server',
            tunnelAddress: values.tunnelAddress,
            targetAddress: values.targetAddress,
            logLevel: values.logLevel,
            tlsMode: values.tlsMode,
            certPath: values.tlsMode === '2' ? values.certPath : '',
            keyPath: values.tlsMode === '2' ? values.keyPath : '',
        }, activeApiConfig);
        onLog?.(`准备创建服务端实例于 "${activeApiConfig.name}": ${clientInstanceUrl}`, 'INFO');
    }
    
    try {
      let serverCreationOk = true;
      if (serverInstanceUrlForAutoCreate) {
        const serverTargetMasterId = values.serverApiId || clientMasterApiId;
        const serverTargetMasterConfig = getApiConfigById(serverTargetMasterId);
        const serverTargetApiRoot = serverTargetMasterConfig ? getApiRootUrl(serverTargetMasterConfig.id) : null;
        const serverTargetApiToken = serverTargetMasterConfig ? getToken(serverTargetMasterConfig.id) : null;

        if (!serverTargetApiRoot || !serverTargetApiToken) {
          toast({title: "配置错误", description: `无法为服务端找到有效的API配置 (主控ID: ${serverTargetMasterId})`, variant: "destructive"});
          serverCreationOk = false;
        } else {
          try {
            await createInstanceMutation.mutateAsync({
              data: { url: serverInstanceUrlForAutoCreate },
              useApiRoot: serverTargetApiRoot,
              useApiToken: serverTargetApiToken,
            });
          } catch (e) {
            serverCreationOk = false; 
          }
        }
      }

      if (clientInstanceUrl && serverCreationOk) { 
        await createInstanceMutation.mutateAsync({
            data: { url: clientInstanceUrl },
            useApiRoot: clientMasterApiRoot, 
            useApiToken: clientMasterApiToken,
         });
      } else if (!clientInstanceUrl) {
        throw new Error("主实例URL未能正确构建。");
      }
      
      if (!createInstanceMutation.isError) {
         form.reset();
         onOpenChange(false);
      }
    } catch (error: any) {
       console.error("创建实例序列中发生错误:", error);
    }
  }
  
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
        
        <CreateInstanceFormFields
            form={form}
            instanceType={instanceType}
            tlsMode={tlsModeWatch}
            autoCreateServer={autoCreateServer}
            activeApiConfig={activeApiConfig}
            apiConfigsList={apiConfigsList}
            serverInstancesForDropdown={serverInstancesForDropdown}
            isLoadingServerInstances={isLoadingServerInstances}
            externalApiSuggestion={externalApiSuggestion}
            onSubmitHandler={onSubmitHandler}
        />

        <DialogFooter className="pt-4 font-sans">
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