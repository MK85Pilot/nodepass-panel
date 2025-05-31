
import { CogIcon, ServerIcon, SmartphoneIcon, Globe, UserCircle2, Network } from 'lucide-react';
import type { TopologyNodeData, ServerNodeData, ClientNodeData, LandingNodeData, UserNodeData } from './topology-types';
import type { Node, Edge } from 'reactflow';

let nodeIdCounter = 0;
export const getId = (prefix = 'npnode_') => `${prefix}${nodeIdCounter++}_${Date.now()}`;

export const getNodeIcon = (nodeType: TopologyNodeData['type'] | undefined): React.ElementType => {
    switch (nodeType) {
        case 'controller': return CogIcon;
        case 'server': return ServerIcon;
        case 'client': return SmartphoneIcon;
        case 'landing': return Globe;
        case 'user': return UserCircle2;
        default: return Network;
    }
};

export const getNodeIconColorClass = (nodeType: TopologyNodeData['type'] | undefined): string => {
    switch (nodeType) {
        case 'controller': return 'text-yellow-500';
        case 'server': return 'text-primary';
        case 'client': return 'text-accent';
        case 'landing': return 'text-purple-500';
        case 'user': return 'text-green-500';
        default: return 'text-muted-foreground';
    }
};

// Returns the Tailwind class for the node's border based on its type and state.
// This function is now simplified to mostly return the type-specific border.
// The general "selected" ring can be applied by React Flow or a wrapper if needed,
// but the main request is for background change matching this border.
export const getNodeBorderColorClass = (nodeType: TopologyNodeData['type'] | undefined, selected: boolean = false, isChainHighlighted: boolean = false, statusInfo?: string): string => {
    if (statusInfo?.includes('失败')) return 'border-destructive ring-1 ring-destructive/50'; // Keep distinctive status borders
    if (statusInfo?.includes('已提交')) return 'border-green-500 ring-1 ring-green-400/50'; // Keep distinctive status borders
    if (isChainHighlighted && !selected) return 'border-green-500 ring-1 ring-green-400/50'; // Chain highlight if not selected (selected style takes precedence)

    // Base border color by type
    switch (nodeType) {
        case 'controller': return 'border-yellow-500';
        case 'server': return 'border-primary';
        case 'client': return 'border-accent';
        case 'landing': return 'border-purple-500';
        case 'user': return 'border-green-500';
        default: return 'border-border';
    }
};

// Returns the Tailwind class for the node's background when it's selected.
// This color should match its characteristic border color.
export const getSelectedNodeBgClass = (nodeType: TopologyNodeData['type'] | undefined): string => {
    switch (nodeType) {
        case 'controller': return 'bg-yellow-500';
        case 'server': return 'bg-primary';
        case 'client': return 'bg-accent';
        case 'landing': return 'bg-purple-500';
        case 'user': return 'bg-green-500';
        default: return 'bg-muted'; // Fallback selected background
    }
};


export function extractHostname(urlOrHostPort: string): string | null {
  if (!urlOrHostPort) return null;
  try {
    // Ensure a scheme is present for URL constructor, default to http if not.
    const fullUrl = urlOrHostPort.includes('://') ? urlOrHostPort : `http://${urlOrHostPort}`;
    const url = new URL(fullUrl);
    // Remove brackets for IPv6 if present, as hostname property includes them.
    return url.hostname.replace(/^\[|\]$/g, '');
  } catch (e) {
    // Fallback for host:port strings or invalid URLs
    const parts = urlOrHostPort.split(':');
    if (parts.length > 0) {
        let hostCandidate = parts[0];
        // Handle IPv6 literal address format [address]:port
        if (urlOrHostPort.includes('[')) {
            const match = urlOrHostPort.match(/^\[(.*?)\]/);
            if (match && match[1]) {
                hostCandidate = match[1]; // This is the IPv6 address without brackets
            }
        }
        // Basic check if it's likely a hostname (not empty)
        return hostCandidate.length > 0 ? hostCandidate : null;
    }
    return null;
  }
}

export function extractPort(addressWithPort: string): string | null {
  if (!addressWithPort) return null;
  try {
    if (addressWithPort.includes('://')) {
      const url = new URL(addressWithPort);
      return url.port || null; // Returns empty string if standard port for scheme, or null if no port
    }
    // Fallback for host:port or [ipv6]:port strings
    const lastColonIndex = addressWithPort.lastIndexOf(':');
    if (lastColonIndex !== -1 && lastColonIndex < addressWithPort.length - 1) {
      const portCandidate = addressWithPort.substring(lastColonIndex + 1);
      // Ensure it's not part of an IPv6 address if no brackets are used (less common for host:port with IPv6)
      if (/^\d+$/.test(portCandidate)) {
        return portCandidate;
      }
    }
    return null;
  } catch (e) {
    // If URL parsing fails, try simple split for host:port
    const parts = addressWithPort.split(':');
     if (parts.length > 1) {
      const lastPart = parts[parts.length - 1];
      if (/^\d+$/.test(lastPart)) { // Check if the last part is purely numeric
        return lastPart;
      }
    }
    return null;
  }
}


export function buildNodePassUrlFromNode(
  instanceNode: Node<ServerNodeData | ClientNodeData | TopologyNodeData>,
  allNodesInner: Node<TopologyNodeData>[],
  allEdgesInner: Edge[]
): string | null {
  const { data } = instanceNode;
  if (!data || !data.type || data.type === 'landing' || data.type === 'user' || data.type === 'controller') return null;

  const typedData = data as ServerNodeData | ClientNodeData;
  if (!typedData.instanceType || !typedData.tunnelAddress || !typedData.targetAddress) return null;

  let actualTargetAddress = typedData.targetAddress;

  // Check if this instance is connected to a landing node
  const landingEdge = allEdgesInner.find(edge =>
    edge.source === instanceNode.id &&
    allNodesInner.find(n => n.id === edge.target)?.data?.type === 'landing'
  );

  if (landingEdge) {
    const landingNode = allNodesInner.find(n => n.id === landingEdge.target) as Node<LandingNodeData> | undefined;
    if (landingNode?.data.landingIp && landingNode.data.landingPort) {
      let landingHost = landingNode.data.landingIp;
      if (landingHost.includes(':') && !landingHost.startsWith('[')) { // IPv6 check
        landingHost = `[${landingHost}]`;
      }
      actualTargetAddress = `${landingHost}:${landingNode.data.landingPort}`;
    }
  }

  let url = `${typedData.instanceType}://${typedData.tunnelAddress}/${actualTargetAddress}`;
  const queryParams = new URLSearchParams();

  if (typedData.logLevel && typedData.logLevel !== "master") {
    queryParams.append('log', typedData.logLevel);
  }

  if (typedData.instanceType === 'server') {
    const serverData = typedData as ServerNodeData;
    if (serverData.tlsMode && serverData.tlsMode !== "master") {
      queryParams.append('tls', serverData.tlsMode);
      if (serverData.tlsMode === '2') {
        if (serverData.crtPath && serverData.crtPath.trim() !== '') queryParams.append('crt', serverData.crtPath.trim());
        if (serverData.keyPath && serverData.keyPath.trim() !== '') queryParams.append('key', serverData.keyPath.trim());
      }
    }
  }
  const queryString = queryParams.toString();
  return queryString ? `${url}?${queryString}` : url;
}
