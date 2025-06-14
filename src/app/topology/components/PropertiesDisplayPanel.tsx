
"use client";

import React from 'react';
import type { Node, CustomNodeData } from '../topologyTypes'; 

interface PropertiesDisplayPanelProps {
  selectedNode: Node | null;
}

export function PropertiesDisplayPanel({ selectedNode }: PropertiesDisplayPanelProps) {
  if (!selectedNode) {
    return (
      <div className="p-1 text-xs text-muted-foreground font-sans text-center h-full flex items-center justify-center">
        {/* Message is handled by parent CardDescription */}
      </div>
    );
  }

  const data = selectedNode.data as CustomNodeData; 

  return (
    <div className="space-y-2 text-xs font-sans p-1">
      <div>
        <strong className="text-muted-foreground">ID:</strong>
        <span className="ml-1 font-mono break-all">{selectedNode.id}</span>
      </div>
      <div>
        <strong className="text-muted-foreground">角色 (Role):</strong>
        <span className="ml-1 font-semibold">{data.role}</span>
      </div>
      {data.masterSubRole && (
        <div>
          <strong className="text-muted-foreground">主控子角色 (SubRole):</strong>
          <span className="ml-1">{data.masterSubRole}</span>
        </div>
      )}
      {data.label && (
        <div>
          <strong className="text-muted-foreground">标签 (Label):</strong>
          <span className="ml-1">{data.label}</span>
        </div>
      )}
      {data.nodeType && (
         <div>
          <strong className="text-muted-foreground">节点类型 (NodeType):</strong>
          <span className="ml-1">{data.nodeType}</span>
        </div>
      )}
      {data.role === 'C' && data.isSingleEndedForwardC !== undefined && (
        <div>
          <strong className="text-muted-foreground">单端转发模式:</strong>
          <span className="ml-1">{data.isSingleEndedForwardC ? '是' : '否'}</span>
        </div>
      )}
      {data.masterId && ( 
         <div>
          <strong className="text-muted-foreground">源主控ID:</strong>
          <span className="ml-1 font-mono break-all">{data.masterId}</span>
        </div>
      )}
      {data.representedMasterId && ( 
         <div>
          <strong className="text-muted-foreground">代表主控ID:</strong>
          <span className="ml-1 font-mono break-all">{data.representedMasterId}</span>
        </div>
      )}
       {data.representedMasterName && ( 
         <div>
          <strong className="text-muted-foreground">代表主控名:</strong>
          <span className="ml-1">{data.representedMasterName}</span>
        </div>
       )}
       {data.parentNode && (
         <div>
          <strong className="text-muted-foreground">父节点ID (ParentNodeID):</strong>
          <span className="ml-1 font-mono break-all">{data.parentNode}</span>
        </div>
      )}
      {data.isContainer !== undefined && (
         <div>
          <strong className="text-muted-foreground">是容器 (IsContainer):</strong>
          <span className="ml-1">{data.isContainer ? '是' : '否'}</span>
        </div>
      )}
      {data.role === 'M' && data.masterName && ( 
        <div>
          <strong className="text-muted-foreground">源主控名称:</strong>
          <span className="ml-1">{data.masterName}</span>
        </div>
      )}
      {(data.role === 'S' || (data.role === 'C' && !data.isSingleEndedForwardC)) && data.tunnelAddress && ( 
        <div>
          <strong className="text-muted-foreground">隧道地址:</strong>
          <span className="ml-1 font-mono break-all">{data.tunnelAddress}</span>
        </div>
      )}
      {data.role === 'C' && data.isSingleEndedForwardC && data.tunnelAddress && ( 
        <div>
          <strong className="text-muted-foreground">本地监听地址:</strong>
          <span className="ml-1 font-mono break-all">{data.tunnelAddress}</span>
        </div>
      )}

      { (data.role === 'S' || data.role === 'T' || (data.role === 'M' && data.masterSubRole === 'client-role')) && data.targetAddress && (
        <div>
          <strong className="text-muted-foreground">
            {data.role === 'S' ? '出口(s)转发地址:' : 
             data.role === 'T' ? '落地转发地址:' : 
             (data.role === 'M' && data.masterSubRole === 'client-role') ? 'M(客户)本地服务:' : 
             '目标地址:' 
            }
          </strong>
          <span className="ml-1 font-mono break-all">{data.targetAddress}</span>
        </div>
      )}
       {data.role === 'C' && data.targetAddress && (
        <div>
          <strong className="text-muted-foreground">
            {data.isSingleEndedForwardC ? '远程目标地址:' : '入口(c)本地转发:'}
          </strong>
          <span className="ml-1 font-mono break-all">{data.targetAddress}</span>
        </div>
      )}
      {data.logLevel && (
        <div>
          <strong className="text-muted-foreground">日志级别:</strong>
          <span className="ml-1">{data.logLevel}</span>
        </div>
      )}
      {data.tlsMode && (data.role === 'S' || (data.role === 'C' && data.isSingleEndedForwardC) || (data.role === 'M' && data.masterSubRole === 'client-role')) && (
         <div>
          <strong className="text-muted-foreground">TLS 模式:</strong>
          <span className="ml-1">{data.tlsMode}</span>
        </div>
      )}
       {data.tlsMode === '2' && (data.role === 'S' || (data.role === 'C' && data.isSingleEndedForwardC) || (data.role === 'M' && data.masterSubRole === 'client-role')) && data.certPath && (
         <div>
          <strong className="text-muted-foreground">证书路径:</strong>
          <span className="ml-1 font-mono break-all">{data.certPath}</span>
        </div>
      )}
       {data.tlsMode === '2' && (data.role === 'S' || (data.role === 'C' && data.isSingleEndedForwardC) || (data.role === 'M' && data.masterSubRole === 'client-role')) && data.keyPath && (
         <div>
          <strong className="text-muted-foreground">密钥路径:</strong>
          <span className="ml-1 font-mono break-all">{data.keyPath}</span>
        </div>
      )}
    </div>
  );
}
    

