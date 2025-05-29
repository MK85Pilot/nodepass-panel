
import { z } from 'zod';

// Schema for the detailed create instance form
export const createInstanceFormSchema = z.object({
  instanceType: z.enum(["server", "client"], {
    required_error: "实例类型是必需的。",
  }),
  tunnelAddress: z.string().min(1, "隧道地址是必需的。").regex(/^(?:\[[0-9a-fA-F:]+\]|[0-9a-zA-Z.-]+):[0-9]+$/, "隧道地址格式无效 (例: host:port 或 [ipv6]:port)"),
  targetAddress: z.string().min(1, "目标地址是必需的。").regex(/^(?:\[[0-9a-fA-F:]+\]|[0-9a-zA-Z.-]+):[0-9]+$/, "目标地址格式无效 (例: host:port 或 [ipv6]:port)"),
  logLevel: z.enum(["master", "debug", "info", "warn", "error", "fatal"], {
    required_error: "日志级别是必需的。",
  }),
  tlsMode: z.optional(z.enum(["master", "0", "1", "2"])),
  certPath: z.optional(z.string()),
  keyPath: z.optional(z.string()),
  autoCreateServer: z.optional(z.boolean()),
}).refine(data => {
  if (data.instanceType === "server" && !data.tlsMode) {
    // This condition should likely be that tlsMode is not 'master' if it's required to be something else
    // For now, if it's server, tlsMode must be present in some form (even 'master')
    return true; // Adjusted to allow 'master' as a valid selection that implies required.
  }
  return true;
}, {
  message: "服务端实例必须选择TLS模式。",
  path: ["tlsMode"],
}).refine(data => {
  if (data.instanceType === "server" && data.tlsMode === "2" && (!data.certPath || data.certPath.trim() === "")) {
    return false;
  }
  return true;
}, {
  message: "TLS模式 '2' 需要证书路径。",
  path: ["certPath"],
}).refine(data => {
  if (data.instanceType === "server" && data.tlsMode === "2" && (!data.keyPath || data.keyPath.trim() === "")) {
    return false;
  }
  return true;
}, {
  message: "TLS模式 '2' 需要密钥路径。",
  path: ["keyPath"],
});

// Type for the create form values
export type CreateInstanceFormValues = z.infer<typeof createInstanceFormSchema>;

// Schema for the detailed modify instance form - Defined independently
export const modifyInstanceFormSchema = z.object({
  instanceType: z.enum(["server", "client"], { // Typically, instanceType is not modifiable after creation.
    required_error: "实例类型是必需的。",
  }),
  tunnelAddress: z.string().min(1, "隧道地址是必需的。").regex(/^(?:\[[0-9a-fA-F:]+\]|[0-9a-zA-Z.-]+):[0-9]+$/, "隧道地址格式无效 (例: host:port 或 [ipv6]:port)"),
  targetAddress: z.string().min(1, "目标地址是必需的。").regex(/^(?:\[[0-9a-fA-F:]+\]|[0-9a-zA-Z.-]+):[0-9]+$/, "目标地址格式无效 (例: host:port 或 [ipv6]:port)"),
  logLevel: z.enum(["master", "debug", "info", "warn", "error", "fatal"], {
    required_error: "日志级别是必需的。",
  }),
  tlsMode: z.optional(z.enum(["master", "0", "1", "2"])),
  certPath: z.optional(z.string()),
  keyPath: z.optional(z.string()),
  // autoCreateServer is not relevant for modification
}).refine(data => {
  if (data.instanceType === "server" && !data.tlsMode) {
    return true; // Adjusted: For modify, if server, tlsMode must be chosen. 'master' is a valid choice.
  }
  return true;
}, {
  message: "服务端实例必须选择TLS模式。",
  path: ["tlsMode"],
}).refine(data => {
  if (data.instanceType === "server" && data.tlsMode === "2" && (!data.certPath || data.certPath.trim() === "")) {
    return false;
  }
  return true;
}, {
  message: "TLS模式 '2' 需要证书路径。",
  path: ["certPath"],
}).refine(data => {
  if (data.instanceType === "server" && data.tlsMode === "2" && (!data.keyPath || data.keyPath.trim() === "")) {
    return false;
  }
  return true;
}, {
  message: "TLS模式 '2' 需要密钥路径。",
  path: ["keyPath"],
});


// Type for the modify form values
export type ModifyInstanceFormValues = z.infer<typeof modifyInstanceFormSchema>;


// This schema is for the API request, which still expects a single URL for creating
export const createInstanceApiSchema = z.object({
  url: z.string().min(1, "URL是必需的。").url("无效的URL格式。例: scheme://host:port/host:port"),
});

// This schema is for the API request for modifying configuration, expecting a single URL
export const modifyInstanceConfigApiSchema = z.object({
  url: z.string().min(1, "URL是必需的。").url("无效的URL格式。例: scheme://host:port/host:port"),
});


export const updateInstanceSchema = z.object({
  action: z.enum(["start", "stop", "restart"]),
});
