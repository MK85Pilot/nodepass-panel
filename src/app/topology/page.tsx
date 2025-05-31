
"use client";

import type { NextPage } from 'next';
import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
  ReactFlow,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  ReactFlowProvider,
  useReactFlow,
  type Node,
  type Edge,
  type OnConnect,
  type Viewport,
  MarkerType,
  Handle,
  Position,
  NodeProps,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { AppLayout } from '@/components/layout/AppLayout';
import { useApiConfig, type NamedApiConfig, type MasterLogLevel, type MasterTlsMode } from '@/hooks/use-api-key';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, RefreshCw, AlertTriangle, Network, ServerIcon, SmartphoneIcon, Globe, UserCircle2, Cog as ControllerIcon, Info, Eraser, Maximize, LayoutGrid, Edit3, Trash2, Unlink, Link2Off, UploadCloud, Target, Users, Cog, Settings2 } from 'lucide-react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { AppLogEntry } from '@/components/nodepass/EventLog';
import { nodePassApi } from '@/lib/api';
import type { CreateInstanceRequest } from '@/types/nodepass';
import { createInstanceApiSchema } from '@/zod-schemas/nodepass';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuPortal,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription as ShadAlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle as ShadAlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle as ShadDialogTitleFromDialog, DialogDescription as ShadDialogDescriptionFromDialog } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { cn } from "@/lib/utils";


const initialViewport: Viewport = { x: 0, y: 0, zoom: 0.8 };

interface BaseNodeData {
  label: string;
  type: 'controller' | 'server' | 'client' | 'landing' | 'user';
  apiId?: string; // For controller nodes, it's their own API ID.
  apiName?: string; // For controller nodes, it's their own API Name.
  isChainHighlighted?: boolean;
  statusInfo?: string;
}

export interface ControllerNodeData extends BaseNodeData {
  type: 'controller';
  apiName: string; // The name of the API config this controller node represents
  apiId: string;   // The ID of the API config
  role?: 'server' | 'client' | 'general';
}
export interface ServerNodeData extends BaseNodeData {
  type: 'server';
  instanceType: 'server'; // To differentiate from controller 'server' role
  tunnelAddress: string;
  targetAddress: string;
  logLevel: MasterLogLevel;
  tlsMode: MasterTlsMode;
  crtPath?: string;
  keyPath?: string;
}
export interface ClientNodeData extends BaseNodeData {
  type: 'client';
  instanceType: 'client'; // To differentiate from controller 'client' role
  tunnelAddress: string;
  targetAddress: string;
  logLevel: MasterLogLevel;
  managingApiId?: string; // ID of the API config managing this client if created from a controller drag
  managingApiName?: string; // Name of the API config
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


const initialNodes: NodePassFlowNodeType[] = [];
const initialEdges: Edge[] = [];

let nodeIdCounter = 0;
const getId = (prefix = 'npnode_') => `${prefix}${nodeIdCounter++}_${Date.now()}`;

const NODE_DEFAULT_WIDTH = 140;
const NODE_DEFAULT_HEIGHT = 40;
const CHAIN_HIGHLIGHT_COLOR = 'hsl(var(--chart-1))';

const TIER_Y_SPACING = 180;
const NODE_X_SPACING = 220;


const getNodeIcon = (nodeType: TopologyNodeData['type'] | undefined): React.ElementType => {
    switch (nodeType) {
        case 'controller': return ControllerIcon;
        case 'server': return ServerIcon;
        case 'client': return SmartphoneIcon;
        case 'landing': return Globe;
        case 'user': return UserCircle2;
        default: return Network;
    }
};

const getNodeIconColorClass = (nodeType: TopologyNodeData['type'] | undefined): string => {
    switch (nodeType) {
        case 'controller': return 'text-yellow-500';
        case 'server': return 'text-primary';
        case 'client': return 'text-accent';
        case 'landing': return 'text-purple-500';
        case 'user': return 'text-green-500';
        default: return 'text-muted-foreground';
    }
};

const getNodeBorderColorClass = (nodeType: TopologyNodeData['type'] | undefined, selected: boolean = false, isChainHighlighted: boolean = false, statusInfo?: string): string => {
    if (selected) return 'border-ring ring-2 ring-ring';
    if (statusInfo?.includes('失败')) return 'border-destructive ring-2 ring-destructive/70';
    if (statusInfo?.includes('已提交')) return 'border-green-500 ring-2 ring-green-400/70';
    if (isChainHighlighted) return 'border-green-500 ring-2 ring-green-400/70';

    switch (nodeType) {
        case 'controller': return 'border-yellow-500';
        case 'server': return 'border-primary';
        case 'client': return 'border-accent';
        case 'landing': return 'border-purple-500';
        case 'user': return 'border-green-500';
        default: return 'border-border';
    }
};


const NodePassFlowNode: React.FC<NodeProps<TopologyNodeData>> = React.memo(({ data, selected }) => {
  if (!data) {
    return <div className="w-20 h-10 bg-muted rounded text-xs flex items-center justify-center">数据错误</div>;
  }
  const Icon = getNodeIcon(data.type);

  let displayLabel = data.label;
  let subText = '';


  if (data.type === 'controller') {
    const controllerData = data as ControllerNodeData;
    displayLabel = controllerData.label || '主控'; 
    subText = controllerData.apiName || '未知API'; 
    if (controllerData.role === 'server') displayLabel += ' (服务)';
    else if (controllerData.role === 'client') displayLabel += ' (客户)';
  } else if (data.type === 'client') {
     const clientData = data as ClientNodeData;
     displayLabel = clientData.label;
     subText = clientData.tunnelAddress || '未配置服务端';
     if(clientData.managingApiName) {
         subText += ` (由 ${clientData.managingApiName} 管理)`;
     }
  } else {
    switch (data.type) {
        case 'server':
          subText = (data as ServerNodeData).tunnelAddress || '未配置隧道';
          break;
        case 'landing':
          subText = ((data as LandingNodeData).landingIp && (data as LandingNodeData).landingPort) ? `${(data as LandingNodeData).landingIp}:${(data as LandingNodeData).landingPort}` : '未配置IP/端口';
          break;
        case 'user':
          subText = (data as UserNodeData).description ? ((data as UserNodeData).description.length > 25 ? (data as UserNodeData).description.substring(0, 22) + '...' : (data as UserNodeData).description) : '未描述';
          break;
    }
  }


  return (
    <div
      className={cn(
        "bg-card text-card-foreground rounded-md shadow-md flex flex-col items-center justify-center border-2",
        "min-w-[120px] max-w-[160px] py-1 px-2", // Adjusted for smaller size
        getNodeBorderColorClass(data.type, selected, data.isChainHighlighted, data.statusInfo)
      )}
    >
      <div className="flex items-center text-[11px] font-medium mb-0.5">
        {Icon && <Icon className={`h-3.5 w-3.5 mr-1 ${getNodeIconColorClass(data.type)}`} />}
        <span className="truncate" title={displayLabel}>{displayLabel}</span>
      </div>
      {subText && <div className="text-[9px] text-muted-foreground truncate w-full text-center" title={subText}>{subText}</div>}
      {data.statusInfo && <div className="text-[8px] font-semibold mt-0.5 w-full text-center" style={{ color: data.statusInfo.includes('失败') ? 'hsl(var(--destructive))' : 'hsl(var(--chart-2))' }}>{data.statusInfo}</div>}


      {(data.type === 'controller' || data.type === 'user') && (
         <Handle type="source" position={Position.Right} id="output"
           className="!w-2.5 !h-2.5 !rounded-full !bg-slate-400 dark:!bg-slate-600 !border-2 !border-background dark:!border-card hover:!bg-primary hover:!border-primary-foreground transition-all cursor-grab shadow-md"
           style={{ right: '5px', top: '50%', transform: 'translateY(-50%)' }} />
      )}
      {(data.type === 'server' || data.type === 'client' || data.type === 'landing') && (
         <Handle type="target" position={Position.Left} id="input"
            className="!w-5 !h-5 !rounded-full !bg-transparent !border-0" // Made larger and transparent for easier connection
            style={{ left: '-10px' }} />
      )}
      {data.type === 'server' && (
        <>
          <Handle type="source" position={Position.Right} id="s_to_c_output"
            className="!w-2.5 !h-2.5 !rounded-full !bg-slate-400 dark:!bg-slate-600 !border-2 !border-background dark:!border-card hover:!bg-accent hover:!border-accent-foreground transition-all cursor-grab shadow-md"
            style={{ right: '5px', top: 'calc(50% - 7px)', transform: 'translateY(-50%)' }} />
          <Handle type="source" position={Position.Bottom} id="s_to_l_output"
            className="!w-2.5 !h-2.5 !rounded-full !bg-slate-400 dark:!bg-slate-600 !border-2 !border-background dark:!border-card hover:!bg-purple-500 hover:!border-purple-300 transition-all cursor-grab shadow-md"
            style={{ bottom: '5px', left: '50%', transform: 'translateX(-50%)' }}/>
        </>
      )}
      {data.type === 'client' && ( // This applies to all client types, including controller-managed ones
        <Handle type="source" position={Position.Right} id="c_to_l_output" // For client to landing
            className="!w-2.5 !h-2.5 !rounded-full !bg-slate-400 dark:!bg-slate-600 !border-2 !border-background dark:!border-card hover:!bg-purple-500 hover:!border-purple-300 transition-all cursor-grab shadow-md"
            style={{ right: '5px', top: 'calc(50% - 7px)', transform: 'translateY(-50%)' }} /> // Adjusted top for distinct position
      )}
      {data.type === 'client' && ( // Adding source handle for client to server connection
        <Handle type="source" position={Position.Right} id="c_to_s_output"
            className="!w-2.5 !h-2.5 !rounded-full !bg-slate-400 dark:!bg-slate-600 !border-2 !border-background dark:!border-card hover:!bg-primary hover:!border-primary-foreground transition-all cursor-grab shadow-md"
            style={{ right: '5px', top: 'calc(50% + 7px)', transform: 'translateY(-50%)' }} /> // Adjusted top for distinct position
      )}
    </div>
  );
});
NodePassFlowNode.displayName = 'NodePassFlowNode';

const nodeTypes = {
  custom: NodePassFlowNode,
};

type PendingOperations = Record<string, { apiConfig: NamedApiConfig; urlsToCreate: Array<{ originalNodeId: string; url: string }> }>;


const TopologyPageContent: NextPage = () => {
  const { apiConfigsList, isLoading: isLoadingApiConfig, getApiConfigById, getApiRootUrl, getToken } = useApiConfig();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, getNodes: rfGetNodes, getNode: rfGetNode, getEdges: rfGetEdges, fitView } = useReactFlow();
  const [appLogs, setAppLogs] = useState<AppLogEntry[]>([]);

  const [nodes, setNodes, onNodesChange] = useNodesState<TopologyNodeData>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const [selectedNodeForPropsPanel, setSelectedNodeForPropsPanel] = useState<NodePassFlowNodeType | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [isClearCanvasAlertOpen, setIsClearCanvasAlertOpen] = useState(false);

  const [nodeForContextMenu, setNodeForContextMenu] = useState<NodePassFlowNodeType | null>(null);
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(null);

  const [isEditPropertiesDialogOpen, setIsEditPropertiesDialogOpen] = useState(false);
  const [editingNodeProperties, setEditingNodeProperties] = useState<TopologyNodeData | null>(null);

  const [nodeToDelete, setNodeToDelete] = useState<NodePassFlowNodeType | null>(null);
  const [isDeleteNodeDialogOpen, setIsDeleteNodeDialogOpen] = useState(false);
  
  const [edgeForContextMenu, setEdgeForContextMenu] = useState<Edge | null>(null);
  const [edgeContextMenuPosition, setEdgeContextMenuPosition] = useState<{ x: number, y: number } | null>(null);


  const [selectedChainElements, setSelectedChainElements] = useState<{ nodes: Set<string>, edges: Set<string> } | null>(null);

  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [pendingOperations, setPendingOperations] = useState<PendingOperations>({});
  const [isSubmittingTopology, setIsSubmittingTopology] = useState(false);


  const { isLoading: isLoadingInstances, error: fetchErrorGlobal, refetch: refetchInstances } = useQuery<
    any[],
    Error
  >({
    queryKey: ['allInstancesForTopologyPlaceholder', apiConfigsList.map(c => c.id).join(',')],
    queryFn: async () => {
      return [];
    },
    enabled: !isLoadingApiConfig && apiConfigsList.length > 0,
    onSuccess: () => setLastRefreshed(new Date()),
  });

  const onAppLog = useCallback((message: string, type: AppLogEntry['type'], details?: Record<string, any> | string) => {
    setAppLogs(prevLogs => [
      { timestamp: new Date().toISOString(), message, type, details },
      ...prevLogs
    ].slice(0, 100));
  }, []);

  const isValidConnection = useCallback((sourceNode: NodePassFlowNodeType, targetNode: NodePassFlowNodeType): boolean => {
    if (!sourceNode.data || !targetNode.data) return false;
    const sourceType = sourceNode.data.type;
    const targetType = targetNode.data.type;

    // Valid connections:
    // Controller -> Server
    // Controller -> Client
    // User -> Client
    // Client -> Server (Client connects to Server's tunnel)
    // Client -> Landing
    // Server -> Client (Server can initiate connection to client's listener IF client is acting as a server, rare for NodePass basic model but possible)
    // Server -> Landing
    const validConnections: Record<string, string[]> = {
      'controller': ['server', 'client'],
      'user': ['client'],
      'client': ['server', 'landing'],
      'server': ['client', 'landing'],
    };
    return validConnections[sourceType]?.includes(targetType) || false;
  }, []);

  const getEdgeStyle = useCallback((sourceType: TopologyNodeData['type'] | undefined, targetType: TopologyNodeData['type'] | undefined): { stroke: string; markerColor: string } => {
    let strokeColor = 'hsl(var(--muted-foreground))'; 

    if (sourceType === 'controller') {
      if (targetType === 'server') strokeColor = 'hsl(var(--primary))'; 
      else if (targetType === 'client') strokeColor = 'hsl(var(--accent))'; 
    } else if (sourceType === 'user') {
      if (targetType === 'client') strokeColor = 'hsl(var(--chart-1))'; 
    } else if (sourceType === 'server') {
      if (targetType === 'client') strokeColor = 'hsl(var(--chart-2))'; 
      else if (targetType === 'landing') strokeColor = 'hsl(var(--chart-4))'; 
    } else if (sourceType === 'client') {
      if (targetType === 'server') strokeColor = 'hsl(var(--chart-2))'; 
      else if (targetType === 'landing') strokeColor = 'hsl(var(--chart-5))'; 
    }
    return { stroke: strokeColor, markerColor: strokeColor };
  }, []);

  const onConnect: OnConnect = useCallback(
    (params) => {
      const sourceNode = rfGetNode(params.source!) as NodePassFlowNodeType | undefined;
      const targetNode = rfGetNode(params.target!) as NodePassFlowNodeType | undefined;

      if (sourceNode && targetNode && sourceNode.data && targetNode.data) {
        if (isValidConnection(sourceNode, targetNode)) {
          const edgeColors = getEdgeStyle(sourceNode.data.type, targetNode.data.type);
          setEdges((eds) => addEdge({
            ...params,
            type: 'smoothstep',
            animated: false,
            markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: edgeColors.markerColor },
            style: { strokeWidth: 1.5, stroke: edgeColors.stroke }
          }, eds));
          toast({ title: "连接已创建", description: `节点 "${sourceNode.data.label}" 已连接到 "${targetNode.data.label}"。` });
          onAppLog?.(`连接创建: "${sourceNode.data.label}" (${sourceNode.id.substring(0,8)}) -> "${targetNode.data.label}" (${targetNode.id.substring(0,8)})`, 'INFO');

          // Auto-fill client tunnel address if server connects to client
          if (sourceNode.data.type === 'server' && targetNode.data.type === 'client') {
            const serverTunnelAddress = (sourceNode.data as ServerNodeData).tunnelAddress;
            if (serverTunnelAddress && serverTunnelAddress.trim() !== '') {
              const clientData = targetNode.data as ClientNodeData;
              if (clientData.tunnelAddress !== serverTunnelAddress) {
                setNodes((nds) =>
                  nds.map((n) =>
                    n.id === targetNode.id
                      ? { ...n, data: { ...clientData, tunnelAddress: serverTunnelAddress } }
                      : n
                  )
                );
                toast({
                  title: "客户端隧道已自动填写",
                  description: `客户端 "${clientData.label}" 的隧道地址已更新为 "${serverTunnelAddress}".`,
                });
                onAppLog?.(`客户端 "${clientData.label}" (${targetNode.id.substring(0,8)}) 隧道地址自动设置为 "${serverTunnelAddress}" 来自服务端 "${sourceNode.data.label}" (${sourceNode.id.substring(0,8)}).`, 'INFO');
              }
            }
          }

        } else {
          toast({ title: "无效的连接", description: `无法从 "${sourceNode.data.type}" 类型连接到 "${targetNode.data.type}" 类型。`, variant: "destructive" });
          onAppLog?.(`无效连接尝试: "${sourceNode.data.label}" (${sourceNode.id.substring(0,8)}) -> "${targetNode.data.label}" (${targetNode.id.substring(0,8)})`, 'WARNING');
        }
      }
    },
    [setEdges, rfGetNode, isValidConnection, toast, getEdgeStyle, setNodes, onAppLog]
  );

  const onDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (!reactFlowWrapper.current) return;

      const draggedNodeType = event.dataTransfer.getData('application/reactflow-nodetype') as TopologyNodeData['type'];
      let initialLabel = event.dataTransfer.getData('application/reactflow-label');
      const draggedApiId = event.dataTransfer.getData('application/reactflow-apiid');
      const draggedApiName = event.dataTransfer.getData('application/reactflow-apiname');

      if (typeof draggedNodeType === 'undefined' || !draggedNodeType) return;

      const clientX = event.clientX;
      const clientY = event.clientY;
      const position = screenToFlowPosition({ x: clientX, y: clientY });
      const centeredPosition = {
        x: position.x - NODE_DEFAULT_WIDTH / 2,
        y: position.y - NODE_DEFAULT_HEIGHT / 2,
      };

      let newNodeData: TopologyNodeData;
      let finalNodeTypeOnCanvas: 'custom' = 'custom'; // All use NodePassFlowNode

      if (draggedNodeType === 'controller') {
        const existingControllerNodes = rfGetNodes().filter(n => n.data?.type === 'controller');
        if (existingControllerNodes.length === 0) { // First controller node
          newNodeData = { 
            label: draggedApiName || initialLabel || '主控', 
            type: 'controller', 
            apiId: draggedApiId || '', 
            apiName: draggedApiName || '未知API', 
            role: 'server',
            statusInfo: '' 
          };
        } else { // Subsequent controller drag becomes a client node
          newNodeData = {
            label: `${draggedApiName || '未命名主控'} Client`,
            type: 'client',
            instanceType: 'client',
            tunnelAddress: 'server.host:10001', // Default placeholder
            targetAddress: '127.0.0.1:8000',  // Default placeholder
            logLevel: 'info',
            managingApiId: draggedApiId,
            managingApiName: draggedApiName,
            statusInfo: ''
          };
        }
      } else { // For server, client (direct drag), landing, user
        switch (draggedNodeType) {
          case 'server':
            newNodeData = { label: initialLabel || '服务端', type: 'server', instanceType: 'server', tunnelAddress: '0.0.0.0:10001', targetAddress: '0.0.0.0:8080', logLevel: 'info', tlsMode: '1', crtPath: '', keyPath: '', statusInfo: '' }; break;
          case 'client': // Direct drag of a client component
            newNodeData = { label: initialLabel || '客户端', type: 'client', instanceType: 'client', tunnelAddress: 'server.host:10001', targetAddress: '127.0.0.1:8000', logLevel: 'info', statusInfo: '' }; break;
          case 'landing':
            newNodeData = { label: initialLabel || '落地', type: 'landing', landingIp: '', landingPort: '', statusInfo: '' }; break;
          case 'user':
            newNodeData = { label: initialLabel || '用户源', type: 'user', description: '', statusInfo: '' }; break;
          default: console.warn("Unknown node type dropped:", draggedNodeType); return;
        }
      }

      const newNode: NodePassFlowNodeType = {
        id: getId((newNodeData.type) + '_'), type: finalNodeTypeOnCanvas, position: centeredPosition, data: newNodeData,
      };
      setNodes((nds) => nds.concat(newNode));
      toast({title: "节点已添加", description: `节点 "${newNode.data.label}" 已添加到画布。`})
      onAppLog?.(`节点 "${newNode.data.label}" (${newNode.id.substring(0,8)}) 已添加到画布。类型: ${newNode.data.type}`, 'INFO');
    },
    [screenToFlowPosition, setNodes, toast, rfGetNodes, onAppLog]
  );

  const updateSelectedChain = useCallback((startNodeId: string | null) => {
    if (!startNodeId) {
      setSelectedChainElements(null);
      return;
    }

    const chainNodes = new Set<string>();
    const chainEdges = new Set<string>();
    const currentNodes = rfGetNodes();
    const currentEdges = rfGetEdges();

    const traverse = (nodeId: string, direction: 'up' | 'down') => {
      const queue: string[] = [nodeId];
      const visitedNodesThisTraversal = new Set<string>(); 

      while (queue.length > 0) {
        const currentId = queue.shift()!;
        if (visitedNodesThisTraversal.has(currentId)) continue;
        visitedNodesThisTraversal.add(currentId);
        chainNodes.add(currentId);

        const connectedEdgesToProcess = direction === 'down'
          ? currentEdges.filter(edge => edge.source === currentId)
          : currentEdges.filter(edge => edge.target === currentId);

        for (const edge of connectedEdgesToProcess) {
          chainEdges.add(edge.id);
          const nextNodeId = direction === 'down' ? edge.target : edge.source;
          const nextNode = currentNodes.find(n => n.id === nextNodeId);

          if (nextNode && nextNode.data) {
            let continueTraversal = true;
            if (direction === 'down') {
              if (nextNode.data.type === 'landing') continueTraversal = false;
            } else { 
              if (nextNode.data.type === 'controller' || nextNode.data.type === 'user') continueTraversal = false;
            }

            if (continueTraversal && !visitedNodesThisTraversal.has(nextNodeId)) {
              queue.push(nextNodeId);
            } else if (!continueTraversal) {
               chainNodes.add(nextNodeId);
            }
          }
        }
      }
    };

    traverse(startNodeId, 'down');
    traverse(startNodeId, 'up');

    setSelectedChainElements({ nodes: chainNodes, edges: chainEdges });
  }, [rfGetNodes, rfGetEdges]);


  const handleNodeClick = useCallback((event: React.MouseEvent, node: NodePassFlowNodeType) => {
    setSelectedNodeForPropsPanel(node);
    updateSelectedChain(node.id);
    setNodeForContextMenu(null); 
    setEdgeForContextMenu(null); 
  }, [updateSelectedChain]);

  const handlePaneClick = useCallback(() => {
    setSelectedNodeForPropsPanel(null);
    updateSelectedChain(null);
    setNodeForContextMenu(null); 
    setEdgeForContextMenu(null);
  }, [updateSelectedChain]);

  const clearCanvas = () => {
    setNodes([]);
    setEdges([]);
    setSelectedNodeForPropsPanel(null);
    updateSelectedChain(null);
    setNodeForContextMenu(null);
    setEdgeForContextMenu(null);
    toast({ title: "画布已清空", description: "所有节点和连接已移除。" });
    onAppLog?.('画布已清空。', 'INFO');
    setIsClearCanvasAlertOpen(false);
  };

  const handleNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: NodePassFlowNodeType) => {
      event.preventDefault();
      setSelectedNodeForPropsPanel(node); 
      setNodeForContextMenu(node);
      setContextMenuPosition({ x: event.clientX, y: event.clientY });
      setEdgeForContextMenu(null); 
    },
    []
  );
  
  const deleteEdgeDirectly = () => {
    if (edgeForContextMenu) {
      const edgeLabel = `从 ${rfGetNode(edgeForContextMenu.source)?.data?.label || '未知源'} 到 ${rfGetNode(edgeForContextMenu.target)?.data?.label || '未知目标'} (ID: ${edgeForContextMenu.id.substring(0,8)}...)`;
      setEdges((eds) => eds.filter((e) => e.id !== edgeForContextMenu.id));
      toast({
        title: "链路已删除",
        description: `链路 "${edgeLabel}" 已被删除。`,
        variant: "default",
      });
      onAppLog?.(`链路 "${edgeLabel}" 已删除。`, 'SUCCESS');
      if (selectedChainElements?.edges.has(edgeForContextMenu.id)) {
        updateSelectedChain(null); 
      }
    }
    setEdgeForContextMenu(null); 
  };

  const handleEdgeContextMenu = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      event.preventDefault();
      setEdgeForContextMenu(edge);
      setEdgeContextMenuPosition({ x: event.clientX, y: event.clientY });
      setNodeForContextMenu(null); 
      setSelectedNodeForPropsPanel(null); 
      updateSelectedChain(null); 
    },
    [updateSelectedChain]
  );

  const openEditPropertiesDialog = () => {
    if (nodeForContextMenu && nodeForContextMenu.data) {
      setEditingNodeProperties({ ...nodeForContextMenu.data }); 
      setIsEditPropertiesDialogOpen(true);
    }
    setNodeForContextMenu(null); 
    setContextMenuPosition(null);
  };

  const handleSaveNodeProperties = () => {
    if (nodeForContextMenu && editingNodeProperties) {
      const originalNode = rfGetNode(nodeForContextMenu.id);
      const newLabel = editingNodeProperties.label;
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeForContextMenu.id
            ? { ...n, data: { 
                ...(originalNode?.data || {}), // Preserve existing data like managingApiId etc.
                ...editingNodeProperties,     // Apply changes from dialog
                isChainHighlighted: n.data.isChainHighlighted, // Preserve internal state
                statusInfo: n.data.statusInfo                  // Preserve internal state
              } } 
            : n
        )
      );
      toast({ title: "属性已更新", description: `节点 "${newLabel}" 的属性已更改。` });
      onAppLog?.(`节点 "${newLabel}" (${nodeForContextMenu.id.substring(0,8)}) 属性已更新。`, 'INFO');
    }
    setIsEditPropertiesDialogOpen(false);
    setEditingNodeProperties(null);
  };

  const handleChangeControllerRole = (nodeId: string, role: ControllerNodeData['role']) => {
    setNodes((nds) => 
      nds.map((n) => 
        n.id === nodeId && n.data?.type === 'controller'
          ? { ...n, data: { ...(n.data as ControllerNodeData), role } }
          : n
      )
    );
    const roleText = role === 'server' ? '服务焦点' : role === 'client' ? '客户焦点' : '通用';
    const node = rfGetNode(nodeId);
    toast({ title: "主控角色已更改", description: `主控 "${node?.data?.label}" 已设为 ${roleText}。` });
    onAppLog?.(`主控 "${node?.data?.label}" 角色已更改为 ${roleText}。`, 'INFO');
    setNodeForContextMenu(null); 
  };

  const openDeleteNodeDialog = () => {
    if (nodeForContextMenu) {
      setNodeToDelete(nodeForContextMenu);
      setIsDeleteNodeDialogOpen(true);
    }
    setNodeForContextMenu(null); 
    setContextMenuPosition(null);
  };

  const confirmDeleteNode = () => {
    if (nodeToDelete) {
      const deletedNodeLabel = nodeToDelete.data?.label || '未知节点';
      const deletedNodeId = nodeToDelete.id;
      setNodes((nds) => nds.filter((n) => n.id !== deletedNodeId));
      setEdges((eds) => eds.filter((e) => e.source !== deletedNodeId && e.target !== deletedNodeId));
      toast({ title: "节点已删除", description: `节点 "${deletedNodeLabel}" 已被删除。`, variant: "destructive" });
      onAppLog?.(`节点 "${deletedNodeLabel}" (${deletedNodeId.substring(0,8)}) 已删除。`, 'SUCCESS');
      if (selectedNodeForPropsPanel?.id === deletedNodeId) {
        setSelectedNodeForPropsPanel(null);
      }
      if (selectedChainElements?.nodes.has(deletedNodeId)) {
        updateSelectedChain(null); 
      }
    }
    setIsDeleteNodeDialogOpen(false);
    setNodeToDelete(null);
  };

  const formatLayout = useCallback(() => {
    const currentNodes = rfGetNodes();
    if (currentNodes.length === 0) {
        toast({ title: "画布为空", description: "没有可格式化的节点。" });
        return;
    }

    const tierOrder: TopologyNodeData['type'][] = ['controller', 'user', 'client', 'server', 'landing'];
    const nodesByTier: Record<string, NodePassFlowNodeType[]> = {
        controller: [], user: [], client: [], server: [], landing: [],
    };

    currentNodes.forEach(node => {
        const nodeType = node.data?.type;
        if (nodeType && nodesByTier[nodeType]) {
            nodesByTier[nodeType].push(node);
        }
    });

    const newNodesLayout: NodePassFlowNodeType[] = [];
    let currentY = 50; 

    tierOrder.forEach(tierType => {
        const tierNodes = nodesByTier[tierType];
        if (tierNodes.length === 0) return; 

        const tierWidth = (tierNodes.length - 1) * NODE_X_SPACING;
        let currentX = -tierWidth / 2; 

        tierNodes.forEach(node => {
            newNodesLayout.push({
                ...node,
                position: { x: currentX, y: currentY },
            });
            currentX += NODE_X_SPACING;
        });
        currentY += TIER_Y_SPACING; 
    });

    setNodes(newNodesLayout);
    setTimeout(() => {
        fitView({ padding: 0.2, duration: 600 });
    }, 100);

    toast({ title: "布局已格式化", description: "节点已重新排列。" });
    onAppLog?.('画布节点已格式化。', 'INFO');

  }, [rfGetNodes, setNodes, fitView, toast, onAppLog]);


  const processedNodes = useMemo(() => {
    return nodes.map(node => ({
      ...node,
      data: {
        ...node.data,
        isChainHighlighted: selectedChainElements?.nodes.has(node.id) || false,
      }
    }));
  }, [nodes, selectedChainElements]);

  const processedEdges = useMemo(() => {
    return edges.map(edge => {
      const isHighlighted = selectedChainElements?.edges.has(edge.id);

      if (isHighlighted) {
        return {
          ...edge,
          style: {
            ...edge.style,
            stroke: CHAIN_HIGHLIGHT_COLOR,
            strokeWidth: 2.5,
          },
          markerEnd: { ...(edge.markerEnd as object), color: CHAIN_HIGHLIGHT_COLOR },
          animated: true, 
          zIndex: 1000, 
        };
      } else {
        const sourceNode = rfGetNode(edge.source) as NodePassFlowNodeType | undefined;
        const targetNode = rfGetNode(edge.target) as NodePassFlowNodeType | undefined;
        const defaultColors = getEdgeStyle(sourceNode?.data?.type, targetNode?.data?.type);
        return {
          ...edge,
          style: {
             ...edge.style, 
            stroke: defaultColors.stroke,
            strokeWidth: 1.5,
          },
          markerEnd: { ...(edge.markerEnd as object), color: defaultColors.markerColor },
          animated: false,
          zIndex: 1,
        };
      }
    });
  }, [edges, selectedChainElements, rfGetNode, getEdgeStyle]);


  const nodePanelTypes: { type: TopologyNodeData['type']; title: string; icon: React.ElementType; }[] = [
    { type: 'server', title: '服务端', icon: ServerIcon },
    { type: 'client', title: '客户端 (通用)', icon: SmartphoneIcon }, // Generic client
    { type: 'landing', title: '落地', icon: Globe },
    { type: 'user', title: '用户源', icon: UserCircle2 },
    // Controller type is handled by dragging from "已配置主控"
  ];

  const onDragStartPanelItem = (event: React.DragEvent<HTMLDivElement>, nodeType: TopologyNodeData['type'], label?: string, apiId?: string, apiName?: string) => {
    event.dataTransfer.setData('application/reactflow-nodetype', nodeType);
    event.dataTransfer.setData('application/reactflow-label', label || `${nodeType} 节点`);
    if (apiId) event.dataTransfer.setData('application/reactflow-apiid', apiId);
    if (apiName) event.dataTransfer.setData('application/reactflow-apiname', apiName);
    event.dataTransfer.effectAllowed = 'copy';
  };

  function buildNodePassUrlFromNode(
      instanceNode: Node<ServerNodeData | ClientNodeData | TopologyNodeData>, 
      allNodesInner: Node<TopologyNodeData>[],
      allEdgesInner: Edge[]
  ): string | null {
      const { data } = instanceNode;
      if (!data || !data.type || data.type === 'landing' || data.type === 'user' || data.type === 'controller') return null; 
      
      const typedData = data as ServerNodeData | ClientNodeData; 
      if (!typedData.instanceType || !typedData.tunnelAddress || !typedData.targetAddress) return null;

      let actualTargetAddress = typedData.targetAddress;

      const landingEdge = allEdgesInner.find(edge => 
          edge.source === instanceNode.id && 
          allNodesInner.find(n => n.id === edge.target)?.data?.type === 'landing'
      );

      if (landingEdge) {
          const landingNode = allNodesInner.find(n => n.id === landingEdge.target) as Node<LandingNodeData> | undefined;
          if (landingNode?.data.landingIp && landingNode.data.landingPort) {
              actualTargetAddress = `${landingNode.data.landingIp}:${landingNode.data.landingPort}`;
          }
      }
      
      let url = `${typedData.instanceType}://${typedData.tunnelAddress}/${actualTargetAddress}`;
      const queryParams = new URLSearchParams();

      if (typedData.logLevel && typedData.logLevel !== "master") { 
          queryParams.append('log', typedData.logLevel);
      }

      if (typedData.instanceType === 'server') {
          const serverData = typedData as ServerNodeData; 
          if (serverData.tlsMode && serverData.tlsMode !== "master") { 
              queryParams.append('tls', serverData.tlsMode);
              if (serverData.tlsMode === '2') { 
                  if (serverData.crtPath && serverData.crtPath.trim() !== '') queryParams.append('crt', serverData.crtPath.trim());
                  if (serverData.keyPath && serverData.keyPath.trim() !== '') queryParams.append('key', serverData.keyPath.trim());
              }
          }
      }
      const queryString = queryParams.toString();
      return queryString ? `${url}?${queryString}` : url;
  }


  const handleSubmitTopology = () => {
      const currentAllNodes = rfGetNodes();
      const currentAllEdges = rfGetEdges();
      const ops: PendingOperations = {};
      const processedNodeIds = new Set<string>();

      // Initialize ops for all available API configurations
      apiConfigsList.forEach(conf => {
          const apiConfig = getApiConfigById(conf.id);
          if (apiConfig) {
              ops[conf.id] = { apiConfig, urlsToCreate: [] };
          }
      });
      
      // Clear previous status info from nodes
      const nodesToClearStatus = currentAllNodes
          .filter(node => node.data?.type === 'server' || node.data?.type === 'client')
          .map(node => node.id);
      if (nodesToClearStatus.length > 0) {
          setNodes(nds =>
              nds.map(n =>
                  nodesToClearStatus.includes(n.id) && n.data.statusInfo
                      ? { ...n, data: { ...n.data, statusInfo: '' } }
                      : n
              )
          );
      }

      // Assign instances to managing controllers
      currentAllNodes.forEach(node => {
          if (node.data?.type === 'server' || node.data?.type === 'client') {
              if (processedNodeIds.has(node.id)) return; // Already processed

              let managingControllerId: string | null = null;

              // 1. Check for direct link from a 'controller' type node
              const controllerEdge = currentAllEdges.find(edge => 
                  edge.target === node.id && 
                  rfGetNode(edge.source)?.data?.type === 'controller'
              );
              if (controllerEdge) {
                  managingControllerId = (rfGetNode(controllerEdge.source)!.data as ControllerNodeData).apiId;
              } 
              // 2. Else, if it's a client node created from controller drag (has managingApiId)
              else if (node.data.type === 'client' && (node.data as ClientNodeData).managingApiId) {
                  managingControllerId = (node.data as ClientNodeData).managingApiId!;
              }
              // 3. Else, if it's a client implicitly managed by a server's controller
              else if (node.data.type === 'client') {
                  const connectedServerEdge = currentAllEdges.find(edge => 
                      (edge.source === node.id && rfGetNode(edge.target)?.data?.type === 'server') ||
                      (edge.target === node.id && rfGetNode(edge.source)?.data?.type === 'server')
                  );
                  if (connectedServerEdge) {
                      const serverNodeId = rfGetNode(connectedServerEdge.source)?.data?.type === 'server' ? connectedServerEdge.source : connectedServerEdge.target;
                      const serverNode = rfGetNode(serverNodeId);
                      if (serverNode) {
                          const serverControllerEdge = currentAllEdges.find(edge => 
                              edge.target === serverNode.id && 
                              rfGetNode(edge.source)?.data?.type === 'controller'
                          );
                          if (serverControllerEdge) {
                              managingControllerId = (rfGetNode(serverControllerEdge.source)!.data as ControllerNodeData).apiId;
                          }
                      }
                  }
              }

              if (managingControllerId && ops[managingControllerId]) {
                  const url = buildNodePassUrlFromNode(node as Node<ServerNodeData | ClientNodeData>, currentAllNodes, currentAllEdges);
                  if (url) {
                      // Avoid duplicate additions if a node somehow matched multiple conditions (shouldn't happen with current logic flow)
                      if (!ops[managingControllerId].urlsToCreate.some(op => op.originalNodeId === node.id)) {
                         ops[managingControllerId].urlsToCreate.push({ originalNodeId: node.id, url });
                         processedNodeIds.add(node.id);
                      }
                  } else {
                       onAppLog?.(`无法为节点 "${node.data.label}" (${node.id.substring(0,8)}) 生成URL。跳过创建。`, 'WARNING');
                  }
              } else if (managingControllerId && !ops[managingControllerId]) {
                  onAppLog?.(`尝试为节点 "${node.data.label}" 分配到主控 ${managingControllerId}，但该主控不在ops中。可能是一个已删除或无效的主控配置。`, 'ERROR');
              } else if (node.data.type === 'client' && !(node.data as ClientNodeData).managingApiId) {
                  // This case might catch clients that are not connected to anything indicating a controller
                  onAppLog?.(`节点 "${node.data.label}" (${node.id.substring(0,8)}) 未连接到任何主控，无法确定创建者。跳过。`, 'WARNING');
              }
          }
      });
      
      // Filter out ops groups with no URLs to create
      const finalOps: PendingOperations = {};
      for (const apiIdKey in ops) {
        if (ops[apiIdKey].urlsToCreate.length > 0) {
          finalOps[apiIdKey] = ops[apiIdKey];
        }
      }

      const totalUrls = Object.values(finalOps).reduce((sum, group) => sum + group.urlsToCreate.length, 0);
      if (totalUrls === 0) {
          toast({ title: "无需提交", description: "未在画布中检测到可创建的实例链路。" });
          onAppLog?.('尝试提交拓扑: 无可创建的实例。', 'INFO');
          return;
      }

      setPendingOperations(finalOps);
      setIsSubmitModalOpen(true);
      onAppLog?.(`准备提交拓扑: ${totalUrls} 个实例待创建。`, 'INFO', finalOps);
  };

  const createInstanceMutation = useMutation({
      mutationFn: (params: { data: CreateInstanceRequest, apiRoot: string, token: string, originalNodeId: string, apiName: string }) => {
          const validatedApiData = createInstanceApiSchema.parse(params.data);
          return nodePassApi.createInstance(validatedApiData, params.apiRoot, params.token);
      },
      onSuccess: (createdInstance, variables) => {
          const shortUrl = variables.data.url.length > 40 ? variables.data.url.substring(0,37) + "..." : variables.data.url;
          toast({
              title: `实例已创建 (${variables.apiName})`,
              description: `画布节点 ${variables.originalNodeId.substring(0,8)}... (URL: ${shortUrl}) -> API实例ID: ${createdInstance.id.substring(0,8)}...`,
          });
          onAppLog?.(`画布实例 ${variables.originalNodeId.substring(0,8)}... 创建成功 (主控: ${variables.apiName}) -> ${createdInstance.type} ${createdInstance.id.substring(0,8)}... (URL: ${shortUrl})`, 'SUCCESS');
          setNodes((nds) =>
            nds.map((n) =>
              n.id === variables.originalNodeId
                ? { ...n, data: { ...n.data, statusInfo: `已提交 (ID: ${createdInstance.id.substring(0,8)}...)` } }
                : n
            )
          );
      },
      onError: (error: any, variables) => {
          const shortUrl = variables.data.url.length > 40 ? variables.data.url.substring(0,37) + "..." : variables.data.url;
          toast({
              title: `创建实例 ${variables.originalNodeId.substring(0,8)}... 出错 (${variables.apiName})`,
              description: `创建 (URL: ${shortUrl}) 失败: ${error.message || '未知错误。'}`,
              variant: 'destructive',
          });
          onAppLog?.(`画布实例 ${variables.originalNodeId.substring(0,8)}... 创建失败 (主控: ${variables.apiName}, URL: ${shortUrl}) - ${error.message || '未知错误'}`, 'ERROR');
           setNodes((nds) =>
            nds.map((n) =>
              n.id === variables.originalNodeId
                ? { ...n, data: { ...n.data, statusInfo: `提交失败` } }
                : n
            )
          );
      },
  });


  const handleConfirmSubmitTopology = async () => {
      setIsSubmittingTopology(true);
      const allSubmissionPromises: Promise<any>[] = [];
      let successCount = 0;
      let errorCount = 0;

      const nodesToUpdateStatus = Object.values(pendingOperations)
          .flatMap(group => group.urlsToCreate)
          .map(({ originalNodeId }) => originalNodeId);
      
      if (nodesToUpdateStatus.length > 0) {
          setNodes(nds => 
              nds.map(n => 
                  nodesToUpdateStatus.includes(n.id)
                      ? { ...n, data: { ...n.data, statusInfo: '处理中...' } } 
                      : n
              )
          );
      }


      for (const apiIdKey in pendingOperations) {
          const opGroup = pendingOperations[apiIdKey];
          const { apiConfig, urlsToCreate } = opGroup;
          const currentApiRoot = getApiRootUrl(apiConfig.id);
          const currentToken = getToken(apiConfig.id);

          if (!currentApiRoot || !currentToken) {
              toast({ title: "错误", description: `主控 "${apiConfig.name}" 配置无效，跳过此主控的所有操作。`, variant: "destructive" });
              onAppLog?.(`提交拓扑时主控 "${apiConfig.name}" 配置无效，跳过。`, 'ERROR');
              errorCount += urlsToCreate.length; 
              urlsToCreate.forEach(({ originalNodeId }) => {
                  setNodes((nds) => nds.map((n) => n.id === originalNodeId ? { ...n, data: { ...n.data, statusInfo: '主控配置错误' } } : n ));
              });
              continue;
          }

          for (const { originalNodeId, url } of urlsToCreate) {
              const promise = createInstanceMutation.mutateAsync({ data: { url }, apiRoot: currentApiRoot, token: currentToken, originalNodeId, apiName: apiConfig.name })
                  .then(() => { successCount++; })
                  .catch(() => { errorCount++; }); 
              allSubmissionPromises.push(promise);
          }
      }

      await Promise.allSettled(allSubmissionPromises);

      setIsSubmittingTopology(false);
      setPendingOperations({}); 
      setIsSubmitModalOpen(false);

      toast({
          title: "拓扑提交处理完成",
          description: `${successCount} 个实例创建成功, ${errorCount} 个实例创建失败或被跳过。`,
          variant: errorCount > 0 ? "destructive" : "default",
          duration: errorCount > 0 ? 8000 : 5000,
      });
      onAppLog?.(`拓扑提交处理完成: ${successCount} 成功, ${errorCount} 失败/跳过。`, errorCount > 0 ? 'ERROR' : 'SUCCESS');

      queryClient.invalidateQueries({ queryKey: ['instances'] }); 
      queryClient.invalidateQueries({ queryKey: ['allInstancesForTraffic'] }); 
  };


  if (isLoadingApiConfig) {
    return (
      <AppLayout onLog={onAppLog}>
        <div className="flex-grow container mx-auto px-4 py-8 flex items-center justify-center h-[calc(100vh-var(--header-height)-var(--footer-height)-4rem)]">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="ml-4 text-lg font-sans">加载主控配置...</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout onLog={onAppLog}>
      <div className="flex flex-col h-full">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-2">
          <h1 className="text-2xl sm:text-3xl font-bold font-title">实例连接拓扑</h1>
          <div className="flex items-center gap-2 flex-wrap">
            {lastRefreshed && (
              <span className="text-xs text-muted-foreground font-sans">
                数据刷新: {lastRefreshed.toLocaleTimeString()}
              </span>
            )}
            <Button variant="outline" onClick={() => fitView({ duration: 600 })} title="自适应视图" size="sm" className="font-sans h-9">
                <Maximize className="mr-1 h-4 w-4" />自适应
            </Button>
            <Button variant="outline" onClick={formatLayout} size="sm" className="font-sans h-9">
                <LayoutGrid className="mr-1 h-4 w-4" />格式化
            </Button>
            <Button variant="outline" onClick={() => refetchInstances()} disabled={isLoadingInstances} size="sm" className="font-sans">
              <RefreshCw className={`mr-1 h-4 w-4 ${isLoadingInstances ? 'animate-spin' : ''}`} />
              {isLoadingInstances ? '刷新中' : '刷新数据'}
            </Button>
            <Button variant="default" onClick={handleSubmitTopology} size="sm" className="font-sans bg-green-600 hover:bg-green-700 text-white">
              <UploadCloud className="mr-1 h-4 w-4" />
              提交拓扑
            </Button>
            <Button variant="destructive" onClick={() => setIsClearCanvasAlertOpen(true)} size="sm" className="font-sans">
              <Eraser className="mr-1 h-4 w-4" />
              清空画布
            </Button>
          </div>
        </div>

        {fetchErrorGlobal && (
          <Card className="mb-4 border-destructive bg-destructive/10">
            <CardHeader><CardTitle className="text-destructive flex items-center text-base"><AlertTriangle size={18} className="mr-2" />部分数据加载失败</CardTitle></CardHeader>
            <CardContent><p className="text-destructive text-sm font-sans">获取部分主控实例数据时出错: {fetchErrorGlobal.message}</p></CardContent>
          </Card>
        )}

        <div className="flex-grow flex gap-4" style={{ height: 'calc(100vh - var(--header-height) - var(--footer-height) - 10rem)' }}>
          <div className="w-60 flex-shrink-0 space-y-3 h-full overflow-y-hidden flex flex-col"> 
            <Card className="shadow-sm flex-shrink-0">
              <CardHeader className="py-2.5 px-3"><CardTitle className="text-sm font-title flex items-center"><ControllerIcon className="mr-1.5 h-4 w-4 text-yellow-500"/>已配置主控</CardTitle></CardHeader>
              <CardContent className="p-1.5"><ScrollArea className="h-[120px]"> 
                <div className="space-y-1 p-1">
                  {apiConfigsList.length === 0 && <p className="text-xs text-muted-foreground text-center py-1 font-sans">无主控连接。</p>}
                  {apiConfigsList.map((config) => (
                    <div key={config.id} draggable onDragStart={(e) => onDragStartPanelItem(e, 'controller', config.name, config.id, config.name)}
                         className="flex items-center gap-1.5 p-1.5 border rounded cursor-grab hover:bg-muted/50 active:cursor-grabbing transition-colors text-xs"
                         title={`拖拽添加主控: "${config.name}" (首个为主控节点, 后续为客户端节点)`}>
                      <ControllerIcon className="h-3.5 w-3.5 text-yellow-500 shrink-0" />
                      <span className="font-medium truncate font-sans">{config.name}</span>
                    </div>
                  ))}
                </div></ScrollArea></CardContent>
            </Card>

            <Card className="shadow-sm flex-shrink-0">
              <CardHeader className="py-2.5 px-3"><CardTitle className="text-sm font-title flex items-center"><Network className="mr-1.5 h-4 w-4 text-primary"/>组件面板</CardTitle></CardHeader>
              <CardContent className="p-1.5"><ScrollArea className="h-[160px]"> 
                <div className="space-y-1 p-1">
                {nodePanelTypes.filter(nt => nt.type !== 'controller').map(({ type, title, icon: Icon }) => ( 
                    <div key={type} draggable onDragStart={(e) => onDragStartPanelItem(e, type, title)}
                         className="flex items-center gap-1.5 p-1.5 border rounded cursor-grab hover:bg-muted/50 active:cursor-grabbing transition-colors text-xs"
                         title={`拖拽添加 "${title}"`}>
                        <Icon className={`h-3.5 w-3.5 ${getNodeIconColorClass(type)} shrink-0`} />
                        <span className="font-medium font-sans">{title}</span>
                    </div>
                ))}
                </div></ScrollArea></CardContent>
                 <CardFooter className="p-1.5 border-t">
                 </CardFooter>
            </Card>

            <Card className="shadow-sm flex-grow flex flex-col min-h-0"> 
              <CardHeader className="py-2.5 px-3 flex-shrink-0">
                <CardTitle className="text-sm font-title flex items-center"><Info className="mr-1.5 h-4 w-4 text-blue-500"/>节点属性</CardTitle>
                <CardDescription className="text-xs font-sans mt-0.5 truncate">
                  {selectedNodeForPropsPanel ? `编辑: ${selectedNodeForPropsPanel.data?.label} (ID: ${selectedNodeForPropsPanel.id.substring(0,8)}...)` : "点击节点查看属性。"}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-2.5 flex-grow overflow-y-auto"><ScrollArea className="h-full pr-1">
                {selectedNodeForPropsPanel && selectedNodeForPropsPanel.data ? (
                  <div className="space-y-1.5 text-xs">
                    <p><span className="font-semibold">ID:</span> <span className="font-mono">{selectedNodeForPropsPanel.id}</span></p>
                    <p><span className="font-semibold">类型:</span> <span className="font-mono capitalize">{selectedNodeForPropsPanel.data.type}</span></p>
                    <p><span className="font-semibold">标签:</span> {selectedNodeForPropsPanel.data.label}</p>
                    {selectedNodeForPropsPanel.data.type === 'controller' && (
                        <>
                            <p><span className="font-semibold">API 名称:</span> {(selectedNodeForPropsPanel.data as ControllerNodeData).apiName}</p>
                            <p><span className="font-semibold">API ID:</span> <span className="font-mono">{(selectedNodeForPropsPanel.data as ControllerNodeData).apiId}</span></p>
                            <p><span className="font-semibold">角色:</span> {
                                (selectedNodeForPropsPanel.data as ControllerNodeData).role === 'server' ? '服务焦点' :
                                (selectedNodeForPropsPanel.data as ControllerNodeData).role === 'client' ? '客户焦点' :
                                '通用'
                            }</p>
                        </>
                    )}
                    {selectedNodeForPropsPanel.data.statusInfo && <p><span className="font-semibold">提交状态:</span> <span style={{ color: selectedNodeForPropsPanel.data.statusInfo.includes('失败') ? 'hsl(var(--destructive))' : 'hsl(var(--chart-2))' }}>{selectedNodeForPropsPanel.data.statusInfo}</span></p>}
                    {selectedNodeForPropsPanel.data.type === 'server' && <>
                        <p><span className="font-semibold">隧道:</span> <span className="font-mono">{(selectedNodeForPropsPanel.data as ServerNodeData).tunnelAddress}</span></p>
                        <p><span className="font-semibold">转发:</span> <span className="font-mono">{(selectedNodeForPropsPanel.data as ServerNodeData).targetAddress}</span></p>
                        <p><span className="font-semibold">日志:</span> {(selectedNodeForPropsPanel.data as ServerNodeData).logLevel}</p>
                        <p><span className="font-semibold">TLS:</span> {(selectedNodeForPropsPanel.data as ServerNodeData).tlsMode}</p>
                    </>}
                     {selectedNodeForPropsPanel.data.type === 'client' && <>
                        <p><span className="font-semibold">服务端隧道:</span> <span className="font-mono">{(selectedNodeForPropsPanel.data as ClientNodeData).tunnelAddress}</span></p>
                        <p><span className="font-semibold">本地转发:</span> <span className="font-mono">{(selectedNodeForPropsPanel.data as ClientNodeData).targetAddress}</span></p>
                        <p><span className="font-semibold">日志:</span> {(selectedNodeForPropsPanel.data as ClientNodeData).logLevel}</p>
                        {(selectedNodeForPropsPanel.data as ClientNodeData).managingApiName && 
                          <p><span className="font-semibold">管理主控:</span> {(selectedNodeForPropsPanel.data as ClientNodeData).managingApiName}</p>}
                    </>}
                     {selectedNodeForPropsPanel.data.type === 'landing' && <>
                        <p><span className="font-semibold">IP:</span> <span className="font-mono">{(selectedNodeForPropsPanel.data as LandingNodeData).landingIp || 'N/A'}</span></p>
                        <p><span className="font-semibold">端口:</span> <span className="font-mono">{(selectedNodeForPropsPanel.data as LandingNodeData).landingPort || 'N/A'}</span></p>
                    </>}
                     {selectedNodeForPropsPanel.data.type === 'user' && <p><span className="font-semibold">描述:</span> {(selectedNodeForPropsPanel.data as UserNodeData).description || 'N/A'}</p>}
                    <p className="text-muted-foreground font-sans mt-2 pt-2 border-t">右键点击节点可编辑或删除。右键点击链路可删除。</p>
                  </div>
                ) : ( <p className="text-xs text-muted-foreground text-center py-3 font-sans">未选择节点。</p> )}
              </ScrollArea></CardContent>
            </Card>
          </div>

          <div ref={reactFlowWrapper} className="flex-grow border rounded-lg shadow-md bg-background/80 backdrop-blur-sm relative h-full" onDrop={onDrop} onDragOver={onDragOver}>
            <ReactFlow
              nodes={processedNodes}
              edges={processedEdges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={handleNodeClick}
              onPaneClick={handlePaneClick}
              onNodeContextMenu={handleNodeContextMenu}
              onEdgeContextMenu={handleEdgeContextMenu}
              fitView
              fitViewOptions={{ padding: 0.2, minZoom: 0.5, maxZoom: 2.5 }}
              proOptions={{ hideAttribution: true }}
              className="bg-card" 
              defaultViewport={initialViewport}
              nodeTypes={nodeTypes}
              nodesDraggable={true} 
              nodesConnectable={true} 
              zoomOnScroll={true} 
              panOnScroll={false}
              panOnDrag={true} 
              preventScrolling={true} 
            >
              <Background gap={16} />
            </ReactFlow>
          </div>
        </div>

        {nodeForContextMenu && contextMenuPosition && (
          <DropdownMenu open={!!nodeForContextMenu} onOpenChange={(isOpen) => !isOpen && setNodeForContextMenu(null)}>
            <DropdownMenuTrigger style={{ position: 'fixed', left: contextMenuPosition.x, top: contextMenuPosition.y }} />
            <DropdownMenuContent align="start" className="w-48 font-sans">
              <DropdownMenuItem onClick={openEditPropertiesDialog}>
                <Edit3 className="mr-2 h-4 w-4" />
                编辑属性
              </DropdownMenuItem>
              {nodeForContextMenu.data?.type === 'controller' && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Cog className="mr-2 h-4 w-4" />
                    更改角色
                  </DropdownMenuSubTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuSubContent>
                      <DropdownMenuItem onClick={() => handleChangeControllerRole(nodeForContextMenu.id, 'server')}>
                        <Target className="mr-2 h-4 w-4" /> 服务焦点
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleChangeControllerRole(nodeForContextMenu.id, 'client')}>
                        <Users className="mr-2 h-4 w-4" /> 客户焦点
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleChangeControllerRole(nodeForContextMenu.id, 'general')}>
                        <Settings2 className="mr-2 h-4 w-4" /> 通用
                      </DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuPortal>
                </DropdownMenuSub>
              )}
              <DropdownMenuItem onClick={openDeleteNodeDialog} className="text-destructive hover:!text-destructive focus:!text-destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                删除节点
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {edgeForContextMenu && edgeContextMenuPosition && (
          <DropdownMenu open={!!edgeForContextMenu} onOpenChange={(isOpen) => !isOpen && setEdgeForContextMenu(null)}>
            <DropdownMenuTrigger style={{ position: 'fixed', left: edgeContextMenuPosition.x, top: edgeContextMenuPosition.y }} />
            <DropdownMenuContent align="start" className="w-48 font-sans">
               <DropdownMenuItem onClick={deleteEdgeDirectly} className="text-destructive hover:!text-destructive focus:!text-destructive">
                <Unlink className="mr-2 h-4 w-4" />
                删除链路
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}


        <Dialog open={isEditPropertiesDialogOpen} onOpenChange={setIsEditPropertiesDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <ShadDialogTitleFromDialog className="font-title">
                编辑节点
                {editingNodeProperties?.type === 'controller' ? ` "${(editingNodeProperties as ControllerNodeData).apiName}" 基础名称` : `属性: ${editingNodeProperties?.label}`}
              </ShadDialogTitleFromDialog>
              {editingNodeProperties?.type === 'landing' && (
                <ShadDialogDescriptionFromDialog className="font-sans text-xs">
                  对于“落地”节点, “标签 (名称)”字段将作为其标识名称 (例如 `ip:port@标签名称` 中的 `@标签名称` 部分)。
                </ShadDialogDescriptionFromDialog>
              )}
               {editingNodeProperties?.type === 'controller' && (
                <ShadDialogDescriptionFromDialog className="font-sans text-xs">
                  修改主控的基础名称。角色 (例如 服务/客户) 通过右键菜单更改。
                </ShadDialogDescriptionFromDialog>
              )}
            </DialogHeader>
            {editingNodeProperties && (
            <div className="py-2 space-y-3 max-h-[60vh] overflow-y-auto pr-2"> 
              <div className="space-y-1">
                <Label htmlFor="node-label-input" className="font-sans">
                    {editingNodeProperties.type === 'controller' ? '基础名称' : '标签 (名称)'}
                </Label>
                <Input
                  id="node-label-input"
                  value={editingNodeProperties.label || ''}
                  onChange={(e) => setEditingNodeProperties(prev => prev ? ({ ...prev, label: e.target.value }) : null)}
                  className="font-sans"
                  autoFocus
                />
              </div>

              {editingNodeProperties.type === 'server' && (
                <>
                  <div className="space-y-1">
                    <Label htmlFor="server-tunnel" className="font-sans">隧道监听地址</Label>
                    <Input id="server-tunnel" value={(editingNodeProperties as ServerNodeData).tunnelAddress || ''} onChange={(e) => setEditingNodeProperties(prev => prev ? ({ ...prev, tunnelAddress: e.target.value }) as ServerNodeData : null)} className="font-mono text-sm" placeholder="0.0.0.0:10001"/>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="server-target" className="font-sans">流量转发地址</Label>
                    <Input id="server-target" value={(editingNodeProperties as ServerNodeData).targetAddress || ''} onChange={(e) => setEditingNodeProperties(prev => prev ? ({ ...prev, targetAddress: e.target.value }) as ServerNodeData : null)} className="font-mono text-sm" placeholder="0.0.0.0:8080"/>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="server-log" className="font-sans">日志级别</Label>
                    <Select value={(editingNodeProperties as ServerNodeData).logLevel || 'info'} onValueChange={(v) => setEditingNodeProperties(prev => prev ? ({ ...prev, logLevel: v as ServerNodeData['logLevel'] }) as ServerNodeData : null)}>
                      <SelectTrigger className="font-sans text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="master">主控默认</SelectItem>
                        <SelectItem value="debug">Debug</SelectItem><SelectItem value="info">Info</SelectItem><SelectItem value="warn">Warn</SelectItem><SelectItem value="error">Error</SelectItem><SelectItem value="fatal">Fatal</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="server-tls" className="font-sans">TLS 模式</Label>
                    <Select value={(editingNodeProperties as ServerNodeData).tlsMode || '1'} onValueChange={(v) => setEditingNodeProperties(prev => prev ? ({ ...prev, tlsMode: v as ServerNodeData['tlsMode'] }) as ServerNodeData : null)}>
                       <SelectTrigger className="font-sans text-sm"><SelectValue /></SelectTrigger>
                       <SelectContent>
                        <SelectItem value="master">主控默认</SelectItem>
                        <SelectItem value="0">0: 无TLS</SelectItem><SelectItem value="1">1: 自签名</SelectItem><SelectItem value="2">2: 自定义</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {(editingNodeProperties as ServerNodeData).tlsMode === '2' && (
                    <>
                      <div className="space-y-1">
                        <Label htmlFor="server-crt" className="font-sans">证书路径 (crt)</Label>
                        <Input id="server-crt" value={(editingNodeProperties as ServerNodeData).crtPath || ''} onChange={(e) => setEditingNodeProperties(prev => prev ? ({ ...prev, crtPath: e.target.value }) as ServerNodeData : null)} className="font-mono text-sm" placeholder="/path/to/cert.pem"/>
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="server-key" className="font-sans">密钥路径 (key)</Label>
                        <Input id="server-key" value={(editingNodeProperties as ServerNodeData).keyPath || ''} onChange={(e) => setEditingNodeProperties(prev => prev ? ({ ...prev, keyPath: e.target.value }) as ServerNodeData : null)} className="font-mono text-sm" placeholder="/path/to/key.pem"/>
                      </div>
                    </>
                  )}
                </>
              )}

              {editingNodeProperties.type === 'client' && (
                 <>
                  <div className="space-y-1">
                    <Label htmlFor="client-tunnel" className="font-sans">服务端隧道地址</Label>
                    <Input id="client-tunnel" value={(editingNodeProperties as ClientNodeData).tunnelAddress || ''} onChange={(e) => setEditingNodeProperties(prev => prev ? ({ ...prev, tunnelAddress: e.target.value }) as ClientNodeData : null)} className="font-mono text-sm" placeholder="your.server.com:10001"/>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="client-target" className="font-sans">本地转发地址</Label>
                    <Input id="client-target" value={(editingNodeProperties as ClientNodeData).targetAddress || ''} onChange={(e) => setEditingNodeProperties(prev => prev ? ({ ...prev, targetAddress: e.target.value }) as ClientNodeData : null)} className="font-mono text-sm" placeholder="127.0.0.1:8000"/>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="client-log" className="font-sans">日志级别</Label>
                     <Select value={(editingNodeProperties as ClientNodeData).logLevel || 'info'} onValueChange={(v) => setEditingNodeProperties(prev => prev ? ({ ...prev, logLevel: v as ClientNodeData['logLevel'] }) as ClientNodeData : null)}>
                       <SelectTrigger className="font-sans text-sm"><SelectValue /></SelectTrigger>
                       <SelectContent>
                        <SelectItem value="master">主控默认</SelectItem>
                        <SelectItem value="debug">Debug</SelectItem><SelectItem value="info">Info</SelectItem><SelectItem value="warn">Warn</SelectItem><SelectItem value="error">Error</SelectItem><SelectItem value="fatal">Fatal</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {(editingNodeProperties as ClientNodeData).managingApiName && (
                    <div className="text-xs text-muted-foreground pt-2">
                        此客户端由主控 "{(editingNodeProperties as ClientNodeData).managingApiName}" 管理。
                    </div>
                  )}
                </>
              )}

              {editingNodeProperties.type === 'landing' && (
                 <>
                  <div className="space-y-1">
                    <Label htmlFor="landing-ip" className="font-sans">IP 地址</Label>
                    <Input id="landing-ip" value={(editingNodeProperties as LandingNodeData).landingIp || ''} onChange={(e) => setEditingNodeProperties(prev => prev ? ({ ...prev, landingIp: e.target.value }) as LandingNodeData : null)} className="font-mono text-sm" placeholder="192.168.1.100"/>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="landing-port" className="font-sans">端口</Label>
                    <Input id="landing-port" value={(editingNodeProperties as LandingNodeData).landingPort || ''} onChange={(e) => setEditingNodeProperties(prev => prev ? ({ ...prev, landingPort: e.target.value }) as LandingNodeData : null)} className="font-mono text-sm" placeholder="80"/>
                  </div>
                </>
              )}

              {editingNodeProperties.type === 'user' && (
                 <div className="space-y-1">
                    <Label htmlFor="user-desc" className="font-sans">描述</Label>
                    <Input id="user-desc" value={(editingNodeProperties as UserNodeData).description || ''} onChange={(e) => setEditingNodeProperties(prev => prev ? ({ ...prev, description: e.target.value }) as UserNodeData : null)} className="font-sans text-sm" placeholder="用户流量描述"/>
                  </div>
              )}
            </div>
            )}
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" className="font-sans" onClick={() => setEditingNodeProperties(null)}>取消</Button>
              </DialogClose>
              <Button onClick={handleSaveNodeProperties} className="font-sans" disabled={!editingNodeProperties}>保存更改</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>


        <AlertDialog open={isDeleteNodeDialogOpen} onOpenChange={(isOpen) => {
            setIsDeleteNodeDialogOpen(isOpen);
            if (!isOpen) { 
                setNodeToDelete(null);
            }
        }}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <ShadAlertDialogTitle className="font-title">确认删除节点</ShadAlertDialogTitle>
                    <ShadAlertDialogDescription className="font-sans">
                        您确定要删除节点 “{nodeToDelete?.data?.label}” 及其所有连接吗？此操作无法撤销。
                    </ShadAlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => { setIsDeleteNodeDialogOpen(false); setNodeToDelete(null);}} className="font-sans">取消</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={confirmDeleteNode}
                        className="bg-destructive hover:bg-destructive/90 font-sans text-destructive-foreground"
                    >
                        <Trash2 className="mr-2 h-4 w-4"/> 删除节点
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={isClearCanvasAlertOpen} onOpenChange={setIsClearCanvasAlertOpen}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <ShadAlertDialogTitle className="font-title">确认清空画布</ShadAlertDialogTitle>
                    <ShadAlertDialogDescription className="font-sans">
                        您确定要删除画布上所有的节点和连接吗？此操作无法撤销。
                    </ShadAlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setIsClearCanvasAlertOpen(false)} className="font-sans">取消</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={clearCanvas}
                        className="bg-destructive hover:bg-destructive/90 font-sans text-destructive-foreground"
                    >
                        <Eraser className="mr-2 h-4 w-4"/> 清空画布
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

        <Dialog open={isSubmitModalOpen} onOpenChange={setIsSubmitModalOpen}>
            <DialogContent className="sm:max-w-2xl"> 
                <DialogHeader>
                    <ShadDialogTitleFromDialog className="font-title flex items-center">
                        <UploadCloud className="mr-2 h-5 w-5 text-primary"/>确认提交拓扑
                    </ShadDialogTitleFromDialog>
                    <ShadDialogDescriptionFromDialog className="font-sans">
                        将根据以下分组在相应的主控上创建实例。请确认操作。
                    </ShadDialogDescriptionFromDialog>
                </DialogHeader>
                <ScrollArea className="max-h-[60vh] pr-4"> 
                    {Object.keys(pendingOperations).length === 0 ? (
                        <p className="text-muted-foreground text-sm font-sans py-4 text-center">无可创建的操作。</p>
                    ) : (
                        <Accordion type="multiple" defaultValue={Object.keys(pendingOperations)} className="w-full">
                            {Object.entries(pendingOperations).map(([apiId, opGroup]) => (
                                <AccordionItem value={apiId} key={apiId}>
                                    <AccordionTrigger className="font-sans text-base hover:no-underline">
                                        主控: {opGroup.apiConfig.name} ({opGroup.urlsToCreate.length} 个实例)
                                    </AccordionTrigger>
                                    <AccordionContent>
                                        <ul className="list-disc pl-5 space-y-1 text-xs font-mono">
                                            {opGroup.urlsToCreate.map(op => (
                                                <li key={op.originalNodeId} className="break-all" title={`源画布节点ID: ${op.originalNodeId}`}>
                                                    {op.url}
                                                </li>
                                            ))}
                                        </ul>
                                    </AccordionContent>
                                </AccordionItem>
                            ))}
                        </Accordion>
                    )}
                </ScrollArea>
                <DialogFooter className="font-sans pt-4">
                    <DialogClose asChild>
                        <Button variant="outline" disabled={isSubmittingTopology}>取消</Button>
                    </DialogClose>
                    <Button 
                        onClick={handleConfirmSubmitTopology} 
                        disabled={isSubmittingTopology || Object.keys(pendingOperations).length === 0}
                        className="bg-green-600 hover:bg-green-700 text-white"
                    >
                        {isSubmittingTopology ? (
                            <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> 提交中...</>
                        ) : (
                            "确认提交"
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

      </div>
    </AppLayout>
  );
};

const TopologyEditorPageWrapper: NextPage = () => {
  return (
    <ReactFlowProvider>
      <TopologyPageContent />
    </ReactFlowProvider>
  );
};

export default TopologyEditorPageWrapper;

