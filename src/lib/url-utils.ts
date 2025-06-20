
"use client";

import type { MasterLogLevel, MasterTlsMode } from '@/hooks/use-api-key';

export interface ParsedNodePassUrl {
  scheme: 'server' | 'client' | null;
  tunnelKey?: string;
  tunnelAddress: string | null;
  targetAddress: string | null;
  params: URLSearchParams;
  logLevel: MasterLogLevel;
  tlsMode: MasterTlsMode | null;
  certPath: string | null;
  keyPath: string | null;
  minPoolSize?: number;
  maxPoolSize?: number;
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
      // Infer scheme based on typical parameters if not explicit
      if (url.includes("?tls=") || url.includes("&tls=")) { // TLS usually means server
        result.scheme = "server";
      } else { // Default to client if no other indicators
        result.scheme = "client";
      }
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

    if (queryPart) {
      result.params = new URLSearchParams(queryPart);
      const log = result.params.get('log');
      if (log && ['debug', 'info', 'warn', 'error', 'event', 'master'].includes(log)) {
        result.logLevel = log as MasterLogLevel;
      }

      if (result.scheme === 'server' || (result.scheme === 'client' /* && !isSingleEndedForward; check this condition if needed */)) {
        const tls = result.params.get('tls');
        if (tls && ['0', '1', '2', 'master'].includes(tls)) {
          result.tlsMode = tls as MasterTlsMode;
        } else {
           result.tlsMode = 'master'; // Default if not specified or invalid
        }
        if (result.tlsMode === '2') {
          result.certPath = result.params.get('crt') || '';
          result.keyPath = result.params.get('key') || '';
        }
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

  // Remove tunnel key (username@) if present
  let addressPart = urlOrHostPort;
  const atSignIndex = addressPart.indexOf('@');
  if (atSignIndex !== -1) {
    addressPart = addressPart.substring(atSignIndex + 1);
  }


  const ipv6WithPortMatch = addressPart.match(/^(\[[0-9a-fA-F:]+\]):[0-9]+$/);
  if (ipv6WithPortMatch && ipv6WithPortMatch[1]) {
    return ipv6WithPortMatch[1];
  }

  const ipv4WithPortMatch = addressPart.match(/^([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}):[0-9]+$/);
  if(ipv4WithPortMatch && ipv4WithPortMatch[1]) {
    return ipv4WithPortMatch[1];
  }

  const fqdnWithPortMatch = addressPart.match(/^([a-zA-Z0-9.-]+):[0-9]+$/);
   if (fqdnWithPortMatch && fqdnWithPortMatch[1] && !extractHostname(fqdnWithPortMatch[1])) {
     if(!addressPart.includes('://') && !ipv6WithPortMatch && !ipv4WithPortMatch && fqdnWithPortMatch[1].includes('.')) {
        return fqdnWithPortMatch[1];
     }
   }

  try {
    const fullUrl = addressPart.includes('://') ? addressPart : `http://${addressPart}`;
    const parsed = new URL(fullUrl);
    return parsed.hostname;
  } catch (e) {
    if (!addressPart.includes(':') && !addressPart.includes('/')) {
        return addressPart;
    }
    if (addressPart.includes(':') && !addressPart.includes('/')) {
        return addressPart;
    }
    return null;
  }
}


export function extractPort(addressWithPort: string | null | undefined): string | null {
  if (!addressWithPort) return null;

  // Remove tunnel key (username@) if present for port extraction
  let addressPart = addressWithPort;
  const atSignIndex = addressPart.indexOf('@');
  if (atSignIndex !== -1) {
    addressPart = addressPart.substring(atSignIndex + 1);
  }

  try {
    const fullUrl = addressPart.includes('://') ? addressPart : `http://${addressPart.startsWith('[') ? addressPart : `dummy//${addressPart}`}`;
    const url = new URL(fullUrl);
    if (url.port) return url.port;

    const lastColonIndex = addressPart.lastIndexOf(':');
    if (lastColonIndex !== -1 && lastColonIndex < addressPart.length - 1) {
        const portCandidate = addressPart.substring(lastColonIndex + 1);
        if (/^\d+$/.test(portCandidate)) {
            const hostPart = addressPart.substring(0, lastColonIndex);
            if (!hostPart.includes(':') || (hostPart.startsWith('[') && hostPart.endsWith(']'))) {
                return portCandidate;
            }
            const ipv6BracketPortRegex = /^\[[0-9a-fA-F:]+\]:(\d+)$/;
            const match = addressPart.match(ipv6BracketPortRegex);
            if (match && match[1]) return match[1];
        }
    }
  } catch (e) {
    const parts = addressPart.split(':');
    if (parts.length > 1) {
      const lastPart = parts[parts.length - 1];
      if (/^\d+$/.test(lastPart)) {
        if (parts.length === 2 && parts[0] !== "" && !parts[0].includes(':')) return lastPart;
        if (parts.length > 2 && addressPart.startsWith('[')) {
            const closingBracketIndex = addressPart.lastIndexOf(']');
            if (closingBracketIndex > 0 && closingBracketIndex < addressPart.length -1 && addressPart[closingBracketIndex+1] === ':') {
                const portAfterBracket = addressPart.substring(closingBracketIndex + 2);
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
    return lowerHost === '0.0.0.0' || lowerHost === '::' || lowerHost === '[::]';
}

export function formatHostForDisplay(host: string | null | undefined): string {
  if (!host) return '[::]';
  if (host.includes(':') && !host.startsWith('[')) {
    return `[${host}]`;
  }
  return host;
}

export function formatHostForUrl(host: string | null | undefined): string {
  if (!host) return '[::]';
  if (host.includes(':') && !host.startsWith('[')) {
    return `[${host}]`;
  }
  return host;
}
