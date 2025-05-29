
"use client";

import type { NextPage } from 'next';
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useApiConfig } from '@/hooks/use-api-key';
import { nodePassApi } from '@/lib/api';
import type { Instance } from '@/types/nodepass';
import { AlertTriangle, Loader2, RefreshCw, Network, ServerIcon, SmartphoneIcon, Move, Link2, Eye, List } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { AppLayout } from '@/components/layout/AppLayout';
import { InstanceStatusBadge } from '@/components/nodepass/InstanceStatusBadge';
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { InstanceDetailsModal } from '@/components/nodepass/InstanceDetailsModal';
import { useQuery } from '@tanstack/react-query';

interface InstanceWithApiDetails extends Instance {
  apiId: string;
  apiName: string;
}

interface Position {
  x: number;
  y: number;
}

interface NodeBase {
  id: string;
  type: 'server' | 'client';
  url: string;
  status: Instance['status'];
  apiId: string;
  apiName: string;
  position: Position;
  originalInstance: InstanceWithApiDetails;
}

interface ServerNode extends NodeBase {
  type: 'server';
  serverListeningAddress: string | null;
}

interface ClientNode extends NodeBase {
  type: 'client';
  clientConnectsToServerAddress: string | null;
  localTargetAddress: string | null;
  connectedToServerId: string | null;
}

type DraggableNode = ServerNode | ClientNode;

interface ConnectionLine {
  id: string;
  pathData: string;
  type: 'intra-api' | 'inter-api';
}

interface DraggingNodeInfo {
  id: string;
  type: 'server' | 'client';
  initialMouseX: number;
  initialMouseY: number;
  initialNodeX: number;
  initialNodeY: number;
}


function parseTunnelAddr(urlString: string): string | null {
  try {
    const url = new URL(urlString);
    return url.host;
  } catch (e) {
    const schemeSeparator = "://";
    const schemeIndex = urlString.indexOf(schemeSeparator);
    if (schemeIndex === -1) return null;
    const restOfString = urlString.substring(schemeIndex + schemeSeparator.length);
    const pathSeparatorIndex = restOfString.indexOf('/');
    const querySeparatorIndex = restOfString.indexOf('?');
    let endOfTunnelAddr = -1;
    if (pathSeparatorIndex !== -1 && querySeparatorIndex !== -1) {
      endOfTunnelAddr = Math.min(pathSeparatorIndex, querySeparatorIndex);
    } else if (pathSeparatorIndex !== -1) {
      endOfTunnelAddr = pathSeparatorIndex;
    } else if (querySeparatorIndex !== -1) {
      endOfTunnelAddr = querySeparatorIndex;
    }
    return endOfTunnelAddr !== -1 ? restOfString.substring(0, endOfTunnelAddr) : restOfString;
  }
}

function parseTargetAddr(urlString: string): string | null {
  const schemeSeparator = "://";
  const schemeIndex = urlString.indexOf(schemeSeparator);
  if (schemeIndex === -1) return null;
  const restOfString = urlString.substring(schemeIndex + schemeSeparator.length);
  const pathSeparatorIndex = restOfString.indexOf('/');
  if (pathSeparatorIndex === -1) return null;
  const targetAndQuery = restOfString.substring(pathSeparatorIndex + 1);
  const querySeparatorIndex = targetAndQuery.indexOf('?');
  return querySeparatorIndex !== -1 ? targetAndQuery.substring(0, querySeparatorIndex) : targetAndQuery;
}

function splitHostPort(address: string | null): { host: string | null; port: string | null } {
  if (!address) return { host: null, port: null };
  const ipv6WithPortMatch = address.match(/^\[(.+)\]:(\d+)$/);
  if (ipv6WithPortMatch) {
    return { host: ipv6WithPortMatch[1], port: ipv6WithPortMatch[2] };
  }
  const lastColonIndex = address.lastIndexOf(':');
  if (lastColonIndex === -1 || address.substring(0, lastColonIndex).includes(':')) { 
    return { host: address, port: null };
  }
  const potentialHost = address.substring(0, lastColonIndex);
  const potentialPort = address.substring(lastColonIndex + 1);

  if (potentialPort && !isNaN(parseInt(potentialPort, 10)) && parseInt(potentialPort, 10).toString() === potentialPort) {
    return { host: potentialHost, port: potentialPort };
  }
  return { host: address, port: null }; 
}


const NODE_WIDTH = 250; 
const NODE_HEIGHT_SERVER = 100;
const NODE_HEIGHT_CLIENT = 85; 
const GRAPH_CLIENT_OFFSET_X = NODE_WIDTH + 50; 
const GRAPH_CLIENT_SPACING_Y = 20;


const TopologyPage: NextPage = () => {
  const router = useRouter();
  const { apiConfigsList, isLoading: isLoadingApiConfigGlobal, getApiConfigById, getApiRootUrl, getToken } = useApiConfig();

  const [allServerInstances, setAllServerInstances] = useState<ServerNode[]>([]);
  const [allClientInstances, setAllClientInstances] = useState<ClientNode[]>([]);

  const [viewMode, setViewMode] = useState<'table' | 'graph'>('table');
  const [selectedServerForGraph, setSelectedServerForGraph] = useState<ServerNode | null>(null);
  const [clientsForSelectedServer, setClientsForSelectedServer] = useState<ClientNode[]>([]);

  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [lines, setLines] = useState<ConnectionLine[]>([]);

  const nodeRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const svgRef = useRef<SVGSVGElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const [draggingNodeInfo, setDraggingNodeInfo] = useState<DraggingNodeInfo | null>(null);
  const didDragRef = useRef<boolean>(false);

  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [selectedInstanceForDetails, setSelectedInstanceForDetails] = useState<Instance | null>(null);

  const processAllInstanceData = useCallback((fetchedInstances: InstanceWithApiDetails[]) => {
    const sNodes: ServerNode[] = [];
    const cNodes: ClientNode[] = [];

    fetchedInstances.forEach(inst => {
      if (inst.type === 'server') {
        sNodes.push({
          id: inst.id,
          type: 'server',
          url: inst.url,
          status: inst.status,
          apiId: inst.apiId,
          apiName: inst.apiName,
          position: { x: 50, y: 50 },
          serverListeningAddress: parseTunnelAddr(inst.url),
          originalInstance: inst,
        });
      } else if (inst.type === 'client') {
        cNodes.push({
          id: inst.id,
          type: 'client',
          url: inst.url,
          status: inst.status,
          apiId: inst.apiId,
          apiName: inst.apiName,
          position: { x: 50 + GRAPH_CLIENT_OFFSET_X, y: 50 },
          clientConnectsToServerAddress: parseTunnelAddr(inst.url),
          localTargetAddress: parseTargetAddr(inst.url),
          connectedToServerId: null,
          originalInstance: inst,
        });
      }
    });


    cNodes.forEach(client => {
      const clientConnAddr = client.clientConnectsToServerAddress;
      if (!clientConnAddr) return;
      const { host: clientHostConnectsTo, port: clientPortConnectsTo } = splitHostPort(clientConnAddr);

      for (const server of sNodes) {
        const serverListenAddr = server.serverListeningAddress;
        if (!serverListenAddr) continue;
        const { host: serverHostListensOn, port: serverPortListensOn } = splitHostPort(serverListenAddr);

        if (clientPortConnectsTo && serverPortListensOn && clientPortConnectsTo === serverPortListensOn) {
          const isServerHostWildcard = serverHostListensOn === '0.0.0.0' || serverHostListensOn === '::' || !serverHostListensOn;
          if (isServerHostWildcard || clientHostConnectsTo === serverHostListensOn) {
            client.connectedToServerId = server.id;
            break;
          }
        }
      }
    });

    setAllServerInstances(sNodes);
    setAllClientInstances(cNodes);
  }, []);

  const { data: allFetchedInstancesData, isLoading: isLoadingData, error: fetchErrorGlobal, refetch } = useQuery<
    InstanceWithApiDetails[],
    Error,
    InstanceWithApiDetails[]
  >({
    queryKey: ['allInstancesForTopology', apiConfigsList.map(c => c.id).join(',')],
    queryFn: async () => {
      if (apiConfigsList.length === 0) {
        return [];
      }
      let combinedInstances: InstanceWithApiDetails[] = [];

      const results = await Promise.allSettled(
        apiConfigsList.map(async (config) => {
          const apiRootVal = getApiRootUrl(config.id);
          const tokenVal = getToken(config.id);
          if (!apiRootVal || !tokenVal) {
            console.warn(`TopologyPage: API config "${config.name}" (ID: ${config.id}) is invalid. Skipping.`);
            return [];
          }
          try {
            const data = await nodePassApi.getInstances(apiRootVal, tokenVal);
            return data.map(inst => ({ ...inst, apiId: config.id, apiName: config.name }));
          } catch (error) {
            console.error(`TopologyPage: Failed to load instances from API "${config.name}" (ID: ${config.id}). Error:`, error instanceof Error ? error.message : String(error));
            return Promise.reject(new Error(`Failed to fetch from ${config.name}: ${error instanceof Error ? error.message : String(error)}`));
          }
        })
      );

      results.forEach(result => {
        if (result.status === 'fulfilled' && result.value) {
          combinedInstances.push(...result.value);
        } else if (result.status === 'rejected') {
          // Error for this specific API config has already been logged
        }
      });
      return combinedInstances;
    },
    enabled: !isLoadingApiConfigGlobal && apiConfigsList.length > 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    onSuccess: (data) => {
      processAllInstanceData(data);
      setLastRefreshed(new Date());
    },
  });

  const handleRefresh = () => {
    refetch();
  };

  useEffect(() => {
    if (allFetchedInstancesData) {
      processAllInstanceData(allFetchedInstancesData);
    }
  }, [allFetchedInstancesData, processAllInstanceData]);


  const calculateGraphLayoutAndLines = useCallback(() => {
    if (viewMode !== 'graph' || !selectedServerForGraph || !svgRef.current || !canvasRef.current) {
      setLines([]);
      return;
    }

    const serverNode = selectedServerForGraph;
    const connectedClients = clientsForSelectedServer;
    const newLines: ConnectionLine[] = [];

    const serverEl = nodeRefs.current.get(`server-${serverNode.id}`);
    if (!serverEl) {
      setLines([]);
      return;
    }

    const serverX_out = serverNode.position.x + NODE_WIDTH;
    const serverY_out = serverNode.position.y + NODE_HEIGHT_SERVER / 2;

    connectedClients.forEach(client => {
      const clientEl = nodeRefs.current.get(`client-${client.id}`);
      if (!clientEl) return;

      const clientX_in = client.position.x;
      const clientY_in = client.position.y + NODE_HEIGHT_CLIENT / 2;

      const controlPointX1 = serverX_out + Math.abs(clientX_in - serverX_out) * 0.5;
      const controlPointY1 = serverY_out;
      const controlPointX2 = clientX_in - Math.abs(clientX_in - serverX_out) * 0.5;
      const controlPointY2 = clientY_in;

      const path = `M ${serverX_out} ${serverY_out} C ${controlPointX1} ${controlPointY1}, ${controlPointX2} ${controlPointY2}, ${clientX_in} ${clientY_in}`;

      newLines.push({
        id: `line-${serverNode.id}-${client.id}`,
        pathData: path,
        type: serverNode.apiId === client.apiId ? 'intra-api' : 'inter-api',
      });
    });
    setLines(newLines);
  }, [selectedServerForGraph, clientsForSelectedServer, viewMode]);


  useEffect(() => {
    if (viewMode === 'graph' && selectedServerForGraph) {
      calculateGraphLayoutAndLines();
      window.addEventListener('resize', calculateGraphLayoutAndLines);
      return () => {
        window.removeEventListener('resize', calculateGraphLayoutAndLines);
      };
    } else {
      setLines([]);
    }
  }, [viewMode, selectedServerForGraph, clientsForSelectedServer, calculateGraphLayoutAndLines, draggingNodeInfo]);

  const handleViewServerTopology = (server: ServerNode) => {
    const connectedClients = allClientInstances
      .filter(c => c.connectedToServerId === server.id)
      .map((client, index) => ({
        ...client,
        position: {
          x: 50 + GRAPH_CLIENT_OFFSET_X,
          y: 50 + (index * (NODE_HEIGHT_CLIENT + GRAPH_CLIENT_SPACING_Y))
        }
      }));

    const serverInitialY = connectedClients.length > 0
      ? 50 + ((connectedClients.length - 1) * (NODE_HEIGHT_CLIENT + GRAPH_CLIENT_SPACING_Y) / 2) + (NODE_HEIGHT_CLIENT / 2) - (NODE_HEIGHT_SERVER / 2)
      : 150;

    setSelectedServerForGraph({...server, position: { x: 50, y: Math.max(50, serverInitialY) }});
    setClientsForSelectedServer(connectedClients);
    setViewMode('graph');
  };

  const handleBackToTable = () => {
    setViewMode('table');
    setSelectedServerForGraph(null);
    setClientsForSelectedServer([]);
    setLines([]);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>, nodeId: string, nodeType: 'server' | 'client') => {
    didDragRef.current = false;
    e.preventDefault();
    e.stopPropagation();

    let node: DraggableNode | undefined;
    if (nodeType === 'server' && selectedServerForGraph?.id === nodeId) {
        node = selectedServerForGraph;
    } else if (nodeType === 'client') {
        node = clientsForSelectedServer.find(c => c.id === nodeId);
    }

    if (!node || !canvasRef.current) return;

    const canvasRect = canvasRef.current.getBoundingClientRect();
    const mouseXInCanvas = e.clientX - canvasRect.left + canvasRef.current.scrollLeft;
    const mouseYInCanvas = e.clientY - canvasRect.top + canvasRef.current.scrollTop;

    setDraggingNodeInfo({
      id: nodeId,
      type: nodeType,
      initialMouseX: mouseXInCanvas,
      initialMouseY: mouseYInCanvas,
      initialNodeX: node.position.x,
      initialNodeY: node.position.y,
    });
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!draggingNodeInfo || !canvasRef.current || viewMode !== 'graph') return;
    e.preventDefault();
    didDragRef.current = true;

    const canvasRect = canvasRef.current.getBoundingClientRect();
    const mouseXInCanvas = e.clientX - canvasRect.left + canvasRef.current.scrollLeft;
    const mouseYInCanvas = e.clientY - canvasRect.top + canvasRef.current.scrollTop;

    const dx = mouseXInCanvas - draggingNodeInfo.initialMouseX;
    const dy = mouseYInCanvas - draggingNodeInfo.initialMouseY;

    let newX = draggingNodeInfo.initialNodeX + dx;
    let newY = draggingNodeInfo.initialNodeY + dy;

    const nodeEl = nodeRefs.current.get(`${draggingNodeInfo.type}-${draggingNodeInfo.id}`);
    const nodeWidth = nodeEl?.offsetWidth || NODE_WIDTH;
    const nodeHeight = nodeEl?.offsetHeight || (draggingNodeInfo.type === 'server' ? NODE_HEIGHT_SERVER : NODE_HEIGHT_CLIENT);

    newX = Math.max(0, Math.min(newX, canvasRef.current.scrollWidth - nodeWidth));
    newY = Math.max(0, Math.min(newY, canvasRef.current.scrollHeight - nodeHeight));

    if (draggingNodeInfo.type === 'server' && selectedServerForGraph?.id === draggingNodeInfo.id) {
      setSelectedServerForGraph(prev => prev ? { ...prev, position: { x: newX, y: newY } } : null);
    } else if (draggingNodeInfo.type === 'client') {
      setClientsForSelectedServer(prevClients =>
        prevClients.map(c =>
          c.id === draggingNodeInfo.id ? { ...c, position: { x: newX, y: newY } } : c
        )
      );
    }
  }, [draggingNodeInfo, viewMode, selectedServerForGraph]);

  const handleMouseUp = useCallback(() => {
    setDraggingNodeInfo(null);
  }, []);

  useEffect(() => {
    if (draggingNodeInfo) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [draggingNodeInfo, handleMouseMove, handleMouseUp]);

  const openInstanceDetailsModal = (instance: Instance) => {
    setSelectedInstanceForDetails(instance);
    setIsDetailsModalOpen(true);
  };

  const renderGraphNode = (node: ServerNode | ClientNode) => {
    const isServer = node.type === 'server';
    const Icon = isServer ? ServerIcon : SmartphoneIcon;
    const bgColor = isServer ? 'bg-primary/10 border-primary/30' : 'bg-accent/10 border-accent/30';
    const title = isServer ? '服务器实例' : '客户端实例';
    const nodeHeight = isServer ? NODE_HEIGHT_SERVER : NODE_HEIGHT_CLIENT;

    return (
      <Card
        key={`${node.type}-${node.id}`}
        ref={el => nodeRefs.current.set(`${node.type}-${node.id}`, el)}
        className={cn(
          "absolute shadow-lg hover:shadow-xl transition-all p-2 rounded-md flex flex-col border-2",
          bgColor,
        )}
        style={{
          left: `${node.position.x}px`,
          top: `${node.position.y}px`,
          height: `${nodeHeight}px`,
          width: `${NODE_WIDTH}px`,
          zIndex: draggingNodeInfo?.id === node.id && draggingNodeInfo?.type === node.type ? 100 : 1,
          userSelect: 'none',
        }}
        onMouseDown={(e) => handleMouseDown(e, node.id, node.type)}
        onClick={() => {
          if (didDragRef.current) {
            didDragRef.current = false;
            return;
          }
          openInstanceDetailsModal(node.originalInstance);
        }}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-2 mb-1 flex-shrink-0 cursor-pointer">
              <Move className="h-4 w-4 text-muted-foreground hover:text-primary cursor-grab flex-shrink-0" />
              <Icon className={`h-5 w-5 ${isServer ? 'text-primary' : 'text-accent'} flex-shrink-0`} />
              <h3 className="font-semibold text-sm truncate" title={node.apiName}>
                {node.apiName}
              </h3>
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs break-all text-xs">
            <p>来源 API: {node.apiName} (ID: {node.apiId})</p>
            <p>{title} ID: {node.id}</p>
            <p>URL: {node.url}</p>
          </TooltipContent>
        </Tooltip>
        <div className="text-xs space-y-0.5 text-muted-foreground overflow-y-auto flex-grow">
          <div className="flex items-center">
            <InstanceStatusBadge status={node.status} />
            <span className="ml-1.5 text-xs">(ID: {node.id.substring(0, 8)}...)</span>
          </div>
          {isServer && (node as ServerNode).serverListeningAddress && (
            <p className="truncate" title={(node as ServerNode).serverListeningAddress!}>监听: <span className="font-mono">{(node as ServerNode).serverListeningAddress}</span></p>
          )}
          {!isServer && (node as ClientNode).localTargetAddress && (
             <p className="truncate text-green-600 dark:text-green-400" title={(node as ClientNode).localTargetAddress!}>
              <Link2 className="inline-block h-3 w-3 mr-1"/>
              落地: <span className="font-mono">{(node as ClientNode).localTargetAddress}</span>
            </p>
          )}
        </div>
      </Card>
    );
  };


  if (isLoadingApiConfigGlobal) {
    return <AppLayout><div className="text-center py-10 flex flex-col items-center justify-center h-[calc(100vh-10rem-4rem)]"><Loader2 className="h-12 w-12 animate-spin text-primary" /><p className="mt-3">加载API配置...</p></div></AppLayout>;
  }

  if (fetchErrorGlobal && !isLoadingData) {
     return (
      <AppLayout>
        <Card className="max-w-md mx-auto mt-10 shadow-lg">
          <CardHeader><CardTitle className="text-destructive flex items-center justify-center"><AlertTriangle className="h-6 w-6 mr-2" />错误</CardTitle></CardHeader>
          <CardContent><p>加载拓扑数据失败: {fetchErrorGlobal.message}</p><Button onClick={() => router.push('/connections')} className="mt-6">管理API连接</Button></CardContent>
        </Card>
      </AppLayout>
    );
  }

  if (isLoadingData && !isLoadingApiConfigGlobal) {
    return (
      <AppLayout>
        <div className="flex-grow flex justify-center items-center py-10 h-[calc(100vh-10rem-4rem)]">
          <Loader2 className="h-16 w-16 animate-spin text-primary" />
          <p className="ml-4 text-xl">加载拓扑数据...</p>
        </div>
      </AppLayout>
    );
  }


  return (
    <AppLayout>
      <TooltipProvider delayDuration={300}>
        <div className="flex flex-col h-full">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl sm:text-3xl font-bold">实例连接拓扑</h1>
            <div className='flex items-center gap-2'>
              {viewMode === 'graph' && (
                <Button variant="outline" onClick={handleBackToTable} size="sm">
                  <List className="mr-2 h-4 w-4" />
                  返回服务器列表
                </Button>
              )}
              {lastRefreshed && <span className="text-xs text-muted-foreground">刷新: {lastRefreshed.toLocaleTimeString()}</span>}
              <Button variant="outline" onClick={handleRefresh} disabled={isLoadingData} size="sm">
                <RefreshCw className={`mr-2 h-4 w-4 ${isLoadingData ? 'animate-spin' : ''}`} />
                {isLoadingData ? '刷新中...' : '刷新'}
              </Button>
            </div>
          </div>

          {!isLoadingData && allServerInstances.length === 0 && viewMode === 'table' && (
             <Card className="text-center py-10 shadow-lg flex-grow flex flex-col justify-center items-center bg-card">
              <CardHeader><CardTitle>无数据显示</CardTitle></CardHeader>
              <CardContent><p className="text-muted-foreground">{apiConfigsList.length > 0 ? "未找到任何服务器实例。" : "请先配置API连接。"}</p></CardContent>
            </Card>
          )}

          {viewMode === 'table' && !isLoadingData && allServerInstances.length > 0 && (
            <div className="border rounded-lg shadow-md overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>API名称</TableHead>
                    <TableHead>服务器ID</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>URL</TableHead>
                    <TableHead>监听地址</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allServerInstances.map((server) => (
                    <TableRow key={server.id}>
                       <TableCell className="max-w-[150px] sm:max-w-xs">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-default truncate block">{server.apiName}</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{server.apiName}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{server.id.substring(0,12)}...</TableCell>
                      <TableCell><InstanceStatusBadge status={server.status} /></TableCell>
                      <TableCell className="font-mono text-xs truncate max-w-xs" title={server.url}>{server.url}</TableCell>
                      <TableCell className="font-mono text-xs">{server.serverListeningAddress || 'N/A'}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="default" size="sm" onClick={() => handleViewServerTopology(server)}>
                          <Eye className="mr-2 h-4 w-4" /> 查看拓扑
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {viewMode === 'graph' && selectedServerForGraph && (
            <div
              ref={canvasRef}
              id="topology-canvas"
              className="relative flex-grow border-2 border-dashed border-border/50 rounded-lg p-4 bg-muted/10 overflow-auto min-h-[calc(100vh-22rem)] w-full shadow-inner"
              style={{ touchAction: 'none' }}
            >
              <svg ref={svgRef} className="absolute inset-0 w-full h-full pointer-events-none z-0">
                {lines.map(line => (
                  <path
                    key={line.id}
                    d={line.pathData}
                    stroke={line.type === 'intra-api' ? 'hsl(var(--primary))' : 'hsl(var(--accent))'}
                    strokeWidth="1.5"
                    fill="none"
                    className="opacity-75"
                  />
                ))}
              </svg>

              {renderGraphNode(selectedServerForGraph)}
              {clientsForSelectedServer.map(client => renderGraphNode(client))}

              {clientsForSelectedServer.length === 0 && (
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-muted-foreground p-4 bg-background/80 rounded-md shadow">
                    此服务器实例当前没有连接的客户端。
                </div>
              )}
            </div>
          )}

          <InstanceDetailsModal
            instance={selectedInstanceForDetails}
            open={isDetailsModalOpen}
            onOpenChange={(open) => {
              setIsDetailsModalOpen(open);
              if (!open) {
                setSelectedInstanceForDetails(null);
              }
            }}
          />

          <div className="mt-8 p-4 bg-muted/30 rounded-lg text-xs text-muted-foreground shadow-sm">
            <div className="flex items-center font-semibold mb-2"><Network className="h-4 w-4 mr-2 text-primary shrink-0" />拓扑说明</div>
            <ul className="list-disc list-inside space-y-1.5 pl-1">
              <li>默认显示所有API源的服务器实例列表。点击 "查看拓扑" 可切换到图形视图，显示选定服务器及其连接的客户端。</li>
              <li>在图形视图中，服务器和客户端节点均可拖动以调整布局。连接线将从服务器右侧弯曲指向客户端左侧。</li>
              <li>连接关系基于客户端的 <code className="bg-muted px-1 py-0.5 rounded text-foreground">&lt;tunnel_addr&gt;</code> (其连接的服务器地址)与服务器的 <code className="bg-muted px-1 py-0.5 rounded text-foreground">&lt;tunnel_addr&gt;</code> (其监听地址)匹配。</li>
              <li>客户端“落地”地址指其本地转发目标 <code className="bg-muted px-1 py-0.5 rounded text-foreground">&lt;target_addr&gt;</code>。</li>
               <li><span className="inline-block w-3 h-3 rounded-sm bg-primary mr-1.5 align-middle"></span><code className="text-foreground">主色调线</code>: 服务器和客户端属于同一API配置。</li>
              <li><span className="inline-block w-3 h-3 rounded-sm bg-accent mr-1.5 align-middle"></span><code className="text-foreground">强调色线</code>: 服务器和客户端属于不同API配置。</li>
              <li>点击图形视图中的节点卡片可查看其详细信息。</li>
            </ul>
          </div>
        </div>
      </TooltipProvider>
    </AppLayout>
  );
};

export default TopologyPage;

    