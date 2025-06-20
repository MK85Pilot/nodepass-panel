
'use client';

import React, { useMemo, useEffect, useState } from 'react';
import ReactFlow, {
  Background,
  MiniMap,
  Panel,
  useReactFlow,
  type Connection,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type NodeMouseHandler,
  type NodeTypes,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useTheme } from 'next-themes';
import { TopologyToolbar } from './components/TopologyToolbar';
import type { DraggableNodeType } from './components/ComponentsPalette';
import type { NamedApiConfig } from '@/hooks/use-api-key';
import type { Node } from './topologyTypes';

const initialZoomLevel = 0.5;

interface ToolbarWrapperPropsInternal { // Renamed for clarity within this file
  onCenterView: (instance: ReturnType<typeof useReactFlow>) => void;
  onClearCanvas: () => void;
  onSubmitTopology: () => void;
  onRefreshAllInstanceCounts: () => void;
  canSubmit: boolean;
  isSubmitting: boolean;
  isRefreshingCounts?: boolean;
  isMobile?: boolean; // Added
  onToggleMobilePalette?: () => void; // Added
}

const ToolbarWrapper: React.FC<ToolbarWrapperPropsInternal> = ({
  onCenterView,
  onClearCanvas,
  onSubmitTopology,
  onRefreshAllInstanceCounts,
  canSubmit,
  isSubmitting,
  isRefreshingCounts,
  isMobile, // Added
  onToggleMobilePalette, // Added
}) => {
  const reactFlowInstance = useReactFlow();
  return (
    <TopologyToolbar
      onCenterView={() => onCenterView(reactFlowInstance)}
      onClearCanvas={onClearCanvas}
      onSubmitTopology={onSubmitTopology}
      onRefreshAllInstanceCounts={onRefreshAllInstanceCounts}
      canSubmit={canSubmit}
      isSubmitting={isSubmitting}
      isRefreshingCounts={isRefreshingCounts}
      isMobile={isMobile} // Pass down
      onToggleMobilePalette={onToggleMobilePalette} // Pass down
    />
  );
};

interface TopologyCanvasWrapperProps {
  nodes: Node[];
  edges: Edge[];
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: (params: Connection | Edge) => void;
  onSelectionChange: ({ nodes, edges }: { nodes: Node[]; edges: Edge[] }) => void;
  reactFlowWrapperRef: React.RefObject<HTMLDivElement>;
  onCenterView: (instance: ReturnType<typeof useReactFlow>) => void;
  onClearCanvas: () => void;
  onTriggerSubmitTopology: () => void;
  onTriggerRefreshAllInstanceCounts: () => void;
  canSubmit: boolean;
  isSubmitting: boolean;
  isRefreshingCounts?: boolean;
  onNodeDropOnCanvas: (
    type: DraggableNodeType | 'master',
    position: { x: number; y: number },
    draggedData?: NamedApiConfig
  ) => void;
  onNodeContextMenu: (event: React.MouseEvent, node: Node) => void;
  onEdgeContextMenu: (event: React.MouseEvent, edge: Edge) => void;
  onPaneClick: () => void;
  onNodeClick?: NodeMouseHandler;
  customNodeTypes: NodeTypes;
  isMobile?: boolean; // Added
  onToggleMobilePalette?: () => void; // Added
}

export const TopologyCanvasWrapper: React.FC<TopologyCanvasWrapperProps> = ({
  nodes, edges, onNodesChange, onEdgesChange, onConnect, onSelectionChange,
  reactFlowWrapperRef, onCenterView, onClearCanvas, onTriggerSubmitTopology,
  onTriggerRefreshAllInstanceCounts,
  canSubmit, isSubmitting, isRefreshingCounts, onNodeDropOnCanvas, onNodeContextMenu,
  onEdgeContextMenu, onPaneClick, onNodeClick, customNodeTypes,
  isMobile, onToggleMobilePalette // Destructure new props
}) => {
  const { resolvedTheme } = useTheme();
  const [isClient, setIsClient] = useState(false);
  const reactFlowInstance = useReactFlow();

  useEffect(() => { setIsClient(true); }, []);

  const miniMapStyle = useMemo(() => ({
    backgroundColor: resolvedTheme === 'dark' ? 'hsl(var(--popover))' : 'hsl(var(--card))',
    border: `1px solid hsl(var(--border))`,
    borderRadius: '0.375rem',
  }), [resolvedTheme]);

  const memoizedMiniMap = useMemo(() => (isClient ? <MiniMap style={miniMapStyle} nodeStrokeWidth={3} zoomable pannable /> : null), [miniMapStyle, isClient]);
  const memoizedBackground = useMemo(() => <Background variant="dots" gap={16} size={1} />, []);

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!reactFlowInstance || !reactFlowWrapperRef.current) return;
    const reactFlowBounds = reactFlowWrapperRef.current.getBoundingClientRect();
    const masterConfigString = event.dataTransfer.getData('application/nodepass-master-config');
    const componentTypeString = event.dataTransfer.getData('application/nodepass-component-type') as DraggableNodeType;
    const position = reactFlowInstance.project({
      x: event.clientX - reactFlowBounds.left,
      y: event.clientY - reactFlowBounds.top,
    });
    if (masterConfigString) {
      try {
        const config = JSON.parse(masterConfigString) as NamedApiConfig;
        onNodeDropOnCanvas('master', position, config);
      } catch (e) { console.error('Failed to parse dragged master config:', e); }
    } else if (componentTypeString) {
      onNodeDropOnCanvas(componentTypeString, position);
    }
  };

  return (
    <div
      ref={reactFlowWrapperRef}
      className="h-full w-full bg-background rounded-lg shadow-md border"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onSelectionChange={onSelectionChange}
        onNodeContextMenu={onNodeContextMenu}
        onEdgeContextMenu={onEdgeContextMenu}
        onPaneClick={onPaneClick}
        onNodeClick={onNodeClick} 
        defaultViewport={{ x: 0, y: 0, zoom: initialZoomLevel }}
        nodesDraggable={!isSubmitting}
        nodesConnectable={!isSubmitting}
        elementsSelectable={!isSubmitting}
        deleteKeyCode={isSubmitting ? [] : ['Backspace', 'Delete']}
        panOnScroll={false}
        zoomOnScroll={true}
        panOnDrag={true}
        selectionOnDrag
        className="h-full w-full"
        nodeOrigin={[0, 0]}
        nodeTypes={customNodeTypes}
      >
        <Panel position="top-right" className="!m-0 !p-2 bg-transparent">
          <ToolbarWrapper
            onCenterView={onCenterView}
            onClearCanvas={onClearCanvas}
            onSubmitTopology={onTriggerSubmitTopology}
            onRefreshAllInstanceCounts={onTriggerRefreshAllInstanceCounts}
            canSubmit={canSubmit}
            isSubmitting={isSubmitting}
            isRefreshingCounts={isRefreshingCounts}
            isMobile={isMobile} // Pass down
            onToggleMobilePalette={onToggleMobilePalette} // Pass down
          />
        </Panel>
        {memoizedMiniMap}
        {memoizedBackground}
      </ReactFlow>
    </div>
  );
};
