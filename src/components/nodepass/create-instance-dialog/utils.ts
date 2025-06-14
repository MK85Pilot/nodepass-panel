
"use client";

import type { CreateInstanceFormValues } from '@/zod-schemas/nodepass';
import type { NamedApiConfig, MasterLogLevel, MasterTlsMode } from '@/hooks/use-api-key';
import { extractHostname, extractPort, isWildcardHostname } from '@/lib/url-utils';

export function formatHostForUrl(host: string | null | undefined): string {
  if (!host) return '127.0.0.1'; 
  if (host.includes(':') && !host.startsWith('[')) { // IPv6 check
    return `[${host}]`; // Bracket IPv6 addresses for URLs
  }
  return host;
}

export interface BuildUrlParams {
  instanceType: "入口(c)" | "出口(s)";
  isSingleEndedForward?: boolean; // Relevant for client
  tunnelAddress: string; // For Server: listen. For Client: server's listen (remote). For Single-Ended Client: local listen port.
  targetAddress: string; // For Server: forward. For Client: local forward. For Single-Ended Client: remote target.
  logLevel: MasterLogLevel;
  tlsMode?: MasterTlsMode | '2'; // For Server. For Single-Ended Client (connects to target). For Client (connects to server).
  certPath?: string;
  keyPath?: string;
}

export function buildUrlFromFormValues(
  params: BuildUrlParams, 
  masterConfigForInstance: NamedApiConfig | null // The master where this specific instance (client or server) will be created
): string { 
  const schemeType = params.instanceType === "出口(s)" ? "server" : "client";
  
  let url = `${schemeType}://${params.tunnelAddress}/${params.targetAddress}`;
  
  const queryParams = new URLSearchParams();

  // Apply Log Level
  let effectiveLogLevel = params.logLevel;
  if (effectiveLogLevel === 'master') {
    effectiveLogLevel = masterConfigForInstance?.masterDefaultLogLevel || 'master'; // Use master's default if it's set and not 'master'
  }
  if (effectiveLogLevel && effectiveLogLevel !== "master") { // Only append if not 'master' (which means inherit from NodePass global default)
    queryParams.append('log', effectiveLogLevel);
  }
  
  // Determine if server-like TLS params should be applied
  // Server always applies server-like TLS.
  // Client in single-ended mode applies server-like TLS (for its connection to the remote target).
  // Client in normal mode applies client-like TLS (for its connection to the NodePass server).
  let applyServerLikeTlsParams = schemeType === 'server' || (schemeType === 'client' && !!params.isSingleEndedForward);

  if (applyServerLikeTlsParams) {
    let effectiveTlsMode = params.tlsMode;

    // Resolve 'master' TLS mode to actual value from master config or default to '1' for server, '0' for client (single-ended acts like server here)
    if (effectiveTlsMode === 'master' || !effectiveTlsMode) {
      if (masterConfigForInstance?.masterDefaultTlsMode && masterConfigForInstance.masterDefaultTlsMode !== 'master') {
        effectiveTlsMode = masterConfigForInstance.masterDefaultTlsMode;
      } else {
        effectiveTlsMode = '1'; // Default for server-like TLS if master doesn't specify
      }
    }
    
    // Append TLS param if not 'master' (which means inherit from NodePass global default, or effectively '1' if server)
    // NodePass server defaults to TLS 1 if no tls param. So we only need to append if it's 0 or 2.
    if (effectiveTlsMode === '0' || effectiveTlsMode === '2') { 
      queryParams.append('tls', effectiveTlsMode);
      if (effectiveTlsMode === '2') {
        if (params.certPath && params.certPath.trim() !== '') queryParams.append('crt', params.certPath.trim());
        if (params.keyPath && params.keyPath.trim() !== '') queryParams.append('key', params.keyPath.trim());
      }
    }
  } else if (schemeType === 'client' && !params.isSingleEndedForward) { 
    // Normal client connecting to a NodePass server
    let effectiveClientTlsMode = params.tlsMode;
    if (effectiveClientTlsMode === 'master' || !effectiveClientTlsMode) {
        effectiveClientTlsMode = (masterConfigForInstance?.masterDefaultTlsMode && masterConfigForInstance.masterDefaultTlsMode !== 'master')
                                    ? masterConfigForInstance.masterDefaultTlsMode
                                    : '0'; // Client defaults to '0' (no TLS) if master does not specify
    }
    // Append TLS param if not 'master' (which means inherit from NodePass global default, or effectively '0' if client)
    // NodePass client defaults to TLS 0 if no tls param. So we only need to append if it's 1 or 2.
    if (effectiveClientTlsMode === '1' || effectiveClientTlsMode === '2') {
        queryParams.append('tls', effectiveClientTlsMode);
        if (effectiveClientTlsMode === '2') { // Client mTLS
            if (params.certPath && params.certPath.trim() !== '') queryParams.append('crt', params.certPath.trim());
            if (params.keyPath && params.keyPath.trim() !== '') queryParams.append('key', params.keyPath.trim());
        }
    }
  }

  const queryString = queryParams.toString();
  return queryString ? `${url}?${queryString}` : url;
}


interface PrepareClientUrlParamsResult {
  clientParams: BuildUrlParams;
  serverParamsForAutoCreate?: BuildUrlParams;
  serverMasterForAutoCreate?: NamedApiConfig | null;
}

export function prepareClientUrlParams(
  values: CreateInstanceFormValues,
  activeApiConfig: NamedApiConfig | null, // Master for the client instance itself
  getApiConfigById: (id: string) => NamedApiConfig | null,
  onLogLocal: (message: string, type: 'INFO' | 'WARN' | 'ERROR') => void
): PrepareClientUrlParamsResult | null {
  if (!activeApiConfig) {
    onLogLocal('当前客户端主控配置无效，无法准备客户端参数。', 'ERROR');
    return null;
  }

  let clientParams: BuildUrlParams;
  let serverParamsForAutoCreate: BuildUrlParams | undefined = undefined;
  let serverMasterForAutoCreate: NamedApiConfig | null = undefined;

  const clientLogLevel = values.logLevel;
  // For client, TLS mode from form is for its connection behavior (to server, or to target in single-ended)
  const clientTlsParamFromForm = values.tlsMode as MasterTlsMode | '2'; 
  const clientCertPath = values.certPath;
  const clientKeyPath = values.keyPath;

  if (values.isSingleEndedForward) {
    // 入口(c) - 单端转发模式
    const localListenPort = values.tunnelAddress; // This is just the port number, e.g., "8080"
    const remoteTargetAddress = values.targetAddress; // This is the full remote host:port, e.g., "remote.service.com:3000"

    if (!remoteTargetAddress) {
      onLogLocal("单端转发模式下，目标地址 (业务数据) 是必需的。", "ERROR");
      return null;
    }
    if (!localListenPort || !/^[0-9]+$/.test(localListenPort)) {
      onLogLocal("单端转发模式下，本地监听端口无效。", "ERROR");
      return null;
    }

    clientParams = {
      instanceType: "入口(c)",
      isSingleEndedForward: true,
      tunnelAddress: `[::]:${localListenPort}`, // Client listens locally on all interfaces on this port
      targetAddress: remoteTargetAddress,       // Client forwards to this remote target
      logLevel: clientLogLevel,
      tlsMode: clientTlsParamFromForm, // TLS for client's connection TO THE REMOTE TARGET
      certPath: clientCertPath,
      keyPath: clientKeyPath,
    };
  } else if (values.autoCreateServer) {
    // 入口(c) - 自动创建出口(s)
    const serverListenPortForAutoCreate = values.tunnelAddress; // Port for the auto-created server, e.g., "10101"
    const serverTargetForAutoCreate = values.serverTargetAddressForAutoCreate; // Target for the auto-created server, e.g., "10.0.0.5:3000"

    if (!serverListenPortForAutoCreate || !/^[0-9]+$/.test(serverListenPortForAutoCreate)) {
      onLogLocal("自动创建出口(s)时，出口(s)监听端口格式无效。", "ERROR");
      return null;
    }
    if (!serverTargetForAutoCreate) {
      onLogLocal("自动创建出口(s)时，出口(s)目标地址 (业务数据) 是必需的。", "ERROR");
      return null;
    }

    const serverMasterId = values.serverApiId || activeApiConfig.id; // Default to active master if none selected
    serverMasterForAutoCreate = getApiConfigById(serverMasterId);

    if (!serverMasterForAutoCreate) {
      onLogLocal(`选择的出口(s)主控 (ID: ${serverMasterId}) 未找到。`, "ERROR");
      return null;
    }
    
    const serverApiHost = extractHostname(serverMasterForAutoCreate.apiUrl);
    if (!serverApiHost) {
        onLogLocal(`无法从出口(s)主控 "${serverMasterForAutoCreate.name}" API URL提取主机名。`, "ERROR");
        return null;
    }

    // Client's tunnelAddress: connects to the auto-created server (server's master API host + server's listen port)
    const clientConnectToFullTunnelAddr = `${formatHostForUrl(serverApiHost)}:${serverListenPortForAutoCreate}`;
    // Client's targetAddress: local listen port, auto-derived (server's listen port + 1)
    const clientActualLocalForwardPort = (parseInt(serverListenPortForAutoCreate, 10) + 1).toString();
    const clientFullLocalForwardTargetAddress = values.targetAddress && values.targetAddress.trim() !== "" && /^[0-9]+$/.test(values.targetAddress.trim())
      ? `[::]:${values.targetAddress.trim()}` // Use user-specified local port if valid
      : `[::]:${clientActualLocalForwardPort}`; // Default

    clientParams = {
      instanceType: "入口(c)",
      isSingleEndedForward: false,
      tunnelAddress: clientConnectToFullTunnelAddr,
      targetAddress: clientFullLocalForwardTargetAddress,
      logLevel: clientLogLevel,
      tlsMode: clientTlsParamFromForm, // TLS for client's connection TO THE AUTO-CREATED SERVER
      certPath: clientCertPath,
      keyPath: clientKeyPath,
    };

    // Server (auto-created) parameters
    serverParamsForAutoCreate = {
      instanceType: "出口(s)",
      // isSingleEndedForward not applicable for server
      tunnelAddress: `[::]:${serverListenPortForAutoCreate}`, // Server listens on all its interfaces on this port
      targetAddress: serverTargetForAutoCreate,                 // Server forwards to this target
      logLevel: clientLogLevel, // Server inherits client's log level choice
      tlsMode: clientTlsParamFromForm,   // Server inherits client's TLS mode choice for its data channel
      certPath: clientCertPath,          // and certs if applicable
      keyPath: clientKeyPath,
    };

  } else {
    // 入口(c) - 连接到已存在的出口(s)
    const connectToServerTunnel = values.tunnelAddress; // Full host:port of existing server, e.g., "your.server.com:10101"
    const clientLocalTargetPort = values.targetAddress; // Optional local port, e.g., "8000"

    if (!connectToServerTunnel) {
      onLogLocal("连接到现有出口(s)时，出口(s)隧道地址是必需的。", "ERROR");
      return null;
    }
    
    // Client's targetAddress: local listen port, auto-derived if not specified or invalid
    let clientFullLocalForwardTargetAddress = `[::]:${(parseInt(extractPort(connectToServerTunnel) || "0", 10) + 1).toString()}`; // Default
    if (clientLocalTargetPort && clientLocalTargetPort.trim() !== "" && /^[0-9]+$/.test(clientLocalTargetPort.trim())) {
      clientFullLocalForwardTargetAddress = `[::]:${clientLocalTargetPort.trim()}`;
    }


    clientParams = {
      instanceType: "入口(c)",
      isSingleEndedForward: false,
      tunnelAddress: connectToServerTunnel,
      targetAddress: clientFullLocalForwardTargetAddress,
      logLevel: clientLogLevel,
      tlsMode: clientTlsParamFromForm, // TLS for client's connection TO THE EXISTING SERVER
      certPath: clientCertPath,
      keyPath: clientKeyPath,
    };
  }
  return { clientParams, serverParamsForAutoCreate, serverMasterForAutoCreate };
}


interface PrepareServerUrlParamsResult {
  serverParams: BuildUrlParams;
}

export function prepareServerUrlParams(
  values: CreateInstanceFormValues,
  onLogLocal: (message: string, type: 'INFO' | 'WARN' | 'ERROR') => void
): PrepareServerUrlParamsResult | null {
  const serverTunnelAddress = values.tunnelAddress; // e.g., "0.0.0.0:10101"
  const serverTargetAddress = values.targetAddress; // e.g., "10.0.0.5:3000"

  if (!serverTargetAddress) {
    onLogLocal("创建出口(s)时，目标地址 (业务数据) 是必需的。", "ERROR");
    return null;
  }
  if (!serverTunnelAddress) {
    onLogLocal("创建出口(s)时，隧道监听地址是必需的。", "ERROR");
    return null;
  }


  const serverParams: BuildUrlParams = {
    instanceType: "出口(s)",
    // isSingleEndedForward not applicable for server
    tunnelAddress: serverTunnelAddress,
    targetAddress: serverTargetAddress,
    logLevel: values.logLevel,
    tlsMode: values.tlsMode as MasterTlsMode | '2', // TLS for server's data channel
    certPath: values.certPath,
    keyPath: values.keyPath,
  };
  return { serverParams };
}

    
