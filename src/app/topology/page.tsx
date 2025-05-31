
"use client";

import type { NextPage } from 'next';
import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  MiniMap,
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
} from 'reactflow';
import 'reactflow/dist/style.css';

import { AppLayout } from '@/components/layout/AppLayout';
import { useApiConfig, type NamedApiConfig } from '@/hooks/use-api-key';
import { nodePassApi } from '@/lib/api';
import type { Instance } from '@/types/nodepass';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, RefreshCw, AlertTriangle, Network, ServerIcon, SmartphoneIcon, Globe, UserCircle2, Settings, Info, Eraser, UploadCloud, Edit3, Trash2 } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { AppLogEntry } from '@/components/nodepass/EventLog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

const initialViewport: Viewport = { x: 0, y: 0, zoom: 1.2 };

interface TopologyNodeData {
  label: string;
  type: 'controller' | 'server' | 'client' | 'landing' | 'user' | 'default';
  apiId?: string;
  apiName?: string;
  // Add other specific data properties as needed
}

const initialNodes: Node<TopologyNodeData>[] = [];
const initialEdges: Edge[] = [];

let nodeIdCounter = 0;
const getId = (prefix = 'dndnode_') => `${prefix}${nodeIdCounter++}`;

const TopologyPageContent: NextPage = () => {
  const { apiConfigsList, isLoading: isLoadingApiConfig, getApiRootUrl, getToken } = useApiConfig();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, getNodes, getNode } = useReactFlow();

  const [nodes, setNodes, onNodesChange] = useNodesState<TopologyNodeData>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNodeForProps, setSelectedNodeForProps] = useState<Node<TopologyNodeData> | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [isClearCanvasAlertOpen, setIsClearCanvasAlertOpen] = useState(false);

  const [contextMenu, setContextMenu] = useState<{
    mouseX: number;
    mouseY: number;
    node: Node<TopologyNodeData>;
  } | null>(null);

  const [isEditLabelDialogOpen, setIsEditLabelDialogOpen] = useState(false);
  const [editingNodeNewLabel, setEditingNodeNewLabel] = useState('');
  
  const [isDeleteNodeDialogOpen, setIsDeleteNodeDialogOpen] = useState(false);
  const [nodeToDelete, setNodeToDelete] = useState<Node<TopologyNodeData> | null>(null);


  const { data: allFetchedInstancesData, isLoading: isLoadingInstances, error: fetchErrorGlobal, refetch: refetchInstances } = useQuery<
    (Instance & { apiId: string; apiName: string })[],
    Error
  >({
    queryKey: ['allInstancesForTopology', apiConfigsList.map(c => c.id).join(',')],
    queryFn: async () => {
      if (apiConfigsList.length === 0) return [];
      // This data isn't directly used to populate React Flow nodes currently,
      // but could be used for validation or reference in the future.
      console.log("Fetched instances data (for reference, not direct graph population):", allFetchedInstancesData);
      return []; 
    },
    enabled: !isLoadingApiConfig && apiConfigsList.length > 0,
    onSuccess: () => setLastRefreshed(new Date()),
  });

  const isValidConnection = useCallback((sourceNodeType: string, targetNodeType: string): boolean => {
    const validConnections: Record<string, string[]> = {
      'controller': ['server', 'client'],
      'user': ['client'],
      'client': ['server', 'landing'],
      'server': ['landing', 'client'], // Server can also output to a client if it's a passthrough/proxy
    };
    return validConnections[sourceNodeType]?.includes(targetNodeType) || false;
  }, []);

  const onConnect: OnConnect = useCallback(
    (params) => {
      const sourceNode = getNode(params.source!);
      const targetNode = getNode(params.target!);

      if (sourceNode && targetNode && sourceNode.data && targetNode.data) {
        if (isValidConnection(sourceNode.data.type, targetNode.data.type)) {
          setEdges((eds) => addEdge({ ...params, type: 'smoothstep', animated: true, markerEnd: { type: MarkerType.ArrowClosed, width: 20, height: 20, color: 'hsl(var(--primary))' }, style: { strokeWidth: 2, stroke: 'hsl(var(--primary))' } }, eds));
          toast({ title: "连接已创建", description: `节点 "${sourceNode.data.label}" 已连接到 "${targetNode.data.label}"。` });
        } else {
          toast({ title: "无效的连接", description: `无法从 "${sourceNode.data.type}" 类型连接到 "${targetNode.data.type}" 类型。`, variant: "destructive" });
        }
      }
    },
    [setEdges, getNode, isValidConnection, toast]
  );

  const onDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (!reactFlowWrapper.current) return;

      const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
      const type = event.dataTransfer.getData('application/reactflow-nodetype') as TopologyNodeData['type'];
      let label = event.dataTransfer.getData('application/reactflow-label');
      const apiId = event.dataTransfer.getData('application/reactflow-apiid');
      const apiName = event.dataTransfer.getData('application/reactflow-apiname');

      if (typeof type === 'undefined' || !type) {
        return;
      }

      const position = screenToFlowPosition({
        x: event.clientX - reactFlowBounds.left,
        y: event.clientY - reactFlowBounds.top,
      });
      
      let newNodeType = type;
      if (type === 'controller' && apiId) { // It's from the "已配置主控" panel
          const existingControllers = getNodes().filter(n => n.data.type === 'controller');
          if (existingControllers.length === 0) {
              // First controller from API config, create as actual controller
              label = apiName || '主控';
          } else {
              // Subsequent controllers from API config, create as client by default
              newNodeType = 'client';
              label = `客户端 (${apiName || '未知主控'})`;
          }
      }


      const newNode: Node<TopologyNodeData> = {
        id: getId(),
        type: 'default',
        position,
        data: { 
          label: label || `${newNodeType} 节点`,
          type: newNodeType,
          ...(apiId && newNodeType === 'controller' && { apiId, apiName }), // Store API info only if it's a controller type
        },
        style: {
          border: '2px solid',
          borderColor: getNodeBorderColor(newNodeType),
          borderRadius: '0.5rem',
          padding: '10px 15px',
          minWidth: '180px',
          background: 'hsl(var(--card))',
          color: 'hsl(var(--card-foreground))',
          boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
        }
      };

      setNodes((nds) => nds.concat(newNode));
      toast({title: "节点已添加", description: `节点 "${newNode.data.label}" 已添加到画布。`})

      // If it was the first controller from API Config, also add a default server
      if (type === 'controller' && apiId && newNodeType === 'controller') {
          const serverNode: Node<TopologyNodeData> = {
              id: getId('server_'),
              type: 'default',
              position: { x: position.x + 220, y: position.y },
              data: { label: '默认服务端', type: 'server' },
               style: {
                  border: '2px solid',
                  borderColor: getNodeBorderColor('server'),
                  borderRadius: '0.5rem',
                  padding: '10px 15px',
                  minWidth: '180px',
                  background: 'hsl(var(--card))',
                  color: 'hsl(var(--card-foreground))',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
               }
          };
          setNodes((nds) => nds.concat(serverNode));
          setEdges((eds) => addEdge({
              id: `e-${newNode.id}-${serverNode.id}`,
              source: newNode.id,
              target: serverNode.id,
              type: 'smoothstep',
              animated: true,
              markerEnd: { type: MarkerType.ArrowClosed, width: 20, height: 20, color: 'hsl(var(--primary))' },
              style: { strokeWidth: 2, stroke: 'hsl(var(--primary))' },
          }, eds));
      }
    },
    [screenToFlowPosition, setNodes, setEdges, toast, getNodes]
  );

  const handleNodeClick = useCallback((event: React.MouseEvent, node: Node<TopologyNodeData>) => {
    setSelectedNodeForProps(node);
    setContextMenu(null); // Close context menu on left click
  }, []);

  const handlePaneClick = useCallback(() => {
    setSelectedNodeForProps(null);
    setContextMenu(null); // Close context menu on pane click
  }, []);
  
  const clearCanvas = () => {
    setNodes([]);
    setEdges([]);
    setSelectedNodeForProps(null);
    setContextMenu(null);
    toast({ title: "画布已清空", description: "所有节点和连接已移除。" });
    setIsClearCanvasAlertOpen(false);
  };

  const handleNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node<TopologyNodeData>) => {
      event.preventDefault();
      setSelectedNodeForProps(node); // Also select it for the properties panel
      setContextMenu({
        mouseX: event.clientX,
        mouseY: event.clientY,
        node: node,
      });
    },
    [setSelectedNodeForProps]
  );

  const handleEditLabel = () => {
    if (contextMenu?.node) {
      setEditingNodeNewLabel(contextMenu.node.data.label);
      setIsEditLabelDialogOpen(true);
    }
    setContextMenu(null);
  };

  const handleSaveLabel = () => {
    if (contextMenu?.node) {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === contextMenu.node.id
            ? { ...n, data: { ...n.data, label: editingNodeNewLabel } }
            : n
        )
      );
      toast({ title: "标签已更新", description: `节点 "${contextMenu.node.data.label}" 的标签已更改。` });
    }
    setIsEditLabelDialogOpen(false);
  };
  
  const handleDeleteNode = () => {
    if (contextMenu?.node) {
      setNodeToDelete(contextMenu.node);
      setIsDeleteNodeDialogOpen(true);
    }
    setContextMenu(null);
  };

  const confirmDeleteNode = () => {
    if (nodeToDelete) {
      setNodes((nds) => nds.filter((n) => n.id !== nodeToDelete.id));
      setEdges((eds) => eds.filter((e) => e.source !== nodeToDelete.id && e.target !== nodeToDelete.id));
      toast({ title: "节点已删除", description: `节点 "${nodeToDelete.data.label}" 已被删除。`, variant: "destructive" });
      if (selectedNodeForProps?.id === nodeToDelete.id) {
        setSelectedNodeForProps(null);
      }
    }
    setIsDeleteNodeDialogOpen(false);
    setNodeToDelete(null);
  };


  const nodePanelTypes: { type: TopologyNodeData['type']; title: string; icon: React.ElementType; iconColorClass: string; }[] = [
    { type: 'server', title: '服务端', icon: ServerIcon, iconColorClass: "text-primary" },
    { type: 'client', title: '客户端', icon: SmartphoneIcon, iconColorClass: "text-accent" },
    { type: 'landing', title: '落地', icon: Globe, iconColorClass: "text-purple-500" },
    { type: 'user', title: '用户源', icon: UserCircle2, iconColorClass: "text-green-500" },
    { type: 'controller', title: '主控 (通用)', icon: Settings, iconColorClass: "text-yellow-500" },
  ];

  const onDragStart = (event: React.DragEvent<HTMLDivElement>, nodeType: TopologyNodeData['type'], label?: string, apiId?: string, apiName?: string) => {
    event.dataTransfer.setData('application/reactflow-nodetype', nodeType);
    event.dataTransfer.setData('application/reactflow-label', label || `${nodeType} Node`);
    if (apiId) event.dataTransfer.setData('application/reactflow-apiid', apiId);
    if (apiName) event.dataTransfer.setData('application/reactflow-apiname', apiName);
    event.dataTransfer.effectAllowed = 'copy';
  };

  const getNodeBorderColor = (nodeType: TopologyNodeData['type'] | undefined) => {
    switch (nodeType) {
        case 'controller': return 'hsl(var(--ring))'; // Using ring color as primary is blue
        case 'server': return 'hsl(var(--chart-2))';
        case 'client': return 'hsl(var(--accent))';
        case 'landing': return 'hsl(var(--chart-4))';
        case 'user': return 'hsl(var(--chart-1))';
        default: return 'hsl(var(--border))';
    }
  };


  if (isLoadingApiConfig) {
    return (
      <AppLayout onLog={(message, type) => console.log(`[AppLayout Log] ${type}: ${message}`)}>
        <div className="flex-grow container mx-auto px-4 py-8 flex items-center justify-center h-[calc(100vh-var(--header-height)-var(--footer-height)-4rem)]">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="ml-4 text-lg font-sans">加载主控配置...</p>
        </div>
      </AppLayout>
    );
  }
  
  return (
    <AppLayout onLog={(message, type) => console.log(`[AppLayout Log] ${type}: ${message}`)}>
      <div className="flex flex-col h-full">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-2">
          <h1 className="text-2xl sm:text-3xl font-bold font-title">实例连接拓扑 (React Flow)</h1>
          <div className="flex items-center gap-2 flex-wrap">
            {lastRefreshed && (
              <span className="text-xs text-muted-foreground font-sans">
                数据刷新: {lastRefreshed.toLocaleTimeString()}
              </span>
            )}
            <Button variant="outline" onClick={() => refetchInstances()} disabled={isLoadingInstances} size="sm" className="font-sans">
              <RefreshCw className={`mr-1 h-4 w-4 ${isLoadingInstances ? 'animate-spin' : ''}`} />
              {isLoadingInstances ? '刷新中' : '刷新数据'}
            </Button>
            <Button variant="destructive" onClick={() => setIsClearCanvasAlertOpen(true)} size="sm" className="font-sans">
              <Eraser className="mr-1 h-4 w-4" />
              清空画布
            </Button>
            {/* Placeholder for Submit Topology Button
            <Button variant="default" onClick={() => {}} size="sm" className="font-sans bg-accent hover:bg-accent/90 text-accent-foreground">
              <UploadCloud className="mr-1 h-4 w-4" />
              提交创建实例
            </Button>
            */}
          </div>
        </div>

        {fetchErrorGlobal && (
          <Card className="mb-4 border-destructive bg-destructive/10">
            <CardHeader><CardTitle className="text-destructive flex items-center text-base"><AlertTriangle size={18} className="mr-2" />部分数据加载失败</CardTitle></CardHeader>
            <CardContent><p className="text-destructive text-sm font-sans">获取部分主控实例数据时出错: {fetchErrorGlobal.message}</p></CardContent>
          </Card>
        )}

        <div className="flex-grow flex gap-4" style={{ height: 'calc(100vh - var(--header-height) - var(--footer-height) - 10rem)' }}>
          {/* Left Panel narrowed from w-72 to w-60 */}
          <div className="w-60 flex-shrink-0 space-y-3 h-full overflow-y-hidden flex flex-col">
            <Card className="shadow-sm flex-shrink-0">
              <CardHeader className="py-2.5 px-3"><CardTitle className="text-sm font-title flex items-center"><Settings className="mr-1.5 h-4 w-4 text-yellow-500"/>已配置主控</CardTitle></CardHeader>
              <CardContent className="p-1.5"><ScrollArea className="h-[120px]">
                <div className="space-y-1 p-1">
                  {apiConfigsList.length === 0 && <p className="text-xs text-muted-foreground text-center py-1 font-sans">无主控连接。</p>}
                  {apiConfigsList.map((config) => (
                    <div key={config.id} draggable onDragStart={(e) => onDragStart(e, 'controller', config.name, config.id, config.name)}
                         className="flex items-center gap-1.5 p-1 border rounded cursor-grab hover:bg-accent/10 active:cursor-grabbing transition-colors text-xs"
                         title={`拖拽添加主控: "${config.name}"`}>
                      <Settings className="h-3 w-3 text-yellow-500 shrink-0" />
                      <span className="font-medium truncate font-sans">{config.name}</span>
                    </div>
                  ))}
                </div></ScrollArea></CardContent>
            </Card>
            
            <Card className="shadow-sm flex-shrink-0">
              <CardHeader className="py-2.5 px-3"><CardTitle className="text-sm font-title flex items-center"><Network className="mr-1.5 h-4 w-4 text-primary"/>组件面板</CardTitle></CardHeader>
              <CardContent className="p-1.5"><ScrollArea className="h-[140px]">
                <div className="space-y-1 p-1">
                {nodePanelTypes.map(({ type, title, icon: Icon, iconColorClass }) => (
                    <div key={type} draggable onDragStart={(e) => onDragStart(e, type, title)}
                         className="flex items-center gap-1.5 p-1 border rounded cursor-grab hover:bg-accent/10 active:cursor-grabbing transition-colors text-xs"
                         title={`拖拽添加 "${title}"`}>
                        <Icon className={`h-3 w-3 ${iconColorClass || 'text-muted-foreground'} shrink-0`} />
                        <span className="font-medium font-sans">{title}</span>
                    </div>
                ))}
                </div></ScrollArea></CardContent>
            </Card>

            <Card className="shadow-sm flex-grow flex flex-col min-h-0">
              <CardHeader className="py-2.5 px-3 flex-shrink-0">
                <CardTitle className="text-sm font-title flex items-center"><Info className="mr-1.5 h-4 w-4 text-blue-500"/>节点属性</CardTitle>
                <CardDescription className="text-xs font-sans mt-0.5 truncate">
                  {selectedNodeForProps ? `编辑: ${selectedNodeForProps.data.label} (ID: ${selectedNodeForProps.id.substring(0,8)}...)` : "点击节点查看属性。"}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-2.5 flex-grow overflow-y-auto"><ScrollArea className="h-full pr-1">
                {selectedNodeForProps ? (
                  <div className="space-y-2.5">
                    <p className="text-xs font-sans">ID: <span className="font-mono">{selectedNodeForProps.id}</span></p>
                    <p className="text-xs font-sans">类型: <span className="font-mono">{selectedNodeForProps.data.type || 'N/A'}</span></p>
                    <p className="text-xs font-sans">标签: <span className="font-mono">{selectedNodeForProps.data.label}</span></p>
                    {selectedNodeForProps.data.apiName && <p className="text-xs font-sans">来源主控: <span className="font-mono">{selectedNodeForProps.data.apiName}</span></p>}
                    <p className="text-xs text-muted-foreground font-sans mt-2">右键点击节点可编辑标签或删除。</p>
                  </div>
                ) : ( <p className="text-xs text-muted-foreground text-center py-3 font-sans">未选择节点。</p> )}
              </ScrollArea></CardContent>
            </Card>
          </div>

          <div ref={reactFlowWrapper} className="flex-grow border rounded-lg shadow-md bg-background/70 backdrop-blur-sm relative h-full" onDrop={onDrop} onDragOver={onDragOver}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={handleNodeClick}
              onPaneClick={handlePaneClick}
              onNodeContextMenu={handleNodeContextMenu}
              fitView
              fitViewOptions={{ padding: 0.2, minZoom: 0.5, maxZoom: 2.5 }}
              proOptions={{ hideAttribution: true }}
              className="bg-background"
              defaultViewport={initialViewport}
            >
              <Controls />
              <MiniMap nodeStrokeWidth={3} zoomable pannable nodeColor={(n) => getNodeBorderColor(n.data.type)} />
              <Background gap={16} />
            </ReactFlow>
          </div>
        </div>
        
        {/* Context Menu for Nodes */}
        {contextMenu && (
          <DropdownMenu open={!!contextMenu} onOpenChange={(isOpen) => !isOpen && setContextMenu(null)}>
            <DropdownMenuTrigger style={{ position: 'fixed', left: contextMenu.mouseX, top: contextMenu.mouseY }} />
            <DropdownMenuContent align="start" className="w-48 font-sans">
              <DropdownMenuItem onClick={handleEditLabel}>
                <Edit3 className="mr-2 h-4 w-4" />
                编辑标签
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDeleteNode} className="text-destructive hover:!text-destructive focus:!text-destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                删除节点
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Edit Label Dialog */}
        <AlertDialog open={isEditLabelDialogOpen} onOpenChange={setIsEditLabelDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="font-title">编辑节点标签</AlertDialogTitle>
              <AlertDialogDescription className="font-sans">
                为节点 "{contextMenu?.node.data.label}" 输入新标签。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="py-2">
              <Label htmlFor="node-label-input" className="font-sans">新标签</Label>
              <Input
                id="node-label-input"
                value={editingNodeNewLabel}
                onChange={(e) => setEditingNodeNewLabel(e.target.value)}
                className="mt-1 font-sans"
                autoFocus
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setIsEditLabelDialogOpen(false)} className="font-sans">取消</AlertDialogCancel>
              <AlertDialogAction onClick={handleSaveLabel} className="font-sans">保存</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Delete Node Dialog */}
        <AlertDialog open={isDeleteNodeDialogOpen} onOpenChange={setIsDeleteNodeDialogOpen}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle className="font-title">确认删除节点</AlertDialogTitle>
                    <AlertDialogDescription className="font-sans">
                        您确定要删除节点 “{nodeToDelete?.data.label}” 及其所有连接吗？此操作无法撤销。
                    </AlertDialogDescription>
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

        {/* Clear Canvas Dialog */}
        <AlertDialog open={isClearCanvasAlertOpen} onOpenChange={setIsClearCanvasAlertOpen}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle className="font-title">确认清空画布</AlertDialogTitle>
                    <AlertDialogDescription className="font-sans">
                        您确定要删除画布上所有的节点和连接吗？此操作无法撤销。
                    </AlertDialogDescription>
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
