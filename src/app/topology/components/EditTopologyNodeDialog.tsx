
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
import { extractHostname, extractPort, formatHostForDisplay } from '@/lib/url-utils';
import { MASTER_TLS_MODE_DISPLAY_MAP } from '@/components/nodepass/create-instance-dialog/constants';
import { useApiConfig, type NamedApiConfig } from '@/hooks/use-api-key';

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
const portRegex = /^[0-9]+$/;
const hostPortErrorMsg = "地址格式无效 (例: host:port 或 [ipv6]:port)。";
const portErrorMsg = "端口必须是数字。";

const baseSchema = z.object({
  label: z.string().min(1, "标签不能为空。"),
});

const masterSchema = baseSchema.extend({
  // For advanced editor, masterSubRole is primarily 'container'
  masterSubRoleM: z.enum(["container", "primary", "client-role", "server-role", "generic"]), 
  targetAddressM: z.optional(z.string().regex(hostPortRegex, hostPortErrorMsg)),
  logLevelM: z.enum(["master", "debug", "info", "warn", "error", "event"]),
  tlsModeM: z.enum(["master", "0", "1", "2"]),
  remoteMasterIdForTunnel: z.optional(z.string()),
  remoteServerListenAddress: z.optional(z.string().regex(hostPortRegex, "远程出口(s)监听地址格式无效 (例: [::]:10101)。")),
  remoteServerForwardAddress: z.optional(z.string().regex(hostPortRegex, "远程出口(s)转发地址格式无效 (例: 192.168.1.10:80)。")),
});

const serverSchema = baseSchema.extend({
  tunnelHost: z.string().min(1, "监听主机不能为空。").default("[::]"),
  tunnelPort: z.string().regex(portRegex, portErrorMsg).min(1, "监听端口不能为空。"),
  targetAddressS: z.string().min(1, "转发地址不能为空。").regex(hostPortRegex, hostPortErrorMsg),
  logLevelS: z.enum(["master", "debug", "info", "warn", "error", "event"]),
  tlsModeS: z.enum(["master", "0", "1", "2"]),
  certPathS: z.optional(z.string()),
  keyPathS: z.optional(z.string()),
});

const clientSchema = z.object({
  label: z.string().min(1, "标签不能为空。"),
  isSingleEndedForwardC: z.boolean().default(false),
  tunnelAddressC_Normal: z.optional(z.string()),
  localHostC_Normal: z.optional(z.string().default("[::]")),
  localPortC_Normal: z.optional(z.string()),
  localListenPortC_Single: z.optional(z.string()), 
  remoteTargetAddressC_Single: z.optional(z.string()), 
  logLevelC: z.enum(["master", "debug", "info", "warn", "error", "event"]),
  tlsModeC: z.enum(["master", "0", "1", "2"]),
  certPathC: z.optional(z.string()),
  keyPathC: z.optional(z.string()),
});

const tuSchema = baseSchema.extend({ // T and U nodes primarily need label and targetAddress for T
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
    if (role === 'C') {
        return clientSchema.superRefine((data, ctx) => {
            const effectiveIsSingleEnded = canClientBeSingleEnded ? data.isSingleEndedForwardC : false;

            if (effectiveIsSingleEnded) { 
                if (!data.localListenPortC_Single || !portRegex.test(data.localListenPortC_Single)) {
                  ctx.addIssue({ code: z.ZodIssueCode.custom, message: `本地监听端口无效 (${portErrorMsg})。`, path: ["localListenPortC_Single"] });
                }
                if (!data.remoteTargetAddressC_Single || !hostPortRegex.test(data.remoteTargetAddressC_Single)) {
                  ctx.addIssue({ code: z.ZodIssueCode.custom, message: `远程目标地址无效 (${hostPortErrorMsg})。`, path: ["remoteTargetAddressC_Single"] });
                }
            } else { 
                if (!data.tunnelAddressC_Normal || !hostPortRegex.test(data.tunnelAddressC_Normal)) {
                  ctx.addIssue({ code: z.ZodIssueCode.custom, message: `服务端隧道地址无效 (${hostPortErrorMsg})。`, path: ["tunnelAddressC_Normal"] });
                }
                if (data.localPortC_Normal && data.localPortC_Normal.trim() !== "" && !portRegex.test(data.localPortC_Normal)) {
                  ctx.addIssue({ code: z.ZodIssueCode.custom, message: `本地监听端口无效 (${portErrorMsg})。`, path: ["localPortC_Normal"] });
                }
            }
             const currentTlsMode = data.tlsModeC;
            if (currentTlsMode === "2") {
                if (!data.certPathC || data.certPathC.trim() === "") {
                    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TLS模式 '2' 需要证书路径。", path: ["certPathC"] });
                }
                if (!data.keyPathC || data.keyPathC.trim() === "") {
                    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TLS模式 '2' 需要密钥路径。", path: ["keyPathC"] });
                }
            }
        });
    }
    return tuSchema; 
  }, [role, canClientBeSingleEnded]);

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
          tunnelHost: extractHostname(data.tunnelAddress || "[::]:0") || "[::]",
          tunnelPort: extractPort(data.tunnelAddress || "[::]:0") || "",
          targetAddressS: data.targetAddress || "",
          logLevelS: (data.logLevel as any) || "master",
          tlsModeS: (data.tlsMode as any) || "master",
          certPathS: data.certPath || "",
          keyPathS: data.keyPath || "",
        };
      } else if (role === 'C') {
        const isEffectivelySingleEndedForDefaults = canClientBeSingleEnded ? !!data.isSingleEndedForwardC : false;

        defaultVals = {
          ...defaultVals,
          isSingleEndedForwardC: isEffectivelySingleEndedForDefaults,
          logLevelC: (data.logLevel as any) || "master", 
          tlsModeC: (data.tlsMode as any) || (isEffectivelySingleEndedForDefaults ? "0" : "master"),
          certPathC: data.certPath || "",
          keyPathC: data.keyPath || "",
        };
        if (isEffectivelySingleEndedForDefaults) {
          (defaultVals as any).localListenPortC_Single = extractPort(data.tunnelAddress || "[::]:0") || "";
          (defaultVals as any).remoteTargetAddressC_Single = data.targetAddress || "";
        } else {
          if (isInterMasterClientLink && interMasterLinkSourceInfo) {
            (defaultVals as any).tunnelAddressC_Normal = interMasterLinkSourceInfo.serverTunnelAddress;
          } else {
            (defaultVals as any).tunnelAddressC_Normal = data.tunnelAddress || "";
          }
          (defaultVals as any).localHostC_Normal = extractHostname(data.targetAddress || "[::]:0") || "[::]";
          (defaultVals as any).localPortC_Normal = extractPort(data.targetAddress || "[::]:0") || "";
        }
      } else if (role === 'T' || role === 'U') {
        defaultVals = { ...defaultVals, targetAddressTU: data.targetAddress || "" };
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
      } else { // For 'container' and other M roles not acting as client-role for tunnel
        updatedData.targetAddress = "";
        updatedData.remoteMasterIdForTunnel = "";
        updatedData.remoteServerListenAddress = "";
        updatedData.remoteServerForwardAddress = "";
      }
    } else if (role === 'S' && 'tunnelHost' in values) {
      updatedData = {
        ...updatedData,
        tunnelAddress: `${formatHostForDisplay(values.tunnelHost)}:${values.tunnelPort}`,
        targetAddress: values.targetAddressS,
        logLevel: values.logLevelS,
        tlsMode: values.tlsModeS,
        certPath: values.tlsModeS === "2" ? values.certPathS : "",
        keyPath: values.tlsModeS === "2" ? values.keyPathS : "",
      };
    } else if (role === 'C' && 'logLevelC' in values) {
      const finalIsSingleEndedDataValue = canClientBeSingleEnded ? values.isSingleEndedForwardC : false;

      updatedData = {
        ...updatedData,
        isSingleEndedForwardC: finalIsSingleEndedDataValue,
        logLevel: values.logLevelC,
        tlsMode: values.tlsModeC,
        certPath: values.tlsModeC === "2" ? values.certPathC : "",
        keyPath: values.tlsModeC === "2" ? values.keyPathC : "",
      };

      if (finalIsSingleEndedDataValue) {
        updatedData.tunnelAddress = `${formatHostForDisplay("[::]")}:${values.localListenPortC_Single}`;
        updatedData.targetAddress = values.remoteTargetAddressC_Single;
      } else { 
        updatedData.tunnelAddress = values.tunnelAddressC_Normal;
        updatedData.targetAddress = `${formatHostForDisplay(values.localHostC_Normal || "[::]")}:${values.localPortC_Normal}`;
      }
    } else if (role === 'T' && 'targetAddressTU' in values) {
      updatedData = { ...updatedData, targetAddress: values.targetAddressTU };
    } else if (role === 'U') { // U node just has label usually
      updatedData = { ...updatedData };
    }
    onSave(node.id, updatedData);
    onOpenChange(false);
  };

  if (!node) return null;
  const dialogTitle = role === 'M' ? "编辑 主控容器 属性" 
    : role === 'S' ? "编辑 出口(s) 属性" 
    : role === 'C' ? "编辑 入口(c) 属性" 
    : role === 'T' ? "编辑 落地 属性"
    : "编辑 用户 属性";
  const watchedMasterSubRole = role === 'M' ? form.watch('masterSubRoleM') : undefined;

  const renderClientAsSingleEnded = canClientBeSingleEnded ? form.watch('isSingleEndedForwardC') : false;

  const watchedClientTlsMode = role === 'C' ? form.watch('tlsModeC') : undefined;
  const watchedServerTlsMode = role === 'S' ? form.watch('tlsModeS') : undefined;

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
                {watchedMasterSubRole === 'client-role' && ( // Only show for basic topology client-role
                  <>
                    <FormField control={form.control} name="targetAddressM" render={({ field }) => (
                      <FormItem><FormLabel className="font-sans">客户端本地服务地址</FormLabel><FormControl><Input {...field} placeholder="例: 127.0.0.1:8080" className="font-mono" /></FormControl>
                      <FormDescription className="font-sans text-xs">此客户主机上，入口(c)实例监听并转发到隧道的地址。</FormDescription><FormMessage /></FormItem>)}
                    />
                    <FormField control={form.control} name="remoteMasterIdForTunnel" render={({ field }) => (
                      <FormItem><FormLabel className="font-sans">远程出口(s)主控</FormLabel><Select onValueChange={field.onChange} value={field.value as string | undefined} disabled={otherApiConfigs.length === 0}><FormControl><SelectTrigger className="font-sans"><SelectValue placeholder={otherApiConfigs.length === 0 ? "无其他主控可选" : "选择出口(s)所在主控"} /></SelectTrigger></FormControl><SelectContent>
                        {otherApiConfigs.map(config => (<SelectItem key={config.id} value={config.id}>{config.name}</SelectItem>))}
                      </SelectContent></Select>
                      <FormDescription className="font-sans text-xs">隧道的出口(s)部分将创建在此主控上。</FormDescription><FormMessage /></FormItem>)}
                    />
                    <FormField control={form.control} name="remoteServerListenAddress" render={({ field }) => (
                      <FormItem><FormLabel className="font-sans">远程出口(s)监听地址</FormLabel><FormControl><Input {...field} placeholder="例: [::]:10101" className="font-mono" /></FormControl>
                      <FormDescription className="font-sans text-xs">远程出口(s)将在此地址监听。</FormDescription><FormMessage /></FormItem>)}
                    />
                    <FormField control={form.control} name="remoteServerForwardAddress" render={({ field }) => (
                      <FormItem><FormLabel className="font-sans">远程出口(s)转发地址 (业务数据)</FormLabel><FormControl><Input {...field} placeholder="例: 192.168.1.10:80" className="font-mono" /></FormControl>
                      <FormDescription className="font-sans text-xs">远程出口(s)将流量转发到此业务地址。</FormDescription><FormMessage /></FormItem>)}
                    />
                  </>
                )}
                 <FormField control={form.control} name="logLevelM" render={({ field }) => (
                  <FormItem><FormLabel className="font-sans">日志级别 (默认)</FormLabel><Select onValueChange={field.onChange} value={field.value as string}><FormControl><SelectTrigger className="font-sans"><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="master">主控默认</SelectItem><SelectItem value="debug">Debug</SelectItem><SelectItem value="info">Info</SelectItem><SelectItem value="warn">Warn</SelectItem><SelectItem value="error">Error</SelectItem><SelectItem value="event">Event</SelectItem></SelectContent></Select>
                   <FormDescription className="font-sans text-xs">此主控内S/C节点的默认日志级别。</FormDescription>
                  <FormMessage /></FormItem>)} />
                <FormField control={form.control} name="tlsModeM" render={({ field }) => (
                  <FormItem><FormLabel className="font-sans">TLS模式 (默认)</FormLabel><Select onValueChange={field.onChange} value={field.value as string}><FormControl><SelectTrigger className="font-sans"><SelectValue /></SelectTrigger></FormControl><SelectContent>{Object.entries(MASTER_TLS_MODE_DISPLAY_MAP).map(([val, lab]) => (<SelectItem key={val} value={val}>{lab}</SelectItem>))}</SelectContent></Select>
                  <FormDescription className="font-sans text-xs">此主控内S/C节点的默认TLS模式。</FormDescription>
                  <FormMessage /></FormItem>)} />
              </>
            )}

            {role === 'S' && (
              <>
                <FormField control={form.control} name="tunnelHost" render={({ field }) => (
                  <FormItem><FormLabel className="font-sans">隧道监听主机</FormLabel><FormControl><Input {...field} placeholder="例: [::] 或 0.0.0.0" className="font-mono" /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="tunnelPort" render={({ field }) => (
                  <FormItem><FormLabel className="font-sans">隧道监听端口</FormLabel><FormControl><Input {...field} placeholder="例: 10101" className="font-mono" /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="targetAddressS" render={({ field }) => (
                  <FormItem><FormLabel className="font-sans">转发地址 (出口(s))</FormLabel><FormControl><Input {...field} placeholder="例: 192.168.1.10:80" className="font-mono" /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="logLevelS" render={({ field }) => (
                  <FormItem><FormLabel className="font-sans">日志级别</FormLabel><Select onValueChange={field.onChange} value={field.value as string}><FormControl><SelectTrigger className="font-sans"><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="master">主控默认</SelectItem><SelectItem value="debug">Debug</SelectItem><SelectItem value="info">Info</SelectItem><SelectItem value="warn">Warn</SelectItem><SelectItem value="error">Error</SelectItem><SelectItem value="event">Event</SelectItem></SelectContent></Select><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="tlsModeS" render={({ field }) => (
                  <FormItem><FormLabel className="font-sans">TLS模式</FormLabel><Select onValueChange={field.onChange} value={field.value as string}><FormControl><SelectTrigger className="font-sans"><SelectValue /></SelectTrigger></FormControl><SelectContent>{Object.entries(MASTER_TLS_MODE_DISPLAY_MAP).map(([val, lab]) => (<SelectItem key={val} value={val}>{lab}</SelectItem>))}</SelectContent></Select><FormMessage /></FormItem>)} />
                {watchedServerTlsMode === '2' && (<>
                  <FormField control={form.control} name="certPathS" render={({ field }) => (<FormItem><FormLabel className="font-sans">证书路径 (TLS 2)</FormLabel><FormControl><Input {...field} placeholder="/path/to/cert.pem" className="font-mono" /></FormControl><FormMessage /></FormItem>)} />
                  <FormField control={form.control} name="keyPathS" render={({ field }) => (<FormItem><FormLabel className="font-sans">密钥路径 (TLS 2)</FormLabel><FormControl><Input {...field} placeholder="/path/to/key.pem" className="font-mono" /></FormControl><FormMessage /></FormItem>)} />
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
                          <FormDescription className="font-sans text-xs">启用后，入口(c)将直接连接到远程目标，不经过出口(s)。</FormDescription>
                        </div>
                      </FormItem>
                    )}
                  />
                ) : (
                  <div className="p-2 text-xs text-muted-foreground border rounded-md bg-muted/50 font-sans">
                    {hasServerNodesInParentContainer && !isInterMasterClientLink && "此入口(c)的父主控容器内已有出口(s)节点，不能设为单端转发模式。"}
                    {isInterMasterClientLink && "此入口(c)已连接到另一主控的出口(s)，为隧道模式，不能设为单端转发。"}
                  </div>
                )}
                {renderClientAsSingleEnded ? (
                  <>
                    <FormField control={form.control} name="localListenPortC_Single" render={({ field }) => (
                      <FormItem><FormLabel className="font-sans">本地监听端口</FormLabel><FormControl><Input {...field} placeholder="例: 10101" className="font-mono" /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name="remoteTargetAddressC_Single" render={({ field }) => (
                      <FormItem><FormLabel className="font-sans">转发地址 (远程目标)</FormLabel><FormControl><Input {...field} placeholder="例: remote.host:8000" className="font-mono" /></FormControl><FormMessage /></FormItem>)} />
                  </>
                ) : ( 
                  <>
                    <FormField control={form.control} name="tunnelAddressC_Normal" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-sans">服务端隧道地址</FormLabel>
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
                    <FormField control={form.control} name="localHostC_Normal" render={({ field }) => (
                      <FormItem><FormLabel className="font-sans">本地监听主机</FormLabel><FormControl><Input {...field} placeholder="例: [::] 或 127.0.0.1" className="font-mono" /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name="localPortC_Normal" render={({ field }) => (
                      <FormItem><FormLabel className="font-sans">本地监听端口</FormLabel><FormControl><Input {...field} placeholder="例: 8080 (默认为出口隧道端口+1)" className="font-mono" /></FormControl><FormMessage /></FormItem>)} />
                  </>
                )}
                <FormField control={form.control} name="logLevelC" render={({ field }) => (
                  <FormItem><FormLabel className="font-sans">日志级别</FormLabel><Select onValueChange={field.onChange} value={field.value as string}><FormControl><SelectTrigger className="font-sans"><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="master">主控默认</SelectItem><SelectItem value="debug">Debug</SelectItem><SelectItem value="info">Info</SelectItem><SelectItem value="warn">Warn</SelectItem><SelectItem value="error">Error</SelectItem><SelectItem value="event">Event</SelectItem></SelectContent></Select><FormMessage /></FormItem>)} />
                 <FormField control={form.control} name="tlsModeC" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-sans">TLS模式 {renderClientAsSingleEnded ? "(连接到远程目标)" : "(连接到出口(s))"}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value as string}>
                      <FormControl><SelectTrigger className="font-sans"><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>{Object.entries(MASTER_TLS_MODE_DISPLAY_MAP).map(([val, lab]) => (<SelectItem key={val} value={val}>{lab}</SelectItem>))}</SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>)}
                />
                {watchedClientTlsMode === '2' && (<>
                  <FormField control={form.control} name="certPathC" render={({ field }) => (<FormItem><FormLabel className="font-sans">证书路径 (TLS 2)</FormLabel><FormControl><Input {...field} placeholder="/path/to/cert.pem" className="font-mono" /></FormControl><FormMessage /></FormItem>)} />
                  <FormField control={form.control} name="keyPathC" render={({ field }) => (<FormItem><FormLabel className="font-sans">密钥路径 (TLS 2)</FormLabel><FormControl><Input {...field} placeholder="/path/to/key.pem" className="font-mono" /></FormControl><FormMessage /></FormItem>)} />
                </>)}
              </>
            )}

            {role === 'T' && (
              <FormField
                control={form.control}
                name="targetAddressTU"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-sans">转发地址 (落地)</FormLabel>
                    <FormControl><Input {...field} placeholder="例: 192.168.1.10:80" className="font-mono" /></FormControl>
                    <FormDescription className="font-sans text-xs">
                      落地节点的“流量转发地址”。
                    </FormDescription>
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
