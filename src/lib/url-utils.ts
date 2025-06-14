
"use client";

import type { MasterLogLevel, MasterTlsMode } from '@/hooks/use-api-key';

export interface ParsedNodePassUrl {
  scheme: 'server' | 'client' | null;
  tunnelAddress: string | null;
  targetAddress: string | null;
  params: URLSearchParams;
  logLevel: MasterLogLevel;
  tlsMode: MasterTlsMode | null;
  certPath: string | null;
  keyPath: string | null;
}

export function parseNodePassUrl(url: string): ParsedNodePassUrl {
  const result: ParsedNodePassUrl = {
    scheme: null,
    tunnelAddress: null,
    targetAddress: null,
    params: new URLSearchParams(),
    logLevel: 'master',
    tlsMode: null,
    certPath: null,
    keyPath: null,
  };

  if (!url) return result;

  try {
    const schemeMatch = url.match(/^([a-zA-Z]+):\/\//);
    if (schemeMatch && (schemeMatch[1] === 'server' || schemeMatch[1] === 'client')) {
      result.scheme = schemeMatch[1] as 'server' | 'client';
    } else {
      if (url.includes("?tls=") || url.includes("&tls=")) {
        result.scheme = "server";
      } else {
        result.scheme = "client";
      }
    }

    const restOfUrl = schemeMatch ? url.substring(schemeMatch[0].length) : url;
    const parts = restOfUrl.split('?');
    const pathPart = parts[0];
    const queryPart = parts[1];

    if (queryPart) {
      result.params = new URLSearchParams(queryPart);
      const log = result.params.get('log');
      if (log && ['debug', 'info', 'warn', 'error', 'event'].includes(log)) {
        result.logLevel = log as MasterLogLevel;
      }

      if (result.scheme === 'server') {
        const tls = result.params.get('tls');
        if (tls && ['0', '1', '2'].includes(tls)) {
          result.tlsMode = tls as MasterTlsMode;
        } else {
           result.tlsMode = 'master';
        }
        if (result.tlsMode === '2') {
          result.certPath = result.params.get('crt') || '';
          result.keyPath = result.params.get('key') || '';
        }
      }
    }


    const addresses = pathPart.split('/');
    if (addresses.length > 0) {
      result.tunnelAddress = addresses[0] || null;
    }
    if (addresses.length > 1) {
      result.targetAddress = addresses.slice(1).join('/') || null;
    }
  } catch (e) {
    console.error("Error parsing NodePass URL:", url, e);
  }
  return result;
}

export function extractHostname(urlOrHostPort: string | null | undefined): string | null {
  if (!urlOrHostPort) return null;

  // Check for IPv6 literal with port, e.g., [::1]:8080
  // This regex ensures we capture the brackets correctly for IPv6.
  const ipv6WithPortMatch = urlOrHostPort.match(/^(\[[0-9a-fA-F:]+\]):[0-9]+$/);
  if (ipv6WithPortMatch && ipv6WithPortMatch[1]) {
    return ipv6WithPortMatch[1]; // Returns with brackets, e.g., "[::1]"
  }
  
  // Check for IPv4 with port, e.g., 127.0.0.1:80
  const ipv4WithPortMatch = urlOrHostPort.match(/^([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}):[0-9]+$/);
  if(ipv4WithPortMatch && ipv4WithPortMatch[1]) {
    return ipv4WithPortMatch[1];
  }

  // Check for FQDN with port, e.g., example.com:80
  const fqdnWithPortMatch = urlOrHostPort.match(/^([a-zA-Z0-9.-]+):[0-9]+$/);
   if (fqdnWithPortMatch && fqdnWithPortMatch[1] && !extractHostname(fqdnWithPortMatch[1])) { // to avoid matching IPv6 without brackets
     // If it's not an IP literal, and has a port, it's likely FQDN:port
     if(!urlOrHostPort.includes('://') && !ipv6WithPortMatch && !ipv4WithPortMatch && fqdnWithPortMatch[1].includes('.')) {
        return fqdnWithPortMatch[1];
     }
   }


  try {
    // For full URLs or hostnames that might not have a port (e.g. just "example.com")
    const fullUrl = urlOrHostPort.includes('://') ? urlOrHostPort : `http://${urlOrHostPort}`;
    const parsed = new URL(fullUrl);
    // parsed.hostname for "[::1]" is "[::1]". For "0.0.0.0" is "0.0.0.0". For "localhost" is "localhost".
    return parsed.hostname;
  } catch (e) {
    // Last resort for something that's not a URL and not host:port matched above
    // This might be just a hostname, or an unbracketed IPv6 address (which is not ideal for URLs)
    if (!urlOrHostPort.includes(':') && !urlOrHostPort.includes('/')) { // Simple hostname without port or path
        return urlOrHostPort;
    }
    // If it contains ':' but wasn't matched as host:port, it might be an unbracketed IPv6.
    // For safety, return it as is, but consumers should be aware.
    if (urlOrHostPort.includes(':') && !urlOrHostPort.includes('/')) {
        return urlOrHostPort; // e.g. "::1" (will need bracketing later if used in URL with port)
    }
    return null;
  }
}


export function extractPort(addressWithPort: string | null | undefined): string | null {
  if (!addressWithPort) return null;
  try {
    // Use URL parser for robust port extraction if possible
    const fullUrl = addressWithPort.includes('://') ? addressWithPort : `http://${addressWithPort.startsWith('[') ? addressWithPort : `dummy//${addressWithPort}`}`;
    // The `dummy//` prefix helps URL constructor parse host:port correctly, especially for IPv6.
    // If addressWithPort is `[::]:80`, `http://[::]:80` is fine.
    // If addressWithPort is `localhost:80`, `http://localhost:80` is fine.
    // If addressWithPort is just `80` (intended as port only), `http://dummy//80` would have hostname `dummy` and port `80`.
    // This scenario (just port) should be handled by direct regex if it's a common input pattern for this function.

    const url = new URL(fullUrl);
    if (url.port) return url.port;

    // Fallback for cases where URL parser might not get it (e.g. just "host:port" without scheme)
    const lastColonIndex = addressWithPort.lastIndexOf(':');
    if (lastColonIndex !== -1 && lastColonIndex < addressWithPort.length - 1) {
        const portCandidate = addressWithPort.substring(lastColonIndex + 1);
        if (/^\d+$/.test(portCandidate)) {
            const hostPart = addressWithPort.substring(0, lastColonIndex);
            // Ensure it's not part of an IPv6 address itself unless bracketed
            if (!hostPart.includes(':') || (hostPart.startsWith('[') && hostPart.endsWith(']'))) {
                return portCandidate;
            }
            // If hostPart has colons but isn't bracketed IPv6, it might be an unbracketed IPv6.
            // This regex tries to ensure the colon is for a port, not part of IPv6.
            const ipv6BracketPortRegex = /^\[[0-9a-fA-F:]+\]:(\d+)$/;
            const match = addressWithPort.match(ipv6BracketPortRegex);
            if (match && match[1]) return match[1];
        }
    }


  } catch (e) {
    // Fallback for simple "host:port" or ":port" strings
    const parts = addressWithPort.split(':');
    if (parts.length > 1) {
      const lastPart = parts[parts.length - 1];
      if (/^\d+$/.test(lastPart)) {
        // Check if it's not an IPv6 address like "::1"
        if (parts.length === 2 && parts[0] !== "" && !parts[0].includes(':')) return lastPart; // Simple host:port
        if (parts.length > 2 && addressWithPort.startsWith('[')) { // Bracketed IPv6:port
            const closingBracketIndex = addressWithPort.lastIndexOf(']');
            if (closingBracketIndex > 0 && closingBracketIndex < addressWithPort.length -1 && addressWithPort[closingBracketIndex+1] === ':') {
                const portAfterBracket = addressWithPort.substring(closingBracketIndex + 2);
                 if (/^\d+$/.test(portAfterBracket)) return portAfterBracket;
            }
        }
      }
    }
  }
  return null;
}

export function isWildcardHostname(host: string | null | undefined): boolean {
    if (!host) return false; 
    const lowerHost = host.toLowerCase();
    // Check for 0.0.0.0, ::, [::]
    return lowerHost === '0.0.0.0' || lowerHost === '::' || lowerHost === '[::]';
}

export function formatHostForDisplay(host: string | null | undefined): string {
  if (!host) return '[::]'; // Default to [::] for display if host is not provided
  // If it's an IPv6 address (contains ':') and not already bracketed, bracket it.
  if (host.includes(':') && !host.startsWith('[')) {
    return `[${host}]`;
  }
  // Return IPv4, FQDN, or already bracketed IPv6 as is.
  // Also return "0.0.0.0" as is.
  return host;
}

export function formatHostForUrl(host: string | null | undefined): string {
  if (!host) return '[::]'; // Default to [::] for URL construction if host is not provided
  if (host.includes(':') && !host.startsWith('[')) {
    return `[${host}]`;
  }
  return host;
}

