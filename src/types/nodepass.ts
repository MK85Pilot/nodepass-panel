
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

export interface ModifyInstanceConfigRequest {
  url: string;
}

// Add instanceDetails to InstanceEvent for structured data
export interface InstanceEvent {
  type: 'initial' | 'create' | 'update' | 'delete' | 'log' | 'shutdown' | 'error'; // Added 'error' and 'shutdown' based on docs
  data: any; // Could be more specific based on event type, e.g. string for logs, Partial<Instance> for others
  instanceDetails?: Instance; // Store the full instance object for relevant events
  level?: string; // For parsed log level from log messages
  timestamp: string;
}
