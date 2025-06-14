
'use client';

import type React from 'react';
import type { Node as ReactFlowNode } from 'reactflow';

export type NodeRole = 'M' | 'S' | 'C' | 'T' | 'U';
// 'generic' can be used for M nodes in advanced topology that are just containers
// 'primary' can be for the main M node if only one is on canvas or first one added.
export type MasterSubRole = 'client-role' | 'server-role' | 'generic' | 'primary' | 'container';

export interface CustomNodeData {
  label: string;
  role: NodeRole;
  icon?: React.ElementType;
  masterSubRole?: MasterSubRole; 
  nodeType?: string; 
  masterId?: string; 
  masterName?: string; 
  representedMasterId?: string; 
  representedMasterName?: string; 
  isContainer?: boolean; 
  parentNode?: string; 
  isDefaultClient?: boolean; 
  isSingleEndedForwardC?: boolean; 
  apiUrl?: string; 
  defaultLogLevel?: string; 
  defaultTlsMode?: string; 
  tunnelAddress?: string; 
  targetAddress?: string; 
  submissionStatus?: 'pending' | 'success' | 'error';
  submissionMessage?: string;
  logLevel?: string; 
  tlsMode?: string; 
  certPath?: string; 
  keyPath?: string; 

  remoteMasterIdForTunnel?: string;
  remoteServerListenAddress?: string;
  remoteServerForwardAddress?: string;

  originalInstanceId?: string;
  originalInstanceUrl?: string;

  isExpanded?: boolean; // For S/C node expansion
}

export interface Node extends ReactFlowNode<CustomNodeData> {
  width?: number;
  height?: number;
}

export interface TopologyContextMenu {
  id: string;
  type: 'node' | 'edge';
  top: number;
  left: number;
  data: Node | import('reactflow').Edge; 
}

// Default dimensions for different node states
export const ICON_ONLY_NODE_SIZE = 48;
export const EXPANDED_SC_NODE_WIDTH = 200;
export const EXPANDED_SC_NODE_BASE_HEIGHT = 40; // Base height, will grow with content
export const DETAIL_LINE_HEIGHT = 18; // Estimated height per detail line
