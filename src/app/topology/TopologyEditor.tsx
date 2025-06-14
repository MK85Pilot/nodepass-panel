
'use client';

import React, { useCallback, useState, useEffect, useMemo, useRef } from 'react';
import {
  useNodesState,
  useEdgesState,
  addEdge,
  MarkerType,
  useReactFlow,
  type Connection,
  type Edge,
} from 'reactflow';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Server, DatabaseZap, Cable, UserCircle2 as User, Globe, Cog, ListTree, Puzzle, Info as InfoIcon } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

import { TopologyCanvasWrapper } from './TopologyCanvas';
import { MastersPalette } from './components/MastersPalette';
import { ComponentsPalette, type DraggableNodeType } from './components/ComponentsPalette';
import { PropertiesDisplayPanel } from './components/PropertiesDisplayPanel';
import type { NamedApiConfig } from '@/hooks/use-api-key';
import { useApiConfig } from '@/hooks/use-api-key';
import { useToast } from '@/hooks/use-toast';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { nodePassApi, type Instance as ApiInstanceType, getEventsUrl } from '@/lib/api';
import { buildUrlFromFormValues, type BuildUrlParams } from '@/components/nodepass/create-instance-dialog/utils';
import { extractPort, extractHostname, formatHostForDisplay, isWildcardHostname, formatHostForUrl, parseNodePassUrl } from '@/lib/url-utils';
import { SubmitTopologyConfirmationDialog, type InstanceUrlConfigWithName } from './components/SubmitTopologyConfirmationDialog';
import { EditTopologyNodeDialog } from './components/EditTopologyNodeDialog';

import type { Node, CustomNodeData, NodeRole, TopologyContextMenu } from './topologyTypes';
import { CARD_NODE_WIDTH, CARD_NODE_HEIGHT, M_NODE_FOR_LINK_WIDTH, M_NODE_FOR_LINK_HEIGHT, nodeStyles } from './NodeRenderer';
import { getEffectiveServerMasterConfig, calculateClientTunnelAddressForServer } from './topologyLogic';

const initialNodes: Node[] = [];
const initialEdges: Edge[] = [];

const DEFAULT_MASTER_NODE_WIDTH = 300;
const DEFAULT_MASTER_NODE_HEIGHT = 200;
const MIN_MASTER_NODE_HEIGHT = 150;


export function TopologyEditor() {
  const [nodesInternal, setNodesInternal, onNodesChangeInternal] = useNodesState<Node>(initialNodes);
  const [edgesInternal, setEdgesInternal, onEdgesChangeInternal] = useEdgesState(initialEdges);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [nodeIdCounter, setNodeIdCounter] = useState(0);
  const { toast } = useToast();
  const reactFlowWrapperRef = useRef<HTMLDivElement>(null);
  const { deleteElements, fitView } = useReactFlow();
  const [contextMenu, setContextMenu] = useState<TopologyContextMenu | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const { apiConfigsList, getApiConfigById, getApiRootUrl, getToken, activeApiConfig } = useApiConfig();
  const queryClient = useQueryClient();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitConfirmOpen, setIsSubmitConfirmOpen] = useState(false);
  const [instancesForConfirmation, setInstancesForConfirmation] = useState<InstanceUrlConfigWithName[]>([]);
  const [isEditNodeDialogOpen, setIsEditNodeDialogOpen] = useState(false);
  const [editingNodeContext, setEditingNodeContext] = useState<{ node: Node; hasS: boolean } | null>(null);
  
  const sseHandshakeAbortControllerRef = useRef<AbortController | null>(null);
  const handshakeLogRegex = /Tunnel handshaked:.*?in\s+(\d+)\s*ms/i;


  const getNodeById = useCallback((id: string): Node | undefined => nodesInternal.find((n) => n.id === id), [nodesInternal]);

  const createInstanceMutation = useMutation({
    mutationFn: (params: { data: { url: string }, useApiRoot: string, useApiToken: string, originalNodeId: string }) => {
      return nodePassApi.createInstance(params.data, params.useApiRoot, params.useApiToken);
    },
    onMutate: (variables) => {
      setNodesInternal(nds => nds.map(n => {
        if (n.id === variables.originalNodeId) {
          return { ...n, data: { ...n.data, submissionStatus: 'pending', submissionMessage: '提交中...' } };
        }
        return n;
      }));
    },
    onSuccess: (createdInstance, variables) => {
      toast({ title: `实例创建请求成功`, description: `节点 ${variables.originalNodeId.substring(0,8)}... -> ID: ${createdInstance.id.substring(0,8)}...` });
      setNodesInternal(nds => nds.map(n => {
         if (n.id === variables.originalNodeId) {
            let message = `ID: ${createdInstance.id.substring(0,8)}...`;
            if (n.data.role === 'M' && n.data.submissionMessage && n.data.submissionMessage.startsWith('ID:')) {
                message = `${n.data.submissionMessage}, ${message}`;
            }
            return { ...n, data: { ...n.data, submissionStatus: 'success', submissionMessage: message, originalInstanceId: createdInstance.id, originalInstanceUrl: variables.data.url } };
        }
        return n;
      }));
      const submittedInstanceInfo = instancesForConfirmation.find(inst => inst.nodeId === variables.originalNodeId && inst.url === variables.data.url);
      if (submittedInstanceInfo) {
        queryClient.invalidateQueries({ queryKey: ['instances', submittedInstanceInfo.masterId]});
        queryClient.invalidateQueries({ queryKey: ['masterInstancesCount', submittedInstanceInfo.masterId]});
      } else {
         const masterIdForInvalidation = getNodeById(variables.originalNodeId)?.data.masterId;
         if (masterIdForInvalidation) {
           queryClient.invalidateQueries({ queryKey: ['instances', masterIdForInvalidation]});
           queryClient.invalidateQueries({ queryKey: ['masterInstancesCount', masterIdForInvalidation]});
         }
      }
      queryClient.invalidateQueries({ queryKey: ['allInstancesForTopologyPage']});
      queryClient.invalidateQueries({ queryKey: ['allInstancesForTraffic']});
    },
    onError: (error: any, variables) => {
      toast({ title: `创建实例失败 (节点 ${variables.originalNodeId.substring(0,8)}...)`, description: error.message || '未知错误', variant: 'destructive' });
      setNodesInternal(nds => nds.map(n => {
        if (n.id === variables.originalNodeId) {
           let message = error.message.substring(0,30) || '失败';
            if (n.data.role === 'M' && n.data.submissionMessage && n.data.submissionMessage.startsWith('ID:')) {
                message = `${n.data.submissionMessage}, 另一部分: ${message}`;
            }
           return { ...n, data: { ...n.data, submissionStatus: 'error', submissionMessage: message } };
        }
        return n;
      }));
    },
  });

  const onConnect = useCallback(
    (params: Connection | Edge) => {
      const sourceNode = getNodeById(params.source!);
      const targetNode = getNodeById(params.target!);

      if (!sourceNode || !targetNode) {
        toast({ title: '连接错误', description: '源节点或目标节点未找到。', variant: 'destructive' });
        return;
      }
      if (params.source === params.target) {
        toast({ title: '连接无效', description: '节点不能连接到自身。', variant: 'destructive' });
        return;
      }
      if (edgesInternal.some(edge => (edge.source === params.source && edge.target === params.target) || (edge.source === params.target && edge.target === params.source))) {
        toast({ title: '连接已存在', description: '这两个节点之间已经存在一条连接。', variant: 'destructive' });
        return;
      }

      if (targetNode.data.role === 'U') {
        toast({ title: '连接无效', description: '用户端 (U) 节点不能被其他节点链接。', variant: 'destructive' });
        return;
      }
       if (sourceNode.data.role === 'U' && targetNode.data.role !== 'M' && targetNode.data.role !== 'C') {
        toast({ title: '连接无效', description: '用户端 (U) 节点只能链接到主控 (M) 或 入口(c) 节点。', variant: 'destructive' });
        return;
      }

      if (sourceNode.data.role === 'T') {
        toast({ title: '连接无效', description: '落地 (T) 节点不能作为连接的起点。', variant: 'destructive' });
        return;
      }
      
      if (sourceNode.data.role === 'C' && sourceNode.data.isSingleEndedForwardC && targetNode.data.role === 'S' && sourceNode.data.parentNode === targetNode.data.parentNode) {
        toast({ title: '连接无效', description: '单端转发模式的入口(c)不能连接到同一主控内的出口(s)。', variant: 'destructive' });
        return;
      }

      if (targetNode.data.role === 'T') {
        const sourceIsConnectableToT = sourceNode.data.role === 'S' || sourceNode.data.role === 'C' || (sourceNode.data.role === 'M' && sourceNode.data.masterSubRole === 'client-role');
        if (!sourceIsConnectableToT) {
            toast({ title: '连接无效', description: '落地 (T) 节点只能被主控 (客户隧道角色), 出口(s), 或 入口(c) 节点链接。', variant: 'destructive' });
            return;
        }
      }

      const sourceParentId = sourceNode.data.parentNode;
      const targetParentId = targetNode.data.parentNode;
      const isInternalConnection = sourceParentId && targetParentId && sourceParentId === targetParentId;

      if (isInternalConnection && !(sourceNode.data.role === 'C' && !sourceNode.data.isSingleEndedForwardC && targetNode.data.role === 'S')) {
         toast({ title: '连接无效', description: '在主控容器内，只允许从非单端转发模式的入口(c)连接到出口(s)。', variant: 'destructive' });
         return;
      }

      const newEdge = {
        ...params,
        id: `edge-${uuidv4()}`, 
        animated: true,
        style: { strokeDasharray: '5 5' },
        type: isInternalConnection ? 'step' : 'smoothstep',
        markerEnd: { type: MarkerType.ArrowClosed },
      };

      setEdgesInternal((eds) => addEdge(newEdge, eds));
      let updatedNodes = [...nodesInternal];

      if (sourceNode.data.role === 'C' && !sourceNode.data.isSingleEndedForwardC && targetNode.data.role === 'S') {
        const clientNode = sourceNode;
        const serverNode = targetNode;

        const effectiveServerMasterCfg = getEffectiveServerMasterConfig(serverNode.data, getNodeById, getApiConfigById);
        const newClientTunnelAddress = calculateClientTunnelAddressForServer(serverNode.data, effectiveServerMasterCfg);

        let clientLocalTargetPort = extractPort(clientNode.data.targetAddress || "");
        if (!clientLocalTargetPort) {
            const serverListenPortNum = parseInt(extractPort(serverNode.data.tunnelAddress || "") || "0", 10);
            if (serverListenPortNum > 0) {
                clientLocalTargetPort = (serverListenPortNum + 1).toString();
            }
        }
        const clientLocalTargetHost = extractHostname(clientNode.data.targetAddress || "") || "[::]";
        const newClientTargetAddress = clientLocalTargetPort ? `${formatHostForDisplay(clientLocalTargetHost)}:${clientLocalTargetPort}` : clientNode.data.targetAddress;

        updatedNodes = updatedNodes.map(n => {
            if (n.id === clientNode.id) {
                return { ...n, data: { ...n.data, tunnelAddress: newClientTunnelAddress, targetAddress: newClientTargetAddress } };
            }
            return n;
        });
        if (newClientTunnelAddress !== clientNode.data.tunnelAddress || newClientTargetAddress !== clientNode.data.targetAddress) {
          toast({ title: "入口(c) 地址已更新", description: `入口(c) ${clientNode.data.label} 已自动配置连接到 出口(s) ${serverNode.data.label}。`});
        }
      }

      const sourceIsConnectableToTForSync = sourceNode.data.role === 'S' || sourceNode.data.role === 'C' || (sourceNode.data.role === 'M' && sourceNode.data.masterSubRole === 'client-role');
      if (sourceIsConnectableToTForSync && targetNode.data.role === 'T') {
        const scOrMNode = sourceNode;
        const tNode = targetNode;
        let tNodeUpdated = false;
        let scOrMNodeUpdated = false;

        const sourceTargetAddr = scOrMNode.data.targetAddress;

        if (sourceTargetAddr && sourceTargetAddr.trim() !== "" && sourceTargetAddr !== tNode.data.targetAddress) {
          updatedNodes = updatedNodes.map(n =>
            n.id === tNode.id ? { ...n, data: { ...n.data, targetAddress: sourceTargetAddr } } : n
          );
          tNodeUpdated = true;
        } else if (tNode.data.targetAddress && tNode.data.targetAddress.trim() !== "" && tNode.data.targetAddress !== sourceTargetAddr) {
          updatedNodes = updatedNodes.map(n =>
            n.id === scOrMNode.id ? { ...n, data: { ...n.data, targetAddress: tNode.data.targetAddress } } : n
          );
          scOrMNodeUpdated = true;
        }
        if (tNodeUpdated) toast({ title: `落地 ${tNode.data.label} 已同步上游目标地址。`});
        if (scOrMNodeUpdated) toast({ title: `${scOrMNode.data.label} 已同步落地目标地址。`});
      }
      setNodesInternal(updatedNodes);
    },
    [edgesInternal, setEdgesInternal, toast, getNodeById, setNodesInternal, nodesInternal, getApiConfigById]
  );

  const onSelectionChange = useCallback(({ nodes: selectedNodesList }: { nodes: Node[]; edges: Edge[] }) => {
    setSelectedNode(selectedNodesList.length === 1 ? selectedNodesList[0] : null);
    if (selectedNodesList.length !== 1) setContextMenu(null);
  }, []);

  const onNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
    event.preventDefault();
    const bounds = editorContainerRef.current?.getBoundingClientRect();
    const top = event.clientY - (bounds?.top || 0);
    const left = event.clientX - (bounds?.left || 0);
    setContextMenu({ id: node.id, type: 'node', top, left, data: node });
  }, [setContextMenu]);

  const onEdgeContextMenu = useCallback((event: React.MouseEvent, edge: Edge) => {
    event.preventDefault();
    const bounds = editorContainerRef.current?.getBoundingClientRect();
    const top = event.clientY - (bounds?.top || 0);
    const left = event.clientX - (bounds?.left || 0);
    setContextMenu({ id: edge.id, type: 'edge', top, left, data: edge });
  }, [setContextMenu]);

  const onPaneClick = useCallback(() => setContextMenu(null), [setContextMenu]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as HTMLElement)) setContextMenu(null);
    };
    if (contextMenu) document.addEventListener('mousedown', handleClickOutside);
    else document.removeEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [contextMenu]);

  const handleNodeDroppedOnCanvas = useCallback((
      type: DraggableNodeType | 'master',
      position: { x: number; y: number },
      draggedData?: NamedApiConfig
  ) => {
      let currentCounter = nodeIdCounter;
      let newNodesList: Node[] = [];
      let newEdgesList: Edge[] = [];
      let nodesToFit: { id: string }[] | null = null;

      const mNodeWidth = 300, mNodeHeight = 200;

      const parentMContainer = nodesInternal.find(n => {
          if (n.data.role !== 'M' || !n.data.isContainer) return false;
          const { x: nodeX, y: nodeY } = n.position;
          const nodeWidth = n.width ?? 0;
          const nodeHeight = n.height ?? 0;
          return (position.x >= nodeX && position.x <= nodeX + nodeWidth && position.y >= nodeY && position.y <= nodeY + nodeHeight);
      });

      if (type === 'master' && draggedData) {
          if (parentMContainer) {
              const sNodeId = `s-from-master-${draggedData.id.substring(0, 8)}-${uuidv4().substring(0,4)}`;
              const relativePosition = { x: position.x - parentMContainer.position.x - (CARD_NODE_WIDTH / 2), y: position.y - parentMContainer.position.y - (CARD_NODE_HEIGHT / 2) };
              const sNode: Node = {
                  id: sNodeId, type: 'cardNode', position: relativePosition, parentNode: parentMContainer.id, extent: 'parent',
                  data: {
                      label: `出口(s): ${draggedData.name}`, role: 'S', icon: Server, parentNode: parentMContainer.id,
                      representedMasterId: draggedData.id, representedMasterName: draggedData.name,
                      tunnelAddress: `[::]:${10000 + ++currentCounter}`,
                      targetAddress: `127.0.0.1:${3000 + currentCounter}`,
                      logLevel: draggedData.masterDefaultLogLevel || parentMContainer.data.defaultLogLevel || 'master',
                      tlsMode: draggedData.masterDefaultTlsMode || parentMContainer.data.defaultTlsMode || 'master',
                  },
                  width: CARD_NODE_WIDTH, height: CARD_NODE_HEIGHT,
              };
              newNodesList.push(sNode);
              
              let tempEdgesFromNodeUpdate: Edge[] = [];
              const updatedNodesViaSetState = nodesInternal.map(n => {
                if (n.data.parentNode === parentMContainer.id && n.data.isDefaultClient && n.data.isSingleEndedForwardC) {
                    const defaultClientToConvert = n;
                    const effectiveServerMasterCfg = getEffectiveServerMasterConfig(sNode.data, (id) => newNodesList.concat(nodesInternal).find(node => node.id === id), getApiConfigById);
                    const newClientTunnelAddr = calculateClientTunnelAddressForServer(sNode.data, effectiveServerMasterCfg);
                    let newClientTargetPort = parseInt(extractPort(sNode.data.tunnelAddress || "0") || "0", 10);
                    if (newClientTargetPort > 0) newClientTargetPort++; else newClientTargetPort = 3001 + currentCounter;
                    const newClientTargetAddr = `[::]:${newClientTargetPort.toString()}`;

                    tempEdgesFromNodeUpdate.push({
                        id: `edge-${uuidv4()}`,
                        source: defaultClientToConvert.id, target: sNode.id,
                        type: 'step', markerEnd: { type: MarkerType.ArrowClosed }, animated: true, style: { strokeDasharray: '5 5' },
                    });
                    toast({ title: "入口(c)已更新并连接到新出口(s)" });
                    return {
                        ...defaultClientToConvert,
                        data: {
                            ...defaultClientToConvert.data,
                            isSingleEndedForwardC: false,
                            tunnelAddress: newClientTunnelAddr,
                            targetAddress: newClientTargetAddr,
                            tlsMode: parentMContainer.data.defaultTlsMode || 'master',
                        }
                    };
                }
                return n;
              });
              const didUpdateDefaultClient = updatedNodesViaSetState.some((n, i) => n.id !== nodesInternal[i]?.id || JSON.stringify(n.data) !== JSON.stringify(nodesInternal[i]?.data));
              if(!didUpdateDefaultClient){ 
                 const normalDefaultClient = nodesInternal.find(n => n.data.parentNode === parentMContainer.id && n.data.isDefaultClient && !n.data.isSingleEndedForwardC);
                 if (normalDefaultClient) {
                    tempEdgesFromNodeUpdate.push({
                        id: `edge-${uuidv4()}`,
                        source: normalDefaultClient.id, target: sNode.id,
                        type: 'step', markerEnd: { type: MarkerType.ArrowClosed }, animated: true, style: { strokeDasharray: '5 5' },
                    });
                     toast({ title: "新出口(s)已连接到默认入口(c)" });
                 }
              }
              setNodesInternal(updatedNodesViaSetState);
              newEdgesList.push(...tempEdgesFromNodeUpdate);
              toast({ title: "出口(s)节点已添加至主控容器" });

          } else {
              const mId = `master-${draggedData.id.substring(0, 8)}-${uuidv4().substring(0,4)}`;
              const uId = `user-for-${mId}`;
              const cId = `default-client-for-${mId}`;
              const tId = `default-tunnel-for-${mId}`;
              currentCounter++;

              newNodesList.push({
                  id: mId, type: 'masterNode', position,
                  data: {
                    label: `主控: ${draggedData.name || '未命名'}`, role: 'M', isContainer: true,
                    masterId: draggedData.id, masterName: draggedData.name,
                    apiUrl: draggedData.apiUrl,
                    defaultLogLevel: draggedData.masterDefaultLogLevel,
                    defaultTlsMode: draggedData.masterDefaultTlsMode,
                    masterSubRole: "server-role",
                  },
                  style: { ...nodeStyles.m.base, width: mNodeWidth, height: mNodeHeight },
                  width: mNodeWidth, height: mNodeHeight,
              });

              newNodesList.push({
                  id: cId, type: 'cardNode', parentNode: mId, extent: 'parent',
                  position: { x: (mNodeWidth / 2) - (CARD_NODE_WIDTH / 2), y: 50 },
                  data: {
                    label: '本地 (C)', role: 'C', icon: DatabaseZap, parentNode: mId, isDefaultClient: true,
                    isSingleEndedForwardC: true,
                    tunnelAddress: `[::]:${10001 + currentCounter}`,
                    targetAddress: `remote.example.com:80`,
                    logLevel: draggedData.masterDefaultLogLevel || 'master',
                    tlsMode: '0',
                  },
                  width: CARD_NODE_WIDTH, height: CARD_NODE_HEIGHT,
              });

              newNodesList.push({
                  id: uId, type: 'cardNode',
                  position: { x: position.x - CARD_NODE_WIDTH - 60, y: position.y + (mNodeHeight / 2) - (CARD_NODE_HEIGHT / 2) },
                  data: { label: '用户', role: 'U', icon: User },
                  width: CARD_NODE_WIDTH, height: CARD_NODE_HEIGHT,
              });

              newNodesList.push({
                  id: tId, type: 'cardNode',
                  position: { x: position.x + mNodeWidth + 60, y: position.y + (mNodeHeight / 2) - (CARD_NODE_HEIGHT / 2) },
                  data: { label: '落地', role: 'T', icon: Globe, targetAddress: '192.168.1.10:80' },
                  width: CARD_NODE_WIDTH, height: CARD_NODE_HEIGHT,
              });

              newEdgesList.push({
                  id: `edge-${uuidv4()}`, source: uId, target: mId, type: 'smoothstep', targetHandle: 'm-left',
                  markerEnd: { type: MarkerType.ArrowClosed }, animated: true, style: { strokeDasharray: '5 5' },
              });
              newEdgesList.push({
                  id: `edge-${uuidv4()}`, source: mId, target: tId, type: 'smoothstep', sourceHandle: 'm-right',
                  markerEnd: { type: MarkerType.ArrowClosed }, animated: true, style: { strokeDasharray: '5 5' },
              });
              toast({ title: "主控容器已创建" });
              nodesToFit = [{ id: uId }, { id: mId }, { id: tId }];
          }
      } else if (type !== 'master') {
          const nodeRole = type.toUpperCase() as NodeRole;
          const { labelPrefix, icon, width, height } = {
              'S': { labelPrefix: '出口(s)', icon: Server, width: CARD_NODE_WIDTH, height: CARD_NODE_HEIGHT },
              'C': { labelPrefix: '入口(c)', icon: DatabaseZap, width: CARD_NODE_WIDTH, height: CARD_NODE_HEIGHT },
              'T': { labelPrefix: '落地', icon: Globe, width: CARD_NODE_WIDTH, height: CARD_NODE_HEIGHT },
              'U': { labelPrefix: '用户', icon: User, width: CARD_NODE_WIDTH, height: CARD_NODE_HEIGHT },
          }[nodeRole]!;

          if ((nodeRole === 'S' || nodeRole === 'C') && !parentMContainer) {
              toast({ title: "操作无效", description: `请将 ${labelPrefix} (${nodeRole}) 拖拽到主控 (M) 容器内。`, variant: "destructive" });
              return;
          }
          currentCounter++;
          const newNodeId = `${nodeRole.toLowerCase()}-${uuidv4().substring(0,8)}`; 
          const newNodeData: CustomNodeData = {
             label: labelPrefix, role: nodeRole, icon,
             logLevel: 'master',
          };

          if (nodeRole === 'S') {
            newNodeData.tunnelAddress = `[::]:${10000 + currentCounter}`;
            newNodeData.targetAddress = `127.0.0.1:${3000 + currentCounter}`;
            newNodeData.tlsMode = parentMContainer?.data.defaultTlsMode || 'master';
          } else if (nodeRole === 'C') {
            if (parentMContainer) {
                const sNodesInParent = nodesInternal.filter(n => n.data.parentNode === parentMContainer.id && n.data.role === 'S');
                newNodeData.isSingleEndedForwardC = sNodesInParent.length === 0;
                if (newNodeData.isSingleEndedForwardC) {
                    newNodeData.tunnelAddress = `[::]:${10002 + currentCounter + Math.floor(Math.random()*50)}`;
                    newNodeData.targetAddress = `some.external.service:${8000 + currentCounter}`;
                    newNodeData.tlsMode = '0';
                } else {
                    const firstSNode = sNodesInParent[0];
                    const effectiveServerMasterCfg = getEffectiveServerMasterConfig(firstSNode.data, getNodeById, getApiConfigById);
                    newNodeData.tunnelAddress = calculateClientTunnelAddressForServer(firstSNode.data, effectiveServerMasterCfg);
                    let newClientTargetPortForS = parseInt(extractPort(firstSNode.data.tunnelAddress || "0") || "0", 10);
                    if (newClientTargetPortForS > 0) newClientTargetPortForS++; else newClientTargetPortForS = 3001 + currentCounter;
                    newNodeData.targetAddress = `[::]:${newClientTargetPortForS.toString()}`;
                    newNodeData.tlsMode = parentMContainer.data.defaultTlsMode || 'master';
                }
            } else {
                newNodeData.isSingleEndedForwardC = true;
                newNodeData.tunnelAddress = `[::]:${10002 + currentCounter + Math.floor(Math.random()*50)}`;
                newNodeData.targetAddress = `some.external.service:${8000 + currentCounter}`;
                newNodeData.tlsMode = '0';
            }
          } else if (nodeRole === 'T') {
            newNodeData.targetAddress = '192.168.1.20:8080';
          }

          const newNode: Node = { id: newNodeId, type: 'cardNode', position, data: newNodeData, width, height };

          if (parentMContainer) {
              newNode.parentNode = parentMContainer.id;
              newNode.extent = 'parent';
              newNode.position = { x: position.x - parentMContainer.position.x - (width / 2), y: position.y - parentMContainer.position.y - (height / 2) };
              newNode.data.logLevel = parentMContainer.data.defaultLogLevel || 'master';
              if (nodeRole === 'S') newNode.data.tlsMode = parentMContainer.data.defaultTlsMode || 'master';

              if (nodeRole === 'S') {
                  let tempEdgesFromNodeUpdateS: Edge[] = [];
                  const updatedNodesForNewS = nodesInternal.map(n => {
                    if (n.data.parentNode === parentMContainer.id && n.data.isDefaultClient && n.data.isSingleEndedForwardC) {
                        const defaultClientToConvert = n;
                        const effectiveServerMasterCfg = getEffectiveServerMasterConfig(newNode.data, (id) => newNodesList.concat(nodesInternal).find(node => node.id === id), getApiConfigById);
                        const newClientTunnelAddr = calculateClientTunnelAddressForServer(newNode.data, effectiveServerMasterCfg);
                        let newClientTargetPortForNewS = parseInt(extractPort(newNode.data.tunnelAddress || "0") || "0", 10);
                        if (newClientTargetPortForNewS > 0) newClientTargetPortForNewS++; else newClientTargetPortForNewS = 3001 + currentCounter;
                        const newClientTargetAddr = `[::]:${newClientTargetPortForNewS.toString()}`;
                        tempEdgesFromNodeUpdateS.push({
                            id: `edge-${uuidv4()}`,
                            source: defaultClientToConvert.id, target: newNodeId,
                            type: 'step', markerEnd: { type: MarkerType.ArrowClosed }, animated: true, style: { strokeDasharray: '5 5' },
                        });
                        toast({ title: "入口(c)已更新并连接到新出口(s)" });
                        return {
                            ...defaultClientToConvert,
                            data: {
                                ...defaultClientToConvert.data,
                                isSingleEndedForwardC: false,
                                tunnelAddress: newClientTunnelAddr,
                                targetAddress: newClientTargetAddr,
                                tlsMode: parentMContainer.data.defaultTlsMode || 'master',
                            }
                        };
                    }
                    return n;
                  });
                  const didUpdateDefaultClientS = updatedNodesForNewS.some((n, i) => n.id !== nodesInternal[i]?.id || JSON.stringify(n.data) !== JSON.stringify(nodesInternal[i]?.data));
                  if (!didUpdateDefaultClientS) {
                     const normalDefaultClient = nodesInternal.find(n => n.data.parentNode === parentMContainer.id && n.data.isDefaultClient && !n.data.isSingleEndedForwardC);
                     if (normalDefaultClient && normalDefaultClient.id !== newNodeId) {
                         tempEdgesFromNodeUpdateS.push({
                            id: `edge-${uuidv4()}`,
                            source: normalDefaultClient.id, target: newNodeId,
                            type: 'step', markerEnd: { type: MarkerType.ArrowClosed }, animated: true, style: { strokeDasharray: '5 5' },
                        });
                         toast({ title: "新出口(s)已连接到默认入口(c)" });
                     }
                  }
                  setNodesInternal(updatedNodesForNewS);
                  newEdgesList.push(...tempEdgesFromNodeUpdateS);

              } else if (nodeRole === 'C' && !newNodeData.isSingleEndedForwardC) {
                  const firstSNodeInParent = nodesInternal.find(n => n.data.parentNode === parentMContainer.id && n.data.role === 'S');
                  if (firstSNodeInParent) {
                      newEdgesList.push({
                          id: `edge-${uuidv4()}`, source: newNodeId, target: firstSNodeInParent.id,
                          type: 'step', markerEnd: { type: MarkerType.ArrowClosed }, animated: true, style: { strokeDasharray: '5 5' },
                      });
                  }
              }
          }
          newNodesList.push(newNode);
          toast({ title: `${labelPrefix} 节点已添加` });
      } else { return; }

      setNodesInternal(nds => nds.concat(newNodesList));
      if (newEdgesList.length > 0) setEdgesInternal(eds => eds.concat(newEdgesList));
      setNodeIdCounter(currentCounter);

      if (nodesToFit) {
        setTimeout(() => {
          fitView({ nodes: nodesToFit, duration: 400, padding: 0.2 });
        }, 50);
      }
  }, [nodeIdCounter, nodesInternal, toast, setNodesInternal, setEdgesInternal, fitView, getApiConfigById, getNodeById]);

    const handleChangeNodeRole = useCallback((nodeId: string, newRole: 'S' | 'C') => {
        setNodesInternal(nds => nds.map(node => {
            if (node.id === nodeId) {
                const newLabel = newRole === 'S' ? '出口(s)' : '入口(c)';
                const newIcon = newRole === 'S' ? Server : DatabaseZap;
                let newData: CustomNodeData = { ...node.data, role: newRole, icon: newIcon, label: newLabel };
                const parentM = node.data.parentNode ? getNodeById(node.data.parentNode) : null;

                if (newRole === 'S') {
                    newData.isSingleEndedForwardC = false; // Not applicable to S
                    newData.tlsMode = parentM?.data.defaultTlsMode || 'master';
                    if (!newData.tunnelAddress || newData.tunnelAddress.startsWith("remote.example.com")) newData.tunnelAddress = `[::]:${10000 + nodeIdCounter}`;
                    if (!newData.targetAddress || newData.targetAddress.startsWith("[::]")) newData.targetAddress = `127.0.0.1:${3000 + nodeIdCounter}`;
                } else if (newRole === 'C') {
                    if (parentM) {
                        const sNodesInParent = nodesInternal.filter(n => n.data.parentNode === parentM.id && n.data.role === 'S' && n.id !== nodeId);
                        newData.isSingleEndedForwardC = sNodesInParent.length === 0;
                        if (newData.isSingleEndedForwardC) {
                            newData.tlsMode = '0'; // Single-ended clients typically don't use NodePass server TLS
                            if (!newData.tunnelAddress || !newData.tunnelAddress.startsWith("[::]")) newData.tunnelAddress = `[::]:${10000 + nodeIdCounter + 1}`; // Local listen
                            if (!newData.targetAddress || newData.targetAddress.startsWith("127.0.0.1")) newData.targetAddress = `remote.service.com:${8000 + nodeIdCounter}`; // Remote target
                        } else {
                            // Tunnel mode client
                            newData.tlsMode = parentM.data.defaultTlsMode || 'master'; // Inherits from parent M for tunnel
                            const firstSNode = sNodesInParent[0]; // Connect to first available S
                            if (firstSNode?.data.tunnelAddress) {
                                newData.tunnelAddress = calculateClientTunnelAddressForServer(firstSNode.data, getEffectiveServerMasterConfig(firstSNode.data, getNodeById, getApiConfigById));
                                newData.targetAddress = `[::]:${(parseInt(extractPort(firstSNode.data.tunnelAddress) || "0", 10) + 1).toString()}`;
                            } else {
                                // Fallback if no S node or S node has no tunnel address
                                newData.tunnelAddress = ""; // Needs manual configuration
                                newData.targetAddress = `[::]:${10000 + nodeIdCounter + 2}`;
                            }
                        }
                    } else { // No parent M, likely an error or incomplete setup, default to single-ended
                        newData.isSingleEndedForwardC = true;
                        newData.tlsMode = '0';
                        newData.tunnelAddress = `[::]:${10000 + nodeIdCounter + 1}`;
                        newData.targetAddress = `remote.service.com:${8000 + nodeIdCounter}`;
                    }
                }
                return { ...node, data: newData };
            }
            return node;
        }));
        toast({ title: "角色已更改" });
        setContextMenu(null);
    }, [setNodesInternal, toast, getNodeById, nodesInternal, getApiConfigById, nodeIdCounter]);

  const handleClearCanvasCallback = useCallback(() => {
    setNodesInternal([]); setEdgesInternal([]); setNodeIdCounter(0); setSelectedNode(null); setContextMenu(null);
    toast({ title: '画布已清空' });
  }, [setNodesInternal, setEdgesInternal, toast]);

  const handleCenterViewCallback = useCallback((instance: ReturnType<typeof useReactFlow> | null) => {
      if (!instance) return;
      setContextMenu(null);
      instance.fitView({ duration: 300, padding: 0.2 });
  }, []);

  const prepareInstancesForSubmission = useCallback((): InstanceUrlConfigWithName[] => {
    const instancesToCreate: InstanceUrlConfigWithName[] = [];
    for (const node of nodesInternal) {
      if (node.data.role === 'S' || node.data.role === 'C') {
        let masterId: string | undefined;
        let masterConfigForNode: NamedApiConfig | null = null;

        if (node.data.representedMasterId) { 
            masterId = node.data.representedMasterId;
            masterConfigForNode = getApiConfigById(masterId);
        } else if (node.data.parentNode) { 
            const parentMNode = getNodeById(node.data.parentNode);
            masterId = parentMNode?.data.masterId;
            masterConfigForNode = masterId ? getApiConfigById(masterId) : null;
        } else { 
             masterConfigForNode = activeApiConfig; 
             masterId = activeApiConfig?.id;
        }
        
        if (!masterId || !masterConfigForNode) {
          setNodesInternal(nds => nds.map(n => n.id === node.id ? { ...n, data: { ...n.data, submissionStatus: 'error', submissionMessage: '主控配置丢失' } } : n));
          continue;
        }

        let urlParams: BuildUrlParams | null = null;
        const instanceTypeForBuild: "入口(c)" | "出口(s)" = node.data.role === 'S' ? "出口(s)" : "入口(c)";

        if (node.data.role === 'S') {
          if (!node.data.targetAddress || !node.data.tunnelAddress) {
            setNodesInternal(nds => nds.map(n => n.id === node.id ? { ...n, data: { ...n.data, submissionStatus: 'error', submissionMessage: '地址不完整' } } : n));
            continue;
          }
          urlParams = {
            instanceType: instanceTypeForBuild,
            tunnelAddress: node.data.tunnelAddress,
            targetAddress: node.data.targetAddress,
            logLevel: (node.data.logLevel as any) || masterConfigForNode.masterDefaultLogLevel || 'master',
            tlsMode: (node.data.tlsMode as any) || masterConfigForNode.masterDefaultTlsMode || 'master',
            certPath: node.data.certPath,
            keyPath: node.data.keyPath,
          };
        } else if (node.data.role === 'C') {
          if (node.data.isSingleEndedForwardC) {
            if (!node.data.tunnelAddress || !node.data.targetAddress) {
              setNodesInternal(nds => nds.map(n => n.id === node.id ? { ...n, data: { ...n.data, submissionStatus: 'error', submissionMessage: '单端转发地址不完整' } } : n));
              continue;
            }
            urlParams = {
              instanceType: instanceTypeForBuild,
              isSingleEndedForward: true,
              tunnelAddress: node.data.tunnelAddress,
              targetAddress: node.data.targetAddress,
              logLevel: (node.data.logLevel as any) || masterConfigForNode.masterDefaultLogLevel || 'master',
              tlsMode: (node.data.tlsMode as any) || '0',
              certPath: node.data.certPath,
              keyPath: node.data.keyPath,
            };
          } else { 
            if (!node.data.tunnelAddress || !node.data.targetAddress) {
              setNodesInternal(nds => nds.map(n => n.id === node.id ? { ...n, data: { ...n.data, submissionStatus: 'error', submissionMessage: '地址不完整' } } : n));
              continue;
            }
            urlParams = {
              instanceType: instanceTypeForBuild,
              isSingleEndedForward: false,
              tunnelAddress: node.data.tunnelAddress,
              targetAddress: node.data.targetAddress,
              logLevel: (node.data.logLevel as any) || masterConfigForNode.masterDefaultLogLevel || 'master',
              tlsMode: (node.data.tlsMode as any) || masterConfigForNode.masterDefaultTlsMode || 'master',
              certPath: node.data.certPath,
              keyPath: node.data.keyPath,
            };
          }
        }

        if (urlParams) {
          const finalUrl = buildUrlFromFormValues(urlParams, masterConfigForNode);
          instancesToCreate.push({
            nodeId: node.id,
            nodeLabel: node.data.representedMasterName ? `${instanceTypeForBuild}: ${node.data.representedMasterName}` : node.data.label,
            masterId: masterConfigForNode.id,
            masterName: masterConfigForNode.name,
            url: finalUrl,
            instanceType: instanceTypeForBuild
          });
        }
      } else if (node.data.role === 'M' && node.data.masterSubRole === 'client-role' && node.data.remoteMasterIdForTunnel && node.data.remoteServerListenAddress && node.data.remoteServerForwardAddress && node.data.targetAddress) {
        const clientMasterConfig = getApiConfigById(node.data.masterId!);
        const serverMasterConfig = getApiConfigById(node.data.remoteMasterIdForTunnel);

        if (!clientMasterConfig || !serverMasterConfig) {
          setNodesInternal(nds => nds.map(n => n.id === node.id ? { ...n, data: { ...n.data, submissionStatus: 'error', submissionMessage: '隧道主控配置不完整' } } : n));
          continue;
        }

        const clientRemoteHost = extractHostname(serverMasterConfig.apiUrl);
        const clientRemotePort = extractPort(node.data.remoteServerListenAddress);
        if (!clientRemoteHost || !clientRemotePort) {
            setNodesInternal(nds => nds.map(n => n.id === node.id ? { ...n, data: { ...n.data, submissionStatus: 'error', submissionMessage: '无法构建客户端隧道地址' } } : n));
            continue;
        }
        const clientTunnelAddressToRemote = `${formatHostForUrl(clientRemoteHost)}:${clientRemotePort}`;

        const clientUrlParams: BuildUrlParams = {
            instanceType: "入口(c)",
            isSingleEndedForward: false,
            tunnelAddress: clientTunnelAddressToRemote,
            targetAddress: node.data.targetAddress,
            logLevel: (node.data.logLevel as any) || clientMasterConfig.masterDefaultLogLevel || 'master',
            tlsMode: (node.data.tlsMode as any) || clientMasterConfig.masterDefaultTlsMode || 'master',
            certPath: node.data.certPath,
            keyPath: node.data.keyPath,
        };
        const clientFinalUrl = buildUrlFromFormValues(clientUrlParams, clientMasterConfig);
        instancesToCreate.push({
            nodeId: node.id,
            nodeLabel: `${node.data.label} (入口部分)`,
            masterId: clientMasterConfig.id,
            masterName: clientMasterConfig.name,
            url: clientFinalUrl,
            instanceType: "入口(c)",
        });

        const serverUrlParams: BuildUrlParams = {
            instanceType: "出口(s)",
            tunnelAddress: node.data.remoteServerListenAddress,
            targetAddress: node.data.remoteServerForwardAddress,
            logLevel: (node.data.logLevel as any) || serverMasterConfig.masterDefaultLogLevel || 'master',
            tlsMode: (node.data.tlsMode as any) || serverMasterConfig.masterDefaultTlsMode || 'master',
            certPath: (node.data.tlsMode === '2' && clientUrlParams.tlsMode === '2') ? node.data.certPath : "",
            keyPath: (node.data.tlsMode === '2' && clientUrlParams.tlsMode === '2') ? node.data.keyPath : "",
        };
        const serverFinalUrl = buildUrlFromFormValues(serverUrlParams, serverMasterConfig);
        instancesToCreate.push({
            nodeId: node.id,
            nodeLabel: `${node.data.label} (出口部分 @ ${serverMasterConfig.name})`,
            masterId: serverMasterConfig.id,
            masterName: serverMasterConfig.name,
            url: serverFinalUrl,
            instanceType: "出口(s)",
        });
      }
    }
    return instancesToCreate;
  }, [nodesInternal, getNodeById, getApiConfigById, setNodesInternal, activeApiConfig]);

  const handleTriggerSubmitTopology = useCallback(async () => {
    setContextMenu(null);
    setIsSubmitting(true);

    if (!activeApiConfig) {
        toast({ title: "错误", description: "没有活动的API配置可用于连接事件流。", variant: "destructive" });
        setIsSubmitting(false);
        return;
    }

    const ssePreCheckAbortController = new AbortController();
    let sseCheckSuccess = false;

    const checkConnectionPromise = (async () => {
        try {
            const apiRootForCheck = getApiRootUrl(activeApiConfig.id);
            const tokenForCheck = getToken(activeApiConfig.id);
            if (!apiRootForCheck || !tokenForCheck) throw new Error("活动主控API配置不完整。");

            const eventsUrl = getEventsUrl(apiRootForCheck);
            if (!eventsUrl) throw new Error("无法生成事件URL。");

            const response = await fetch(eventsUrl, {
                method: 'GET',
                headers: { 'X-API-Key': tokenForCheck, 'Accept': 'text/event-stream', 'Cache-Control': 'no-cache' },
                signal: ssePreCheckAbortController.signal,
            });

            if (!response.ok || !response.body) {
                const errorText = response.statusText || `HTTP error ${response.status}`;
                throw new Error(errorText);
            }
            
            const reader = response.body.getReader();
            const { done } = await reader.read(); 
            if (!done) {
                sseCheckSuccess = true;
            }
            if (!ssePreCheckAbortController.signal.aborted) {
                 ssePreCheckAbortController.abort("Pre-check complete");
            }
            reader.releaseLock();
             if (response.body && response.body.locked) {
                await response.body.cancel().catch(e => console.warn("Error cancelling pre-check stream body:", e));
            }
        } catch (error: any) {
            if (error.name !== 'AbortError') {
                console.warn("SSE Pre-check connection error:", error.message);
            }
             sseCheckSuccess = false;
        }
    })();

    const timeoutPromise = new Promise(resolve => setTimeout(() => {
        if (!sseCheckSuccess && !ssePreCheckAbortController.signal.aborted) {
            ssePreCheckAbortController.abort("Pre-check timeout");
        }
        resolve(null);
    }, 10000));

    await Promise.race([checkConnectionPromise, timeoutPromise]);

    if (!sseCheckSuccess) {
        if (!ssePreCheckAbortController.signal.aborted) {
            ssePreCheckAbortController.abort("Pre-check timeout or failure post-race");
        }
        toast({ title: "连接检查失败", description: "无法连接到主控事件流，请检查主控状态或网络。提交已取消。", variant: "destructive" });
        setIsSubmitting(false);
        return;
    }

    setNodesInternal(nds => nds.map(n => ({ ...n, data: { ...n.data, submissionStatus: undefined, submissionMessage: undefined } })));
    const instancesToCreate = prepareInstancesForSubmission();

    if (instancesToCreate.length === 0) {
      toast({ title: '无实例可提交', description: '请配置有效的出口(s)/入口(c)节点或跨主控隧道。' });
      setIsSubmitting(false);
      return;
    }
    setInstancesForConfirmation(instancesToCreate);
    setIsSubmitConfirmOpen(true);
  }, [activeApiConfig, getApiRootUrl, getToken, toast, prepareInstancesForSubmission, setNodesInternal]);

  const listenForHandshakeViaSSE = useCallback(async (
    masterForSse: NamedApiConfig,
    signal: AbortSignal
  ) => {
    const sseApiRoot = getApiRootUrl(masterForSse.id);
    const sseApiToken = getToken(masterForSse.id);

    if (!sseApiRoot || !sseApiToken) {
        toast({ title: "SSE 错误", description: `无法监听握手: 主控 ${masterForSse.name} 的API配置无效。`, variant: "destructive" });
        return;
    }

    const eventsSSEUrl = getEventsUrl(sseApiRoot);
    if (!eventsSSEUrl) return;

    try {
        const response = await fetch(eventsSSEUrl, {
            method: 'GET',
            headers: { 'X-API-Key': sseApiToken, 'Accept': 'text/event-stream', 'Cache-Control': 'no-cache' },
            signal,
        });

        if (!response.ok || !response.body) {
            const errorText = response.statusText || `HTTP error ${response.status}`;
            throw new Error(errorText);
        }
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        
        while (true) {
            if (signal.aborted) break;
            const { value, done } = await reader.read();
            if (signal.aborted || done) break;

            buffer += decoder.decode(value, { stream: true });
            const messageBlocks = buffer.split('\n\n');
            buffer = messageBlocks.pop() || ''; 

            for (const block of messageBlocks) {
                if (signal.aborted) break;
                if (block.trim() === '') continue;

                let eventName = 'message';
                let eventDataStr = '';
                const lines = block.split('\n');
                for (const line of lines) {
                    if (line.startsWith('event:')) {
                        eventName = line.substring('event:'.length).trim();
                    } else if (line.startsWith('data:')) {
                        eventDataStr += line.substring('data:'.length).trimStart();
                    }
                }

                if (eventName === 'instance' && eventDataStr) {
                    try {
                        const jsonData = JSON.parse(eventDataStr);
                        if (jsonData.type === 'log' && typeof jsonData.logs === 'string') {
                            const match = jsonData.logs.match(handshakeLogRegex);
                            if (match && match[1]) {
                                const latency = match[1];
                                toast({ 
                                    title: "✅ 隧道握手成功", 
                                    description: `延迟: ${latency}ms` 
                                });
                                if (sseHandshakeAbortControllerRef.current && !sseHandshakeAbortControllerRef.current.signal.aborted) {
                                  sseHandshakeAbortControllerRef.current.abort("Handshake detected");
                                }
                                return; 
                            }
                        }
                    } catch (e) {
                        console.warn("SSE: Error parsing instance event data:", e, "Raw data:", eventDataStr);
                    }
                }
            }
        }
    } catch (error: any) {
        if (error.name !== 'AbortError') {
            console.error("SSE: Handshake listener error:", error);
            toast({ title: "SSE 监听错误", description: `监听隧道握手时出错: ${error.message}`, variant: "destructive" });
        }
    } finally {
         if (sseHandshakeAbortControllerRef.current && sseHandshakeAbortControllerRef.current.signal === signal && !signal.aborted) {
            sseHandshakeAbortControllerRef.current.abort("Listener function completed or errored");
        }
    }
  }, [getApiRootUrl, getToken, toast, handshakeLogRegex]);


  const executeActualSubmission = useCallback(async () => {
    setIsSubmitConfirmOpen(false);

    toast({ title: '拓扑已提交', description: `正在创建 ${instancesForConfirmation.length} 个实例并实时监听隧道握手事件...` });

    if (activeApiConfig) {
      if (sseHandshakeAbortControllerRef.current && !sseHandshakeAbortControllerRef.current.signal.aborted) {
        sseHandshakeAbortControllerRef.current.abort("New submission handshake listener starting");
      }
      const newAbortController = new AbortController();
      sseHandshakeAbortControllerRef.current = newAbortController;

      listenForHandshakeViaSSE(activeApiConfig, newAbortController.signal);

      setTimeout(() => {
        if (newAbortController && !newAbortController.signal.aborted) {
          if (newAbortController.signal.reason !== "Handshake detected") {
             toast({
                title: "监听超时",
                description: "25秒内未检测到隧道握手事件。请检查Master日志。",
                variant: "default"
             });
          }
          newAbortController.abort("Handshake listener timeout");
          if (sseHandshakeAbortControllerRef.current === newAbortController) {
              sseHandshakeAbortControllerRef.current = null;
          }
        }
      }, 25000); 
    }

    const submissionPromises = instancesForConfirmation.map(inst => {
      const apiR = getApiRootUrl(inst.masterId);
      const apiT = getToken(inst.masterId);
      if (!apiR || !apiT) {
        setNodesInternal(nds => nds.map(n => n.id === inst.nodeId ? { ...n, data: { ...n.data, submissionStatus: 'error', submissionMessage: '主控API无效' } } : n));
        return Promise.reject(new Error(`主控 ${inst.masterName} API配置无效。`));
      }
      return createInstanceMutation.mutateAsync({ data: { url: inst.url }, useApiRoot: apiR, useApiToken: apiT, originalNodeId: inst.nodeId });
    });

    try {
        await Promise.allSettled(submissionPromises);
        console.log('所有实例创建请求已发送完毕。');
    } catch (e) {
        console.error("拓扑提交出错:", e);
        toast({ title: '拓扑提交过程中发生意外错误', variant: 'destructive' });
    } finally {
        setIsSubmitting(false);
    }
  }, [instancesForConfirmation, getApiRootUrl, getToken, toast, createInstanceMutation, setNodesInternal, activeApiConfig, listenForHandshakeViaSSE]);
  
  useEffect(() => {
    return () => {
        if (sseHandshakeAbortControllerRef.current && !sseHandshakeAbortControllerRef.current.signal.aborted) {
            sseHandshakeAbortControllerRef.current.abort("Component unmounting");
            sseHandshakeAbortControllerRef.current = null;
        }
    };
  }, []);

  const handleOpenEditNodeDialog = (node: Node) => {
    let hasS = false;
    if (node.data.role === 'C' && node.data.parentNode) {
        hasS = nodesInternal.some(n => n.data.parentNode === node.data.parentNode && n.data.role === 'S');
    }
    setEditingNodeContext({ node, hasS });
    setIsEditNodeDialogOpen(true);
    setContextMenu(null);
  };

  const handleSaveNodeProperties = useCallback((nodeId: string, updatedDataFromDialog: Partial<CustomNodeData>) => {
    let newNodes = [...nodesInternal];
    const nodeIndex = newNodes.findIndex(n => n.id === nodeId);
    if (nodeIndex === -1) return;

    const originalNodeDataFromState = newNodes[nodeIndex].data;
    const mergedData = { ...originalNodeDataFromState, ...updatedDataFromDialog };
    newNodes[nodeIndex] = { ...newNodes[nodeIndex], data: mergedData };
    const editedNode = newNodes[nodeIndex];

    const isForwardingSourceNode = editedNode.data.role === 'S' || editedNode.data.role === 'C' || (editedNode.data.role === 'M' && editedNode.data.masterSubRole === 'client-role');

    if (isForwardingSourceNode) {
        edgesInternal.forEach(edge => {
            if (edge.source === editedNode.id) {
                const targetTNodeIndex = newNodes.findIndex(n => n.id === edge.target && n.data.role === 'T');
                if (targetTNodeIndex !== -1) {
                    const connectedTNodeOriginalData = nodesInternal.find(n => n.id === newNodes[targetTNodeIndex].id)?.data;
                    if (editedNode.data.targetAddress !== connectedTNodeOriginalData?.targetAddress) {
                        newNodes[targetTNodeIndex] = {
                            ...newNodes[targetTNodeIndex],
                            data: { ...newNodes[targetTNodeIndex].data, targetAddress: editedNode.data.targetAddress }
                        };
                         if(originalNodeDataFromState.targetAddress !== editedNode.data.targetAddress){
                            toast({ title: `落地 ${newNodes[targetTNodeIndex].data.label} 已同步目标地址。`});
                         }
                    }
                }
            }
        });
    } else if (editedNode.data.role === 'T') {
        const originalTNodeData = originalNodeDataFromState;
        edgesInternal.forEach(edge => {
            if (edge.target === editedNode.id) {
                const sourceNodeIndex = newNodes.findIndex(n => n.id === edge.source && (n.data.role === 'S' || n.data.role === 'C' || (n.data.role === 'M' && n.data.masterSubRole === 'client-role')));
                if (sourceNodeIndex !== -1) {
                     const connectedSourceNodeOriginalData = nodesInternal.find(n => n.id === newNodes[sourceNodeIndex].id)?.data;
                    if (editedNode.data.targetAddress !== connectedSourceNodeOriginalData?.targetAddress) {
                        newNodes[sourceNodeIndex] = {
                            ...newNodes[sourceNodeIndex],
                            data: { ...newNodes[sourceNodeIndex].data, targetAddress: editedNode.data.targetAddress }
                        };
                         if (originalTNodeData?.targetAddress !== editedNode.data.targetAddress) {
                           toast({ title: `${newNodes[sourceNodeIndex].data.label} 已同步落地目标地址。`});
                         }
                    }
                }
            }
        });
    }

    if (editedNode.data.role === 'S') {
        edgesInternal.forEach(edge => {
            if (edge.target === editedNode.id) { // S is target, C is source
                const clientNodeIndex = newNodes.findIndex(n => n.id === edge.source && n.data.role === 'C' && !n.data.isSingleEndedForwardC);
                if (clientNodeIndex !== -1) {
                    const clientNode = newNodes[clientNodeIndex];
                    const effectiveServerMasterCfg = getEffectiveServerMasterConfig(editedNode.data, (id) => newNodes.find(n => n.id === id), getApiConfigById);
                    const newClientAddr = calculateClientTunnelAddressForServer(editedNode.data, effectiveServerMasterCfg);
                     if (clientNode.data.tunnelAddress !== newClientAddr) {
                         newNodes[clientNodeIndex] = { ...clientNode, data: { ...clientNode.data, tunnelAddress: newClientAddr }};
                         if (originalNodeDataFromState.tunnelAddress !== editedNode.data.tunnelAddress) {
                             toast({ title: `入口(c) ${clientNode.data.label} 的隧道地址已更新。` });
                         }
                    }
                }
            }
        });
    } else if (editedNode.data.role === 'M' && originalNodeDataFromState.apiUrl !== editedNode.data.apiUrl) { // If Master Node's API URL changed
        const mContainerNode = editedNode;
        const mContainerMasterConfig = getApiConfigById(mContainerNode.data.masterId!);

        newNodes.forEach((sNode) => {
            // If S node is inside this M container AND it's not representing an external master
            if (sNode.data.parentNode === mContainerNode.id && sNode.data.role === 'S' && !sNode.data.representedMasterId && mContainerMasterConfig) {
                edgesInternal.forEach(edge => {
                    if (edge.target === sNode.id) { // Find C nodes connected to this S node
                        const clientNodeIndexToUpdate = newNodes.findIndex(n => n.id === edge.source && n.data.role === 'C' && !n.data.isSingleEndedForwardC);
                        if (clientNodeIndexToUpdate !== -1) {
                            const clientNodeToUpdate = newNodes[clientNodeIndexToUpdate];
                            const newClientTunAddr = calculateClientTunnelAddressForServer(sNode.data, mContainerMasterConfig); // Recalculate with new Master API URL
                             if (clientNodeToUpdate.data.tunnelAddress !== newClientTunAddr) {
                                newNodes[clientNodeIndexToUpdate] = { ...clientNodeToUpdate, data: { ...clientNodeToUpdate.data, tunnelAddress: newClientTunAddr }};
                                toast({ title: `入口(c) ${clientNodeToUpdate.data.label} 的隧道地址已更新。` });
                            }
                        }
                    }
                });
            }
        });
    }

    setNodesInternal(newNodes);
    toast({ title: `节点 "${mergedData.label || nodeId.substring(0,8)}" 属性已更新`});
    setIsEditNodeDialogOpen(false);
    setEditingNodeContext(null);
  }, [nodesInternal, edgesInternal, setNodesInternal, toast, getNodeById, getApiConfigById]);


  const handleDeleteNode = (nodeToDelete: Node) => {
    const parentMId = nodeToDelete.data.parentNode;
    deleteElements({ nodes: [nodeToDelete] });
    toast({ title: `节点 "${nodeToDelete.data.label || nodeToDelete.id}" 已删除` });
    if (selectedNode?.id === nodeToDelete.id) setSelectedNode(null);
    setContextMenu(null);

    if (nodeToDelete.data.role === 'S' && parentMId) {
        const remainingSNodesInParent = nodesInternal.filter(n => n.id !== nodeToDelete.id && n.data.parentNode === parentMId && n.data.role === 'S');
        if (remainingSNodesInParent.length === 0) {
            setNodesInternal(prevNodes =>
                prevNodes.map(n => {
                    if (n.data.parentNode === parentMId && n.data.role === 'C') {
                        return {
                            ...n,
                            data: {
                                ...n.data,
                                isSingleEndedForwardC: true, // Change to single-ended
                                tunnelAddress: `[::]:${10000 + Math.floor(Math.random() * 1000)}`, // Default local listen
                                targetAddress: 'remote.example.com:80', // Default remote target
                                tlsMode: '0', // Default TLS for single-ended
                            }
                        };
                    }
                    return n;
                })
            );
            toast({ title: `主控 ${getNodeById(parentMId)?.data.label} 内无出口(s)，入口(c)已切换为单端转发模式。`});
        }
    }
  };
  const handleDeleteEdge = (edgeToDelete: Edge) => { deleteElements({ edges: [edgeToDelete] }); toast({ title: '链路已删除' }); setContextMenu(null); };

const handleRenderMasterInstancesOnCanvas = useCallback(async (masterId: string) => {
    const m1Config = getApiConfigById(masterId);
    if (!m1Config) {
        toast({ title: "错误", description: "无法找到选定主控的配置。", variant: "destructive" });
        return;
    }
    const m1ApiRoot = getApiRootUrl(masterId);
    const m1ApiToken = getToken(masterId);
    if (!m1ApiRoot || !m1ApiToken) {
        toast({ title: "错误", description: `主控 "${m1Config.name}" 的API配置不完整。`, variant: "destructive" });
        return;
    }

    setNodesInternal([]);
    setEdgesInternal([]);
    setNodeIdCounter(0);
    setSelectedNode(null);
    setContextMenu(null);
    let currentIdCounter = 0;

    toast({ title: `正在加载主控 ${m1Config.name} 的实例...` });

    try {
        const m1InstancesRaw: ApiInstanceType[] = await nodePassApi.getInstances(m1ApiRoot, m1ApiToken);
        const m1ValidInstances = m1InstancesRaw.filter(inst => inst.id !== '********');

        const newRenderedNodes: Node[] = [];
        const newRenderedEdges: Edge[] = [];
        
        const m1ContainerNodeId = `master-container-${m1Config.id.substring(0, 8)}-${++currentIdCounter}`;
        const m1ContainerNode: Node = {
            id: m1ContainerNodeId,
            type: 'masterNode',
            position: { x: 250, y: 50 },
            data: {
                label: `主控: ${m1Config.name}`, role: 'M', isContainer: true,
                masterId: m1Config.id, masterName: m1Config.name,
                apiUrl: m1Config.apiUrl, defaultLogLevel: m1Config.masterDefaultLogLevel,
                defaultTlsMode: m1Config.masterDefaultTlsMode, masterSubRole: 'primary',
            } as CustomNodeData, // Cast to CustomNodeData
            style: { ...nodeStyles.m.base, minWidth: DEFAULT_MASTER_NODE_WIDTH, minHeight: MIN_MASTER_NODE_HEIGHT },
            width: DEFAULT_MASTER_NODE_WIDTH, // Initialize with default
            height: MIN_MASTER_NODE_HEIGHT, // Initialize with min or default
        };
        newRenderedNodes.push(m1ContainerNode);

        const uGlobalNodeId = `u-global-${m1Config.id.substring(0, 5)}-${++currentIdCounter}`;
        newRenderedNodes.push({
            id: uGlobalNodeId, type: 'cardNode',
            position: { x: m1ContainerNode.position.x - CARD_NODE_WIDTH - 100, y: m1ContainerNode.position.y + (MIN_MASTER_NODE_HEIGHT / 2) - (CARD_NODE_HEIGHT / 2) },
            data: { label: '用户/服务', role: 'U', icon: User },
            width: CARD_NODE_WIDTH, height: CARD_NODE_HEIGHT,
        });

        const landingNodesMap = new Map<string, Node>();
        let tNodeYOffset = m1ContainerNode.position.y;
        
        const internalClientNodes: Node[] = [];
        const internalServerNodes: Node[] = [];
        const representedServerNodesMap = new Map<string, Node>(); 
        const pairedServerInstanceIds = new Set<string>(); 
        
        let internalNodeYOffset = 40; // Initial Y offset for child nodes
        const internalNodeXOffsetC = 20; // X offset for client nodes inside master
        let internalNodeXOffsetSBase = internalNodeXOffsetC + CARD_NODE_WIDTH + 40; // Base X for server nodes

        for (const inst of m1ValidInstances) {
            const parsedUrl = parseNodePassUrl(inst.url);
            const commonNodeData: Partial<CustomNodeData> = {
                originalInstanceId: inst.id,
                originalInstanceUrl: inst.url,
                tunnelAddress: parsedUrl.tunnelAddress || '',
                targetAddress: parsedUrl.targetAddress || '',
                logLevel: parsedUrl.logLevel || 'master',
                tlsMode: parsedUrl.tlsMode || (parsedUrl.scheme === 'client' ? '0' : 'master'),
                parentNode: m1ContainerNodeId,
            };

            if (inst.type === 'client') {
                const clientNodeId = `c-${inst.id.substring(0, 8)}-${++currentIdCounter}`;
                const clientNode: Node = {
                    id: clientNodeId, type: 'cardNode',
                    position: { x: internalNodeXOffsetC, y: internalNodeYOffset },
                    parentNode: m1ContainerNodeId, extent: 'parent',
                    data: {
                        ...commonNodeData,
                        label: `入口(c): ${inst.id.substring(0, 5)}..`, role: 'C', icon: DatabaseZap,
                        isSingleEndedForwardC: parsedUrl.scheme === 'client' && isWildcardHostname(extractHostname(parsedUrl.tunnelAddress || "")),
                    } as CustomNodeData,
                    width: CARD_NODE_WIDTH, height: CARD_NODE_HEIGHT,
                };
                internalClientNodes.push(clientNode);
                newRenderedNodes.push(clientNode);
                internalNodeYOffset += CARD_NODE_HEIGHT + 15; // Increment Y for next client
            } else if (inst.type === 'server') {
                const serverNodeId = `s-${inst.id.substring(0, 8)}-${++currentIdCounter}`;
                // Simple stacking for servers for now, can be improved
                const serverYPos = internalNodeYOffset - (internalClientNodes.length * (CARD_NODE_HEIGHT + 15)) + (internalServerNodes.length * (CARD_NODE_HEIGHT + 15));
                const serverNode: Node = {
                    id: serverNodeId, type: 'cardNode',
                    position: { x: internalNodeXOffsetSBase, y: serverYPos }, 
                    parentNode: m1ContainerNodeId, extent: 'parent',
                    data: {
                        ...commonNodeData,
                        label: `出口(s): ${inst.id.substring(0, 5)}..`, role: 'S', icon: Server,
                    } as CustomNodeData,
                    width: CARD_NODE_WIDTH, height: CARD_NODE_HEIGHT,
                };
                internalServerNodes.push(serverNode);
                newRenderedNodes.push(serverNode);
            }
        }
        
        const m1ContainerData = newRenderedNodes.find(n => n.id === m1ContainerNodeId)?.data;
        if (m1ContainerData) (m1ContainerData as any).renderedChildCount = internalClientNodes.length + internalServerNodes.length;


        for (const cNode of internalClientNodes) {
            const parsedClientUrl = parseNodePassUrl(cNode.data.originalInstanceUrl!);
            newRenderedEdges.push({ id: `edge-${uuidv4()}`, source: uGlobalNodeId, target: cNode.id, type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed } });

            if (cNode.data.isSingleEndedForwardC && parsedClientUrl.targetAddress) {
                let tNode = landingNodesMap.get(parsedClientUrl.targetAddress);
                if (!tNode) {
                    const tNodeId = `t-${parsedClientUrl.targetAddress.replace(/[^a-zA-Z0-9]/g, '')}-${++currentIdCounter}`;
                    tNode = {
                        id: tNodeId, type: 'cardNode', position: { x: 0, y: 0 }, // Position will be set later
                        data: { label: `远程 @ ${parsedClientUrl.targetAddress}`, role: 'T', icon: Globe, targetAddress: parsedClientUrl.targetAddress },
                        width: CARD_NODE_WIDTH, height: CARD_NODE_HEIGHT,
                    };
                    newRenderedNodes.push(tNode);
                    landingNodesMap.set(parsedClientUrl.targetAddress, tNode);
                }
                newRenderedEdges.push({ id: `edge-${uuidv4()}`, source: cNode.id, target: tNode.id, type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed } });
            } else if (parsedClientUrl.tunnelAddress) { 
                const clientConnectsToHost = extractHostname(parsedClientUrl.tunnelAddress);
                const clientConnectsToPort = extractPort(parsedClientUrl.tunnelAddress);

                const sOnM1Node = internalServerNodes.find(sInternalNode => {
                    const parsedLocalServerUrl = parseNodePassUrl(sInternalNode.data.originalInstanceUrl!);
                    const localServerListenHost = extractHostname(parsedLocalServerUrl.tunnelAddress || "");
                    const localServerListenPort = extractPort(parsedLocalServerUrl.tunnelAddress || "");
                    if (clientConnectsToPort !== localServerListenPort) return false;
                    const m1ApiHost = extractHostname(m1Config.apiUrl);
                    return (clientConnectsToHost === localServerListenHost ||
                           (isWildcardHostname(localServerListenHost) && (clientConnectsToHost === m1ApiHost || clientConnectsToHost === 'localhost' || clientConnectsToHost === '127.0.0.1' || clientConnectsToHost === '[::1]')) ||
                           ((clientConnectsToHost === 'localhost' || clientConnectsToHost === '127.0.0.1' || clientConnectsToHost === '[::1]') && (isWildcardHostname(localServerListenHost) || localServerListenHost === m1ApiHost || localServerListenHost === 'localhost' || localServerListenHost === '127.0.0.1' || localServerListenHost === '[::1]')));
                });

                if (sOnM1Node) {
                    newRenderedEdges.push({ id: `edge-${uuidv4()}`, source: cNode.id, target: sOnM1Node.id, type: 'step', markerEnd: { type: MarkerType.ArrowClosed } });
                    pairedServerInstanceIds.add(sOnM1Node.data.originalInstanceId!);
                } else if (clientConnectsToHost && clientConnectsToPort) { 
                    const targetM2Config = apiConfigsList.find(conf => conf.id !== m1Config.id && extractHostname(conf.apiUrl)?.toLowerCase() === clientConnectsToHost.toLowerCase());
                    if (targetM2Config) {
                        const m2ApiRoot = getApiRootUrl(targetM2Config.id);
                        const m2Token = getToken(targetM2Config.id);
                        if (m2ApiRoot && m2Token) {
                            try {
                                const m2Instances = await nodePassApi.getInstances(m2ApiRoot, m2Token);
                                const sOnM2InstanceData = m2Instances.find(inst => {
                                    if (inst.type !== 'server') return false;
                                    const parsedSUrl = parseNodePassUrl(inst.url);
                                    const sListenHost = extractHostname(parsedSUrl.tunnelAddress || "");
                                    const sListenPort = extractPort(parsedSUrl.tunnelAddress || "");
                                    if (sListenPort !== clientConnectsToPort) return false;
                                    return (sListenHost?.toLowerCase() === clientConnectsToHost.toLowerCase() || (isWildcardHostname(sListenHost) && clientConnectsToHost.toLowerCase() === extractHostname(targetM2Config.apiUrl)?.toLowerCase()));
                                });

                                if (sOnM2InstanceData) {
                                    const representativeSNodeKey = `${targetM2Config.id}-${sOnM2InstanceData.id}`;
                                    let representativeSNode = representedServerNodesMap.get(representativeSNodeKey);
                                    if (!representativeSNode) {
                                        const parsedServerOnM2Url = parseNodePassUrl(sOnM2InstanceData.url);
                                        const sNodeId = `s-repr-${sOnM2InstanceData.id.substring(0, 8)}-${++currentIdCounter}`;
                                        const currentMaxS_X = Math.max(internalNodeXOffsetSBase, ...newRenderedNodes.filter(n => n.data.parentNode === m1ContainerNodeId && n.data.role === 'S' && n.data.representedMasterId).map(n => n.position.x + (n.width || CARD_NODE_WIDTH)));
                                        const newRepS_X = (currentMaxS_X === internalNodeXOffsetSBase ? internalNodeXOffsetSBase : currentMaxS_X + 20);
                                        const repS_Y_pos = (internalServerNodes.length + representedServerNodesMap.size) * (CARD_NODE_HEIGHT + 15) + 40;
                                        
                                        representativeSNode = {
                                            id: sNodeId, type: 'cardNode',
                                            position: { x: newRepS_X, y: repS_Y_pos }, 
                                            parentNode: m1ContainerNodeId, extent: 'parent',
                                            data: {
                                                label: `出口(s) @ ${targetM2Config.name.substring(0,10)}..`, role: 'S', icon: Server,
                                                parentNode: m1ContainerNodeId,
                                                originalInstanceId: sOnM2InstanceData.id, originalInstanceUrl: sOnM2InstanceData.url,
                                                tunnelAddress: parsedServerOnM2Url.tunnelAddress || '', targetAddress: parsedServerOnM2Url.targetAddress || '',
                                                logLevel: parsedServerOnM2Url.logLevel || 'master', tlsMode: parsedServerOnM2Url.tlsMode || 'master',
                                                representedMasterId: targetM2Config.id, representedMasterName: targetM2Config.name,
                                            } as CustomNodeData,
                                            width: CARD_NODE_WIDTH, height: CARD_NODE_HEIGHT,
                                        };
                                        newRenderedNodes.push(representativeSNode);
                                        representedServerNodesMap.set(representativeSNodeKey, representativeSNode);
                                        if(m1ContainerData) (m1ContainerData as any).renderedChildCount = ((m1ContainerData as any).renderedChildCount || 0) + 1;
                                        internalNodeXOffsetSBase = Math.max(internalNodeXOffsetSBase, representativeSNode.position.x + CARD_NODE_WIDTH + 20);
                                    }
                                    newRenderedEdges.push({ id: `edge-${uuidv4()}`, source: cNode.id, target: representativeSNode.id, type: 'step', markerEnd: { type: MarkerType.ArrowClosed } });
                                } else { 
                                    let tNode = landingNodesMap.get(parsedClientUrl.tunnelAddress!); 
                                    if (!tNode) {
                                        const tNodeId = `t-ext-${(parsedClientUrl.tunnelAddress!).replace(/[^a-zA-Z0-9]/g, '')}-${++currentIdCounter}`;
                                        tNode = {
                                            id: tNodeId, type: 'cardNode', position: { x: 0, y: 0 },
                                            data: { label: `外部出口(s) @ ${parsedClientUrl.tunnelAddress}`, role: 'T', icon: Globe, targetAddress: parsedClientUrl.tunnelAddress },
                                            width: CARD_NODE_WIDTH, height: CARD_NODE_HEIGHT,
                                        };
                                        newRenderedNodes.push(tNode);
                                        landingNodesMap.set(parsedClientUrl.tunnelAddress!, tNode); 
                                    }
                                    newRenderedEdges.push({ id: `edge-${uuidv4()}`, source: cNode.id, target: tNode.id, type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed } });
                                }
                            } catch (e: any) { console.error("Error fetching/processing M2 instances", e); }
                        }
                    } else { 
                        let tNode = landingNodesMap.get(parsedClientUrl.tunnelAddress!); 
                        if (!tNode) {
                            const tNodeId = `t-ext-${(parsedClientUrl.tunnelAddress!).replace(/[^a-zA-Z0-9]/g, '')}-${++currentIdCounter}`;
                            tNode = {
                                id: tNodeId, type: 'cardNode', position: { x: 0, y: 0 },
                                data: { label: `外部出口(s) @ ${parsedClientUrl.tunnelAddress}`, role: 'T', icon: Globe, targetAddress: parsedClientUrl.tunnelAddress },
                                width: CARD_NODE_WIDTH, height: CARD_NODE_HEIGHT,
                            };
                            newRenderedNodes.push(tNode);
                            landingNodesMap.set(parsedClientUrl.tunnelAddress!, tNode); 
                        }
                        newRenderedEdges.push({ id: `edge-${uuidv4()}`, source: cNode.id, target: tNode.id, type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed } });
                    }
                }
            }
        }

        const allServerLikeNodes = internalServerNodes.concat(Array.from(representedServerNodesMap.values()));
        allServerLikeNodes.forEach(sNode => {
            const serverTargetAddr = sNode.data.targetAddress;
            if (serverTargetAddr) {
                let tNode = landingNodesMap.get(serverTargetAddr);
                if (!tNode) {
                    const tNodeId = `t-${serverTargetAddr.replace(/[^a-zA-Z0-9]/g, '')}-${++currentIdCounter}`;
                    tNode = {
                        id: tNodeId, type: 'cardNode', position: { x: 0, y: 0 },
                        data: { label: `服务 @ ${serverTargetAddr}`, role: 'T', icon: Globe, targetAddress: serverTargetAddr },
                        width: CARD_NODE_WIDTH, height: CARD_NODE_HEIGHT,
                    };
                    newRenderedNodes.push(tNode);
                    landingNodesMap.set(serverTargetAddr, tNode);
                }
                newRenderedEdges.push({ id: `edge-${uuidv4()}`, source: sNode.id, target: tNode.id, type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed } });
            }
            if (!sNode.data.representedMasterId && !pairedServerInstanceIds.has(sNode.data.originalInstanceId!)) {
                 const isConnectedFromInternalClient = newRenderedEdges.some(edge => edge.target === sNode.id && internalClientNodes.some(cn => cn.id === edge.source));
                 if (!isConnectedFromInternalClient) {
                    newRenderedEdges.push({ id: `edge-${uuidv4()}`, source: uGlobalNodeId, target: sNode.id, type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed } });
                 }
            }
        });

        // Calculate M container size after all children are potentially added
        const childNodesForM1 = newRenderedNodes.filter(n => n.data.parentNode === m1ContainerNodeId);
        let requiredHeight = MIN_MASTER_NODE_HEIGHT;
        let requiredWidth = DEFAULT_MASTER_NODE_WIDTH;

        if (childNodesForM1.length > 0) {
            const maxY = Math.max(...childNodesForM1.map(n => n.position.y + (n.height || CARD_NODE_HEIGHT)));
            const maxX = Math.max(...childNodesForM1.map(n => n.position.x + (n.width || CARD_NODE_WIDTH)));
            requiredHeight = Math.max(maxY + 40, MIN_MASTER_NODE_HEIGHT); // Add padding
            requiredWidth = Math.max(maxX + 40, DEFAULT_MASTER_NODE_WIDTH, internalNodeXOffsetSBase);
        }

        const m1NodeToUpdateIndex = newRenderedNodes.findIndex(n => n.id === m1ContainerNodeId);
        if (m1NodeToUpdateIndex !== -1) {
            newRenderedNodes[m1NodeToUpdateIndex].height = requiredHeight;
            newRenderedNodes[m1NodeToUpdateIndex].style = { ...newRenderedNodes[m1NodeToUpdateIndex].style, height: requiredHeight, width: requiredWidth };
            newRenderedNodes[m1NodeToUpdateIndex].width = requiredWidth;
        }

        // Position T nodes based on final M container size
        const masterNode = newRenderedNodes[m1NodeToUpdateIndex];
        const currentMasterNodeWidth = masterNode?.width ?? requiredWidth;
        
        tNodeYOffset = masterNode.position.y; // Reset Y for T nodes
        let tNodeXBase = masterNode.position.x + currentMasterNodeWidth + 150;
        let tNodesInCurrentColumn = 0;
        const tNodesPerColumn = Math.floor((masterNode.height || requiredHeight) / (CARD_NODE_HEIGHT + 30)) || 1;


        Array.from(landingNodesMap.values()).forEach((tNode, index) => {
            const tNodeIndex = newRenderedNodes.findIndex(n => n.id === tNode.id);
            if (tNodeIndex !== -1) {
                 if (tNodesInCurrentColumn >= tNodesPerColumn) {
                    tNodeXBase += CARD_NODE_WIDTH + 50; // New column for T nodes
                    tNodeYOffset = masterNode.position.y;
                    tNodesInCurrentColumn = 0;
                }
                newRenderedNodes[tNodeIndex].position = { x: tNodeXBase, y: tNodeYOffset };
                tNodeYOffset += CARD_NODE_HEIGHT + 30;
                tNodesInCurrentColumn++;
            }
        });
        
        // Adjust U node position based on final M height
        const uNodeGlobalToUpdateIndex = newRenderedNodes.findIndex(n => n.id === uGlobalNodeId);
        if (uNodeGlobalToUpdateIndex !== -1) {
           newRenderedNodes[uNodeGlobalToUpdateIndex].position.y = masterNode.position.y + (requiredHeight / 2) - (CARD_NODE_HEIGHT / 2);
        }

        setNodesInternal(newRenderedNodes);
        setEdgesInternal(newRenderedEdges);
        setNodeIdCounter(currentIdCounter);

        setTimeout(() => { fitView({ duration: 400, padding: 0.1 }); }, 100);
        toast({ title: `主控 ${m1Config.name} 的实例已渲染。`, description: `共 ${m1ValidInstances.length} 个实例。` });

    } catch (error: any) {
      console.error(`渲染主控 ${m1Config.name} 实例失败:`, error);
      toast({ title: `渲染主控 ${m1Config.name} 实例失败`, description: error.message, variant: "destructive" });
      setNodesInternal([]); setEdgesInternal([]);
    }
  }, [getApiConfigById, getApiRootUrl, getToken, toast, setNodesInternal, setEdgesInternal, fitView, apiConfigsList, activeApiConfig]);


  return (
    <div ref={editorContainerRef} className="flex flex-col flex-grow h-full relative">
      <div className="flex flex-row flex-grow h-full overflow-hidden">
        <ScrollArea className="w-60 flex-shrink-0 border-r bg-muted/30 p-2">
          <div className="flex flex-col h-full bg-background rounded-lg shadow-md border">
            <div className="flex flex-col p-3">
              <h2 className="text-sm font-semibold font-title mb-1 flex items-center">
                <ListTree size={16} className="mr-2 text-primary" />
                主控列表 (M)
              </h2>
              <p className="text-xs text-muted-foreground font-sans mb-2">拖拽主控到画布。</p>
              <ScrollArea className="flex-grow pr-1 max-h-60">
                <MastersPalette onRenderMasterInstances={handleRenderMasterInstancesOnCanvas} />
              </ScrollArea>
            </div>
            <Separator className="my-0" />
            <div className="flex flex-col p-3">
              <h2 className="text-sm font-semibold font-title mb-1 flex items-center">
                <Puzzle size={16} className="mr-2 text-primary" />
                组件 (U, C, S, T)
              </h2>
              <p className="text-xs text-muted-foreground font-sans mb-2">拖拽组件到画布或主控容器。</p>
              <div className="flex-grow overflow-y-auto pr-1"><ComponentsPalette /></div>
            </div>
            <Separator className="my-0" />
            <div className="flex flex-col flex-grow min-h-0 p-3">
              <h2 className="text-sm font-semibold font-title mb-1 flex items-center">
                <InfoIcon size={16} className="mr-2 text-primary" />
                节点属性
              </h2>
              <p className="text-xs text-muted-foreground font-sans mb-2">{selectedNode ? `选中: ${selectedNode.data.label || selectedNode.id}` : '点击节点查看属性。'}</p>
              <div className="flex-grow overflow-y-hidden"><PropertiesDisplayPanel selectedNode={selectedNode} /></div>
            </div>
          </div>
        </ScrollArea>
        <div className="flex-grow flex flex-col overflow-hidden p-2">
          <div className="flex-grow relative">
            <div className="absolute inset-0">
              <TopologyCanvasWrapper
                nodes={nodesInternal} edges={edgesInternal} onNodesChange={onNodesChangeInternal} onEdgesChange={onEdgesChangeInternal} onConnect={onConnect}
                onSelectionChange={onSelectionChange} reactFlowWrapperRef={reactFlowWrapperRef} onCenterView={() => handleCenterViewCallback(useReactFlow())}
                onClearCanvas={handleClearCanvasCallback} onTriggerSubmitTopology={handleTriggerSubmitTopology}
                canSubmit={(nodesInternal.length > 0 || edgesInternal.length > 0) && !isSubmitting}
                isSubmitting={isSubmitting}
                onNodeDropOnCanvas={handleNodeDroppedOnCanvas} onNodeContextMenu={onNodeContextMenu} onEdgeContextMenu={onEdgeContextMenu} onPaneClick={onPaneClick}
              />
            </div>
          </div>
        </div>
      </div>
      {contextMenu && (
        <div ref={menuRef} style={{ top: contextMenu.top, left: contextMenu.left }} className="absolute z-[100] bg-popover border border-border rounded-md shadow-xl p-1.5 text-popover-foreground text-xs min-w-[150px]">
          {contextMenu.type === 'node' && (contextMenu.data as Node).data.role !== 'U' && (
            <Button variant="ghost" size="sm" className="w-full justify-start px-2 py-1 h-auto text-xs font-sans" onClick={() => handleOpenEditNodeDialog(contextMenu.data as Node)}>修改属性</Button>
          )}
          {(contextMenu.data as Node).type === 'node' && (contextMenu.data as Node).data.role === 'S' && (contextMenu.data as Node).data.parentNode && (
            <Button variant="ghost" size="sm" className="w-full justify-start px-2 py-1 h-auto text-xs font-sans" onClick={() => handleChangeNodeRole((contextMenu.data as Node).id, 'C')}>更改为入口(c)</Button>
          )}
          {(contextMenu.data as Node).type === 'node' && (contextMenu.data as Node).data.role === 'C' && (contextMenu.data as Node).data.parentNode && !(contextMenu.data as Node).data.isDefaultClient && (
            <Button variant="ghost" size="sm" className="w-full justify-start px-2 py-1 h-auto text-xs font-sans" onClick={() => handleChangeNodeRole((contextMenu.data as Node).id, 'S')}>更改为出口(s)</Button>
          )}
          {contextMenu.type === 'node' && <Separator className="my-1"/>}
          {contextMenu.type === 'node' && (
              <Button variant="ghost" size="sm" className="w-full justify-start px-2 py-1 h-auto text-xs font-sans text-destructive hover:!text-destructive" onClick={() => handleDeleteNode(contextMenu.data as Node)}>删除角色</Button>
          )}
          {contextMenu.type === 'edge' && (
            <Button variant="ghost" size="sm" className="w-full justify-start px-2 py-1 h-auto text-xs font-sans text-destructive hover:!text-destructive" onClick={() => handleDeleteEdge(contextMenu.data as Edge)}>删除链路</Button>
          )}
        </div>
      )}
       <SubmitTopologyConfirmationDialog
        open={isSubmitConfirmOpen}
        onOpenChange={(isOpen) => {
            setIsSubmitConfirmOpen(isOpen);
            if (!isOpen && !createInstanceMutation.isPending) {
                setIsSubmitting(false);
            }
        }}
        instancesToCreate={instancesForConfirmation}
        onConfirm={executeActualSubmission}
        isSubmitting={createInstanceMutation.isPending}
      />
      <EditTopologyNodeDialog
        open={isEditNodeDialogOpen}
        onOpenChange={(isOpen) => {
            setIsEditNodeDialogOpen(isOpen);
            if (!isOpen) setEditingNodeContext(null);
        }}
        node={editingNodeContext?.node || null}
        hasServerNodesInParentContainer={editingNodeContext?.hasS || false}
        onSave={handleSaveNodeProperties}
      />
    </div>
  );
}
