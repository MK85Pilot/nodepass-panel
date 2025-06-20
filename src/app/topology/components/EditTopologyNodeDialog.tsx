
"use client";

import React, { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Node, CustomNodeData, MasterSubRole } from '../topologyTypes';
import { MASTER_TLS_MODE_DISPLAY_MAP } from '@/components/nodepass/create-instance-dialog/constants';
import { useApiConfig } from '@/hooks/use-api-key';

interface EditTopologyNodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  node: Node | null;
  hasServerNodesInParentContainer: boolean;
  isInterMasterClientLink?: boolean;
  interMasterLinkSourceInfo?: {
    serverTunnelAddress: string;
  };
  onSave: (nodeId: string, updatedData: Partial<CustomNodeData>) => void;
}

const hostPortRegex = /^(?:\[[0-9a-fA-F:]+\]|[0-9a-zA-Z.-]+):[0-9]+$/;
const hostPortErrorMsg = "地址格式无效 (例: host:port 或 [ipv6]:port)。";

const baseSchema = z.object({
  label: z.string().min(1, "标签不能为空。"),
});

const masterSchema = baseSchema.extend({
  masterSubRoleM: z.enum(["container", "primary", "client-role", "server-role", "generic"]),
  targetAddressM: z.optional(z.string().regex(hostPortRegex, hostPortErrorMsg)),
  logLevelM: z.enum(["master", "debug", "info", "warn", "error", "event"]),
  tlsModeM: z.enum(["master", "0", "1", "2"]),
  remoteMasterIdForTunnel: z.optional(z.string()),
  remoteServerListenAddress: z.optional(z.string().regex(hostPortRegex, "远程服务端(s)监听地址格式无效 (例: [::]:10101)。")),
  remoteServerForwardAddress: z.optional(z.string().regex(hostPortRegex, "远程服务端(s)转发地址格式无效 (例: 192.168.1.10:80)。")),
});

const serverSchema = baseSchema.extend({
  tunnelAddressS: z.string().min(1, "隧道地址不能为空。").regex(hostPortRegex, hostPortErrorMsg),
  targetAddressS: z.string().min(1, "目标地址不能为空。").regex(hostPortRegex, hostPortErrorMsg),
  logLevelS: z.enum(["master", "debug", "info", "warn", "error", "event"]),
  tlsModeS: z.enum(["master", "0", "1", "2"]),
  certPathS: z.optional(z.string()),
  keyPathS: z.optional(z.string()),
  tunnelKeyS: z.string().optional(),
});

const clientSchema = z.object({
  label: z.string().min(1, "标签不能为空。"),
  isSingleEndedForwardC: z.boolean().default(false),
  tunnelAddressC_Normal: z.optional(z.string()),
  localListenAddressC_Normal: z.optional(z.string()),
  localListenAddressC_Single: z.optional(z.string()),
  remoteTargetAddressC_Single: z.optional(z.string()),
  logLevelC: z.enum(["master", "debug", "info", "warn", "error", "event"]),
  tunnelKeyC: z.string().optional(),
  minPoolSizeC: z.coerce.number().int("最小连接池必须是整数。").positive("最小连接池必须是正数。").optional().or(z.literal("").transform(() => undefined)),
  maxPoolSizeC: z.coerce.number().int("最大连接池必须是整数。").positive("最大连接池必须是正数。").optional().or(z.literal("").transform(() => undefined)),
}).superRefine((data, ctx) => {
    const effectiveIsSingleEnded = data.isSingleEndedForwardC;

    if (effectiveIsSingleEnded) {
        if (!data.localListenAddressC_Single || !hostPortRegex.test(data.localListenAddressC_Single)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: `本地监听地址无效 (${hostPortErrorMsg})。`, path: ["localListenAddressC_Single"] });
        }
        if (!data.remoteTargetAddressC_Single || !hostPortRegex.test(data.remoteTargetAddressC_Single)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: `目标服务地址无效 (${hostPortErrorMsg})。`, path: ["remoteTargetAddressC_Single"] });
        }
    } else {
        if (!data.tunnelAddressC_Normal || !hostPortRegex.test(data.tunnelAddressC_Normal)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: `隧道地址无效 (${hostPortErrorMsg})。`, path: ["tunnelAddressC_Normal"] });
        }
        if (data.localListenAddressC_Normal && data.localListenAddressC_Normal.trim() !== "" && !hostPortRegex.test(data.localListenAddressC_Normal)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: `本地监听地址无效 (${hostPortErrorMsg})。`, path: ["localListenAddressC_Normal"] });
        }
    }
    if (data.minPoolSizeC !== undefined && data.maxPoolSizeC !== undefined && data.minPoolSizeC >= data.maxPoolSizeC) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "最小连接池必须小于最大连接池。",
            path: ["minPoolSizeC"],
        });
    }
});


const tuSchema = baseSchema.extend({
  targetAddressTU: z.optional(z.string().regex(hostPortRegex, hostPortErrorMsg)),
});

type FormValues = z.infer<typeof masterSchema> | z.infer<typeof serverSchema> | z.infer<typeof clientSchema> | z.infer<typeof tuSchema>;

export function EditTopologyNodeDialog({
  open,
  onOpenChange,
  node,
  hasServerNodesInParentContainer,
  isInterMasterClientLink = false,
  interMasterLinkSourceInfo,
  onSave
}: EditTopologyNodeDialogProps) {
  const role = node?.data.role;
  const { apiConfigsList, activeApiConfig, getApiConfigById } = useApiConfig();

  const canClientBeSingleEnded = role === 'C' ? !hasServerNodesInParentContainer && !isInterMasterClientLink : false;

  const currentSchema = useMemo(() => {
    if (role === 'M') return masterSchema;
    if (role === 'S') return serverSchema;
    if (role === 'C') return clientSchema;
    return tuSchema;
  }, [role]);

  const otherApiConfigs = apiConfigsList.filter(c => c.id !== node?.data.masterId && c.id !== activeApiConfig?.id);

  const form = useForm<FormValues>({
    resolver: zodResolver(currentSchema),
    defaultValues: {},
  });

  useEffect(() => {
    if (node && open) {
      const data = node.data;
      let defaultVals: Partial<FormValues> = { label: data.label };

      if (role === 'M') {
        defaultVals = {
          ...defaultVals,
          masterSubRoleM: data.masterSubRole || "container",
          targetAddressM: data.targetAddress || "",
          logLevelM: (data.logLevel as any) || data.defaultLogLevel || "master",
          tlsModeM: (data.tlsMode as any) || data.defaultTlsMode || "master",
          remoteMasterIdForTunnel: data.remoteMasterIdForTunnel || "",
          remoteServerListenAddress: data.remoteServerListenAddress || "",
          remoteServerForwardAddress: data.remoteServerForwardAddress || "",
        };
      } else if (role === 'S') {
        defaultVals = {
          ...defaultVals,
          label: data.label,
          tunnelAddressS: data.tunnelAddress || "",
          targetAddressS: data.targetAddress || "",
          logLevelS: (data.logLevel as any) || "master",
          tlsModeS: (data.tlsMode as any) || "master",
          certPathS: data.certPath || "",
          keyPathS: data.keyPath || "",
          tunnelKeyS: data.tunnelKey || "",
        };
      } else if (role === 'C') {
        const isEffectivelySingleEndedForDefaults = canClientBeSingleEnded ? !!data.isSingleEndedForwardC : false;
        defaultVals = {
          ...defaultVals,
          label: data.label,
          isSingleEndedForwardC: isEffectivelySingleEndedForDefaults,
          logLevelC: (data.logLevel as any) || "master",
          tunnelKeyC: data.tunnelKey || "",
          minPoolSizeC: data.minPoolSize || undefined,
          maxPoolSizeC: data.maxPoolSize || undefined,
        };
        if (isEffectivelySingleEndedForDefaults) {
          (defaultVals as any).localListenAddressC_Single = data.tunnelAddress || "";
          (defaultVals as any).remoteTargetAddressC_Single = data.targetAddress || "";
        } else {
          if (isInterMasterClientLink && interMasterLinkSourceInfo) {
            (defaultVals as any).tunnelAddressC_Normal = interMasterLinkSourceInfo.serverTunnelAddress;
          } else {
            (defaultVals as any).tunnelAddressC_Normal = data.tunnelAddress || "";
          }
          (defaultVals as any).localListenAddressC_Normal = data.targetAddress || "";
        }
      } else if (role === 'T' || role === 'U') {
        defaultVals = { ...defaultVals, label: data.label, targetAddressTU: data.targetAddress || "" };
      }
      form.reset(defaultVals as any);
    }
  }, [node, open, form, role, hasServerNodesInParentContainer, isInterMasterClientLink, currentSchema, interMasterLinkSourceInfo, canClientBeSingleEnded]);

  const onSubmit = (values: FormValues) => {
    if (!node) return;
    let updatedData: Partial<CustomNodeData> = { label: values.label };

    if (role === 'M' && 'masterSubRoleM' in values) {
      updatedData = {
        ...updatedData,
        masterSubRole: values.masterSubRoleM as MasterSubRole,
        logLevel: values.logLevelM,
        tlsMode: values.tlsModeM,
      };
      if (values.masterSubRoleM === 'client-role') {
        updatedData.targetAddress = values.targetAddressM;
        updatedData.remoteMasterIdForTunnel = values.remoteMasterIdForTunnel;
        updatedData.remoteServerListenAddress = values.remoteServerListenAddress;
        updatedData.remoteServerForwardAddress = values.remoteServerForwardAddress;
      } else {
        updatedData.targetAddress = "";
        updatedData.remoteMasterIdForTunnel = "";
        updatedData.remoteServerListenAddress = "";
        updatedData.remoteServerForwardAddress = "";
      }
    } else if (role === 'S' && 'tunnelAddressS' in values) {
      updatedData = {
        ...updatedData,
        label: values.label,
        tunnelAddress: values.tunnelAddressS,
        targetAddress: values.targetAddressS,
        logLevel: values.logLevelS,
        tlsMode: values.tlsModeS,
        certPath: values.tlsModeS === "2" ? values.certPathS : "",
        keyPath: values.tlsModeS === "2" ? values.keyPathS : "",
        tunnelKey: values.tunnelKeyS?.trim() || undefined,
      };
    } else if (role === 'C' && 'logLevelC' in values) {
      const finalIsSingleEndedDataValue = canClientBeSingleEnded ? values.isSingleEndedForwardC : false;
      updatedData = {
        ...updatedData,
        label: values.label,
        isSingleEndedForwardC: finalIsSingleEndedDataValue,
        logLevel: values.logLevelC,
        tlsMode: finalIsSingleEndedDataValue ? "0" : values.tlsModeC || "master",
        certPath: (finalIsSingleEndedDataValue || values.tlsModeC !== '2') ? "" : values.certPathC,
        keyPath: (finalIsSingleEndedDataValue || values.tlsModeC !== '2') ? "" : values.keyPathC,
        tunnelKey: values.tunnelKeyC?.trim() || undefined,
        minPoolSize: values.minPoolSizeC,
        maxPoolSize: values.maxPoolSizeC,
      };
      if (finalIsSingleEndedDataValue) {
        updatedData.tunnelAddress = values.localListenAddressC_Single;
        updatedData.targetAddress = values.remoteTargetAddressC_Single;
      } else {
        updatedData.tunnelAddress = values.tunnelAddressC_Normal;
        updatedData.targetAddress = values.localListenAddressC_Normal;
      }
    } else if (role === 'T' && 'targetAddressTU' in values) {
      updatedData = { ...updatedData, label: values.label, targetAddress: values.targetAddressTU };
    } else if (role === 'U') {
      updatedData = { ...updatedData, label: values.label };
    }
    onSave(node.id, updatedData);
    onOpenChange(false);
  };

  if (!node) return null;
  const dialogTitle = role === 'M' ? "编辑 主控容器"
    : role === 'S' ? "编辑 服务端"
    : role === 'C' ? "编辑 客户端"
    : role === 'T' ? "编辑 目标服务"
    : "编辑 用户";
  const watchedMasterSubRole = role === 'M' ? form.watch('masterSubRoleM') : undefined;
  const renderClientAsSingleEnded = canClientBeSingleEnded ? form.watch('isSingleEndedForwardC') : false;
  const watchedServerTlsMode = role === 'S' ? form.watch('tlsModeS') : undefined;
  const watchedClientTlsMode = (role === 'C' && !renderClientAsSingleEnded) ? form.watch('tlsModeC') : undefined;


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-title">{dialogTitle}</DialogTitle>
          <DialogDescription className="font-sans">
            修改节点 "{node.data.label}" 的配置。
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
            <FormField
              control={form.control}
              name="label"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-sans">标签</FormLabel>
                  <FormControl><Input {...field} className="font-sans" /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {role === 'M' && (
              <>
                <FormField control={form.control} name="masterSubRoleM" render={({ field }) => (
                  <FormItem><FormLabel className="font-sans">主控画布角色</FormLabel><Select onValueChange={field.onChange} value={field.value as string}><FormControl><SelectTrigger className="font-sans"><SelectValue /></SelectTrigger></FormControl><SelectContent>
                    <SelectItem value="container">容器 (Advanced Topology Default)</SelectItem>
                    <SelectItem value="generic">通用 (Legacy/Basic)</SelectItem>
                    <SelectItem value="server-role">服务主机 (Basic Topology)</SelectItem>
                    <SelectItem value="client-role">客户主机 (Basic Topology - 定义隧道)</SelectItem>
                    <SelectItem value="primary">主要 (Basic Topology)</SelectItem>
                  </SelectContent></Select>
                  <FormDescription className="font-sans text-xs">定义此主控在画布上的行为和连接语义。</FormDescription>
                  <FormMessage /></FormItem>)}
                />
                {watchedMasterSubRole === 'client-role' && (
                  <>
                    <FormField control={form.control} name="targetAddressM" render={({ field }) => (
                      <FormItem><FormLabel className="font-sans">客户端本地服务地址</FormLabel><FormControl><Input {...field} placeholder="例: 127.0.0.1:8080" className="font-mono" /></FormControl>
                      <FormDescription className="font-sans text-xs">此客户主机上，客户端(c)实例监听并转发到隧道的地址。</FormDescription><FormMessage /></FormItem>)}
                    />
                    <FormField control={form.control} name="remoteMasterIdForTunnel" render={({ field }) => (
                      <FormItem><FormLabel className="font-sans">远程服务端(s)主控</FormLabel><Select onValueChange={field.onChange} value={field.value as string | undefined} disabled={otherApiConfigs.length === 0}><FormControl><SelectTrigger className="font-sans"><SelectValue placeholder={otherApiConfigs.length === 0 ? "无其他主控可选" : "选择服务端(s)所在主控"} /></SelectTrigger></FormControl><SelectContent>
                        {otherApiConfigs.map(config => (<SelectItem key={config.id} value={config.id}>{config.name}</SelectItem>))}
                      </SelectContent></Select>
                      <FormDescription className="font-sans text-xs">隧道的服务端(s)部分将创建在此主控上。</FormDescription><FormMessage /></FormItem>)}
                    />
                    <FormField control={form.control} name="remoteServerListenAddress" render={({ field }) => (
                      <FormItem><FormLabel className="font-sans">远程服务端(s)监听地址</FormLabel><FormControl><Input {...field} placeholder="例: [::]:10101" className="font-mono" /></FormControl>
                      <FormDescription className="font-sans text-xs">远程服务端(s)将在此地址监听。</FormDescription><FormMessage /></FormItem>)}
                    />
                    <FormField control={form.control} name="remoteServerForwardAddress" render={({ field }) => (
                      <FormItem><FormLabel className="font-sans">远程服务端(s)转发地址</FormLabel><FormControl><Input {...field} placeholder="例: 192.168.1.10:80" className="font-mono" /></FormControl>
                      <FormDescription className="font-sans text-xs">远程服务端(s)将流量转发到此业务地址。</FormDescription><FormMessage /></FormItem>)}
                    />
                  </>
                )}
                 <FormField control={form.control} name="logLevelM" render={({ field }) => (
                  <FormItem><FormLabel className="font-sans">日志级别</FormLabel><Select onValueChange={field.onChange} value={field.value as string}><FormControl><SelectTrigger className="font-sans"><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="master">主控默认</SelectItem><SelectItem value="debug">Debug</SelectItem><SelectItem value="info">Info</SelectItem><SelectItem value="warn">Warn</SelectItem><SelectItem value="error">Error</SelectItem><SelectItem value="event">Event</SelectItem></SelectContent></Select>
                   <FormDescription className="font-sans text-xs">此主控内S/C节点的默认日志级别。</FormDescription>
                  <FormMessage /></FormItem>)} />
                <FormField control={form.control} name="tlsModeM" render={({ field }) => (
                  <FormItem><FormLabel className="font-sans">TLS模式</FormLabel><Select onValueChange={field.onChange} value={field.value as string}><FormControl><SelectTrigger className="font-sans"><SelectValue /></SelectTrigger></FormControl><SelectContent>{Object.entries(MASTER_TLS_MODE_DISPLAY_MAP).map(([val, lab]) => (<SelectItem key={val} value={val}>{lab}</SelectItem>))}</SelectContent></Select>
                  <FormDescription className="font-sans text-xs">此主控内S/C节点的默认TLS模式。</FormDescription>
                  <FormMessage /></FormItem>)} />
              </>
            )}

            {(role === 'S' || role === 'C') && (
               <FormField control={form.control} name={role === 'S' ? 'tunnelKeyS' : 'tunnelKeyC'} render={({ field }) => (
                <FormItem><FormLabel className="font-sans">隧道密钥 (可选)</FormLabel><FormControl><Input {...field} placeholder="默认: 端口派生密钥" className="font-mono" /></FormControl>
                <FormDescription className="font-sans text-xs">留空则使用端口派生的密钥。</FormDescription><FormMessage /></FormItem>)} />
            )}

            {role === 'S' && (
              <>
                <FormField control={form.control} name="tunnelAddressS" render={({ field }) => (
                  <FormItem><FormLabel className="font-sans">隧道地址</FormLabel><FormControl><Input {...field} placeholder="例: [::]:10101 或 0.0.0.0:10101" className="font-mono" /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="targetAddressS" render={({ field }) => (
                  <FormItem><FormLabel className="font-sans">目标地址</FormLabel><FormControl><Input {...field} placeholder="例: 192.168.1.10:80" className="font-mono" /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="logLevelS" render={({ field }) => (
                  <FormItem><FormLabel className="font-sans">日志级别</FormLabel><Select onValueChange={field.onChange} value={field.value as string}><FormControl><SelectTrigger className="font-sans"><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="master">主控默认</SelectItem><SelectItem value="debug">Debug</SelectItem><SelectItem value="info">Info</SelectItem><SelectItem value="warn">Warn</SelectItem><SelectItem value="error">Error</SelectItem><SelectItem value="event">Event</SelectItem></SelectContent></Select><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="tlsModeS" render={({ field }) => (
                  <FormItem><FormLabel className="font-sans">TLS模式</FormLabel><Select onValueChange={field.onChange} value={field.value as string}><FormControl><SelectTrigger className="font-sans"><SelectValue /></SelectTrigger></FormControl><SelectContent>{Object.entries(MASTER_TLS_MODE_DISPLAY_MAP).map(([val, lab]) => (<SelectItem key={val} value={val}>{lab}</SelectItem>))}</SelectContent></Select><FormMessage /></FormItem>)} />
                {watchedServerTlsMode === '2' && (<>
                  <FormField control={form.control} name="certPathS" render={({ field }) => (<FormItem><FormLabel className="font-sans">证书路径</FormLabel><FormControl><Input {...field} placeholder="/path/to/cert.pem" className="font-mono" /></FormControl><FormMessage /></FormItem>)} />
                  <FormField control={form.control} name="keyPathS" render={({ field }) => (<FormItem><FormLabel className="font-sans">密钥路径</FormLabel><FormControl><Input {...field} placeholder="/path/to/key.pem" className="font-mono" /></FormControl><FormMessage /></FormItem>)} />
                </>)}
              </>
            )}

            {role === 'C' && (
              <>
                {canClientBeSingleEnded ? (
                  <FormField
                    control={form.control}
                    name="isSingleEndedForwardC"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center space-x-2 space-y-0 rounded-md border p-2 shadow-sm">
                        <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} id="isSingleEndedForwardCheckbox" /></FormControl>
                        <div className="space-y-0.5 leading-none">
                          <FormLabel htmlFor="isSingleEndedForwardCheckbox" className="font-sans cursor-pointer text-sm">单端转发模式</FormLabel>
                        </div>
                      </FormItem>
                    )}
                  />
                ) : (
                  <div className="p-2 text-xs text-muted-foreground border rounded-md bg-muted/50 font-sans">
                    {hasServerNodesInParentContainer && !isInterMasterClientLink && "此客户端(c)的父主控容器内已有服务端(s)节点，不能设为单端转发模式。"}
                    {isInterMasterClientLink && "此客户端(c)已连接到另一主控的服务端(s)，为隧道模式，不能设为单端转发。"}
                  </div>
                )}
                {renderClientAsSingleEnded ? (
                  <>
                    <FormField control={form.control} name="localListenAddressC_Single" render={({ field }) => (
                      <FormItem><FormLabel className="font-sans">监听地址</FormLabel><FormControl><Input {...field} placeholder="例: [::]:10101 或 127.0.0.1:10101" className="font-mono" /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name="remoteTargetAddressC_Single" render={({ field }) => (
                      <FormItem><FormLabel className="font-sans">目标地址</FormLabel><FormControl><Input {...field} placeholder="例: remote.host:8000" className="font-mono" /></FormControl><FormMessage /></FormItem>)} />
                  </>
                ) : (
                  <>
                    <FormField control={form.control} name="tunnelAddressC_Normal" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-sans">隧道地址</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="例: server.example.com:10101"
                            className="font-mono"
                            disabled={isInterMasterClientLink && !!interMasterLinkSourceInfo?.serverTunnelAddress}
                          />
                        </FormControl>
                        {isInterMasterClientLink && !!interMasterLinkSourceInfo?.serverTunnelAddress && (
                          <FormDescription className="font-sans text-xs">
                            此地址由跨主控连接自动确定。
                          </FormDescription>
                        )}
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="localListenAddressC_Normal" render={({ field }) => (
                      <FormItem><FormLabel className="font-sans">本地监听地址</FormLabel><FormControl><Input {...field} placeholder="例: [::]:8080 或 127.0.0.1:8080" className="font-mono" /></FormControl><FormMessage /></FormItem>)} />
                  </>
                )}
                <FormField control={form.control} name="logLevelC" render={({ field }) => (
                  <FormItem><FormLabel className="font-sans">日志级别</FormLabel><Select onValueChange={field.onChange} value={field.value as string}><FormControl><SelectTrigger className="font-sans"><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="master">主控默认</SelectItem><SelectItem value="debug">Debug</SelectItem><SelectItem value="info">Info</SelectItem><SelectItem value="warn">Warn</SelectItem><SelectItem value="error">Error</SelectItem><SelectItem value="event">Event</SelectItem></SelectContent></Select><FormMessage /></FormItem>)} />
                {!renderClientAsSingleEnded && (
                   <FormField control={form.control} name="tlsModeC" render={({ field }) => (
                      <FormItem><FormLabel className="font-sans">TLS模式 (连接至服务端)</FormLabel><Select onValueChange={field.onChange} value={(field.value as string) || 'master'}><FormControl><SelectTrigger className="font-sans"><SelectValue /></SelectTrigger></FormControl><SelectContent>{Object.entries(MASTER_TLS_MODE_DISPLAY_MAP).map(([val, lab]) => (<SelectItem key={val} value={val}>{lab}</SelectItem>))}</SelectContent></Select><FormMessage /></FormItem>)} />
                )}
                {watchedClientTlsMode === '2' && !renderClientAsSingleEnded && (
                  <>
                    <FormField control={form.control} name="certPathC" render={({ field }) => (<FormItem><FormLabel className="font-sans">证书路径 (TLS 2)</FormLabel><FormControl><Input {...field} placeholder="/path/to/client-cert.pem" className="font-mono" /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name="keyPathC" render={({ field }) => (<FormItem><FormLabel className="font-sans">密钥路径 (TLS 2)</FormLabel><FormControl><Input {...field} placeholder="/path/to/client-key.pem" className="font-mono" /></FormControl><FormMessage /></FormItem>)} />
                  </>
                )}
                 <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="minPoolSizeC" render={({ field }) => (
                        <FormItem><FormLabel className="font-sans">最小连接池</FormLabel><FormControl><Input type="number" {...field} onChange={e => field.onChange(e.target.value === '' ? undefined : Number(e.target.value))} value={field.value ?? ""} placeholder="例: 64" className="font-mono" /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name="maxPoolSizeC" render={({ field }) => (
                        <FormItem><FormLabel className="font-sans">最大连接池</FormLabel><FormControl><Input type="number" {...field} onChange={e => field.onChange(e.target.value === '' ? undefined : Number(e.target.value))} value={field.value ?? ""} placeholder="例: 8192" className="font-mono" /></FormControl><FormMessage /></FormItem>)} />
                </div>
              </>
            )}

            {role === 'T' && (
              <FormField
                control={form.control}
                name="targetAddressTU"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-sans">目标地址</FormLabel>
                    <FormControl><Input {...field} placeholder="例: 192.168.1.10:80" className="font-mono" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
             {role === 'U' && (
                <FormDescription className="font-sans text-xs">
                  用户节点目前仅支持标签修改。
                </FormDescription>
            )}
            <DialogFooter className="pt-4">
              <DialogClose asChild><Button type="button" variant="outline">取消</Button></DialogClose>
              <Button type="submit">保存</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
