
// src/app/topology/lib/topology-utils.ts
import type { MasterLogLevel, MasterTlsMode } from '@/hooks/use-api-key';

export interface ParsedNodePassUrlForTopology {
  scheme: 'server' | 'client' | null;
  tunnelKey?: string; // Added tunnelKey
  tunnelAddress: string | null; // host:port
  targetAddress: string | null; // host:port or just port for client local
  params: URLSearchParams;
  logLevel: MasterLogLevel;
  tlsMode: MasterTlsMode | null;
  certPath: string | null;
  keyPath: string | null;
  minPoolSize?: number; // Added minPoolSize
  maxPoolSize?: number; // Added maxPoolSize
}

/**
 * Parses a NodePass URL string into its components, specifically for topology needs.
 * This is a simplified version and might need adjustments based on exact URL structures used in topology.
 */
export function parseNodePassUrlForTopology(url: string): ParsedNodePassUrlForTopology {
  const result: ParsedNodePassUrlForTopology = {
    scheme: null,
    tunnelAddress: null,
    targetAddress: null,
    params: new URLSearchParams(),
    logLevel: 'master', // Default
    tlsMode: null,    // Default
    certPath: null,
    keyPath: null,
  };

  if (!url) return result;

  try {
    const schemeMatch = url.match(/^([a-zA-Z]+):\/\//);
    if (schemeMatch && (schemeMatch[1] === 'server' || schemeMatch[1] === 'client')) {
      result.scheme = schemeMatch[1] as 'server' | 'client';
    } else {
      // Basic inference if scheme is missing (can be ambiguous)
      result.scheme = url.includes("?tls=") || url.includes("&tls=") ? "server" : "client";
    }

    let restOfUrl = schemeMatch ? url.substring(schemeMatch[0].length) : url;

    // Extract tunnelKey (username part)
    const atSignIndex = restOfUrl.indexOf('@');
    if (atSignIndex !== -1) {
      result.tunnelKey = restOfUrl.substring(0, atSignIndex);
      restOfUrl = restOfUrl.substring(atSignIndex + 1);
    }

    const parts = restOfUrl.split('?');
    const pathPart = parts[0];
    const queryPart = parts[1];

    // Parse addresses from pathPart
    // Example: host:port/targethost:targetport OR host:port/targetport (for client local forward)
    const addresses = pathPart.split('/');
    if (addresses.length > 0) {
      result.tunnelAddress = addresses[0].trim() || null; // This is the primary host:port
    }
    if (addresses.length > 1) {
      result.targetAddress = addresses.slice(1).join('/').trim() || null; // This can be host:port or just port
    }

    // Parse query parameters
    if (queryPart) {
      result.params = new URLSearchParams(queryPart);
      const log = result.params.get('log');
      if (log && ['debug', 'info', 'warn', 'error', 'event', 'master'].includes(log)) {
        result.logLevel = log as MasterLogLevel;
      }

      const tls = result.params.get('tls');
      if (tls && ['0', '1', '2', 'master'].includes(tls)) {
        result.tlsMode = tls as MasterTlsMode;
      }
      if (result.tlsMode === '2') {
        result.certPath = result.params.get('crt') || null;
        result.keyPath = result.params.get('key') || null;
      }

      if (result.scheme === 'client') {
        const min = result.params.get('min');
        if (min && /^\d+$/.test(min)) {
          result.minPoolSize = parseInt(min, 10);
        }
        const max = result.params.get('max');
        if (max && /^\d+$/.test(max)) {
          result.maxPoolSize = parseInt(max, 10);
        }
      }
    }
  } catch (e) {
    console.error("Error parsing NodePass URL for topology:", url, e);
    // Return defaults or partially parsed data
  }
  return result;
}
