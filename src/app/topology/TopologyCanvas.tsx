
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
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useTheme } from 'next-themes';
import { TopologyToolbar } from './components/TopologyToolbar';
import type { DraggableNodeType } from './components/ComponentsPalette';
import type { NamedApiConfig } from '@/hooks/use-api-key';
import type { Node } from './topologyTypes';
import { nodeTypes } from './NodeRenderer';

const initialZoomLevel = 0.5;

interface ToolbarWrapperProps {
  onCenterView: (instance: ReturnType<typeof useReactFlow>) => void;
  // onFormatLayout prop removed
  onClearCanvas: () => void;
  onSubmitTopology: () => void;
  canSubmit: boolean;
  isSubmitting: boolean;
}

const ToolbarWrapper: React.FC<ToolbarWrapperProps> = ({
  onCenterView,
  // onFormatLayout removed
  onClearCanvas,
  onSubmitTopology,
  canSubmit,
  isSubmitting,
}) => {
  const reactFlowInstance = useReactFlow();
  return (
    <TopologyToolbar
      onCenterView={() => onCenterView(reactFlowInstance)}
      // onFormatLayout removed
      onClearCanvas={onClearCanvas}
      onSubmitTopology={onSubmitTopology}
      canSubmit={canSubmit}
      isSubmitting={isSubmitting}
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
  // onFormatLayout prop removed
  onClearCanvas: () => void;
  onTriggerSubmitTopology: () => void;
  canSubmit: boolean;
  isSubmitting: boolean;
  onNodeDropOnCanvas: (
    type: DraggableNodeType | 'master',
    position: { x: number; y: number },
    draggedData?: NamedApiConfig
  ) => void;
  onNodeContextMenu: (event: React.MouseEvent, node: Node) => void;
  onEdgeContextMenu: (event: React.MouseEvent, edge: Edge) => void;
  onPaneClick: () => void;
  onNodeClick?: NodeMouseHandler; // Added for S/C expansion
}

export const TopologyCanvasWrapper: React.FC<TopologyCanvasWrapperProps> = ({
  nodes, edges, onNodesChange, onEdgesChange, onConnect, onSelectionChange,
  reactFlowWrapperRef, onCenterView, /* onFormatLayout removed */ onClearCanvas, onTriggerSubmitTopology,
  canSubmit, isSubmitting, onNodeDropOnCanvas, onNodeContextMenu,
  onEdgeContextMenu, onPaneClick, onNodeClick
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
        nodeTypes={nodeTypes}
      >
        <Panel position="top-right" className="!m-0 !p-2 bg-transparent">
          <ToolbarWrapper
            onCenterView={onCenterView}
            // onFormatLayout removed
            onClearCanvas={onClearCanvas}
            onSubmitTopology={onTriggerSubmitTopology}
            canSubmit={canSubmit}
            isSubmitting={isSubmitting}
          />
        </Panel>
        {memoizedMiniMap}
        {memoizedBackground}
      </ReactFlow>
    </div>
  );
};
