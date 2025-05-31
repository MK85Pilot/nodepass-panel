"use client";

import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import ReactFlow, {
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  Node,
  Edge,
  Position,
  MarkerType,
  Panel,
  NodeProps,
  Handle,
  Connection,
  addEdge,
  ReactFlowProvider,
  useReactFlow,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { AppLayout } from '@/components/layout/AppLayout';
import { useApiConfig } from '@/hooks/use-api-key';
import { nodePassApi } from '@/lib/api';
import type { Instance } from '@/types/nodepass';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, RefreshCw, AlertTriangle, Network, ServerIcon, SmartphoneIcon, Link2, UserCircle2, Globe, Settings, Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { InstanceDetailsModal } from '@/components/nodepass/InstanceDetailsModal';
import { ScrollArea } from '@/components/ui/scroll-area';

// 节点类型定义
export type NodeData = {
  label: string;
  type: 'master' | 'server' | 'client' | 'user' | 'target';
  apiId?: string;
  apiName?: string;
  tunnelAddr?: string;
  targetAddr?: string;
  originalInstance?: Instance; // Store original instance data if node is from API
};

// 自定义节点组件
const CustomNode = ({ data, id, selected }: NodeProps<NodeData>) => {
  const getNodeBorderColor = () => {
    switch (data.type) {
      case 'master':
        return 'border-yellow-500';
      case 'server':
        return 'border-primary';
      case 'client':
        return 'border-accent';
      case 'user':
        return 'border-green-500';
      case 'target':
        return 'border-purple-500';
      default:
        return 'border-border';
    }
  };

  const getIcon = () => {
    const commonClass = "h-5 w-5 mr-2 shrink-0";
    switch (data.type) {
      case 'master':
        return <Settings className={`${commonClass} text-yellow-500`} />;
      case 'server':
        return <ServerIcon className={`${commonClass} text-primary`} />;
      case 'client':
        return <SmartphoneIcon className={`${commonClass} text-accent`} />;
      case 'user':
        return <UserCircle2 className={`${commonClass} text-green-500`} />;
      case 'target':
        return <Globe className={`${commonClass} text-purple-500`} />;
      default:
        return <Info className={`${commonClass} text-muted-foreground`} />;
    }
  };

  return (
    <div
      className={`shadow-lg rounded-lg bg-card border-2 text-card-foreground hover:shadow-xl transition-shadow duration-200 
                  ${getNodeBorderColor()} p-3 space-y-1.5 min-w-[200px] text-xs
                  ${selected ? 'ring-2 ring-offset-2 ring-ring' : ''}`}
      onContextMenu={(e) => {
        e.preventDefault();
        // Context menu logic can be added here if needed, or managed by ReactFlow
      }}
    >
      <Handle type="target" position={Position.Left} className="!bg-gray-400 !h-4 !w-2 !border-2 !border-card" style={{ left: '-0.6rem' }}/>
      <div className="flex items-center">
        {getIcon()}
        <div className="text-sm font-semibold text-card-foreground truncate" title={data.label}>{data.label}</div>
      </div>
      {data.apiName && data.type !== 'master' && (
        <div className="text-xs text-muted-foreground mt-1">主控: {data.apiName}</div>
      )}
      {data.tunnelAddr && (
        <div className="font-mono text-muted-foreground">监听: {data.tunnelAddr}</div>
      )}
      {data.targetAddr && (
        <div className="font-mono text-green-600 dark:text-green-400 flex items-center">
          <Link2 className="inline-block h-3 w-3 mr-1.5 shrink-0" />
          <span>落地: {data.targetAddr}</span>
        </div>
      )}
      <Handle type="source" position={Position.Right} className="!bg-gray-400 !h-4 !w-2 !border-2 !border-card" style={{ right: '-0.6rem' }}/>
    </div>
  );
};

const nodeTypes = {
  custom: CustomNode,
};

// Main component content
function TopologyPageContent() {
  const { apiConfigsList, isLoading: isLoadingApiConfig, getApiRootUrl, getToken } = useApiConfig();
  const { toast } = useToast();
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [selectedInstanceForDetails, setSelectedInstanceForDetails] = useState<Instance | null>(null);
  const [selectedApiConfigForModal, setSelectedApiConfigForModal] = useState<string | null>(null);
  const [masterNodesCount, setMasterNodesCount] = useState<number>(0);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const reactFlowInstance = useReactFlow();


  const { data: allFetchedInstancesData, isLoading: isLoadingData, error: fetchErrorGlobal, refetch } = useQuery<
    (Instance & { apiId: string; apiName: string })[], // Ensure apiId and apiName are part of the type
    Error
  >({
    queryKey: ['allInstancesForTopology', apiConfigsList.map(c => c.id).join(',')],
    queryFn: async () => {
      if (apiConfigsList.length === 0) {
        return [];
      }
      let combinedInstances: (Instance & { apiId: string; apiName: string })[] = [];

      const results = await Promise.allSettled(
        apiConfigsList.map(async (config) => {
          const apiRootVal = getApiRootUrl(config.id);
          const tokenVal = getToken(config.id);
          if (!apiRootVal || !tokenVal) {
            console.warn(`拓扑页: 主控配置 "${config.name}" (ID: ${config.id}) 无效。跳过。`);
            return [];
          }
          try {
            const data = await nodePassApi.getInstances(apiRootVal, tokenVal);
            // Add apiId and apiName to each instance
            return data.map(inst => ({ ...inst, apiId: config.id, apiName: config.name }));
          } catch (error: any) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`拓扑页: 从主控 "${config.name}" 加载实例失败。错误:`, errorMessage);
            toast({
              title: `加载 "${config.name}" 失败`,
              description: errorMessage.length > 100 ? errorMessage.substring(0, 97) + "..." : errorMessage,
              variant: 'destructive',
            });
            return [];
          }
        })
      );

      results.forEach(result => {
        if (result.status === 'fulfilled' && result.value) {
          combinedInstances.push(...result.value);
        }
      });
      return combinedInstances;
    },
    enabled: !isLoadingApiConfig && apiConfigsList.length > 0,
    refetchInterval: 30000, // Increased interval
    onSuccess: () => {
      setLastRefreshed(new Date());
    },
  });

  const onConnect = useCallback((params: Connection) => {
    const sourceNode = nodes.find(n => n.id === params.source);
    const targetNode = nodes.find(n => n.id === params.target);

    if (!sourceNode || !targetNode) {
      console.warn("onConnect: Source or target node not found for connection:", params);
      return;
    }

    const isValidConnection = (sourceType: NodeData['type'], targetType: NodeData['type']) => {
      if (sourceType === 'user' && targetType === 'client') return true;
      if (sourceType === 'client' && targetType === 'server') return true;
      if (sourceType === 'server' && targetType === 'target') return true;
      if (sourceType === 'client' && targetType === 'target') return true;
      // Disallow master connections via onConnect for now, they are structural.
      return false;
    };

    if (!isValidConnection(sourceNode.data.type, targetNode.data.type)) {
      toast({
        title: '无效的连接',
        description: `无法从 ${sourceNode.data.type} 类型连接到 ${targetNode.data.type} 类型。`,
        variant: 'destructive',
      });
      return;
    }

    setEdges((eds) =>
      addEdge(
        {
          ...params,
          type: 'smoothstep',
          animated: true,
          style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: 'hsl(var(--primary))',
            width: 20,
            height: 20,
          },
        },
        eds
      )
    );
  }, [nodes, toast, setEdges]);


  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData('application/reactflow-type') as NodeData['type'] | 'master-config';
      const draggedApiId = event.dataTransfer.getData('application/reactflow-api-id');
      const draggedApiName = event.dataTransfer.getData('application/reactflow-api-name');
      
      if (!type || !reactFlowInstance) return;

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      
      let newNode: Node<NodeData>;

      if (type === 'master-config') {
        const masterId = `master-${draggedApiId}`;
        if (nodes.some(node => node.id === masterId)) {
          toast({
            title: '主控已存在',
            description: `主控 "${draggedApiName}" 已在画布中。`,
            variant: 'default',
          });
          return;
        }

        newNode = {
          id: masterId,
          type: 'custom',
          position,
          data: {
            label: draggedApiName || '主控',
            type: 'master',
            apiId: draggedApiId,
            apiName: draggedApiName,
          },
        };
        setMasterNodesCount(prev => prev + 1);

         // Automatically add a server for the first master, or a client for subsequent masters
        const childPosition = { x: position.x + 280, y: position.y };
        let companionNode: Node<NodeData> | null = null;
        let edgeToCompanion: Edge | null = null;

        if (masterNodesCount === 0) { // This is the first master being added
            const serverId = `server-for-${draggedApiId}-${Date.now()}`;
            companionNode = {
                id: serverId,
                type: 'custom',
                position: childPosition,
                data: {
                    label: `默认服务端 (${draggedApiName})`,
                    type: 'server',
                    apiId: draggedApiId,
                    apiName: draggedApiName,
                },
            };
            // No automatic edge from master to server
        } else { // Subsequent masters are assumed to be for clients
            const clientId = `client-for-${draggedApiId}-${Date.now()}`;
            companionNode = {
                id: clientId,
                type: 'custom',
                position: childPosition,
                data: {
                    label: `默认客户端 (${draggedApiName})`,
                    type: 'client',
                    apiId: draggedApiId,
                    apiName: draggedApiName,
                },
            };
            // Try to connect this new client to an existing server from the first master
            const firstMaster = nodes.find(n => n.data.type === 'master' && n.data.apiId !== draggedApiId);
            if (firstMaster) {
                const firstServerOfFirstMaster = nodes.find(n => n.data.type === 'server' && n.data.apiId === firstMaster.data.apiId);
                if (firstServerOfFirstMaster && companionNode.data.type === 'client') { // Ensure companion is a client
                     edgeToCompanion = {
                        id: `edge-${companionNode.id}-${firstServerOfFirstMaster.id}`,
                        source: companionNode.id, // client
                        target: firstServerOfFirstMaster.id, // server
                        type: 'smoothstep', animated: true, style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color: 'hsl(var(--primary))', width: 20, height:20 },
                    };
                }
            }
        }
        setNodes((nds) => nds.concat(newNode, companionNode ? [companionNode] : []));
        if (edgeToCompanion) {
            setEdges((eds) => eds.concat(edgeToCompanion!));
        }

      } else { // Node from the "Node Types" panel
        newNode = {
          id: `${type}-${Date.now()}`,
          type: 'custom',
          position,
          data: {
            label: `${type.charAt(0).toUpperCase() + type.slice(1)} 节点`,
            type: type as NodeData['type'], // Ensure type is valid NodeData['type']
          },
        };
        setNodes((nds) => nds.concat(newNode));
      }

    },
    [reactFlowInstance, nodes, masterNodesCount, toast, setNodes, setEdges] // Added setEdges
  );

  const MasterCardsPanel = () => (
    <Panel position="top-right" className="bg-background/90 p-3 rounded-lg shadow-md border w-52">
      <h3 className="text-sm font-semibold mb-2 text-foreground">可用主控</h3>
      <ScrollArea className="h-[180px]">
        <div className="space-y-2">
          {apiConfigsList.length === 0 && <p className="text-xs text-muted-foreground">未配置主控连接。</p>}
          {apiConfigsList.map((config) => (
            <div
              key={config.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('application/reactflow-type', 'master-config'); // Special type for master from panel
                e.dataTransfer.setData('application/reactflow-api-id', config.id);
                e.dataTransfer.setData('application/reactflow-api-name', config.name);
                e.dataTransfer.effectAllowed = "move";
              }}
              className="flex items-center gap-2 p-2 border rounded-md cursor-grab hover:bg-accent/10 active:cursor-grabbing transition-colors"
            >
              <Settings className="h-4 w-4 text-yellow-500 shrink-0" />
              <span className="text-xs font-medium truncate" title={config.name}>{config.name}</span>
            </div>
          ))}
        </div>
      </ScrollArea>
    </Panel>
  );

  const NodeTypesPanel = () => {
    const nodeCreationTypes: { type: NodeData['type']; label: string; icon: React.ElementType }[] = [
      { type: 'server', label: '服务端', icon: ServerIcon },
      { type: 'client', label: '客户端', icon: SmartphoneIcon },
      { type: 'user', label: '用户', icon: UserCircle2 },
      { type: 'target', label: '落地', icon: Globe },
    ];
    return (
    <Panel position="top-left" className="bg-background/90 p-3 rounded-lg shadow-md border w-48">
      <h3 className="text-sm font-semibold mb-2 text-foreground">节点类型</h3>
      <div className="space-y-2">
        {nodeCreationTypes.map(({ type, label, icon: Icon }) => (
            <div
              key={type}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('application/reactflow-type', type);
                e.dataTransfer.effectAllowed = "move";
              }}
              className="flex items-center gap-2 p-2 border rounded-md cursor-grab hover:bg-accent/10 active:cursor-grabbing transition-colors"
            >
              <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-xs font-medium">{label}</span>
            </div>
        ))}
      </div>
    </Panel>
    );
  };
  
  useEffect(() => {
    // Update masterNodesCount when nodes change (e.g. a master node is deleted)
    setMasterNodesCount(nodes.filter(node => node.data.type === 'master').length);
  }, [nodes]);


  if (isLoadingApiConfig) {
    return (
      <AppLayout>
        <div className="flex-grow container mx-auto px-4 py-8 flex items-center justify-center h-[calc(100vh-var(--header-height)-var(--footer-height)-4rem)]">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="ml-4 text-lg font-sans">加载主控配置...</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl sm:text-3xl font-bold font-title">实例连接拓扑</h1>
          <div className="flex items-center gap-2">
            {lastRefreshed && (
              <span className="text-xs text-muted-foreground font-sans">
                数据刷新: {lastRefreshed.toLocaleTimeString()}
              </span>
            )}
            <Button
              variant="outline"
              onClick={() => refetch()}
              disabled={isLoadingData}
              size="sm"
              className="font-sans"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${isLoadingData ? 'animate-spin' : ''}`} />
              {isLoadingData ? '刷新中...' : '刷新数据'}
            </Button>
          </div>
        </div>
        
        {fetchErrorGlobal && (
          <Card className="mb-4 border-destructive bg-destructive/10">
            <CardHeader>
              <CardTitle className="text-destructive flex items-center text-base">
                <AlertTriangle size={18} className="mr-2" /> 部分数据加载失败
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-destructive text-sm">
                获取部分主控的实例数据时发生错误。拓扑图可能不完整。请检查控制台和主控连接。
              </p>
            </CardContent>
          </Card>
        )}


        <div className="flex-grow border rounded-lg shadow-md bg-background relative" style={{ height: 'calc(100vh - var(--header-height) - var(--footer-height) - 8rem)' }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onDragOver={onDragOver}
            onDrop={onDrop}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            proOptions={{ hideAttribution: true }}
          >
            <Controls className="fill-foreground stroke-foreground text-foreground" />
            <MiniMap nodeStrokeWidth={3} zoomable pannable className="bg-background border-border"/>
            <Background gap={16} color="hsl(var(--border))" />
            <NodeTypesPanel />
            <MasterCardsPanel />
          </ReactFlow>
        </div>

        <InstanceDetailsModal
          instance={selectedInstanceForDetails}
          open={!!selectedInstanceForDetails}
          onOpenChange={(open) => {
            if (!open) {
              setSelectedInstanceForDetails(null);
              setSelectedApiConfigForModal(null);
            }
          }}
          apiRoot={selectedApiConfigForModal ? getApiRootUrl(selectedApiConfigForModal) : null}
          apiToken={selectedApiConfigForModal ? getToken(selectedApiConfigForModal) : null}
        />
      </div>
    </AppLayout>
  );
}


export default function TopologyPage() {
  return (
    <ReactFlowProvider>
      <TopologyPageContent />
    </ReactFlowProvider>
  );
}
