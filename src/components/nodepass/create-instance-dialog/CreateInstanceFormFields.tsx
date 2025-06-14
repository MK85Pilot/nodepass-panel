
"use client";

import React from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Info, Network, Settings2, Share2, Zap } from 'lucide-react';
import type { CreateInstanceFormValues } from '@/zod-schemas/nodepass';
import type { NamedApiConfig } from '@/hooks/use-api-key';
import { MASTER_TLS_MODE_DISPLAY_MAP } from './constants';

interface CreateInstanceFormFieldsProps {
  form: UseFormReturn<CreateInstanceFormValues>;
  instanceType: "入口(c)" | "出口(s)";
  tlsMode?: string;
  isSingleEndedForward: boolean;
  autoCreateServer: boolean;
  activeApiConfig: NamedApiConfig | null;
  apiConfigsList: NamedApiConfig[];
  serverInstancesForDropdown: Array<{id: string, display: string, tunnelAddr: string, masterName: string}> | undefined;
  isLoadingServerInstances: boolean;
  externalApiSuggestion: string | null;
  onSubmitHandler: (values: CreateInstanceFormValues) => void;
  showDetailedDescriptions: boolean;
}

export function CreateInstanceFormFields({
  form,
  instanceType,
  tlsMode,
  isSingleEndedForward,
  autoCreateServer,
  activeApiConfig,
  apiConfigsList,
  serverInstancesForDropdown,
  isLoadingServerInstances,
  externalApiSuggestion,
  onSubmitHandler,
  showDetailedDescriptions,
}: CreateInstanceFormFieldsProps) {

  const masterLogLevelDisplay = activeApiConfig?.masterDefaultLogLevel && activeApiConfig.masterDefaultLogLevel !== 'master'
    ? activeApiConfig.masterDefaultLogLevel.charAt(0).toUpperCase() + activeApiConfig.masterDefaultLogLevel.slice(1)
    : '主控配置';

  const effectiveTlsModeDisplay = activeApiConfig?.masterDefaultTlsMode && activeApiConfig.masterDefaultTlsMode !== 'master'
    ? MASTER_TLS_MODE_DISPLAY_MAP[activeApiConfig.masterDefaultTlsMode as keyof typeof MASTER_TLS_MODE_DISPLAY_MAP] || '主控配置'
    : '主控配置';

  const serverApiIdOptions = React.useMemo(() => {
    if (instanceType === '入口(c)' && autoCreateServer && !isSingleEndedForward) {
      // Filter out the activeApiConfig from the list of available masters for the server
      return apiConfigsList.filter(config => config.id !== activeApiConfig?.id);
    }
    return [];
  }, [apiConfigsList, activeApiConfig?.id, instanceType, autoCreateServer, isSingleEndedForward]);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmitHandler)} className="space-y-3 py-1 max-h-[calc(65vh-50px)] overflow-y-auto pr-2" id="create-instance-form">
        <FormField
          control={form.control}
          name="instanceType"
          render={({ field }) => (
            <FormItem className="space-y-1">
              <FormLabel className="font-sans text-xs">实例类型</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger className="text-xs font-sans h-9">
                    <SelectValue placeholder="选择实例类型" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="入口(c)" className="font-sans text-xs">入口(c)</SelectItem>
                  <SelectItem value="出口(s)" className="font-sans text-xs">出口(s)</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage className="text-xs" />
            </FormItem>
          )}
        />

        {instanceType === '入口(c)' && (
          <FormField
            control={form.control}
            name="isSingleEndedForward"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center space-x-2 space-y-0 rounded-md border p-2 shadow-sm bg-muted/30">
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    id="isSingleEndedForwardCheckbox"
                    className="h-3.5 w-3.5"
                  />
                </FormControl>
                <div className="space-y-0.5 leading-none">
                  <FormLabel htmlFor="isSingleEndedForwardCheckbox" className="font-sans cursor-pointer text-xs flex items-center">
                    <Zap size={13} className="mr-1 text-yellow-500" />
                    单端转发模式
                  </FormLabel>
                  {showDetailedDescriptions && (
                    <FormDescription className="font-sans text-xs mt-0.5">
                      启用后，仅需配置本地监听端口和远程目标转发地址。
                    </FormDescription>
                  )}
                </div>
              </FormItem>
            )}
          />
        )}

        {instanceType === '入口(c)' && !isSingleEndedForward && (
          <FormField
            control={form.control}
            name="autoCreateServer"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center space-x-2 space-y-0 rounded-md border p-2 shadow-sm bg-muted/30">
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    id="autoCreateServerCheckbox"
                    className="h-3.5 w-3.5"
                  />
                </FormControl>
                <div className="space-y-0.5 leading-none">
                  <FormLabel htmlFor="autoCreateServerCheckbox" className="font-sans cursor-pointer text-xs">
                    自动创建匹配的出口(s)
                  </FormLabel>
                  {showDetailedDescriptions && (
                    <FormDescription className="font-sans text-xs mt-0.5">
                      在选定主控下创建相应出口(s)。入口(c)本地转发端口将使用出口(s)监听端口+1。
                    </FormDescription>
                  )}
                </div>
              </FormItem>
            )}
          />
        )}

        {instanceType === '入口(c)' && autoCreateServer && !isSingleEndedForward && (
          <FormField
            control={form.control}
            name="serverApiId"
            render={({ field }) => (
              <FormItem className="space-y-1">
                <FormLabel className="font-sans text-xs flex items-center">
                  <Network size={14} className="mr-1 text-primary" />
                  出口(s)所属主控
                </FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value || ""}
                  disabled={serverApiIdOptions.length === 0}
                >
                  <FormControl>
                    <SelectTrigger className="text-xs font-sans h-9">
                      <SelectValue placeholder={serverApiIdOptions.length === 0 ? "无其他主控可选" : "选择出口(s)创建主控"} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {serverApiIdOptions.map(config => (
                      <SelectItem key={config.id} value={config.id} className="font-sans text-xs">
                        {config.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {showDetailedDescriptions && (
                  <FormDescription className="font-sans text-xs mt-0.5">
                    选择自动创建的出口(s)实例将归属于哪个主控 (不能是当前客户端主控)。
                    {serverApiIdOptions.length === 0 && (
                      <span className="text-destructive"> 此功能要求至少配置一个其他主控。</span>
                    )}
                  </FormDescription>
                )}
                <FormMessage className="text-xs" />
              </FormItem>
            )}
          />
        )}

        {/* Tunnel Address / Port Field */}
        <FormField
          control={form.control}
          name="tunnelAddress"
          render={({ field }) => (
            <FormItem className="space-y-1">
              <FormLabel className="font-sans text-xs flex items-center">
                 <Settings2 size={14} className="mr-1 text-muted-foreground" />
                {instanceType === '出口(s)' ? '出口(s)隧道监听地址' :
                 (isSingleEndedForward ? '入口(c)本地监听端口' : 
                   (autoCreateServer ? '隧道监听端口' : '连接的出口(s)隧道地址')
                 )}
              </FormLabel>
              <FormControl>
                <Input
                  className="text-xs font-mono h-9"
                  placeholder={
                    instanceType === "出口(s)"
                      ? "例: 0.0.0.0:10101"
                      : (isSingleEndedForward
                          ? "例: 8080" 
                          : (autoCreateServer
                              ? "例: 10101 (主机将固定为 [::])"
                              : "例: your.server.com:10101"))
                  }
                  {...field}
                />
              </FormControl>
               {showDetailedDescriptions && (
                <FormDescription className="font-sans text-xs mt-0.5">
                  {instanceType === "出口(s)"
                    ? "出口(s)在此地址监听控制连接。"
                    : (isSingleEndedForward
                        ? "入口(c)在此本地端口监听传入连接。"
                        : (autoCreateServer
                            ? "自动创建的出口(s)将在此隧道监听端口监听 (主机固定为 [::])。"
                            : "入口(c)连接此出口(s)地址的控制通道。"))}
                </FormDescription>
               )}
              {externalApiSuggestion && showDetailedDescriptions && instanceType === '入口(c)' && !autoCreateServer && !isSingleEndedForward && (
                <FormDescription className="text-xs text-amber-600 dark:text-amber-400 mt-0.5 font-sans">
                  <Info size={12} className="inline-block mr-1 align-text-bottom" />
                  {externalApiSuggestion}
                </FormDescription>
              )}
              <FormMessage className="text-xs" />
            </FormItem>
          )}
        />

        {/* Server Target Address for Auto-Create Server */}
        {instanceType === '入口(c)' && autoCreateServer && !isSingleEndedForward && (
          <FormField
            control={form.control}
            name="serverTargetAddressForAutoCreate"
            render={({ field }) => (
              <FormItem className="space-y-1">
                <FormLabel className="font-sans text-xs flex items-center">
                  <Share2 size={14} className="mr-1 text-muted-foreground" />
                  转发地址 (自动创建的出口(s))
                </FormLabel>
                <FormControl>
                  <Input
                    className="text-xs font-mono h-9"
                    placeholder="例: 10.0.0.5:3000"
                    {...field}
                    value={field.value || ""} 
                  />
                </FormControl>
                {showDetailedDescriptions && (
                  <FormDescription className="font-sans text-xs mt-0.5">
                    自动创建的出口(s)实例会将流量转发到此地址。
                  </FormDescription>
                )}
                <FormMessage className="text-xs" />
              </FormItem>
            )}
          />
        )}

        {instanceType === '入口(c)' && !autoCreateServer && !isSingleEndedForward && (
          <FormItem className="space-y-1">
            <FormLabel className="font-sans text-xs">或从其他主控的现有出口(s)选择隧道</FormLabel>
            <Select
              onValueChange={(selectedServerId) => {
                if (selectedServerId) {
                  const selectedServer = serverInstancesForDropdown?.find(s => s.id === selectedServerId);
                  if (selectedServer) {
                    form.setValue('tunnelAddress', selectedServer.tunnelAddr, { shouldValidate: true, shouldDirty: true });
                  }
                }
              }}
              disabled={isLoadingServerInstances || !serverInstancesForDropdown || serverInstancesForDropdown.length === 0}
            >
              <FormControl>
                <SelectTrigger className="text-xs font-sans h-9">
                  <SelectValue placeholder={
                    isLoadingServerInstances ? "加载出口(s)中..." :
                    (!serverInstancesForDropdown || serverInstancesForDropdown.length === 0) ? "无其他主控的可用出口(s)" : "选择出口(s)隧道"
                  } />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {isLoadingServerInstances && (
                    <div className="flex items-center justify-center p-2 font-sans text-xs">
                        <Loader2 className="h-3.5 w-3.5 animate-spin mr-2"/> 加载中...
                    </div>
                )}
                {serverInstancesForDropdown && serverInstancesForDropdown.map(server => (
                  <SelectItem key={server.id} value={server.id} className="font-sans text-xs">
                    {server.display}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {showDetailedDescriptions && serverInstancesForDropdown && serverInstancesForDropdown.length === 0 && !isLoadingServerInstances && (
                <FormDescription className="font-sans text-xs mt-0.5">在其他主控下无可用出口(s)实例供选择。</FormDescription>
            )}
          </FormItem>
        )}

        {/* Target Address Field (context-dependent) */}
        <FormField
          control={form.control}
          name="targetAddress"
          render={({ field }) => (
            <FormItem className="space-y-1">
              <FormLabel className="font-sans text-xs flex items-center">
                <Share2 size={14} className="mr-1 text-muted-foreground" />
                {instanceType === '出口(s)' ? '转发地址 (出口(s))' :
                 (isSingleEndedForward ? '转发地址 (远程目标)' : '入口(c)本地转发端口 (可选)')}
              </FormLabel>
              <FormControl>
                <Input
                  className="text-xs font-mono h-9"
                  placeholder={
                      instanceType === '出口(s)' ? "例: 10.0.0.5:3000" :
                      (isSingleEndedForward ? "例: remote.service.com:3000" : "例: 8000 (默认为出口(s)隧道端口+1)")
                  }
                  {...field}
                />
              </FormControl>
              {showDetailedDescriptions && (
                <FormDescription className="font-sans text-xs mt-0.5">
                  {instanceType === "出口(s)"
                    ? "出口(s)将业务数据转发到此地址。"
                    : (isSingleEndedForward
                        ? "入口(c)将流量转发到的远程目标服务地址。"
                        : "入口(c)将流量转发到的本地服务端口 (主机固定为 [::])。若留空，将使用 (出口(s)隧道端口+1) 自动生成。")}
                </FormDescription>
              )}
              <FormMessage className="text-xs" />
            </FormItem>
          )}
        />


        <FormField
          control={form.control}
          name="logLevel"
          render={({ field }) => (
            <FormItem className="space-y-1">
              <FormLabel className="font-sans text-xs">日志级别</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger className="text-xs font-sans h-9">
                    <SelectValue placeholder="选择日志级别" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                   <SelectItem value="master" className="font-sans text-xs">
                     默认 ({masterLogLevelDisplay})
                  </SelectItem>
                  <SelectItem value="debug" className="font-sans text-xs">Debug</SelectItem>
                  <SelectItem value="info" className="font-sans text-xs">Info</SelectItem>
                  <SelectItem value="warn" className="font-sans text-xs">Warn</SelectItem>
                  <SelectItem value="error" className="font-sans text-xs">Error</SelectItem>
                  <SelectItem value="event" className="font-sans text-xs">Event</SelectItem>
                </SelectContent>
              </Select>
              {showDetailedDescriptions && (
                <FormDescription className="font-sans text-xs mt-0.5">
                  实例日志级别。
                  {autoCreateServer && instanceType === '入口(c)' && !isSingleEndedForward && " 此设置亦用于自动创建的出口(s)。"}
                </FormDescription>
              )}
              <FormMessage className="text-xs" />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="tlsMode"
          render={({ field }) => (
            <FormItem className="space-y-1">
              <FormLabel className="font-sans text-xs">
                {instanceType === '出口(s)' ? "TLS 模式 (出口(s)数据通道)"
                  : (isSingleEndedForward ? "TLS 模式 (入口(c)连接目标)" 
                      : (instanceType === '入口(c)' && autoCreateServer ? "TLS 模式 (自动创建的出口(s))" 
                          : "TLS 模式 (入口(c)连接行为)"))}
              </FormLabel>
              <Select onValueChange={field.onChange} value={field.value || "master"}>
                <FormControl>
                  <SelectTrigger className="text-xs font-sans h-9">
                    <SelectValue placeholder="选择 TLS 模式" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="master" className="font-sans text-xs">
                    默认 ({effectiveTlsModeDisplay})
                  </SelectItem>
                  <SelectItem value="0" className="font-sans text-xs">0: 无TLS (明文)</SelectItem>
                  <SelectItem value="1" className="font-sans text-xs">1: 自签名</SelectItem>
                  <SelectItem value="2" className="font-sans text-xs">2: 自定义</SelectItem>
                </SelectContent>
              </Select>
              {showDetailedDescriptions && (
                <FormDescription className="font-sans text-xs mt-0.5">
                  {instanceType === '出口(s)'
                    ? "出口(s)数据通道的TLS加密模式。"
                    : (isSingleEndedForward 
                        ? "入口(c)连接远程目标时使用的TLS行为。"
                        : (autoCreateServer
                            ? "用于自动创建的出口(s)的数据通道。"
                            : "入口(c)连接目标出口(s)时的TLS行为。"))}
                </FormDescription>
              )}
              <FormMessage className="text-xs" />
            </FormItem>
          )}
        />
        {/* Show Cert/Key fields if TLS mode 2 is selected for server, or client (auto-create or single-ended) */}
        {((instanceType === '出口(s)') || (instanceType === '入口(c)' && (autoCreateServer || isSingleEndedForward))) && tlsMode === '2' && (
          <>
            <FormField
              control={form.control}
              name="certPath"
              render={({ field }) => (
                <FormItem className="space-y-1">
                  <FormLabel className="font-sans text-xs">证书路径 (TLS 2)</FormLabel>
                  <FormControl>
                    <Input
                      className="text-xs font-mono h-9"
                      placeholder="例: /path/to/cert.pem"
                      {...field}
                      value={field.value || ""}
                    />
                  </FormControl>
                   {showDetailedDescriptions && (
                    <FormDescription className="font-sans text-xs mt-0.5">
                      {instanceType === '入口(c)' && autoCreateServer && !isSingleEndedForward ? "用于自动创建的出口(s)。" : ""}
                      {instanceType === '入口(c)' && isSingleEndedForward ? "用于单端转发客户端连接目标。" : ""}
                    </FormDescription>
                   )}
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="keyPath"
              render={({ field }) => (
                <FormItem className="space-y-1">
                  <FormLabel className="font-sans text-xs">密钥路径 (TLS 2)</FormLabel>
                  <FormControl>
                    <Input
                      className="text-xs font-mono h-9"
                      placeholder="例: /path/to/key.pem"
                      {...field}
                      value={field.value || ""}
                    />
                  </FormControl>
                   {showDetailedDescriptions && (
                    <FormDescription className="font-sans text-xs mt-0.5">
                    {instanceType === '入口(c)' && autoCreateServer && !isSingleEndedForward ? "用于自动创建的出口(s)。" : ""}
                    {instanceType === '入口(c)' && isSingleEndedForward ? "用于单端转发客户端连接目标。" : ""}
                    </FormDescription>
                   )}
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />
          </>
        )}
      </form>
    </Form>
  );
}
    
