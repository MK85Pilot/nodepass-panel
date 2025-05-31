
"use client";

import React from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { cn } from "@/lib/utils";
import type { TopologyNodeData, ControllerNodeData, ServerNodeData, ClientNodeData, LandingNodeData, UserNodeData } from '../lib/topology-types';
import { getNodeIcon, getNodeIconColorClass, getNodeBorderColorClass } from '../lib/topology-utils';

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
    if (controllerData.role === 'server') displayLabel += ' (服务)';
    else if (controllerData.role === 'client') displayLabel += ' (客户)';
    subText = controllerData.apiName || '未知API';
  } else if (data.type === 'client') {
    const clientData = data as ClientNodeData;
    displayLabel = clientData.label;
    subText = clientData.tunnelAddress || '未配置服务端';
    if (clientData.managingApiName) {
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
        "min-w-[120px] max-w-[160px] py-1 px-2",
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
            className="!w-5 !h-5 !rounded-full !bg-transparent !border-0"
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
      {data.type === 'client' && (
        <Handle type="source" position={Position.Right} id="c_to_l_output"
            className="!w-2.5 !h-2.5 !rounded-full !bg-slate-400 dark:!bg-slate-600 !border-2 !border-background dark:!border-card hover:!bg-purple-500 hover:!border-purple-300 transition-all cursor-grab shadow-md"
            style={{ right: '5px', top: 'calc(50% - 7px)', transform: 'translateY(-50%)' }} />
      )}
       {data.type === 'client' && (
        <Handle type="source" position={Position.Right} id="c_to_s_output" // Added this handle for client to server connections.
            className="!w-2.5 !h-2.5 !rounded-full !bg-slate-400 dark:!bg-slate-600 !border-2 !border-background dark:!border-card hover:!bg-primary hover:!border-primary-foreground transition-all cursor-grab shadow-md"
            style={{ right: '5px', top: 'calc(50% + 7px)', transform: 'translateY(-50%)' }} />
      )}
    </div>
  );
});
NodePassFlowNode.displayName = 'NodePassFlowNode';

export default NodePassFlowNode;
