
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
} from 'reactflow';
import 'reactflow/dist/style.css';

import { AppLayout } from '@/components/layout/AppLayout';
import { useApiConfig, type NamedApiConfig } from '@/hooks/use-api-key';
import { nodePassApi } from '@/lib/api';
import type { Instance } from '@/types/nodepass';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, RefreshCw, AlertTriangle, Network, ServerIcon, SmartphoneIcon, Globe, UserCircle2, Settings, Info, Eraser, UploadCloud } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { AppLogEntry } from '@/components/nodepass/EventLog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

// Define initial viewport (optional)
const initialViewport: Viewport = { x: 0, y: 0, zoom: 1.5 };

// Placeholder for custom node types if needed later
// const nodeTypes = { customNode: CustomNodeComponent };

interface TopologyNodeData {
  label: string;
  apiId?: string;
  apiName?: string;
  instanceType?: 'controller' | 'server' | 'client' | 'landing' | 'user';
  // Add other specific data properties as needed
}

const initialNodes: Node<TopologyNodeData>[] = [];
const initialEdges: Edge[] = [];

const TopologyPageContent: NextPage = () => {
  const { apiConfigsList, isLoading: isLoadingApiConfig, getApiRootUrl, getToken } = useApiConfig();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { project } = useReactFlow(); // For converting screen to flow position

  const [nodes, setNodes, onNodesChange] = useNodesState<TopologyNodeData>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNodeForProps, setSelectedNodeForProps] = useState<Node<TopologyNodeData> | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [isClearCanvasAlertOpen, setIsClearCanvasAlertOpen] = useState(false);

  // Fetch existing instances - this might be used to populate the graph or for reference
  const { data: allFetchedInstancesData, isLoading: isLoadingInstances, error: fetchErrorGlobal, refetch: refetchInstances } = useQuery<
    (Instance & { apiId: string; apiName: string })[],
    Error
  >({
    queryKey: ['allInstancesForTopology', apiConfigsList.map(c => c.id).join(',')],
    queryFn: async () => {
      if (apiConfigsList.length === 0) return [];
      // ... (data fetching logic remains similar, but its usage will change)
      // For now, just log it or display it if needed
      console.log("Fetched instances data, to be used with React Flow:", allFetchedInstancesData);
      return []; // Placeholder
    },
    enabled: !isLoadingApiConfig && apiConfigsList.length > 0,
    onSuccess: () => setLastRefreshed(new Date()),
  });


  const onConnect: OnConnect = useCallback(
    (params) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const onDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }, []);

  let id = 0;
  const getId = () => `dndnode_${id++}`;

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (!reactFlowWrapper.current) return;

      const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
      const type = event.dataTransfer.getData('application/reactflow-nodetype');
      const label = event.dataTransfer.getData('application/reactflow-label');
      const apiId = event.dataTransfer.getData('application/reactflow-apiid');
      const apiName = event.dataTransfer.getData('application/reactflow-apiname');

      if (typeof type === 'undefined' || !type) {
        return;
      }

      const position = project({
        x: event.clientX - reactFlowBounds.left,
        y: event.clientY - reactFlowBounds.top,
      });

      const newNode: Node<TopologyNodeData> = {
        id: getId(),
        type: 'default', // Or a custom type if defined
        position,
        data: { 
          label: label || `${type} node`,
          instanceType: type as TopologyNodeData['instanceType'],
          ...(apiId && { apiId }),
          ...(apiName && { apiName }),
        },
      };

      setNodes((nds) => nds.concat(newNode));
      toast({title: "节点已添加", description: `节点 "${newNode.data.label}" 已添加到画布。`})
    },
    [project, setNodes, toast]
  );

  const handleNodeClick = useCallback((event: React.MouseEvent, node: Node<TopologyNodeData>) => {
    setSelectedNodeForProps(node);
  }, []);

  const handlePaneClick = useCallback(() => {
    setSelectedNodeForProps(null);
  }, []);
  
  const clearCanvas = () => {
    setNodes([]);
    setEdges([]);
    setSelectedNodeForProps(null);
    toast({ title: "画布已清空", description: "所有节点和连接已移除。" });
    setIsClearCanvasAlertOpen(false);
  };

  // Placeholder for node types panel items
  const nodePanelTypes = [
    { type: 'server', title: '服务端', icon: ServerIcon, iconColorClass: "text-primary" },
    { type: 'client', title: '客户端', icon: SmartphoneIcon, iconColorClass: "text-accent" },
    { type: 'landing', title: '落地', icon: Globe, iconColorClass: "text-purple-500" },
    { type: 'user', title: '用户源', icon: UserCircle2, iconColorClass: "text-green-500" },
    { type: 'controller', title: '主控', icon: Settings, iconColorClass: "text-yellow-500" },
  ];

  const onDragStart = (event: React.DragEvent<HTMLDivElement>, nodeType: string, label?: string, apiId?: string, apiName?: string) => {
    event.dataTransfer.setData('application/reactflow-nodetype', nodeType);
    event.dataTransfer.setData('application/reactflow-label', label || `${nodeType} Node`);
    if (apiId) event.dataTransfer.setData('application/reactflow-apiid', apiId);
    if (apiName) event.dataTransfer.setData('application/reactflow-apiname', apiName);
    event.dataTransfer.effectAllowed = 'copy';
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
            <CardContent><p className="text-destructive text-sm font-sans">获取部分主控实例数据时出错。</p></CardContent>
          </Card>
        )}

        <div className="flex-grow flex gap-4" style={{ height: 'calc(100vh - var(--header-height) - var(--footer-height) - 10rem)' }}>
          <div className="w-72 flex-shrink-0 space-y-3 h-full overflow-y-hidden flex flex-col">
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
                {nodePanelTypes.filter(nt => nt.type !== 'controller').map(({ type, title, icon: Icon, iconColorClass }) => (
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
                  {selectedNodeForProps ? `编辑: ${selectedNodeForProps.data.label} (ID: ${selectedNodeForProps.id})` : "点击节点查看属性。"}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-2.5 flex-grow overflow-y-auto"><ScrollArea className="h-full pr-1">
                {selectedNodeForProps ? (
                  <div className="space-y-2.5">
                    <p className="text-xs font-sans">ID: <span className="font-mono">{selectedNodeForProps.id}</span></p>
                    <p className="text-xs font-sans">类型: <span className="font-mono">{selectedNodeForProps.data.instanceType || 'N/A'}</span></p>
                    <p className="text-xs font-sans">标签: <span className="font-mono">{selectedNodeForProps.data.label}</span></p>
                    {selectedNodeForProps.data.apiName && <p className="text-xs font-sans">来源主控: <span className="font-mono">{selectedNodeForProps.data.apiName}</span></p>}
                    {/* Placeholder for actual property editing fields */}
                    <p className="text-xs text-muted-foreground font-sans mt-2">属性编辑功能待实现。</p>
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
              fitView
              fitViewOptions={{ padding: 0.2 }}
              // nodeTypes={nodeTypes} // Uncomment if custom nodes are defined
              proOptions={{ hideAttribution: true }}
              className="bg-background"
            >
              <Controls />
              <MiniMap nodeStrokeWidth={3} zoomable pannable />
              <Background gap={16} />
            </ReactFlow>
          </div>
        </div>
        
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


// Wrap with ReactFlowProvider
const TopologyEditorPageWrapper: NextPage = () => {
  return (
    <ReactFlowProvider>
      <TopologyPageContent />
    </ReactFlowProvider>
  );
};

export default TopologyEditorPageWrapper;
