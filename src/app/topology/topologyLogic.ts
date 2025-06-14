
'use client';

import type { CustomNodeData, Node } from './topologyTypes';
import type { NamedApiConfig } from '@/hooks/use-api-key';
import { extractHostname, extractPort, isWildcardHostname, formatHostForUrl } from '@/lib/url-utils';

// Helper function to determine the effective master config for a server node
export function getEffectiveServerMasterConfig(
  serverNodeData: CustomNodeData,
  getNodeById: (id: string) => Node | undefined,
  getApiConfigById: (id: string) => NamedApiConfig | null
): NamedApiConfig | null {
  if (serverNodeData.representedMasterId) {
    // This case might be more relevant for basic topology or S nodes representing external masters.
    // In advanced topology, S nodes are typically direct children of an M container.
    return getApiConfigById(serverNodeData.representedMasterId);
  }
  if (serverNodeData.parentNode) {
    const parentMNode = getNodeById(serverNodeData.parentNode);
    if (parentMNode && parentMNode.data.masterId) {
      return getApiConfigById(parentMNode.data.masterId);
    }
  }
  // Fallback if S node isn't properly parented or configured
  // This should ideally not happen in a well-formed advanced topology.
  console.warn(`AdvancedTopology: Could not determine effective master config for server node ${serverNodeData.label}. Node parent or masterId might be missing.`);
  return null;
}

// Helper function to calculate the client's tunnel address when connecting to a server
export function calculateClientTunnelAddressForServer(
  serverNodeData: CustomNodeData, // S node's data
  effectiveServerMasterConfig: NamedApiConfig | null // S node's master's config
): string {
  let masterApiHost: string | null = null;
  if (effectiveServerMasterConfig?.apiUrl) {
    masterApiHost = extractHostname(effectiveServerMasterConfig.apiUrl);
  } else {
    console.warn(`AdvancedTopology: Master config for server ${serverNodeData.label} is missing or has no API URL. Cannot determine master host for client tunnel.`);
    // No early return yet, will try to use server's own listen host if specific.
  }

  const serverListenHostOriginal = extractHostname(serverNodeData.tunnelAddress || ""); // Host from S node's listen address (e.g., "[::]")
  const serverListenPort = extractPort(serverNodeData.tunnelAddress || "");   // PORT from S node's listen address (e.g., "12345")

  if (!serverListenPort) {
    console.warn(`AdvancedTopology: Cannot determine listen port for server ${serverNodeData.label} from its tunnelAddress: '${serverNodeData.tunnelAddress}'. Client tunnel address cannot be formed.`);
    return ""; // Cannot form address without a port
  }

  let clientEffectiveTunnelHost: string | null = null;

  // For inter-master connections, prioritize the S-node's Master's API host.
  if (masterApiHost && masterApiHost.trim() !== "") {
    clientEffectiveTunnelHost = masterApiHost;
  } else if (serverListenHostOriginal && !isWildcardHostname(serverListenHostOriginal) && serverListenHostOriginal.trim() !== "") {
    // Fallback to S's specific listen host ONLY if Master's API host is unavailable.
    // This is less ideal for inter-M but might work in some same-network scenarios or if S is on a public IP.
    clientEffectiveTunnelHost = serverListenHostOriginal;
    console.warn(`AdvancedTopology: Master API host for server ${serverNodeData.label} is unavailable. Falling back to server's specific listen host '${serverListenHostOriginal}' for client tunnel. This may not be reachable externally.`);
  } else {
    // If masterApiHost is not available AND serverListenHostOriginal is wildcard or also unavailable
    console.warn(`AdvancedTopology: Cannot determine a valid host for client to connect to server ${serverNodeData.label}. Master API host is unavailable, and server's own listen host ('${serverListenHostOriginal}') is wildcard or also unavailable.`);
    return ""; // Cannot determine host
  }

  if (clientEffectiveTunnelHost && clientEffectiveTunnelHost.trim() !== "") {
    return `${formatHostForUrl(clientEffectiveTunnelHost)}:${serverListenPort}`;
  }
  
  console.warn(`AdvancedTopology: Failed to determine a valid clientEffectiveTunnelHost for server ${serverNodeData.label}, though a port was found. This indicates an issue with resolving the S-node's master host.`);
  return ""; 
}

