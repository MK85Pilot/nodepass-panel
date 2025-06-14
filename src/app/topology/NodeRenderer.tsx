
'use client';

import React, { memo } from 'react';
import type { NodeProps } from 'reactflow';
import { Handle, Position } from 'reactflow';
import { Loader2, Server, DatabaseZap, Globe, UserCircle2 } from 'lucide-react';
import type { CustomNodeData } from './topologyTypes';
import { ICON_ONLY_NODE_SIZE, EXPANDED_SC_NODE_WIDTH, EXPANDED_SC_NODE_BASE_HEIGHT, DETAIL_LINE_HEIGHT } from './topologyTypes';
import { cn } from '@/lib/utils';

export const CARD_NODE_WIDTH = 100; // Original default width, kept for reference or other uses
export const CARD_NODE_HEIGHT = 40; // Original default height

export const M_NODE_FOR_LINK_WIDTH = 300;
export const M_NODE_FOR_LINK_HEIGHT = 200;


export const nodeStyles = {
  m: {
    base: {
      color: 'hsl(var(--foreground))',
      borderColor: 'hsl(var(--border))',
      borderWidth: 1.5,
      background: 'hsl(var(--card) / 0.6)',
      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
      borderRadius: '0.75rem',
      padding: '16px',
      fontSize: '0.8rem',
      fontWeight: 500,
      textAlign: 'center' as const,
      display: 'flex',
      flexDirection: 'column' as const,
      alignItems: 'center',
      justifyContent: 'flex-start',
    }
  },
  s: { base: { background: 'hsl(210, 100%, 97%)', borderColor: 'hsl(210, 80%, 60%)', color: 'hsl(210, 90%, 30%)', iconColor: 'hsl(210, 80%, 50%)' } },
  c: { base: { background: 'hsl(145, 63%, 96%)', borderColor: 'hsl(145, 60%, 45%)', color: 'hsl(145, 80%, 20%)', iconColor: 'hsl(145, 60%, 40%)' } },
  t: { base: { background: 'hsl(35, 100%, 96%)', borderColor: 'hsl(35, 90%, 60%)', color: 'hsl(35, 90%, 35%)', iconColor: 'hsl(35, 90%, 55%)' } },
  u: { base: { background: 'hsl(265, 80%, 97%)', borderColor: 'hsl(265, 70%, 60%)', color: 'hsl(265, 70%, 40%)', iconColor: 'hsl(265, 70%, 55%)' } }
};

export const MasterNode: React.FC<NodeProps<CustomNodeData>> = memo(({ data }) => {
  const isAdvancedContainerRole = !data.masterSubRole || data.masterSubRole === 'generic' || data.masterSubRole === 'primary' || data.masterSubRole === 'container';

  const subRoleText = data.masterSubRole === 'client-role' ? '(客户隧道)'
    : data.masterSubRole === 'server-role' ? '(服务主机)'
    : data.masterSubRole === 'primary' ? '(主要主控)'
    : data.masterSubRole === 'single-client-link' ? '(单客户端链路)'
    : data.masterSubRole === 'intra-master-tunnel' ? '(内部隧道)'
    : data.masterSubRole === 'external-client-link' ? '(外部客户端连接)'
    : data.masterSubRole === 'server-service-link' ? '(服务端服务)'
    : '(通用容器)';
  
  return (
    <>
      {!isAdvancedContainerRole && data.masterSubRole === 'client-role' && (
        <>
          <Handle type="target" position={Position.Left} id="m-left" className="!bg-cyan-500 w-2.5 h-2.5" />
          <Handle type="source" position={Position.Right} id="m-right" className="!bg-cyan-500 w-2.5 h-2.5" />
        </>
      )}
      <div className="font-semibold text-sm mb-1">{data.label} 
        {!isAdvancedContainerRole && <span className="text-xs text-muted-foreground"> {subRoleText}</span>}
      </div>
      {data.submissionStatus && (
        <div className={`text-xs mt-1 p-0.5 rounded ${data.submissionStatus === 'success' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : data.submissionStatus === 'error' ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' : 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'}`}>
          {data.submissionStatus === 'pending' && <Loader2 className="inline h-3 w-3 mr-1 animate-spin" />}
          {data.submissionMessage || data.submissionStatus}
        </div>
      )}
    </>
  );
});
MasterNode.displayName = 'MasterNode';

export const CardNode: React.FC<NodeProps<CustomNodeData>> = memo(({ data, selected, width, height }) => {
  const IconComponent = data.icon || (data.role === 'S' ? Server : data.role === 'C' ? DatabaseZap : data.role === 'T' ? Globe : UserCircle2);
  const roleStyle = nodeStyles[data.role.toLowerCase() as keyof typeof nodeStyles];
  const isExpanded = !!data.isExpanded;

  const baseCardClasses = `flex rounded-lg border-2 shadow-sm transition-all duration-200 ease-in-out`;
  
  const nodeWidth = width || (isExpanded ? EXPANDED_SC_NODE_WIDTH : ICON_ONLY_NODE_SIZE);
  
  let calculatedHeight = height;
  if (!calculatedHeight) {
    if (isExpanded) {
      let numDetails = 2; // Label, Role
      if (data.tunnelAddress) numDetails++;
      if (data.targetAddress) numDetails++;
      if (data.submissionStatus) numDetails++;
      calculatedHeight = EXPANDED_SC_NODE_BASE_HEIGHT + (numDetails * DETAIL_LINE_HEIGHT);
    } else {
      calculatedHeight = ICON_ONLY_NODE_SIZE;
    }
  }


  const dynamicStyle: React.CSSProperties = {
    borderColor: roleStyle.base.borderColor,
    color: roleStyle.base.color,
    background: isExpanded || selected ? roleStyle.base.background : 'transparent',
    width: `${nodeWidth}px`,
    height: `${calculatedHeight}px`,
  };

  const handleBaseClasses = "w-3 h-3 !bg-slate-400 opacity-75 transition-opacity duration-150";
  const handleHiddenClasses = "!opacity-0 !pointer-events-none";

  return (
    <>
      <div
        className={cn(
          baseCardClasses,
          isExpanded ? 'flex-col p-2 items-start' : 'items-center justify-center p-1'
        )}
        style={dynamicStyle}
      >
        <div className={cn("flex items-center", isExpanded ? 'w-full mb-1' : '')}>
          {IconComponent && (
            <div
              className={cn(
                "flex-shrink-0 flex items-center justify-center rounded-md",
                isExpanded ? 'w-7 h-7 mr-2' : 'w-full h-full' 
              )}
              style={{ 
                backgroundColor: isExpanded ? `${(roleStyle.base as any).borderColor}33` : 'transparent' 
              }}
            >
              <IconComponent size={isExpanded ? 16 : 24} style={{ color: (roleStyle.base as any).iconColor || roleStyle.base.borderColor }} />
            </div>
          )}
          {isExpanded && (
            <span className="font-medium text-xs truncate flex-grow" style={{ color: selected ? roleStyle.base.color : 'hsl(var(--foreground))' }}>
              {data.label || data.role}
            </span>
          )}
        </div>

        {isExpanded && (
          <div className="text-xs space-y-0.5 w-full pl-1 overflow-hidden text-ellipsis">
            <p className="truncate" title={`角色: ${data.role}`}><strong>角色:</strong> {data.role}</p>
            {data.tunnelAddress && <p className="truncate" title={`隧道: ${data.tunnelAddress}`}><strong>隧道:</strong> {data.tunnelAddress}</p>}
            {data.targetAddress && <p className="truncate" title={`目标: ${data.targetAddress}`}><strong>目标:</strong> {data.targetAddress}</p>}
          </div>
        )}
        
        {data.submissionStatus && (isExpanded || !isExpanded /* Always show for icon if status exists */) && (
          <div className={cn(
            `text-xs p-0.5 rounded w-full text-center`,
            isExpanded ? 'mt-auto' : 'absolute bottom-0 left-0 right-0 text-[8px] leading-tight bg-opacity-75',
            data.submissionStatus === 'success' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : 
            data.submissionStatus === 'error' ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' : 
            'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
          )}>
            {data.submissionStatus === 'pending' && <Loader2 className="inline h-2 w-2 mr-0.5 animate-spin" />}
            {isExpanded ? data.submissionMessage || data.submissionStatus : data.submissionStatus.substring(0,1).toUpperCase()}
          </div>
        )}
      </div>

      {/* Handles for S and C nodes (can be source or target on any side) */}
      {(data.role === 'S' || data.role === 'C') && (
        <>
          <Handle type="target" position={Position.Top} id="top" className={cn(handleBaseClasses, !data.activeHandles?.top && handleHiddenClasses)} />
          <Handle type="source" position={Position.Bottom} id="bottom" className={cn(handleBaseClasses, !data.activeHandles?.bottom && handleHiddenClasses)} />
          <Handle type="target" position={Position.Left} id="left" className={cn(handleBaseClasses, !data.activeHandles?.left && handleHiddenClasses)} />
          <Handle type="source" position={Position.Right} id="right" className={cn(handleBaseClasses, !data.activeHandles?.right && handleHiddenClasses)} />
        </>
      )}

      {/* Handles for U node (only source) */}
      {data.role === 'U' && (
        <>
          <Handle type="source" position={Position.Top} id="top" className={cn(handleBaseClasses, !data.activeHandles?.top && handleHiddenClasses)} />
          <Handle type="source" position={Position.Bottom} id="bottom" className={cn(handleBaseClasses, !data.activeHandles?.bottom && handleHiddenClasses)} />
          <Handle type="source" position={Position.Left} id="left" className={cn(handleBaseClasses, !data.activeHandles?.left && handleHiddenClasses)} />
          <Handle type="source" position={Position.Right} id="right" className={cn(handleBaseClasses, !data.activeHandles?.right && handleHiddenClasses)} />
        </>
      )}

      {/* Handles for T node (only target) */}
      {data.role === 'T' && (
        <>
          <Handle type="target" position={Position.Top} id="top" className={cn(handleBaseClasses, !data.activeHandles?.top && handleHiddenClasses)} />
          <Handle type="target" position={Position.Bottom} id="bottom" className={cn(handleBaseClasses, !data.activeHandles?.bottom && handleHiddenClasses)} />
          <Handle type="target" position={Position.Left} id="left" className={cn(handleBaseClasses, !data.activeHandles?.left && handleHiddenClasses)} />
          <Handle type="target" position={Position.Right} id="right" className={cn(handleBaseClasses, !data.activeHandles?.right && handleHiddenClasses)} />
        </>
      )}
    </>
  );
});
CardNode.displayName = 'CardNode';

export const nodeTypes = {
  cardNode: CardNode,
  masterNode: MasterNode,
};
