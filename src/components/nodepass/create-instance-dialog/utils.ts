
"use client";

import type { CreateInstanceFormValues } from '@/zod-schemas/nodepass';
import type { NamedApiConfig, MasterLogLevel, MasterTlsMode } from '@/hooks/use-api-key';
import { extractHostname, extractPort } from '@/lib/url-utils';

export function formatHostForUrl(host: string | null | undefined): string {
  if (!host) return '127.0.0.1'; // Default to a safe local address if host is undefined
  if (host.includes(':') && !host.startsWith('[')) { // IPv6
    return `[${host}]`;
  }
  return host;
}

export interface BuildUrlParams {
  instanceType: "客户端" | "服务端";
  isSingleEndedForward?: boolean;
  tunnelKey?: string;
  tunnelAddress: string;
  targetAddress: string;
  logLevel: MasterLogLevel;
  tlsMode?: MasterTlsMode | '2' | undefined;
  certPath?: string;
  keyPath?: string;
  minPoolSize?: number;
  maxPoolSize?: number;
}

export function buildUrlFromFormValues(
  params: BuildUrlParams,
  masterConfigForInstance: NamedApiConfig | null
): string {
  const schemeType = params.instanceType === "服务端" ? "server" : "client";
  const tunnelAuthPart = params.tunnelKey && params.tunnelKey.trim() !== "" ? `${params.tunnelKey.trim()}@` : "";
  let url = `${schemeType}://${tunnelAuthPart}${params.tunnelAddress}/${params.targetAddress}`;

  const queryParams = new URLSearchParams();

  let effectiveLogLevel = params.logLevel;
  if (effectiveLogLevel === 'master') {
    effectiveLogLevel = masterConfigForInstance?.masterDefaultLogLevel || 'info'; // Default log level if master is 'master'
  }
  if (effectiveLogLevel && effectiveLogLevel !== "master") { // Always include log level if not 'master'
    queryParams.append('log', effectiveLogLevel);
  } else if (effectiveLogLevel === "master" && (!masterConfigForInstance?.masterDefaultLogLevel || masterConfigForInstance.masterDefaultLogLevel === 'master')) {
    // If form says 'master' AND master config also says 'master' (or is undefined), explicitly set to 'info'
    queryParams.append('log', 'info');
  }


  let effectiveTlsMode = params.tlsMode;

  if (params.instanceType === "服务端") {
    if (effectiveTlsMode === 'master' || !effectiveTlsMode) {
      effectiveTlsMode = (masterConfigForInstance?.masterDefaultTlsMode && masterConfigForInstance.masterDefaultTlsMode !== 'master')
                            ? masterConfigForInstance.masterDefaultTlsMode
                            : '1';
    }
    // For server, always append tls mode unless it's '1' (self-signed, which is default behavior if param omitted)
    if (effectiveTlsMode === '0' || effectiveTlsMode === '2') {
      queryParams.append('tls', effectiveTlsMode);
    }
    if (effectiveTlsMode === '2') { // Cert/Key only for TLS mode 2
      if (params.certPath && params.certPath.trim() !== '') queryParams.append('crt', params.certPath.trim());
      if (params.keyPath && params.keyPath.trim() !== '') queryParams.append('key', params.keyPath.trim());
    }

  } else if (params.instanceType === "客户端") {
    if (params.isSingleEndedForward) {
      // No TLS params in URL for single-ended client's local listener
    } else { // Regular (tunnel) client
      if (effectiveTlsMode === 'master' || !effectiveTlsMode) {
          effectiveTlsMode = (masterConfigForInstance?.masterDefaultTlsMode && masterConfigForInstance.masterDefaultTlsMode !== 'master')
                                  ? masterConfigForInstance.masterDefaultTlsMode
                                  : '0'; // Default for client connecting to server: no TLS
      }
      // For client, only append tls if it's '1' or '2' (explicitly enabling TLS towards server)
      if (effectiveTlsMode === '1' || effectiveTlsMode === '2') {
          queryParams.append('tls', effectiveTlsMode);
          if (effectiveTlsMode === '2') {
              if (params.certPath && params.certPath.trim() !== '') queryParams.append('crt', params.certPath.trim());
              if (params.keyPath && params.keyPath.trim() !== '') queryParams.append('key', params.keyPath.trim());
          }
      }
    }
    // Min/Max pool size for clients
    if (params.minPoolSize !== undefined && params.minPoolSize !== null && params.minPoolSize > 0) {
      queryParams.append('min', params.minPoolSize.toString());
    }
    if (params.maxPoolSize !== undefined && params.maxPoolSize !== null && params.maxPoolSize > 0) {
      queryParams.append('max', params.maxPoolSize.toString());
    }
  }

  const queryString = queryParams.toString();
  return queryString ? `${url}?${queryString}` : url;
}


interface PrepareClientUrlParamsResult {
  clientParams: BuildUrlParams;
}

export function prepareClientUrlParams(
  values: CreateInstanceFormValues,
  activeApiConfig: NamedApiConfig | null,
  onLogLocal: (message: string, type: 'INFO' | 'WARN' | 'ERROR') => void
): PrepareClientUrlParamsResult | null {
  if (!activeApiConfig) {
    onLogLocal('当前客户端主控配置无效，无法准备客户端参数。', 'ERROR');
    return null;
  }

  let clientParams: BuildUrlParams;

  const clientLogLevel = values.logLevel as MasterLogLevel;
  const clientTlsParamFromForm = values.tlsMode as MasterTlsMode | '2' | undefined;
  const clientCertPath = values.certPath;
  const clientKeyPath = values.keyPath;

  if (values.isSingleEndedForward) {
    const localListenAddress = values.tunnelAddress; // This is the client's local listening address
    const remoteTargetAddress = values.targetAddress; // This is the remote service the client forwards to

    if (!remoteTargetAddress) {
      onLogLocal("单端转发模式下，目标地址 (业务数据) 是必需的。", "ERROR");
      return null;
    }
    if (!localListenAddress) {
        onLogLocal("单端转发模式下，本地监听地址是必需的。", "ERROR");
        return null;
    }

    clientParams = {
      instanceType: "客户端",
      isSingleEndedForward: true,
      tunnelKey: values.tunnelKey,
      tunnelAddress: localListenAddress,
      targetAddress: remoteTargetAddress,
      logLevel: clientLogLevel,
      tlsMode: '0', // Single-ended client's listener typically does not use TLS itself
      certPath: '', // Not applicable for single-ended listener
      keyPath: '',  // Not applicable for single-ended listener
      minPoolSize: values.minPoolSize,
      maxPoolSize: values.maxPoolSize,
    };
  } else { // Regular (tunnel) client
    const connectToServerTunnel = values.tunnelAddress; // Address of the S node
    const clientLocalTargetPortOrAddress = values.targetAddress; // Client's local listening port/address

    if (!connectToServerTunnel) {
      onLogLocal("连接到现有服务端时，服务端隧道地址是必需的。", "ERROR");
      return null;
    }
    
    // Determine the client's local forwarding target address
    let clientFullLocalForwardTargetAddress: string;
    if (clientLocalTargetPortOrAddress && clientLocalTargetPortOrAddress.trim() !== "") {
        if (/^[0-9]+$/.test(clientLocalTargetPortOrAddress.trim())) { // If just a port
            clientFullLocalForwardTargetAddress = `[::]:${clientLocalTargetPortOrAddress.trim()}`;
        } else { // If full address
            clientFullLocalForwardTargetAddress = clientLocalTargetPortOrAddress.trim();
        }
    } else { // Default if empty
        clientFullLocalForwardTargetAddress = `[::]:${(parseInt(extractPort(connectToServerTunnel) || "0", 10) + 1).toString()}`;
    }


    clientParams = {
      instanceType: "客户端",
      isSingleEndedForward: false,
      tunnelKey: values.tunnelKey,
      tunnelAddress: connectToServerTunnel, // S node's address
      targetAddress: clientFullLocalForwardTargetAddress, // Client's local forward target
      logLevel: clientLogLevel,
      tlsMode: clientTlsParamFromForm, // TLS for connection to S node
      certPath: clientCertPath,
      keyPath: clientKeyPath,
      minPoolSize: values.minPoolSize,
      maxPoolSize: values.maxPoolSize,
    };
  }
  return { clientParams };
}


interface PrepareServerUrlParamsResult {
  serverParams: BuildUrlParams;
}

export function prepareServerUrlParams(
  values: CreateInstanceFormValues,
  onLogLocal: (message: string, type: 'INFO' | 'WARN' | 'ERROR') => void
): PrepareServerUrlParamsResult | null {
  const serverTunnelAddress = values.tunnelAddress; // S node's listening address
  const serverTargetAddress = values.targetAddress; // Where S node forwards traffic to

  if (!serverTargetAddress) {
    onLogLocal("创建服务端时，目标地址 (业务数据) 是必需的。", "ERROR");
    return null;
  }
  if (!serverTunnelAddress) {
    onLogLocal("创建服务端时，隧道监听地址是必需的。", "ERROR");
    return null;
  }

  const serverParams: BuildUrlParams = {
    instanceType: "服务端",
    tunnelKey: values.tunnelKey,
    tunnelAddress: serverTunnelAddress,
    targetAddress: serverTargetAddress,
    logLevel: values.logLevel as MasterLogLevel,
    tlsMode: values.tlsMode as MasterTlsMode | '2',
    certPath: values.certPath,
    keyPath: values.keyPath,
    // min/maxPoolSize are not applicable to servers
  };
  return { serverParams };
}
