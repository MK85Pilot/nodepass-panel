
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
  type Edge,
  type OnConnect,
  MarkerType,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { AppLayout } from '@/components/layout/AppLayout';
import { useApiConfig, type NamedApiConfig } from '@/hooks/use-api-key';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, AlertTriangle, Edit3, Trash2, Unlink, Target, Users, Settings2, UploadCloud, Eraser } from 'lucide-react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
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
import { cn } from "@/lib/utils";

import NodePassFlowNode from './components/NodePassFlowNode';
import { TopologyControlBar } from './components/TopologyControlBar';
import { DraggablePanels } from './components/DraggablePanels';
import { PropertiesDisplayPanel } from './components/PropertiesDisplayPanel';
import { SubmitTopologyDialog } from './components/dialogs/SubmitTopologyDialog';
import { calculateElkLayout, calculateTieredLayout } from './lib/advanced-layout'; 

import type {
  TopologyNodeData, NodePassFlowNodeType, PendingOperations,
  ControllerNodeData, ServerNodeData, ClientNodeData, LandingNodeData, UserNodeData
} from './lib/topology-types';
import { initialViewport, NODE_DEFAULT_WIDTH, NODE_DEFAULT_HEIGHT, CONTROLLER_NODE_DEFAULT_WIDTH, CONTROLLER_NODE_DEFAULT_HEIGHT, CHAIN_HIGHLIGHT_COLOR } from './lib/topology-types';
import { getId, extractHostname, extractPort, buildNodePassUrlFromNode } from './lib/topology-utils';


const initialNodes: NodePassFlowNodeType[] = [];
const initialEdges: Edge[] = [];

const nodeTypes = {
  custom: NodePassFlowNode,
};

const TopologyPageContent: NextPage = () => {
  const { apiConfigsList, isLoading: isLoadingApiConfig, getApiConfigById, getApiRootUrl, getToken } = useApiConfig();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, getNodes: rfGetNodes, getNode: rfGetNode, getEdges: rfGetEdges, setEdges: rfSetEdges, fitView } = useReactFlow();
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
  const [isFormattingLayout, setIsFormattingLayout] = useState(false);


  const { isLoading: isLoadingInstances, error: fetchErrorGlobal, refetch: refetchInstances } = useQuery<
    any[], Error
  >({
    queryKey: ['allInstancesForTopologyPlaceholder', apiConfigsList.map(c => c.id).join(',')],
    queryFn: async () => { return []; }, 
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
            ...params, type: 'smoothstep', animated: false,
            markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: edgeColors.markerColor },
            style: { strokeWidth: 1.5, stroke: edgeColors.stroke }
          }, eds));
          toast({ title: "连接已创建", description: `节点 "${sourceNode.data.label}" 已连接到 "${targetNode.data.label}"。` });
          onAppLog?.(`连接创建: "${sourceNode.data.label}" (${sourceNode.id.substring(0,8)}) -> "${targetNode.data.label}" (${targetNode.id.substring(0,8)})`, 'INFO');

          if (sourceNode.data.type === 'server' && targetNode.data.type === 'client') {
            const serverData = sourceNode.data as ServerNodeData;
            const clientData = targetNode.data as ClientNodeData;
            const serverPort = extractPort(serverData.tunnelAddress);

            if (serverPort) {
              let serverHost = extractHostname(serverData.tunnelAddress);
              let effectiveServerHost = serverHost;

              if (!serverHost || serverHost === '0.0.0.0' || serverHost === '::') {
                const serverManagingControllerEdge = rfGetEdges().find(edge =>
                  edge.target === sourceNode.id && rfGetNode(edge.source)?.data?.type === 'controller'
                );
                if (serverManagingControllerEdge) {
                  const controllerNode = rfGetNode(serverManagingControllerEdge.source) as Node<ControllerNodeData> | undefined;
                  if (controllerNode?.data?.apiId) {
                    const controllerConfig = getApiConfigById(controllerNode.data.apiId);
                    if (controllerConfig?.apiUrl) {
                      const controllerApiHost = extractHostname(controllerConfig.apiUrl);
                      if (controllerApiHost) effectiveServerHost = controllerApiHost;
                      else onAppLog?.(`无法从主控 "${controllerNode.data.apiName}" 的 API URL (${controllerConfig.apiUrl}) 提取主机名。`, 'WARNING');
                    } else onAppLog?.(`找不到主控 "${controllerNode.data.apiName}" 的配置或 API URL。`, 'WARNING');
                  }
                } else onAppLog?.(`服务端节点 "${serverData.label}" 未直接由主控管理。`, 'WARNING');
              }

              let formattedHost = effectiveServerHost;
              // Ensure IPv6 is bracketed if it contains a colon and is not already bracketed
              if (effectiveServerHost && effectiveServerHost.includes(':') && !effectiveServerHost.startsWith('[') && !effectiveServerHost.endsWith(']')) { 
                formattedHost = `[${effectiveServerHost}]`;
              }
              const newClientTunnelAddress = formattedHost ? `${formattedHost}:${serverPort}` : `:${serverPort}`;


              if (clientData.tunnelAddress !== newClientTunnelAddress) {
                setNodes((nds) =>
                  nds.map((n) =>
                    n.id === targetNode.id ? { ...n, data: { ...clientData, tunnelAddress: newClientTunnelAddress } } : n
                  )
                );
                toast({ title: "客户端隧道已自动更新", description: `客户端 "${clientData.label}" 的隧道地址更新为 "${newClientTunnelAddress}".` });
                onAppLog?.(`客户端 "${clientData.label}" (${targetNode.id.substring(0,8)}) 隧道地址自动设置为 "${newClientTunnelAddress}".`, 'INFO');
              }
            } else {
               onAppLog?.(`无法从服务端 "${serverData.label}" 的隧道地址 (${serverData.tunnelAddress}) 提取端口。客户端隧道地址未自动填充。`, 'WARNING');
            }
          }
        } else {
          toast({ title: "无效的连接", description: `无法从 "${sourceNode.data.type}" 类型连接到 "${targetNode.data.type}" 类型。`, variant: "destructive" });
          onAppLog?.(`无效连接尝试: "${sourceNode.data.label}" (${sourceNode.id.substring(0,8)}) -> "${targetNode.data.label}" (${targetNode.id.substring(0,8)})`, 'WARNING');
        }
      }
    },
    [setEdges, rfGetNode, rfGetEdges, isValidConnection, toast, getEdgeStyle, setNodes, onAppLog, getApiConfigById]
  );

  const onDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (!reactFlowWrapper.current) return;

      const draggedNodeTypeFromPanel = event.dataTransfer.getData('application/reactflow-nodetype') as TopologyNodeData['type'];
      let initialLabel = event.dataTransfer.getData('application/reactflow-label');
      const draggedApiId = event.dataTransfer.getData('application/reactflow-apiid');
      const draggedApiName = event.dataTransfer.getData('application/reactflow-apiname');

      if (typeof draggedNodeTypeFromPanel === 'undefined' || !draggedNodeTypeFromPanel) return;

      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      
      let newNodeData: TopologyNodeData;
      let actualNodeTypeForData: TopologyNodeData['type'];
      let nodeWidth = NODE_DEFAULT_WIDTH;
      let nodeHeight = NODE_DEFAULT_HEIGHT;

      if (draggedNodeTypeFromPanel === 'controller' && draggedApiId && draggedApiName) {
        const existingControllerNodes = rfGetNodes().filter(n => n.data?.type === 'controller');
        if (existingControllerNodes.length === 0) {
          actualNodeTypeForData = 'controller';
          nodeWidth = CONTROLLER_NODE_DEFAULT_WIDTH;
          nodeHeight = CONTROLLER_NODE_DEFAULT_HEIGHT;
          newNodeData = {
            label: draggedApiName, type: 'controller',
            apiId: draggedApiId, apiName: draggedApiName, role: 'server', statusInfo: ''
          } as ControllerNodeData;
        } else {
          actualNodeTypeForData = 'client'; 
          nodeWidth = NODE_DEFAULT_WIDTH; 
          nodeHeight = NODE_DEFAULT_HEIGHT;
          newNodeData = {
            label: `${draggedApiName} Client`, type: 'client', instanceType: 'client',
            tunnelAddress: 'server.host:10001', targetAddress: '127.0.0.1:8000', logLevel: 'info',
            managingApiId: draggedApiId, managingApiName: draggedApiName, statusInfo: ''
          } as ClientNodeData;
        }
      } else {
        actualNodeTypeForData = draggedNodeTypeFromPanel;
        switch (draggedNodeTypeFromPanel) {
          case 'server': 
            nodeWidth = NODE_DEFAULT_WIDTH; nodeHeight = NODE_DEFAULT_HEIGHT;
            newNodeData = { label: initialLabel || '服务端', type: 'server', instanceType: 'server', tunnelAddress: '0.0.0.0:10001', targetAddress: '0.0.0.0:8080', logLevel: 'info', tlsMode: '1', crtPath: '', keyPath: '', statusInfo: '' } as ServerNodeData; 
            break;
          case 'client': 
            nodeWidth = NODE_DEFAULT_WIDTH; nodeHeight = NODE_DEFAULT_HEIGHT;
            newNodeData = { label: initialLabel || '客户端', type: 'client', instanceType: 'client', tunnelAddress: 'server.host:10001', targetAddress: '127.0.0.1:8000', logLevel: 'info', statusInfo: '' } as ClientNodeData; 
            break;
          case 'landing': 
            nodeWidth = NODE_DEFAULT_WIDTH; nodeHeight = NODE_DEFAULT_HEIGHT;
            newNodeData = { label: initialLabel || '落地', type: 'landing', landingIp: '', landingPort: '', statusInfo: '' } as LandingNodeData; 
            break;
          case 'user': 
            nodeWidth = NODE_DEFAULT_WIDTH; nodeHeight = NODE_DEFAULT_HEIGHT;
            newNodeData = { label: initialLabel || '用户源', type: 'user', description: '', statusInfo: '' } as UserNodeData; 
            break;
          default: console.warn("Unknown node type dropped from panel:", draggedNodeTypeFromPanel); return;
        }
      }
      const centeredPosition = { x: position.x - nodeWidth / 2, y: position.y - nodeHeight / 2 };

      const newNode: NodePassFlowNodeType = { 
        id: getId(actualNodeTypeForData + '_'), 
        type: 'custom', 
        position: centeredPosition, 
        data: newNodeData,
        width: nodeWidth, 
        height: nodeHeight, 
      };

      setNodes((nds) => nds.concat(newNode));
      toast({title: "节点已添加", description: `节点 "${newNode.data.label}" 已添加到画布。`})
      onAppLog?.(`节点 "${newNode.data.label}" (${newNode.id.substring(0,8)}) 已添加到画布。类型: ${newNode.data.type}`, 'INFO');
    },
    [screenToFlowPosition, setNodes, toast, rfGetNodes, onAppLog]
  );

  const updateSelectedChain = useCallback((startNodeId: string | null) => {
    if (!startNodeId) {
      setSelectedChainElements(null); return;
    }
    const chainNodes = new Set<string>(); const chainEdges = new Set<string>();
    const currentNodes = rfGetNodes(); const currentEdges = rfGetEdges();
    const traverse = (nodeId: string, direction: 'up' | 'down') => {
      const queue: string[] = [nodeId]; const visitedNodesThisTraversal = new Set<string>();
      while (queue.length > 0) {
        const currentId = queue.shift()!;
        if (visitedNodesThisTraversal.has(currentId)) continue;
        visitedNodesThisTraversal.add(currentId); chainNodes.add(currentId);
        const connectedEdgesToProcess = direction === 'down' ? currentEdges.filter(edge => edge.source === currentId) : currentEdges.filter(edge => edge.target === currentId);
        for (const edge of connectedEdgesToProcess) {
          chainEdges.add(edge.id); const nextNodeId = direction === 'down' ? edge.target : edge.source;
          const nextNode = currentNodes.find(n => n.id === nextNodeId);
          if (nextNode?.data) {
            let continueTraversal = true;
            if (direction === 'down' && nextNode.data.type === 'landing') continueTraversal = false;
            else if (direction === 'up' && (nextNode.data.type === 'controller' || nextNode.data.type === 'user')) continueTraversal = false;
            if (continueTraversal && !visitedNodesThisTraversal.has(nextNodeId)) queue.push(nextNodeId);
            else if (!continueTraversal) chainNodes.add(nextNodeId);
          }
        }
      }
    };
    traverse(startNodeId, 'down'); traverse(startNodeId, 'up');
    setSelectedChainElements({ nodes: chainNodes, edges: chainEdges });
  }, [rfGetNodes, rfGetEdges]);

  const handleNodeClick = useCallback((event: React.MouseEvent, node: NodePassFlowNodeType) => {
    setSelectedNodeForPropsPanel(node); updateSelectedChain(node.id);
    setNodeForContextMenu(null); setEdgeForContextMenu(null);
  }, [updateSelectedChain]);

  const handlePaneClick = useCallback(() => {
    setSelectedNodeForPropsPanel(null); updateSelectedChain(null);
    setNodeForContextMenu(null); setEdgeForContextMenu(null);
  }, [updateSelectedChain]);

  const clearCanvas = () => {
    setNodes([]); setEdges([]); setSelectedNodeForPropsPanel(null); updateSelectedChain(null);
    setNodeForContextMenu(null); setEdgeForContextMenu(null);
    toast({ title: "画布已清空", description: "所有节点和连接已移除。" });
    onAppLog?.('画布已清空。', 'INFO'); setIsClearCanvasAlertOpen(false);
  };

  const handleNodeContextMenu = useCallback((event: React.MouseEvent, node: NodePassFlowNodeType) => {
    event.preventDefault(); setSelectedNodeForPropsPanel(node);
    setNodeForContextMenu(node); setContextMenuPosition({ x: event.clientX, y: event.clientY });
    setEdgeForContextMenu(null);
  }, []);

  const deleteEdgeDirectly = () => {
    if (edgeForContextMenu) {
      const edgeLabel = `从 ${rfGetNode(edgeForContextMenu.source)?.data?.label || '未知源'} 到 ${rfGetNode(edgeForContextMenu.target)?.data?.label || '未知目标'} (ID: ${edgeForContextMenu.id.substring(0,8)}...)`;
      setEdges((eds) => eds.filter((e) => e.id !== edgeForContextMenu.id));
      toast({ title: "链路已删除", description: `链路 "${edgeLabel}" 已被删除。` });
      onAppLog?.(`链路 "${edgeLabel}" 已删除。`, 'SUCCESS');
      if (selectedChainElements?.edges.has(edgeForContextMenu.id)) updateSelectedChain(null);
    }
    setEdgeForContextMenu(null);
  };

  const handleEdgeContextMenu = useCallback((event: React.MouseEvent, edge: Edge) => {
    event.preventDefault(); setEdgeForContextMenu(edge);
    setEdgeContextMenuPosition({ x: event.clientX, y: event.clientY });
    setNodeForContextMenu(null); setSelectedNodeForPropsPanel(null); updateSelectedChain(null);
  }, [updateSelectedChain]);

  const openEditPropertiesDialog = () => {
    if (nodeForContextMenu?.data) {
      setEditingNodeProperties({ ...nodeForContextMenu.data });
      setIsEditPropertiesDialogOpen(true);
    }
    setNodeForContextMenu(null); setContextMenuPosition(null);
  };

  const handleSaveNodeProperties = () => {
    if (nodeForContextMenu && editingNodeProperties) {
      const originalNode = rfGetNode(nodeForContextMenu.id);
      const newLabel = editingNodeProperties.label;
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeForContextMenu.id
            ? { ...n, data: { ...(originalNode?.data || {}), ...editingNodeProperties, isChainHighlighted: n.data.isChainHighlighted, statusInfo: n.data.statusInfo } }
            : n
        )
      );
      toast({ title: "属性已更新", description: `节点 "${newLabel}" 的属性已更改。` });
      onAppLog?.(`节点 "${newLabel}" (${nodeForContextMenu.id.substring(0,8)}) 属性已更新。`, 'INFO');
    }
    setIsEditPropertiesDialogOpen(false); setEditingNodeProperties(null);
  };

  const handleChangeControllerRole = (nodeId: string, role: ControllerNodeData['role']) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === nodeId && n.data?.type === 'controller'
          ? { ...n, data: { ...(n.data as ControllerNodeData), role } } : n
      )
    );
    const roleText = role === 'server' ? '服务焦点' : role === 'client' ? '客户焦点' : '通用';
    const node = rfGetNode(nodeId);
    toast({ title: "主控角色已更改", description: `主控 "${node?.data?.label}" 已设为 ${roleText}。` });
    onAppLog?.(`主控 "${node?.data?.label}" 角色已更改为 ${roleText}。`, 'INFO');
    setNodeForContextMenu(null);
  };

  const openDeleteNodeDialog = () => {
    if (nodeForContextMenu) { setNodeToDelete(nodeForContextMenu); setIsDeleteNodeDialogOpen(true); }
    setNodeForContextMenu(null); setContextMenuPosition(null);
  };

  const confirmDeleteNode = () => {
    if (nodeToDelete) {
      const deletedNodeLabel = nodeToDelete.data?.label || '未知节点';
      const deletedNodeId = nodeToDelete.id;
      setNodes((nds) => nds.filter((n) => n.id !== deletedNodeId));
      setEdges((eds) => eds.filter((e) => e.source !== deletedNodeId && e.target !== deletedNodeId));
      toast({ title: "节点已删除", description: `节点 "${deletedNodeLabel}" 已被删除。`, variant: "destructive" });
      onAppLog?.(`节点 "${deletedNodeLabel}" (${deletedNodeId.substring(0,8)}) 已删除。`, 'SUCCESS');
      if (selectedNodeForPropsPanel?.id === deletedNodeId) setSelectedNodeForPropsPanel(null);
      if (selectedChainElements?.nodes.has(deletedNodeId)) updateSelectedChain(null);
    }
    setIsDeleteNodeDialogOpen(false); setNodeToDelete(null);
  };

  const formatLayout = useCallback(async () => {
    setIsFormattingLayout(true);
    const currentNodes = rfGetNodes();
    const currentEdges = rfGetEdges();

    if (currentNodes.length === 0) {
      toast({ title: "画布为空", description: "没有可格式化的节点。" });
      setIsFormattingLayout(false);
      return;
    }
    
    onAppLog?.('开始ELK布局计算...', 'INFO');
    try {
      const { nodes: newNodesLayout, edges: newEdgesLayout } = await calculateElkLayout(currentNodes, currentEdges);
      
      setNodes(newNodesLayout);
      rfSetEdges(newEdgesLayout); 

      setTimeout(() => { fitView({ padding: 0.2, duration: 600 }); }, 100);
      toast({ title: "布局已使用ELK格式化", description: "节点已通过ELK重新排列。" });
      onAppLog?.('ELK布局计算完成，画布节点已格式化。', 'INFO');
    } catch (error) {
        console.error("ELK布局失败，回退到分层布局:", error);
        onAppLog?.('ELK布局失败，回退到默认分层布局。', 'ERROR', error instanceof Error ? error.message : String(error));
        const tieredNodes = calculateTieredLayout(currentNodes);
        setNodes(tieredNodes);
        setTimeout(() => { fitView({ padding: 0.2, duration: 600 }); }, 100);
        toast({ title: "ELK布局失败", description: "已回退到默认分层布局。" , variant: "destructive"});
    } finally {
        setIsFormattingLayout(false);
    }
  }, [rfGetNodes, rfGetEdges, setNodes, rfSetEdges, fitView, toast, onAppLog]);

  const processedNodes = useMemo(() => {
    return nodes.map(node => ({ ...node, data: { ...node.data, isChainHighlighted: selectedChainElements?.nodes.has(node.id) || false } }));
  }, [nodes, selectedChainElements]);

  const processedEdges = useMemo(() => {
    return edges.map(edge => {
      const isHighlighted = selectedChainElements?.edges.has(edge.id);
      if (isHighlighted) {
        return { ...edge, style: { ...edge.style, stroke: CHAIN_HIGHLIGHT_COLOR, strokeWidth: 2.5 }, markerEnd: { ...(edge.markerEnd as object), color: CHAIN_HIGHLIGHT_COLOR }, animated: true, zIndex: 1000 };
      } else {
        const sourceNode = rfGetNode(edge.source) as NodePassFlowNodeType | undefined;
        const targetNode = rfGetNode(edge.target) as NodePassFlowNodeType | undefined;
        const defaultColors = getEdgeStyle(sourceNode?.data?.type, targetNode?.data?.type);
        return { ...edge, style: { ...edge.style, stroke: defaultColors.stroke, strokeWidth: 1.5 }, markerEnd: { ...(edge.markerEnd as object), color: defaultColors.markerColor }, animated: false, zIndex: 1 };
      }
    });
  }, [edges, selectedChainElements, rfGetNode, getEdgeStyle]);

  const onDragStartPanelItem = (event: React.DragEvent<HTMLDivElement>, nodeType: TopologyNodeData['type'], label?: string, apiId?: string, apiName?: string) => {
    event.dataTransfer.setData('application/reactflow-nodetype', nodeType);
    event.dataTransfer.setData('application/reactflow-label', label || `${nodeType} 节点`);
    if (apiId) event.dataTransfer.setData('application/reactflow-apiid', apiId);
    if (apiName) event.dataTransfer.setData('application/reactflow-apiname', apiName);
    event.dataTransfer.effectAllowed = 'copy';
  };

  const handleSubmitTopology = () => {
    const currentAllNodes = rfGetNodes(); const currentAllEdges = rfGetEdges();
    const ops: PendingOperations = {};
    apiConfigsList.forEach(conf => { ops[conf.id] = { apiConfig: conf, urlsToCreate: [] }; });
    const processedNodeIds = new Set<string>();

    const nodesToClearStatusIds = currentAllNodes
        .filter(node => (node.data?.type === 'server' || node.data?.type === 'client') && node.data?.statusInfo)
        .map(node => node.id);

    if (nodesToClearStatusIds.length > 0) {
        setNodes(nds => nds.map(n => nodesToClearStatusIds.includes(n.id) ? { ...n, data: { ...n.data, statusInfo: '' } } : n));
    }

    currentAllNodes.forEach(node => {
      if ((node.data?.type === 'server' || node.data?.type === 'client') && !processedNodeIds.has(node.id)) {
        let managingControllerId: string | null = null;
        const nodeData = node.data as ClientNodeData | ServerNodeData;

        const controllerEdge = currentAllEdges.find(edge => edge.target === node.id && rfGetNode(edge.source)?.data?.type === 'controller');
        if (controllerEdge) {
          const controllerNode = rfGetNode(controllerEdge.source) as Node<ControllerNodeData> | undefined;
          if (controllerNode?.data?.apiId) managingControllerId = controllerNode.data.apiId;
        } 
        else if (nodeData.type === 'client' && (nodeData as ClientNodeData).managingApiId) {
          managingControllerId = (nodeData as ClientNodeData).managingApiId!;
        } 
        else if (nodeData.type === 'client') { 
          const connectedServerEdge = currentAllEdges.find(edge =>
            (edge.source === node.id && rfGetNode(edge.target)?.data?.type === 'server') ||
            (edge.target === node.id && rfGetNode(edge.source)?.data?.type === 'server')
          );
          if (connectedServerEdge) {
            const serverNodeId = rfGetNode(connectedServerEdge.source)?.data?.type === 'server' ? connectedServerEdge.source : connectedServerEdge.target;
            const serverNode = rfGetNode(serverNodeId) as Node<ServerNodeData> | undefined;
            if (serverNode?.data) {
              const serverControllerEdge = currentAllEdges.find(edge => edge.target === serverNode.id && rfGetNode(edge.source)?.data?.type === 'controller');
              if (serverControllerEdge) {
                const controllerNode = rfGetNode(serverControllerEdge.source) as Node<ControllerNodeData> | undefined;
                if (controllerNode?.data?.apiId) managingControllerId = controllerNode.data.apiId;
              }
            }
          }
        }

        if (managingControllerId && ops[managingControllerId]) {
          const url = buildNodePassUrlFromNode(node as Node<ServerNodeData | ClientNodeData>, currentAllNodes, currentAllEdges);
          if (url) {
            if (!ops[managingControllerId].urlsToCreate.some(op => op.originalNodeId === node.id)) {
              ops[managingControllerId].urlsToCreate.push({ originalNodeId: node.id, url });
              processedNodeIds.add(node.id);
            }
          } else onAppLog?.(`无法为节点 "${nodeData.label}" (${node.id.substring(0,8)}) 生成URL。跳过创建。`, 'WARNING');
        } else if (managingControllerId && !ops[managingControllerId]) {
          onAppLog?.(`尝试为节点 "${nodeData.label}" 分配到主控 ${managingControllerId}，但该主控不在ops中。`, 'ERROR');
        } else if (nodeData.type === 'client' && !managingControllerId) {
          onAppLog?.(`节点 "${nodeData.label}" (${node.id.substring(0,8)}) 未连接到任何主控或通过受管服务器连接。跳过。`, 'WARNING');
        }
      }
    });

    const finalOps: PendingOperations = {};
    for (const apiIdKey in ops) { if (ops[apiIdKey].urlsToCreate.length > 0) finalOps[apiIdKey] = ops[apiIdKey]; }
    const totalUrls = Object.values(finalOps).reduce((sum, group) => sum + group.urlsToCreate.length, 0);
    if (totalUrls === 0) {
      toast({ title: "无需提交", description: "未在画布中检测到可创建的实例链路。" });
      onAppLog?.('尝试提交拓扑: 无可创建的实例。', 'INFO'); return;
    }
    setPendingOperations(finalOps); setIsSubmitModalOpen(true);
    onAppLog?.(`准备提交拓扑: ${totalUrls} 个实例待创建。`, 'INFO', finalOps);
  };

  const createInstanceMutation = useMutation({
    mutationFn: (params: { data: CreateInstanceRequest, apiRoot: string, token: string, originalNodeId: string, apiName: string }) => {
      const validatedApiData = createInstanceApiSchema.parse(params.data);
      return nodePassApi.createInstance(validatedApiData, params.apiRoot, params.token);
    },
    onSuccess: (createdInstance, variables) => {
      const shortUrl = variables.data.url.length > 40 ? variables.data.url.substring(0,37) + "..." : variables.data.url;
      toast({ title: `实例已创建 (${variables.apiName})`, description: `画布节点 ${variables.originalNodeId.substring(0,8)}... (URL: ${shortUrl}) -> API实例ID: ${createdInstance.id.substring(0,8)}...` });
      onAppLog?.(`画布实例 ${variables.originalNodeId.substring(0,8)}... 创建成功 (主控: ${variables.apiName}) -> ${createdInstance.type} ${createdInstance.id.substring(0,8)}... (URL: ${shortUrl})`, 'SUCCESS');
      setNodes((nds) => nds.map((n) => n.id === variables.originalNodeId ? { ...n, data: { ...n.data, statusInfo: `已提交 (ID: ${createdInstance.id.substring(0,8)}...)` } } : n ));
    },
    onError: (error: any, variables) => {
      const shortUrl = variables.data.url.length > 40 ? variables.data.url.substring(0,37) + "..." : variables.data.url;
      toast({ title: `创建实例 ${variables.originalNodeId.substring(0,8)}... 出错 (${variables.apiName})`, description: `创建 (URL: ${shortUrl}) 失败: ${error.message || '未知错误。'}`, variant: 'destructive' });
      onAppLog?.(`画布实例 ${variables.originalNodeId.substring(0,8)}... 创建失败 (主控: ${variables.apiName}, URL: ${shortUrl}) - ${error.message || '未知错误'}`, 'ERROR');
      setNodes((nds) => nds.map((n) => n.id === variables.originalNodeId ? { ...n, data: { ...n.data, statusInfo: `提交失败` } } : n ));
    },
  });

  const handleConfirmSubmitTopology = async () => {
    setIsSubmittingTopology(true); const allSubmissionPromises: Promise<any>[] = [];
    let successCount = 0; let errorCount = 0;
    const nodesToUpdateStatus = Object.values(pendingOperations).flatMap(group => group.urlsToCreate).map(({ originalNodeId }) => originalNodeId);
    if (nodesToUpdateStatus.length > 0) {
      setNodes(nds => nds.map(n => nodesToUpdateStatus.includes(n.id) ? { ...n, data: { ...n.data, statusInfo: '处理中...' } } : n ));
    }

    for (const apiIdKey in pendingOperations) {
      const opGroup = pendingOperations[apiIdKey]; const { apiConfig, urlsToCreate } = opGroup;
      const currentApiRoot = getApiRootUrl(apiConfig.id); const currentToken = getToken(apiConfig.id);
      if (!currentApiRoot || !currentToken) {
        toast({ title: "错误", description: `主控 "${apiConfig.name}" 配置无效，跳过此主控的所有操作。`, variant: "destructive" });
        onAppLog?.(`提交拓扑时主控 "${apiConfig.name}" 配置无效，跳过。`, 'ERROR'); errorCount += urlsToCreate.length;
        urlsToCreate.forEach(({ originalNodeId }) => {
          setNodes((nds) => nds.map((n) => n.id === originalNodeId ? { ...n, data: { ...n.data, statusInfo: '主控配置错误' } } : n ));
        });
        continue;
      }
      for (const { originalNodeId, url } of urlsToCreate) {
        const promise = createInstanceMutation.mutateAsync({ data: { url }, apiRoot: currentApiRoot, token: currentToken, originalNodeId, apiName: apiConfig.name })
          .then(() => { successCount++; }).catch(() => { errorCount++; });
        allSubmissionPromises.push(promise);
      }
    }
    await Promise.allSettled(allSubmissionPromises);
    setIsSubmittingTopology(false); setPendingOperations({}); setIsSubmitModalOpen(false);
    toast({ title: "拓扑提交处理完成", description: `${successCount} 个实例创建成功, ${errorCount} 个实例创建失败或被跳过。`, variant: errorCount > 0 ? "destructive" : "default", duration: errorCount > 0 ? 8000 : 5000 });
    onAppLog?.(`拓扑提交处理完成: ${successCount} 成功, ${errorCount} 失败/跳过。`, errorCount > 0 ? 'ERROR' : 'SUCCESS');
    queryClient.invalidateQueries({ queryKey: ['instances'] });
    queryClient.invalidateQueries({ queryKey: ['allInstancesForTraffic'] });
  };

  if (isLoadingApiConfig) {
    return (
      <AppLayout onLog={onAppLog}>
        <div className="flex-grow container mx-auto px-4 py-8 flex items-center justify-center h-[calc(100vh-var(--header-height)-var(--footer-height)-4rem)]">
          <Loader2 className="h-12 w-12 animate-spin text-primary" /> <p className="ml-4 text-lg font-sans">加载主控配置...</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout onLog={onAppLog}>
      <div className="flex flex-col h-full">
        <TopologyControlBar
          onFitView={() => fitView({ duration: 600 })}
          onFormatLayout={formatLayout}
          onRefreshData={() => refetchInstances()}
          onSubmitTopology={handleSubmitTopology}
          onClearCanvas={() => setIsClearCanvasAlertOpen(true)}
          isLoadingData={isLoadingInstances || isFormattingLayout}
          lastRefreshed={lastRefreshed}
        />

        {fetchErrorGlobal && (
          <div className="mb-4 p-4 border border-destructive bg-destructive/10 rounded-md text-destructive text-sm font-sans flex items-center">
            <AlertTriangle size={18} className="mr-2" />部分数据加载失败: {fetchErrorGlobal.message}
          </div>
        )}

        <div className="flex-grow flex flex-row gap-4 overflow-hidden">
          <div className="w-60 flex-shrink-0 flex flex-col gap-4">
            <DraggablePanels apiConfigsList={apiConfigsList} onDragStartPanelItem={onDragStartPanelItem} />
            <PropertiesDisplayPanel selectedNode={selectedNodeForPropsPanel} />
          </div>

          <div ref={reactFlowWrapper} className="flex-grow border rounded-lg shadow-md bg-background/80 backdrop-blur-sm relative h-full" onDrop={onDrop} onDragOver={onDragOver}>
            <ReactFlow
              nodes={processedNodes} edges={processedEdges}
              onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
              onNodeClick={handleNodeClick} onPaneClick={handlePaneClick}
              onNodeContextMenu={handleNodeContextMenu} onEdgeContextMenu={handleEdgeContextMenu}
              fitView fitViewOptions={{ padding: 0.2, minZoom: 0.5, maxZoom: 2.5 }}
              proOptions={{ hideAttribution: true }} className="bg-card"
              defaultViewport={initialViewport} nodeTypes={nodeTypes}
              nodesDraggable={true} nodesConnectable={true} zoomOnScroll={true} panOnScroll={false} panOnDrag={true} preventScrolling={true}
            >
              <Background gap={16} />
            </ReactFlow>
             {isFormattingLayout && (
                <div className="absolute inset-0 bg-background/50 backdrop-blur-sm flex items-center justify-center z-20">
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                    <p className="ml-3 text-sm font-sans">格式化布局中...</p>
                </div>
            )}
          </div>
        </div>

        {nodeForContextMenu && contextMenuPosition && (
          <DropdownMenu open={!!nodeForContextMenu} onOpenChange={(isOpen) => !isOpen && setNodeForContextMenu(null)}>
            <DropdownMenuTrigger style={{ position: 'fixed', left: contextMenuPosition.x, top: contextMenuPosition.y }} />
            <DropdownMenuContent align="start" className="w-48 font-sans">
              <DropdownMenuItem onClick={openEditPropertiesDialog}><Edit3 className="mr-2 h-4 w-4" />编辑属性</DropdownMenuItem>
              {nodeForContextMenu.data?.type === 'controller' && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger><Settings2 className="mr-2 h-4 w-4" />更改角色</DropdownMenuSubTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuSubContent>
                      <DropdownMenuItem onClick={() => handleChangeControllerRole(nodeForContextMenu.id, 'server')}><Target className="mr-2 h-4 w-4" />服务焦点</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleChangeControllerRole(nodeForContextMenu.id, 'client')}><Users className="mr-2 h-4 w-4" />客户焦点</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleChangeControllerRole(nodeForContextMenu.id, 'general')}><Settings2 className="mr-2 h-4 w-4" />通用</DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuPortal>
                </DropdownMenuSub>
              )}
              <DropdownMenuItem onClick={openDeleteNodeDialog} className="text-destructive hover:!text-destructive focus:!text-destructive"><Trash2 className="mr-2 h-4 w-4" />删除节点</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {edgeForContextMenu && edgeContextMenuPosition && (
          <DropdownMenu open={!!edgeForContextMenu} onOpenChange={(isOpen) => !isOpen && setEdgeForContextMenu(null)}>
            <DropdownMenuTrigger style={{ position: 'fixed', left: edgeContextMenuPosition.x, top: edgeContextMenuPosition.y }} />
            <DropdownMenuContent align="start" className="w-48 font-sans">
              <DropdownMenuItem onClick={deleteEdgeDirectly} className="text-destructive hover:!text-destructive focus:!text-destructive"><Unlink className="mr-2 h-4 w-4" />删除链路</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <Dialog open={isEditPropertiesDialogOpen} onOpenChange={setIsEditPropertiesDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <ShadDialogTitleFromDialog className="font-title">编辑节点 {editingNodeProperties?.type === 'controller' ? ` "${(editingNodeProperties as ControllerNodeData).apiName}" 基础名称` : `属性: ${editingNodeProperties?.label}`}</ShadDialogTitleFromDialog>
              {editingNodeProperties?.type === 'landing' && <ShadDialogDescriptionFromDialog className="font-sans text-xs">对于“落地”节点, “标签 (名称)”字段将作为其标识名称。</ShadDialogDescriptionFromDialog>}
              {editingNodeProperties?.type === 'controller' && <ShadDialogDescriptionFromDialog className="font-sans text-xs">修改主控的基础名称。角色通过右键菜单更改。</ShadDialogDescriptionFromDialog>}
            </DialogHeader>
            {editingNodeProperties && (
            <div className="py-2 space-y-3 max-h-[60vh] overflow-y-auto pr-2">
              <div className="space-y-1">
                <Label htmlFor="node-label-input" className="font-sans">{editingNodeProperties.type === 'controller' ? '基础名称' : '标签 (名称)'}</Label>
                <Input id="node-label-input" value={editingNodeProperties.label || ''} onChange={(e) => setEditingNodeProperties(prev => prev ? ({ ...prev, label: e.target.value }) : null)} className="font-sans" autoFocus />
              </div>
              {editingNodeProperties.type === 'server' && (
                <>
                  <div className="space-y-1"><Label htmlFor="server-tunnel" className="font-sans">隧道监听地址</Label><Input id="server-tunnel" value={(editingNodeProperties as ServerNodeData).tunnelAddress || ''} onChange={(e) => setEditingNodeProperties(prev => prev ? ({ ...prev, tunnelAddress: e.target.value }) as ServerNodeData : null)} className="font-mono text-sm" placeholder="0.0.0.0:10001"/></div>
                  <div className="space-y-1"><Label htmlFor="server-target" className="font-sans">流量转发地址</Label><Input id="server-target" value={(editingNodeProperties as ServerNodeData).targetAddress || ''} onChange={(e) => setEditingNodeProperties(prev => prev ? ({ ...prev, targetAddress: e.target.value }) as ServerNodeData : null)} className="font-mono text-sm" placeholder="0.0.0.0:8080"/></div>
                  <div className="space-y-1"><Label htmlFor="server-log" className="font-sans">日志级别</Label><Select value={(editingNodeProperties as ServerNodeData).logLevel || 'info'} onValueChange={(v) => setEditingNodeProperties(prev => prev ? ({ ...prev, logLevel: v as ServerNodeData['logLevel'] }) as ServerNodeData : null)}><SelectTrigger className="font-sans text-sm"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="master">主控默认</SelectItem><SelectItem value="debug">Debug</SelectItem><SelectItem value="info">Info</SelectItem><SelectItem value="warn">Warn</SelectItem><SelectItem value="error">Error</SelectItem><SelectItem value="fatal">Fatal</SelectItem></SelectContent></Select></div>
                  <div className="space-y-1"><Label htmlFor="server-tls" className="font-sans">TLS 模式</Label><Select value={(editingNodeProperties as ServerNodeData).tlsMode || '1'} onValueChange={(v) => setEditingNodeProperties(prev => prev ? ({ ...prev, tlsMode: v as ServerNodeData['tlsMode'] }) as ServerNodeData : null)}><SelectTrigger className="font-sans text-sm"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="master">主控默认</SelectItem><SelectItem value="0">0: 无TLS</SelectItem><SelectItem value="1">1: 自签名</SelectItem><SelectItem value="2">2: 自定义</SelectItem></SelectContent></Select></div>
                  {(editingNodeProperties as ServerNodeData).tlsMode === '2' && (<>
                    <div className="space-y-1"><Label htmlFor="server-crt" className="font-sans">证书路径 (crt)</Label><Input id="server-crt" value={(editingNodeProperties as ServerNodeData).crtPath || ''} onChange={(e) => setEditingNodeProperties(prev => prev ? ({ ...prev, crtPath: e.target.value }) as ServerNodeData : null)} className="font-mono text-sm" placeholder="/path/to/cert.pem"/></div>
                    <div className="space-y-1"><Label htmlFor="server-key" className="font-sans">密钥路径 (key)</Label><Input id="server-key" value={(editingNodeProperties as ServerNodeData).keyPath || ''} onChange={(e) => setEditingNodeProperties(prev => prev ? ({ ...prev, keyPath: e.target.value }) as ServerNodeData : null)} className="font-mono text-sm" placeholder="/path/to/key.pem"/></div>
                  </>)}
                </>
              )}
              {editingNodeProperties.type === 'client' && (
                 <>
                  <div className="space-y-1"><Label htmlFor="client-tunnel" className="font-sans">服务端隧道地址</Label><Input id="client-tunnel" value={(editingNodeProperties as ClientNodeData).tunnelAddress || ''} onChange={(e) => setEditingNodeProperties(prev => prev ? ({ ...prev, tunnelAddress: e.target.value }) as ClientNodeData : null)} className="font-mono text-sm" placeholder="your.server.com:10001"/></div>
                  <div className="space-y-1"><Label htmlFor="client-target" className="font-sans">本地转发地址</Label><Input id="client-target" value={(editingNodeProperties as ClientNodeData).targetAddress || ''} onChange={(e) => setEditingNodeProperties(prev => prev ? ({ ...prev, targetAddress: e.target.value }) as ClientNodeData : null)} className="font-mono text-sm" placeholder="127.0.0.1:8000"/></div>
                  <div className="space-y-1"><Label htmlFor="client-log" className="font-sans">日志级别</Label><Select value={(editingNodeProperties as ClientNodeData).logLevel || 'info'} onValueChange={(v) => setEditingNodeProperties(prev => prev ? ({ ...prev, logLevel: v as ClientNodeData['logLevel'] }) as ClientNodeData : null)}><SelectTrigger className="font-sans text-sm"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="master">主控默认</SelectItem><SelectItem value="debug">Debug</SelectItem><SelectItem value="info">Info</SelectItem><SelectItem value="warn">Warn</SelectItem><SelectItem value="error">Error</SelectItem><SelectItem value="fatal">Fatal</SelectItem></SelectContent></Select></div>
                  {(editingNodeProperties as ClientNodeData).managingApiName && <div className="text-xs text-muted-foreground pt-2">此客户端由主控 "{(editingNodeProperties as ClientNodeData).managingApiName}" 管理。</div>}
                </>
              )}
              {editingNodeProperties.type === 'landing' && (
                 <>
                  <div className="space-y-1"><Label htmlFor="landing-ip" className="font-sans">IP 地址</Label><Input id="landing-ip" value={(editingNodeProperties as LandingNodeData).landingIp || ''} onChange={(e) => setEditingNodeProperties(prev => prev ? ({ ...prev, landingIp: e.target.value }) as LandingNodeData : null)} className="font-mono text-sm" placeholder="192.168.1.100"/></div>
                  <div className="space-y-1"><Label htmlFor="landing-port" className="font-sans">端口</Label><Input id="landing-port" value={(editingNodeProperties as LandingNodeData).landingPort || ''} onChange={(e) => setEditingNodeProperties(prev => prev ? ({ ...prev, landingPort: e.target.value }) as LandingNodeData : null)} className="font-mono text-sm" placeholder="80"/></div>
                </>
              )}
              {editingNodeProperties.type === 'user' && <div className="space-y-1"><Label htmlFor="user-desc" className="font-sans">描述</Label><Input id="user-desc" value={(editingNodeProperties as UserNodeData).description || ''} onChange={(e) => setEditingNodeProperties(prev => prev ? ({ ...prev, description: e.target.value }) as UserNodeData : null)} className="font-sans text-sm" placeholder="用户流量描述"/></div>}
            </div>
            )}
            <DialogFooter>
              <DialogClose asChild><Button type="button" variant="outline" className="font-sans" onClick={() => setEditingNodeProperties(null)}>取消</Button></DialogClose>
              <Button onClick={handleSaveNodeProperties} className="font-sans" disabled={!editingNodeProperties}>保存更改</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={isDeleteNodeDialogOpen} onOpenChange={(isOpen) => { setIsDeleteNodeDialogOpen(isOpen); if (!isOpen) setNodeToDelete(null); }}>
            <AlertDialogContent>
                <AlertDialogHeader><ShadAlertDialogTitle className="font-title">确认删除节点</ShadAlertDialogTitle><ShadAlertDialogDescription className="font-sans">您确定要删除节点 “{nodeToDelete?.data?.label}” 及其所有连接吗？此操作无法撤销。</ShadAlertDialogDescription></AlertDialogHeader>
                <AlertDialogFooter><AlertDialogCancel onClick={() => { setIsDeleteNodeDialogOpen(false); setNodeToDelete(null);}} className="font-sans">取消</AlertDialogCancel><AlertDialogAction onClick={confirmDeleteNode} className="bg-destructive hover:bg-destructive/90 font-sans text-destructive-foreground"><Trash2 className="mr-2 h-4 w-4"/> 删除节点</AlertDialogAction></AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={isClearCanvasAlertOpen} onOpenChange={setIsClearCanvasAlertOpen}>
            <AlertDialogContent>
                <AlertDialogHeader><ShadAlertDialogTitle className="font-title">确认清空画布</ShadAlertDialogTitle><ShadAlertDialogDescription className="font-sans">您确定要删除画布上所有的节点和连接吗？此操作无法撤销。</ShadAlertDialogDescription></AlertDialogHeader>
                <AlertDialogFooter><AlertDialogCancel onClick={() => setIsClearCanvasAlertOpen(false)} className="font-sans">取消</AlertDialogCancel><AlertDialogAction onClick={clearCanvas} className="bg-destructive hover:bg-destructive/90 font-sans text-destructive-foreground"><Eraser className="mr-2 h-4 w-4"/> 清空画布</AlertDialogAction></AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

        <SubmitTopologyDialog
            isOpen={isSubmitModalOpen}
            onOpenChange={setIsSubmitModalOpen}
            pendingOperations={pendingOperations}
            isSubmitting={isSubmittingTopology}
            onConfirmSubmit={handleConfirmSubmitTopology}
        />
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
