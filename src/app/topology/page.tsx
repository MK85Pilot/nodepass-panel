
"use client";

import type { NextPage } from 'next';
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useApiConfig } from '@/hooks/use-api-key';
import { nodePassApi } from '@/lib/api';
import type { Instance } from '@/types/nodepass';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Loader2, RefreshCw, AlertTriangle, Network, ServerIcon, SmartphoneIcon, Move, Link2, Eye, List, KeyRound, ClipboardCopy } from 'lucide-react';
import { InstanceStatusBadge } from '@/components/nodepass/InstanceStatusBadge';
import { InstanceDetailsModal } from '@/components/nodepass/InstanceDetailsModal';
import { Badge } from '@/components/ui/badge';
import { cn } from "@/lib/utils";
import { useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

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
  type: 'server' | 'client' | 'apikey';
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
  serverForwardsToAddress: string | null;
}

interface ClientNode extends NodeBase {
  type: 'client';
  clientConnectsToServerAddress: string | null;
  localTargetAddress: string | null;
  connectedToServerId: string | null;
}

interface ApiKeyNode extends NodeBase {
  type: 'apikey';
}


type DraggableNode = ServerNode | ClientNode | ApiKeyNode;

interface ConnectionLine {
  id: string;
  pathData: string;
  type: 'intra-api' | 'inter-api';
}

interface DraggingNodeInfo {
  id: string;
  type: DraggableNode['type'];
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
  if (schemeIndex === -1) return null; // No scheme, invalid format

  const restOfString = urlString.substring(schemeIndex + schemeSeparator.length);
  const pathSeparatorIndex = restOfString.indexOf('/');
  if (pathSeparatorIndex === -1) return null; // No path part after host/port

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
const NODE_HEIGHT_APIKEY = 75;
const GRAPH_CLIENT_OFFSET_X = NODE_WIDTH + 50;
const GRAPH_CLIENT_SPACING_Y = 20;


const TopologyPage: NextPage = () => {
  const { apiConfigsList, isLoading: isLoadingApiConfigGlobal, getApiConfigById, getApiRootUrl, getToken } = useApiConfig();
  const { toast } = useToast();

  const [allServerInstances, setAllServerInstances] = useState<ServerNode[]>([]);
  const [allClientInstances, setAllClientInstances] = useState<ClientNode[]>([]);
  const [allApiKeyInstances, setAllApiKeyInstances] = useState<ApiKeyNode[]>([]);

  const [viewMode, setViewMode] = useState<'table' | 'graph'>('table');
  const [selectedServerForGraph, setSelectedServerForGraph] = useState<ServerNode | ApiKeyNode | null>(null);
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
    const apiKeyNodes: ApiKeyNode[] = [];

    fetchedInstances.forEach(inst => {
      if (inst.id === '********') {
        apiKeyNodes.push({
          id: inst.id,
          type: 'apikey',
          url: inst.url,
          status: inst.status,
          apiId: inst.apiId,
          apiName: inst.apiName,
          position: { x: 50, y: 50 + apiKeyNodes.length * (NODE_HEIGHT_APIKEY + GRAPH_CLIENT_SPACING_Y) },
          originalInstance: inst,
        });
      } else if (inst.type === 'server') {
        sNodes.push({
          id: inst.id,
          type: 'server',
          url: inst.url,
          status: inst.status,
          apiId: inst.apiId,
          apiName: inst.apiName,
          position: { x: 50, y: 50 + sNodes.length * (NODE_HEIGHT_SERVER + GRAPH_CLIENT_SPACING_Y) },
          serverListeningAddress: parseTunnelAddr(inst.url),
          serverForwardsToAddress: parseTargetAddr(inst.url),
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
    setAllApiKeyInstances(apiKeyNodes);
  }, []);

  const { data: allFetchedInstancesData, isLoading: isLoadingData, error: fetchErrorGlobal, refetch } = useQuery<
    InstanceWithApiDetails[],
    Error
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
            console.warn(`拓扑页: 主控配置 "${config.name}" (ID: ${config.id}) 无效。跳过。`);
            return [];
          }
          try {
            const data = await nodePassApi.getInstances(apiRootVal, tokenVal);
            return data.map(inst => ({ ...inst, apiId: config.id, apiName: config.name }));
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`拓扑页: 从主控 "${config.name}" (ID: ${config.id}) 加载实例失败。错误:`, errorMessage);
            toast({
              title: `加载 "${config.name}" 失败`,
              description: errorMessage,
              variant: 'destructive',
            });
            return []; // Return empty array for this failed fetch to not break Promise.allSettled
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


  const calculateLines = useCallback(() => {
    if (viewMode !== 'graph' || !selectedServerForGraph || !svgRef.current || !canvasRef.current) {
      setLines([]);
      return;
    }

    const serverNode = selectedServerForGraph;
    const connectedClients = clientsForSelectedServer;
    const newLines: ConnectionLine[] = [];

    const serverEl = nodeRefs.current.get(`${serverNode.type}-${serverNode.id}`);
    if (!serverEl) {
      setLines([]);
      return;
    }

    const serverRect = serverEl.getBoundingClientRect();
    const canvasRect = canvasRef.current.getBoundingClientRect();

    // Calculate server out-point based on its current position
    const serverX_out = serverNode.position.x + NODE_WIDTH;
    const serverY_out = serverNode.position.y + (serverNode.type === 'apikey' ? NODE_HEIGHT_APIKEY : NODE_HEIGHT_SERVER) / 2;

    connectedClients.forEach(client => {
      const clientEl = nodeRefs.current.get(`client-${client.id}`);
      if (!clientEl) return;

      // Calculate client in-point based on its current position
      const clientX_in = client.position.x;
      const clientY_in = client.position.y + NODE_HEIGHT_CLIENT / 2;

      // Control points for the quadratic Bézier curve
      // Adjust for a more pronounced curve
      const controlPointX = (serverX_out + clientX_in) / 2 + (clientY_in > serverY_out ? 50 : -50) * (Math.abs(clientY_in - serverY_out) / 100);
      const controlPointY = (serverY_out + clientY_in) / 2;


      const path = `M ${serverX_out} ${serverY_out} Q ${controlPointX} ${controlPointY}, ${clientX_in} ${clientY_in}`;

      newLines.push({
        id: `line-${serverNode.id}-${client.id}`,
        pathData: path,
        type: serverNode.apiId === client.apiId ? 'intra-api' : 'inter-api',
      });
    });
    setLines(newLines);
  }, [selectedServerForGraph, clientsForSelectedServer, viewMode]);


  useEffect(() => {
    if (viewMode === 'graph' && selectedServerForGraph && (allServerInstances.length > 0 || allClientInstances.length > 0)) {
       calculateLines();
       window.addEventListener('resize', calculateLines);
      return () => {
        window.removeEventListener('resize', calculateLines);
      };
    } else {
      setLines([]);
    }
  }, [viewMode, selectedServerForGraph, clientsForSelectedServer, calculateLines, draggingNodeInfo, allServerInstances, allClientInstances]);


  const handleViewServerTopology = (server: ServerNode | ApiKeyNode) => {
    let relevantClients: ClientNode[] = [];

    if (server.type === 'apikey') {
        relevantClients = allApiKeyInstances
            .filter(apiKeyNode => apiKeyNode.id !== server.id && apiKeyNode.apiId === server.apiId)
            .map(apiKeyNode => ({
                ...apiKeyNode,
                type: 'client' as 'client',
                clientConnectsToServerAddress: "N/A (API 密钥链接)",
                localTargetAddress: 'N/A',
                connectedToServerId: server.id,
            }));
    } else {
        relevantClients = allClientInstances.filter(c => c.connectedToServerId === server.id);
    }

    const serverNodeHeight = server.type === 'apikey' ? NODE_HEIGHT_APIKEY : NODE_HEIGHT_SERVER;
    const initialServerY = 100;

    const positionedClients = relevantClients.map((client, index) => ({
      ...client,
      position: {
        x: 50 + GRAPH_CLIENT_OFFSET_X,
        y: initialServerY + (index * (NODE_HEIGHT_CLIENT + GRAPH_CLIENT_SPACING_Y)) - (relevantClients.length > 1 ? (((relevantClients.length - 1) * (NODE_HEIGHT_CLIENT + GRAPH_CLIENT_SPACING_Y)) / 2) : 0) + (serverNodeHeight / 2) - (NODE_HEIGHT_CLIENT / 2),
      }
    }));

    const serverY = positionedClients.length > 0
      ? positionedClients[0].position.y + ( (positionedClients.length -1) * (NODE_HEIGHT_CLIENT + GRAPH_CLIENT_SPACING_Y))/2 + (NODE_HEIGHT_CLIENT / 2) - (serverNodeHeight / 2)
      : initialServerY;


    setSelectedServerForGraph({...server, position: { x: 50, y: serverY }});
    setClientsForSelectedServer(positionedClients);
    setViewMode('graph');
  };

  const handleBackToTable = () => {
    setViewMode('table');
    setSelectedServerForGraph(null);
    setClientsForSelectedServer([]);
    setLines([]);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>, nodeId: string, nodeType: DraggableNode['type']) => {
    didDragRef.current = false;
    e.preventDefault();
    e.stopPropagation();

    let nodeToDrag: DraggableNode | undefined;
    if ((nodeType === 'server' || nodeType === 'apikey') && selectedServerForGraph?.id === nodeId && selectedServerForGraph.type === nodeType) {
        nodeToDrag = selectedServerForGraph;
    } else if (nodeType === 'client') {
        nodeToDrag = clientsForSelectedServer.find(c => c.id === nodeId);
    }


    if (!nodeToDrag || !canvasRef.current) return;

    const canvasRect = canvasRef.current.getBoundingClientRect();
    const mouseXInCanvas = e.clientX - canvasRect.left + canvasRef.current.scrollLeft;
    const mouseYInCanvas = e.clientY - canvasRect.top + canvasRef.current.scrollTop;

    setDraggingNodeInfo({
      id: nodeId,
      type: nodeType,
      initialMouseX: mouseXInCanvas,
      initialMouseY: mouseYInCanvas,
      initialNodeX: nodeToDrag.position.x,
      initialNodeY: nodeToDrag.position.y,
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
    let nodeWidth = nodeEl?.offsetWidth || NODE_WIDTH;
    let nodeHeight = NODE_HEIGHT_SERVER;
    if (draggingNodeInfo.type === 'client') nodeHeight = NODE_HEIGHT_CLIENT;
    if (draggingNodeInfo.type === 'apikey') nodeHeight = NODE_HEIGHT_APIKEY;


    newX = Math.max(0, Math.min(newX, canvasRef.current.scrollWidth - nodeWidth));
    newY = Math.max(0, Math.min(newY, canvasRef.current.scrollHeight - nodeHeight));

    if ((draggingNodeInfo.type === 'server' || draggingNodeInfo.type === 'apikey') && selectedServerForGraph?.id === draggingNodeInfo.id) {
      setSelectedServerForGraph(prev => prev ? { ...prev, position: { x: newX, y: newY } } : null);
    } else if (draggingNodeInfo.type === 'client') {
      setClientsForSelectedServer(prevClients =>
        prevClients.map(c =>
          c.id === draggingNodeInfo.id ? { ...c, position: { x: newX, y: newY } } : c
        )
      );
    }
  }, [draggingNodeInfo, viewMode, selectedServerForGraph, clientsForSelectedServer]);

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
    if (didDragRef.current) { // Prevent modal open if a drag just occurred
        didDragRef.current = false;
        return;
    }
    setSelectedInstanceForDetails(instance);
    setIsDetailsModalOpen(true);
  };

  const handleCopyToClipboard = async (textToCopy: string, entity: string) => {
    if (!navigator.clipboard) {
      toast({
        title: '复制失败',
        description: '您的浏览器不支持剪贴板操作。',
        variant: 'destructive',
      });
      return;
    }
    try {
      await navigator.clipboard.writeText(textToCopy);
      toast({
        title: '复制成功',
        description: `${entity} 已复制到剪贴板。`,
      });
    } catch (err) {
      toast({
        title: '复制失败',
        description: `无法将 ${entity} 复制到剪贴板。`,
        variant: 'destructive',
      });
      console.error('Failed to copy: ', err);
    }
  };

  const renderGraphNode = (node: DraggableNode) => {
    const isServer = node.type === 'server';
    const isApiKey = node.type === 'apikey';
    const isClient = node.type === 'client';

    let Icon = ServerIcon;
    let bgColor = 'bg-primary/10 border-primary/30';
    let titleText = '服务端实例';
    let nodeHeight = NODE_HEIGHT_SERVER;

    if (isClient) {
      Icon = SmartphoneIcon;
      bgColor = 'bg-accent/10 border-accent/30';
      titleText = '客户端实例';
      nodeHeight = NODE_HEIGHT_CLIENT;
    } else if (isApiKey) {
      Icon = KeyRound;
      bgColor = 'bg-yellow-500/10 border-yellow-500/30';
      titleText = 'API 密钥实例';
      nodeHeight = NODE_HEIGHT_APIKEY;
    }


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
          width: `${NODE_WIDTH}px`,
          height: `${nodeHeight}px`,
          zIndex: draggingNodeInfo?.id === node.id && draggingNodeInfo?.type === node.type ? 100 : 1,
          userSelect: 'none',
        }}
        onMouseDown={(e) => handleMouseDown(e, node.id, node.type)}
        onClick={() => openInstanceDetailsModal(node.originalInstance)}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5 mb-1 flex-shrink-0 cursor-pointer">
              <Move className="h-3.5 w-3.5 text-muted-foreground hover:text-primary cursor-grab flex-shrink-0" />
              <Icon className={`h-4 w-4 ${isServer ? 'text-primary' : isClient ? 'text-accent' : 'text-yellow-500'} flex-shrink-0`} />
              <h3 className="font-semibold text-xs truncate font-title" title={node.apiName}>
                {node.apiName}
              </h3>
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs break-all text-xs font-sans">
            <p>来源主控: {node.apiName} (ID: {node.apiId})</p>
            <p>{titleText} ID: {node.id}</p>
            <p>URL: {node.url}</p>
          </TooltipContent>
        </Tooltip>
        <div className="text-xs space-y-0.5 text-muted-foreground overflow-hidden flex-grow">
          <div className="flex items-center">
            {node.id === '********' ? (
                 <Badge variant="outline" className="border-yellow-500 text-yellow-600 whitespace-nowrap font-sans text-xs">
                    <KeyRound className="mr-1 h-3 w-3" />
                    监听中
                </Badge>
            ) : (
                <InstanceStatusBadge status={node.status} />
            )}
            <span className="ml-1.5 text-xs font-mono">(ID: {node.id.substring(0, 8)}...)</span>
          </div>
          {isServer && (node as ServerNode).serverListeningAddress && (
            <p className="truncate font-mono" title={(node as ServerNode).serverListeningAddress!}>监听: {(node as ServerNode).serverListeningAddress}</p>
          )}
          {isClient && (node as ClientNode).localTargetAddress && (
             <p className="truncate text-green-600 dark:text-green-400 font-mono" title={(node as ClientNode).localTargetAddress!}>
              <Link2 className="inline-block h-3 w-3 mr-1"/>
              落地: {(node as ClientNode).localTargetAddress}
            </p>
          )}
           {isApiKey && (
            <p className="font-mono text-xs text-yellow-600 dark:text-yellow-400">此为 API 密钥配置节点</p>
          )}
        </div>
      </Card>
    );
  };


  if (isLoadingApiConfigGlobal) {
    return <AppLayout><div className="flex-grow container mx-auto px-4 py-8 flex items-center justify-center h-[calc(100vh-var(--header-height)-var(--footer-height)-4rem)]"><Loader2 className="h-12 w-12 animate-spin text-primary" /><p className="ml-4 text-lg font-sans">加载主控配置...</p></div></AppLayout>;
  }

  if (fetchErrorGlobal && !isLoadingData) {
     return (
      <AppLayout>
        <Card className="max-w-md mx-auto mt-10 shadow-lg">
          <CardHeader><CardTitle className="text-destructive flex items-center justify-center font-title"><AlertTriangle className="h-6 w-6 mr-2" />错误</CardTitle></CardHeader>
          <CardContent><p className="font-sans">加载拓扑数据失败: {fetchErrorGlobal.message}</p></CardContent>
        </Card>
      </AppLayout>
    );
  }

  if (isLoadingData && !isLoadingApiConfigGlobal) {
    return (
      <AppLayout>
        <div className="flex-grow container mx-auto px-4 py-8 flex items-center justify-center h-[calc(100vh-var(--header-height)-var(--footer-height)-4rem)]">
          <Loader2 className="h-16 w-16 animate-spin text-primary" />
          <p className="ml-4 text-xl font-sans">加载拓扑数据...</p>
        </div>
      </AppLayout>
    );
  }

  const combinedServerAndApiKeyInstances = [
    ...allServerInstances,
    ...allApiKeyInstances.map(apiKeyNode => ({
        ...apiKeyNode,
        type: 'server' as 'server', // Treat as server for table view
        serverListeningAddress: 'N/A (API 密钥)',
        serverForwardsToAddress: 'N/A (API 密钥)',
    })),
  ];


  return (
    <AppLayout>
      <TooltipProvider delayDuration={300}>
        <div className="flex flex-col h-full">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl sm:text-3xl font-bold font-title">实例连接拓扑</h1>
            <div className='flex items-center gap-2'>
              {viewMode === 'graph' && (
                <Button variant="outline" onClick={handleBackToTable} size="sm" className="font-sans">
                  <List className="mr-2 h-4 w-4" />
                  返回服务端列表
                </Button>
              )}
               <Button variant="outline" onClick={() => viewMode === 'graph' && calculateLines()} disabled={isLoadingData || viewMode !== 'graph'} size="sm" className="font-sans">
                <Network className="mr-2 h-4 w-4" />
                布局
              </Button>
              {lastRefreshed && <span className="text-xs text-muted-foreground font-sans">刷新: {lastRefreshed.toLocaleTimeString()}</span>}
              <Button variant="outline" onClick={handleRefresh} disabled={isLoadingData} size="sm" className="font-sans">
                <RefreshCw className={`mr-2 h-4 w-4 ${isLoadingData ? 'animate-spin' : ''}`} />
                {isLoadingData ? '刷新中...' : '刷新'}
              </Button>
            </div>
          </div>

          {!isLoadingData && combinedServerAndApiKeyInstances.length === 0 && viewMode === 'table' && (
             <Card className="text-center py-10 shadow-lg flex-grow flex flex-col justify-center items-center bg-card">
              <CardHeader><CardTitle className="font-title">无数据显示</CardTitle></CardHeader>
              <CardContent><p className="text-muted-foreground font-sans">{apiConfigsList.length > 0 ? "未找到任何服务端实例或 API 密钥配置。" : "请先配置主控连接。"}</p></CardContent>
            </Card>
          )}

          {viewMode === 'table' && !isLoadingData && combinedServerAndApiKeyInstances.length > 0 && (
            <div className="border rounded-lg shadow-md overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-sans">来源主控</TableHead>
                    <TableHead className="font-sans">实例/密钥 ID</TableHead>
                    <TableHead className="font-sans">状态</TableHead>
                    <TableHead className="font-sans">URL/类型</TableHead>
                    <TableHead className="font-sans">监听地址</TableHead>
                    <TableHead className="text-right font-sans">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {combinedServerAndApiKeyInstances.map((item) => (
                    <TableRow key={`${item.apiId}-${item.id}`}>
                       <TableCell className="max-w-[150px] sm:max-w-xs font-sans">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-default truncate block">{item.apiName}</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="font-sans">{item.apiName}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{item.id.substring(0,12)}...</TableCell>
                      <TableCell>
                        {item.id === '********' ? (
                           <Badge variant="outline" className="border-yellow-500 text-yellow-600 whitespace-nowrap font-sans text-xs">
                                <KeyRound className="mr-1 h-3.5 w-3.5" />
                                监听中
                            </Badge>
                        ) : (
                            <InstanceStatusBadge status={item.status} />
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs max-w-xs">
                        <div className="flex items-center justify-between">
                          <span className="truncate" title={item.url}>
                           {item.id === '********' ? <span className="flex items-center"><KeyRound size={14} className="mr-1 text-yellow-500"/> API 密钥 (已隐藏)</span> : item.url}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 ml-2 flex-shrink-0"
                            onClick={() => handleCopyToClipboard(item.url, item.id === '********' ? 'API 密钥' : 'URL')}
                            aria-label={`复制 ${item.id === '********' ? 'API 密钥' : 'URL'}`}
                          >
                            <ClipboardCopy className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{item.id === '********' ? 'N/A' : (item as ServerNode).serverListeningAddress || 'N/A'}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="default" size="sm" onClick={() => handleViewServerTopology(item as ServerNode | ApiKeyNode)} className="font-sans">
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
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-muted-foreground p-4 bg-background/80 rounded-md shadow font-sans">
                    此服务端实例当前没有连接的客户端。
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

          <div className="mt-8 p-4 bg-muted/30 rounded-lg text-xs text-muted-foreground shadow-sm font-sans">
            <div className="flex items-center font-semibold mb-2"><Network className="h-4 w-4 mr-2 text-primary shrink-0" />拓扑说明</div>
            <ul className="list-disc list-inside space-y-1.5 pl-1">
              <li>默认显示所有来源主控的服务端实例及 API 密钥列表。点击 "查看拓扑" 可切换到图形视图，显示选定服务端/密钥及其连接的客户端。</li>
              <li>在图形视图中，服务端和客户端节点均可拖动以调整布局。连接线将从服务端右侧弯曲指向客户端左侧。</li>
              <li>连接关系基于客户端的 <code className="font-mono bg-muted px-1 py-0.5 rounded text-foreground">&lt;tunnel_addr&gt;</code> (其连接的服务端地址)与服务端的 <code className="font-mono bg-muted px-1 py-0.5 rounded text-foreground">&lt;tunnel_addr&gt;</code> (其监听地址)匹配。</li>
              <li>客户端“落地”地址指其本地转发目标 <code className="font-mono bg-muted px-1 py-0.5 rounded text-foreground">&lt;target_addr&gt;</code>。</li>
               <li><span className="inline-block w-3 h-3 rounded-sm bg-primary mr-1.5 align-middle"></span><code className="text-foreground">主色调线</code>: 服务端和客户端属于同一主控配置。</li>
              <li><span className="inline-block w-3 h-3 rounded-sm bg-accent mr-1.5 align-middle"></span><code className="text-foreground">强调色线</code>: 服务端和客户端属于不同主控配置。</li>
              <li>点击图形视图中的节点卡片可查看其详细信息。</li>
              <li>API 密钥类型的节点在表格中作为特殊服务端显示。在图形视图中，如果选择查看API密钥的拓扑，则其“客户端”是源自同一主控的其他API密钥节点 (此功能为概念性展示，实际连接取决于您的使用场景)。</li>
            </ul>
          </div>
        </div>
      </TooltipProvider>
    </AppLayout>
  );
};

export default TopologyPage;

    