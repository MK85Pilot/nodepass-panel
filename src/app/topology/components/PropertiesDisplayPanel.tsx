
"use client";

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Info } from 'lucide-react';
import type { NodePassFlowNodeType, ControllerNodeData, ServerNodeData, ClientNodeData, LandingNodeData, UserNodeData } from '../lib/topology-types';

interface PropertiesDisplayPanelProps {
  selectedNode: NodePassFlowNodeType | null;
}

export const PropertiesDisplayPanel: React.FC<PropertiesDisplayPanelProps> = ({ selectedNode }) => {
  return (
    <Card className="shadow-sm flex-grow flex flex-col min-h-0">
      <CardHeader className="py-2.5 px-3 flex-shrink-0">
        <CardTitle className="text-sm font-title flex items-center">
          <Info className="mr-1.5 h-4 w-4 text-blue-500" />节点属性
        </CardTitle>
        <CardDescription className="text-xs font-sans mt-0.5 truncate">
          {selectedNode ? `编辑: ${selectedNode.data?.label} (ID: ${selectedNode.id.substring(0,8)}...)` : "点击节点查看属性。"}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-2.5 flex-grow overflow-y-auto">
        <ScrollArea className="h-full pr-1">
          {selectedNode && selectedNode.data ? (
            <div className="space-y-1.5 text-xs">
              <p><span className="font-semibold">ID:</span> <span className="font-mono">{selectedNode.id}</span></p>
              <p><span className="font-semibold">类型:</span> <span className="font-mono capitalize">{selectedNode.data.type}</span></p>
              <p><span className="font-semibold">标签:</span> {selectedNode.data.label}</p>
              {selectedNode.data.type === 'controller' && (
                <>
                  <p><span className="font-semibold">API 名称:</span> {(selectedNode.data as ControllerNodeData).apiName}</p>
                  <p><span className="font-semibold">API ID:</span> <span className="font-mono">{(selectedNode.data as ControllerNodeData).apiId}</span></p>
                  <p><span className="font-semibold">角色:</span> {
                    (selectedNode.data as ControllerNodeData).role === 'server' ? '服务焦点' :
                    (selectedNode.data as ControllerNodeData).role === 'client' ? '客户焦点' :
                    '通用'
                  }</p>
                </>
              )}
              {selectedNode.data.statusInfo && <p><span className="font-semibold">提交状态:</span> <span style={{ color: selectedNode.data.statusInfo.includes('失败') ? 'hsl(var(--destructive))' : 'hsl(var(--chart-2))' }}>{selectedNode.data.statusInfo}</span></p>}
              {selectedNode.data.type === 'server' && <>
                <p><span className="font-semibold">隧道:</span> <span className="font-mono">{(selectedNode.data as ServerNodeData).tunnelAddress}</span></p>
                <p><span className="font-semibold">转发:</span> <span className="font-mono">{(selectedNode.data as ServerNodeData).targetAddress}</span></p>
                <p><span className="font-semibold">日志:</span> {(selectedNode.data as ServerNodeData).logLevel}</p>
                <p><span className="font-semibold">TLS:</span> {(selectedNode.data as ServerNodeData).tlsMode}</p>
              </>}
              {selectedNode.data.type === 'client' && <>
                <p><span className="font-semibold">服务端隧道:</span> <span className="font-mono">{(selectedNode.data as ClientNodeData).tunnelAddress}</span></p>
                <p><span className="font-semibold">本地转发:</span> <span className="font-mono">{(selectedNode.data as ClientNodeData).targetAddress}</span></p>
                <p><span className="font-semibold">日志:</span> {(selectedNode.data as ClientNodeData).logLevel}</p>
                {(selectedNode.data as ClientNodeData).managingApiName &&
                  <p><span className="font-semibold">管理主控:</span> {(selectedNode.data as ClientNodeData).managingApiName}</p>}
              </>}
              {selectedNode.data.type === 'landing' && <>
                <p><span className="font-semibold">IP:</span> <span className="font-mono">{(selectedNode.data as LandingNodeData).landingIp || 'N/A'}</span></p>
                <p><span className="font-semibold">端口:</span> <span className="font-mono">{(selectedNode.data as LandingNodeData).landingPort || 'N/A'}</span></p>
              </>}
              {selectedNode.data.type === 'user' && <p><span className="font-semibold">描述:</span> {(selectedNode.data as UserNodeData).description || 'N/A'}</p>}
              <p className="text-muted-foreground font-sans mt-2 pt-2 border-t">右键点击节点可编辑或删除。右键点击链路可删除。</p>
            </div>
          ) : ( <p className="text-xs text-muted-foreground text-center py-3 font-sans">未选择节点。</p> )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
};
