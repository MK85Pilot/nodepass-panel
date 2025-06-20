
export interface Instance {
  id: string;
  type: "client" | "server";
  status: "running" | "stopped" | "error";
  url: string;
  tcprx: number;
  tcptx: number;
  udprx: number;
  udptx: number;
}

export interface CreateInstanceRequest {
  url: string;
}

export interface UpdateInstanceRequest {
  action: "start" | "stop" | "restart";
}

// Add instanceDetails to InstanceEvent for structured data
export interface InstanceEvent {
  type: 'initial' | 'create' | 'update' | 'delete' | 'log' | 'shutdown' | 'error';
  data: any;
  instanceDetails?: Instance;
  level?: string;
  timestamp: string;
}

export interface MasterInfo {
  ver: string;         // e.g., "v1.4.0"
  os: string;          // e.g., "linux"
  arch: string;        // e.g., "amd64"
  log: string;         // e.g., "info"
  tls: string;         // e.g., "1"
  crt?: string;        // Optional, e.g., ""
  key?: string;        // Optional, e.g., ""
  // Other fields from NodePass /info can be added here if needed
  // For example, if the Go version was previously part of system_info:
  go_version?: string; // Retaining this for potential future use if separate from os/arch
  system_info?: string; // Potentially deprecated if os/arch are preferred
}

