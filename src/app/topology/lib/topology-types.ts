
import type { Node, Edge, Viewport } from 'reactflow';
import type { NamedApiConfig, MasterLogLevel, MasterTlsMode } from '@/hooks/use-api-key';

export interface BaseNodeData {
  label: string;
  type: 'controller' | 'server' | 'client' | 'landing' | 'user';
  apiId?: string; // Relevant for controller, or client managed by controller
  apiName?: string; // Relevant for controller, or client managed by controller
  isChainHighlighted?: boolean;
  statusInfo?: string;
}

export interface ControllerNodeData extends BaseNodeData {
  type: 'controller';
  apiName: string; // Always present for a controller node based on config
  apiId: string;   // Always present for a controller node based on config
  role?: 'server' | 'client' | 'general';
}
export interface ServerNodeData extends BaseNodeData {
  type: 'server';
  instanceType: 'server'; // From NodePass, for URL building
  tunnelAddress: string;
  targetAddress: string;
  logLevel: MasterLogLevel;
  tlsMode: MasterTlsMode;
  crtPath?: string;
  keyPath?: string;
}
export interface ClientNodeData extends BaseNodeData {
  type: 'client';
  instanceType: 'client'; // From NodePass, for URL building
  tunnelAddress: string;
  targetAddress: string;
  logLevel: MasterLogLevel;
  managingApiId?: string; // For clients created by dragging a controller config
  managingApiName?: string; // For clients created by dragging a controller config
}
export interface LandingNodeData extends BaseNodeData {
  type: 'landing';
  landingIp: string;
  landingPort: string;
}
export interface UserNodeData extends BaseNodeData {
  type: 'user';
  description: string;
}

export type TopologyNodeData = ControllerNodeData | ServerNodeData | ClientNodeData | LandingNodeData | UserNodeData;
export type NodePassFlowNodeType = Node<TopologyNodeData>;

export const initialViewport: Viewport = { x: 0, y: 0, zoom: 0.8 };

// Node visual defaults
export const NODE_DEFAULT_WIDTH = 140;
export const NODE_DEFAULT_HEIGHT = 40; // Actual height will vary based on content

export const CONTROLLER_NODE_DEFAULT_WIDTH = 170; // Made wider
export const CONTROLLER_NODE_DEFAULT_HEIGHT = 45; // Made slightly taller

export const CHAIN_HIGHLIGHT_COLOR = 'hsl(var(--chart-1))'; // Example, can be themed

// Auto-layout constants
export const TIER_Y_SPACING = 240;
export const NODE_X_SPACING = 280;


export interface PendingOperationDetail {
  originalNodeId: string;
  url: string;
}
export interface PendingOperationsGroup {
  apiConfig: NamedApiConfig;
  urlsToCreate: PendingOperationDetail[];
}
export type PendingOperations = Record<string, PendingOperationsGroup>;

// For the component panel
export interface DraggableNodeType {
  type: TopologyNodeData['type'];
  title: string;
  icon: React.ElementType;
  // apiId and apiName are for when dragging a controller config
  apiId?: string;
  apiName?: string;
}
