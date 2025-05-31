
import type { Node } from 'reactflow';
import type { NodePassFlowNodeType, TopologyNodeData } from './topology-types';
import { TIER_Y_SPACING, NODE_X_SPACING } from './topology-types'; // Import constants

// TODO: Define more sophisticated layout options if needed in the future
export interface LayoutOptions {
  tierSpacing?: number;
  nodeSpacing?: number;
  // Add other options like algorithm type ('tiered', 'force-directed', 'elk', etc.)
}

/**
 * Calculates node positions based on a tiered layout.
 * This is the initial simple layout algorithm. More advanced algorithms
 * for obstacle avoidance and parallel edge routing can be added here or
 * called from a main layout function in this module.
 *
 * @param nodes - The current array of nodes.
 * @param options - Optional layout parameters.
 * @returns A new array of nodes with updated positions.
 */
export function calculateTieredLayout(
  nodes: NodePassFlowNodeType[],
  options?: LayoutOptions
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
      // If an unknown node type somehow gets here, put it in a generic tier to avoid errors
      if (!nodesByTier['unknown']) nodesByTier['unknown'] = [];
      nodesByTier['unknown'].push(node);
    }
  });
  if (nodesByTier['unknown']) tierOrder.push('unknown');


  const newNodesLayout: NodePassFlowNodeType[] = [];
  let currentY = 50; // Initial Y offset for the first tier

  tierOrder.forEach(tierType => {
    const tierNodes = nodesByTier[tierType];
    if (!tierNodes || tierNodes.length === 0) return;

    const tierWidth = (tierNodes.length - 1) * nodeXSpacing;
    let currentX = -tierWidth / 2; // Center the tier horizontally

    tierNodes.forEach(node => {
      // Preserve other node properties like data, type, etc.
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

// Future placeholder for a more advanced layout function
/*
export function calculateAdvancedLayout(
  nodes: NodePassFlowNodeType[],
  edges: Edge[], // Edges might be needed for advanced routing
  options: LayoutOptions
): { nodes: NodePassFlowNodeType[], edges: Edge[] } { // Might also return modified edges
  // 1. Call a node positioning algorithm (e.g., from ELK.js, Dagre, or custom)
  //    This would ideally handle initial placement to minimize overlaps.

  // 2. Implement or call an edge routing algorithm
  //    - Obstacle avoidance for nodes
  //    - Parallel edge bundling/routing

  // For now, it could just fall back to tiered layout or be a NOOP
  console.warn("Advanced layout function called, but not fully implemented. Using tiered layout.");
  const positionedNodes = calculateTieredLayout(nodes, options);
  return { nodes: positionedNodes, edges }; // Return original edges for now
}
*/

// Add more layout algorithms or integrations with libraries like ELK.js or Dagre here.
// For example:
// import ELK from 'elkjs/lib/elk.bundled.js';
// const elk = new ELK();
// async function calculateElkLayout(nodes, edges, options) { ... }
