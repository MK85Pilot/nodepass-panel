
import ELK, { type ElkNode, type ElkExtendedEdge, type LayoutOptions as ElkLayoutOptions } from 'elkjs/lib/elk.bundled.js';
import type { Node as ReactFlowNodeReactFlow, Edge as ReactFlowEdge } from 'reactflow'; // Renamed to avoid conflict
import type { NodePassFlowNodeType, TopologyNodeData } from './topology-types';
import { NODE_DEFAULT_WIDTH, NODE_DEFAULT_HEIGHT, TIER_Y_SPACING, NODE_X_SPACING } from './topology-types';

const elk = new ELK();

// Default ELK options for a hierarchical layout
// See https://www.eclipse.org/elk/reference/algorithms/org-eclipse-elk-layered.html
const defaultElkOptions: ElkLayoutOptions = {
  'elk.algorithm': 'layered',
  'elk.direction': 'DOWN',
  'elk.layered.spacing.nodeNodeBetweenLayers': String(TIER_Y_SPACING * 0.9), // Increased spacing
  'elk.spacing.nodeNode': String(NODE_X_SPACING * 0.7), // Increased spacing
  'elk.layered.spacing.edgeNodeBetweenLayers': String(TIER_Y_SPACING * 0.5),
  'elk.layered.spacing.edgeEdgeBetweenLayers': String(TIER_Y_SPACING * 0.5),
  'elk.edgeRouting': 'POLYLINE', // Polyline routing can help avoid node overlaps.
  'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
  'elk.layered.cycleBreaking.strategy': 'DEPTH_FIRST',
  'elk.separateConnectedComponents': 'true',
  'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
  // 'elk.padding.node': '[top=20,left=20,bottom=20,right=20]', // Add padding around nodes for edges
  'elk.layered.mergeEdges': 'true', // Might help with bundling edges visually
  'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
};

export async function calculateElkLayout(
  reactFlowNodes: NodePassFlowNodeType[],
  reactFlowEdges: ReactFlowEdge[]
): Promise<{ nodes: NodePassFlowNodeType[], edges: ReactFlowEdge[] }> {
  if (reactFlowNodes.length === 0) {
    return { nodes: [], edges: [] };
  }

  const elkNodes: ElkNode[] = reactFlowNodes.map(flowNode => ({
    id: flowNode.id,
    width: flowNode.width || NODE_DEFAULT_WIDTH,
    height: flowNode.height || NODE_DEFAULT_HEIGHT,
    labels: [{ text: flowNode.data?.label || flowNode.id }],
    // ELK can use portConstraints for more precise edge connections if needed
    // ports: flowNode.data?.type === 'server' ? [{ id: `${flowNode.id}-s_to_c_output`, properties: { 'port.side': 'EAST', 'port.index': '0' } }] : []
  }));

  const elkEdges: ElkExtendedEdge[] = reactFlowEdges.map(flowEdge => ({
    id: flowEdge.id,
    sources: [flowEdge.source],
    targets: [flowEdge.target],
    // Optional: define sourcePort and targetPort if using specific ports on ELK nodes
    // sourcePort: flowEdge.sourceHandle || undefined,
    // targetPort: flowEdge.targetHandle || undefined,
  }));

  const graphToLayout: ElkNode = {
    id: 'root',
    layoutOptions: defaultElkOptions,
    children: elkNodes,
    edges: elkEdges,
  };

  try {
    const layoutedGraph = await elk.layout(graphToLayout);

    const newNodes = reactFlowNodes.map(flowNode => {
      const elkNode = layoutedGraph.children?.find(n => n.id === flowNode.id);
      if (elkNode && elkNode.x !== undefined && elkNode.y !== undefined) {
        return {
          ...flowNode,
          position: { x: elkNode.x, y: elkNode.y },
        };
      }
      return flowNode;
    });
    
    // For now, return original edges. Custom edge components would process elkEdge.sections / bendPoints.
    const newEdges = reactFlowEdges.map(flowEdge => {
        const elkEdge = layoutedGraph.edges?.find(e => e.id === flowEdge.id);
        if (elkEdge) {
            // Storing ELK's bend points or sections in edge.data could be one way
            // for a custom edge component to use them.
            // return { ...flowEdge, data: { ...flowEdge.data, elkSections: elkEdge.sections } };
        }
        return flowEdge; // Return original edge, React Flow will rerender to new node positions
    });


    return { nodes: newNodes, edges: newEdges };
  } catch (e) {
    console.error('ELK layout error:', e);
    throw e; // Re-throw to be caught by the caller for fallback
  }
}

// Tiered layout remains as a fallback or alternative
export function calculateTieredLayout(
  nodes: NodePassFlowNodeType[],
  options?: { tierSpacing?: number; nodeSpacing?: number; }
): NodePassFlowNodeType[] {
  if (nodes.length === 0) {
    return [];
  }

  const tierYSpacing = options?.tierSpacing || TIER_Y_SPACING;
  const nodeXSpacing = options?.nodeSpacing || NODE_X_SPACING;

  const tierOrder: TopologyNodeData['type'][] = ['controller', 'user', 'client', 'server', 'landing'];
  const nodesByTier: Record<string, NodePassFlowNodeType[]> = { controller: [], user: [], client: [], server: [], landing: [] };

  nodes.forEach(node => {
    const nodeType = node.data?.type;
    if (nodeType && nodesByTier[nodeType]) {
      nodesByTier[nodeType].push(node);
    } else if (nodeType) {
      if (!nodesByTier['unknown']) nodesByTier['unknown'] = [];
      nodesByTier['unknown'].push(node);
    }
  });
  if (nodesByTier['unknown']) tierOrder.push('unknown');


  const newNodesLayout: NodePassFlowNodeType[] = [];
  let currentY = 50;

  tierOrder.forEach(tierType => {
    const tierNodes = nodesByTier[tierType];
    if (!tierNodes || tierNodes.length === 0) return;

    const tierWidth = (tierNodes.length - 1) * nodeXSpacing;
    let currentX = -tierWidth / 2; 

    tierNodes.forEach(node => {
      newNodesLayout.push({
        ...node,
        position: { x: currentX, y: currentY },
      });
      currentX += nodeXSpacing;
    });
    currentY += tierYSpacing;
  });

  return newNodesLayout;
}
