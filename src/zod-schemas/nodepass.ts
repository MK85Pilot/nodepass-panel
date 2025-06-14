
import { z } from 'zod';

// Schema for the detailed create instance form
export const createInstanceFormSchema = z.object({
  instanceType: z.enum(["客户端", "服务端"], {
    required_error: "实例类型是必需的。",
  }),
  isSingleEndedForward: z.optional(z.boolean()),
  tunnelAddress: z.string().min(1, "此字段是必需的。"),
  targetAddress: z.optional(z.string()),
  logLevel: z.enum(["master", "debug", "info", "warn", "error"], { // Added "master"
    required_error: "日志级别是必需的。",
  }),
  tlsMode: z.string(),
  certPath: z.optional(z.string()),
  keyPath: z.optional(z.string()),
}).superRefine((data, ctx) => {
  if (data.instanceType === "客户端") {
    if (data.isSingleEndedForward) {
      if (!/^(?:\[[0-9a-fA-F:]+\]|[0-9a-zA-Z.-]+):[0-9]+$/.test(data.tunnelAddress)) { // Changed regex here
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "监听地址格式无效 (例: 127.0.0.1:8080 或 [::]:8080)", // Updated message
          path: ["tunnelAddress"],
        });
      }
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
    } else {
      if (!/^(?:\[[0-9a-fA-F:]+\]|[0-9a-zA-Z.-]+):[0-9]+$/.test(data.tunnelAddress)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "连接的服务端隧道地址格式无效 (例: host:port 或 [ipv6]:port)",
          path: ["tunnelAddress"],
        });
      }
      if (data.targetAddress && data.targetAddress.trim() !== "" && !/^[0-9]+$/.test(data.targetAddress.trim())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "客户端本地转发端口格式无效 (应为数字)。",
          path: ["targetAddress"],
        });
      }
    }
  } else if (data.instanceType === "服务端") {
    if (!/^(?:\[[0-9a-fA-F:]+\]|[0-9a-zA-Z.-]+):[0-9]+$/.test(data.tunnelAddress)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "服务端隧道监听地址格式无效 (例: host:port 或 [ipv6]:port)",
        path: ["tunnelAddress"],
      });
    }
    if (!data.targetAddress || data.targetAddress.trim() === "") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "转发地址 (服务端) 是必需的。",
        path: ["targetAddress"],
      });
    } else if (!/^(?:\[[0-9a-fA-F:]+\]|[0-9a-zA-Z.-]+):[0-9]+$/.test(data.targetAddress)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "转发地址 (服务端) 格式无效 (例: host:port)",
        path: ["targetAddress"],
      });
    }
  }

  if (!(data.instanceType === "客户端" && data.isSingleEndedForward)) {
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
  }
});


export type CreateInstanceFormValues = z.infer<typeof createInstanceFormSchema>;

export const createInstanceApiSchema = z.object({
  url: z.string().min(1, "URL是必需的。").url("无效的URL格式。例: scheme://host:port/host:port"),
});

export const updateInstanceSchema = z.object({
  action: z.enum(["start", "stop", "restart"]),
});

