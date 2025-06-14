
import { z } from 'zod';

// Schema for the detailed create instance form
export const createInstanceFormSchema = z.object({
  instanceType: z.enum(["入口(c)", "出口(s)"], {
    required_error: "实例类型是必需的。",
  }),
  isSingleEndedForward: z.optional(z.boolean()), // New field for single-ended forwarding
  autoCreateServer: z.optional(z.boolean()),
  serverApiId: z.optional(z.string()), // ID of the master where the server instance will be created if autoCreateServer is true
  tunnelAddress: z.string().min(1, "此字段是必需的。"), // Meaning changes based on context
  targetAddress: z.optional(z.string()), // For "入口(c)" this is local forward port (optional) or remote target (required if single-ended). For "出口(s)" this is required host:port
  serverTargetAddressForAutoCreate: z.optional(z.string()), // Specific for auto-created server's target
  logLevel: z.enum(["master", "debug", "info", "warn", "error", "event"], {
    required_error: "日志级别是必需的。",
  }),
  tlsMode: z.string(), // Will be validated to 'master', '0', '1', '2'
  certPath: z.optional(z.string()),
  keyPath: z.optional(z.string()),
}).superRefine((data, ctx) => {
  // Validation based on instanceType and modes
  if (data.instanceType === "入口(c)") {
    if (data.isSingleEndedForward) {
      // Mode: 入口(c) with Single-Ended Forwarding
      // tunnelAddress is the local listening port
      if (!/^[0-9]+$/.test(data.tunnelAddress)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "本地监听端口格式无效 (例: 8080)",
          path: ["tunnelAddress"],
        });
      }
      // targetAddress is the remote destination, required
      if (!data.targetAddress || data.targetAddress.trim() === "") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "转发地址 (远程目标) 是必需的。",
          path: ["targetAddress"],
        });
      } else if (!/^(?:\[[0-9a-fA-F:]+\]|[0-9a-zA-Z.-]+):[0-9]+$/.test(data.targetAddress)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "转发地址 (远程目标) 格式无效 (例: host:port)",
          path: ["targetAddress"],
        });
      }
    } else if (data.autoCreateServer) {
      // Mode: 入口(c) with Auto-Create Server
      // tunnelAddress is the port for the auto-created server
      if (!/^[0-9]+$/.test(data.tunnelAddress)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "隧道监听端口格式无效 (例: 10101)",
          path: ["tunnelAddress"],
        });
      }
      // serverTargetAddressForAutoCreate is REQUIRED in this mode
      if (!data.serverTargetAddressForAutoCreate || data.serverTargetAddressForAutoCreate.trim() === "") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "转发地址 (自动创建的出口(s)) 是必需的。",
          path: ["serverTargetAddressForAutoCreate"],
        });
      } else if (!/^(?:\[[0-9a-fA-F:]+\]|[0-9a-zA-Z.-]+):[0-9]+$/.test(data.serverTargetAddressForAutoCreate)) {
         ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "转发地址 (自动创建的出口(s)) 格式无效 (例: host:port)",
          path: ["serverTargetAddressForAutoCreate"],
        });
      }
      if (!data.serverApiId) { 
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "自动创建出口(s)时，必须选择出口(s)所属主控。",
          path: ["serverApiId"],
        });
      }
    } else {
      // Mode: 入口(c) direct connect to existing server
      // tunnelAddress must be host:port
      if (!/^(?:\[[0-9a-fA-F:]+\]|[0-9a-zA-Z.-]+):[0-9]+$/.test(data.tunnelAddress)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "连接的出口(s)隧道地址格式无效 (例: host:port 或 [ipv6]:port)",
          path: ["tunnelAddress"],
        });
      }
      // targetAddress is optional local forward port
      if (data.targetAddress && data.targetAddress.trim() !== "" && !/^[0-9]+$/.test(data.targetAddress.trim())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "入口(c)本地转发端口格式无效 (应为数字)。",
          path: ["targetAddress"],
        });
      }
    }
  } else if (data.instanceType === "出口(s)") {
    // Mode: 出口(s)
    // tunnelAddress must be host:port
    if (!/^(?:\[[0-9a-fA-F:]+\]|[0-9a-zA-Z.-]+):[0-9]+$/.test(data.tunnelAddress)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "出口(s)隧道监听地址格式无效 (例: host:port 或 [ipv6]:port)",
        path: ["tunnelAddress"],
      });
    }
    // targetAddress is required and must be host:port
    if (!data.targetAddress || data.targetAddress.trim() === "") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "转发地址 (出口(s)) 是必需的。",
        path: ["targetAddress"],
      });
    } else if (!/^(?:\[[0-9a-fA-F:]+\]|[0-9a-zA-Z.-]+):[0-9]+$/.test(data.targetAddress)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "转发地址 (出口(s)) 格式无效 (例: host:port)",
        path: ["targetAddress"],
      });
    }
  }

  // TLS Mode and Cert/Key Path validation
  const effectiveTlsUserType = (data.instanceType === '入口(c)' && data.autoCreateServer && !data.isSingleEndedForward) ? '出口(s)' : data.instanceType;

  if (effectiveTlsUserType === "出口(s)" || (effectiveTlsUserType === "入口(c)" && data.isSingleEndedForward)) { // TLS relevant for server or single-ended client
    if (!["master", "0", "1", "2"].includes(data.tlsMode)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${data.instanceType} TLS模式无效。`,
        path: ["tlsMode"],
      });
    }
    if (data.tlsMode === "2") {
      if (!data.certPath || data.certPath.trim() === "") {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TLS模式 '2' 需要证书路径。", path: ["certPath"] });
      }
      if (!data.keyPath || data.keyPath.trim() === "") {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TLS模式 '2' 需要密钥路径。", path: ["keyPath"] });
      }
    }
  } else if (effectiveTlsUserType === "入口(c)" && !data.isSingleEndedForward) { // Client connecting to existing server
     if (!["master", "0", "1", "2"].includes(data.tlsMode)) { // Client also has TLS mode for its connection behavior
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "入口(c) TLS模式无效。",
        path: ["tlsMode"],
      });
    }
     if (data.tlsMode === "2") { 
      if (!data.certPath || data.certPath.trim() === "") {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TLS模式 '2' 需要证书路径 (入口(c))。", path: ["certPath"] });
      }
      if (!data.keyPath || data.keyPath.trim() === "") {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TLS模式 '2' 需要密钥路径 (入口(c))。", path: ["keyPath"] });
      }
    }
  }
});


// Type for the create form values
export type CreateInstanceFormValues = z.infer<typeof createInstanceFormSchema>;

// This schema is for the API request, which still expects a single URL for creating
export const createInstanceApiSchema = z.object({
  url: z.string().min(1, "URL是必需的。").url("无效的URL格式。例: scheme://host:port/host:port"),
});

export const updateInstanceSchema = z.object({
  action: z.enum(["start", "stop", "restart"]),
});


