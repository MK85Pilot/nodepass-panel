
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
  version: string;
  system_info: string; // e.g., "Linux arm64"
  go_version: string; // e.g., "go1.21.0"
  // Add other fields if the /info endpoint provides more
}
