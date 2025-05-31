
"use client";

import React from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { cn } from "@/lib/utils";
import type { TopologyNodeData, ControllerNodeData, ServerNodeData, ClientNodeData, LandingNodeData, UserNodeData } from '../lib/topology-types';
import { getNodeIcon, getNodeIconColorClass, getNodeBorderColorClass, getSelectedNodeBgClass } from '../lib/topology-utils';

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
  
  // Determine styles based on selection
  const baseBorderClass = getNodeBorderColorClass(data.type, false, data.isChainHighlighted, data.statusInfo);
  const backgroundClass = selected ? getSelectedNodeBgClass(data.type) : "bg-card";
  const mainTextColorClass = selected ? "text-primary-foreground" : "text-card-foreground";
  const iconFinalColorClass = selected ? "text-primary-foreground" : getNodeIconColorClass(data.type);
  const subTextFinalColorClass = selected ? "text-primary-foreground/80" : "text-muted-foreground";
  
  let statusInfoFinalColorClass = '';
  let statusInfoInlineStyle = {};
  if (data.statusInfo) {
    if (selected) {
      statusInfoFinalColorClass = 'text-primary-foreground/90';
    } else {
      // Default status color logic (inline style for non-selected to handle specific HSL)
      statusInfoInlineStyle = { color: data.statusInfo.includes('失败') ? 'hsl(var(--destructive))' : 'hsl(var(--chart-2))' };
    }
  }


  return (
    <div
      className={cn(
        "rounded-md shadow-md flex flex-col items-center justify-center border-2",
        "py-1 px-2", // Standard padding
        baseBorderClass, // Always apply the base border color for the type
        backgroundClass, // Background changes on selection
        mainTextColorClass // Main text color changes on selection
        // Explicit width/height is applied by React Flow from the node object
      )}
      data-type={data.type} // For potential CSS targeting
    >
      <div className="flex items-center text-[11px] font-medium mb-0.5">
        {Icon && <Icon className={cn("h-3.5 w-3.5 mr-1 shrink-0", iconFinalColorClass)} />}
        <span className="truncate" title={displayLabel}>{displayLabel}</span>
      </div>
      {subText && <div className={cn("text-[9px] truncate w-full text-center", subTextFinalColorClass)} title={subText}>{subText}</div>}
      
      {data.statusInfo && (
        <div 
          className={cn("text-[8px] font-semibold mt-0.5 w-full text-center", statusInfoFinalColorClass)}
          style={statusInfoInlineStyle}
        >
          {data.statusInfo}
        </div>
      )}

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
        <Handle type="source" position={Position.Right} id="c_to_s_output" 
            className="!w-2.5 !h-2.5 !rounded-full !bg-slate-400 dark:!bg-slate-600 !border-2 !border-background dark:!border-card hover:!bg-primary hover:!border-primary-foreground transition-all cursor-grab shadow-md"
            style={{ right: '5px', top: 'calc(50% + 7px)', transform: 'translateY(-50%)' }} />
      )}
    </div>
  );
});
NodePassFlowNode.displayName = 'NodePassFlowNode';

export default NodePassFlowNode;
