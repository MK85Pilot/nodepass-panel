
"use client";

import type { CreateInstanceFormValues } from '@/zod-schemas/nodepass';
import type { NamedApiConfig, MasterLogLevel, MasterTlsMode } from '@/hooks/use-api-key';
import { extractHostname, extractPort } from '@/lib/url-utils';

export function formatHostForUrl(host: string | null | undefined): string {
  if (!host) return '127.0.0.1';
  if (host.includes(':') && !host.startsWith('[')) {
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
  const tunnelAuthPart = params.tunnelKey ? `${params.tunnelKey}@` : "";
  let url = `${schemeType}://${tunnelAuthPart}${params.tunnelAddress}/${params.targetAddress}`;

  const queryParams = new URLSearchParams();

  let effectiveLogLevel = params.logLevel;
  if (effectiveLogLevel === 'master') {
    effectiveLogLevel = masterConfigForInstance?.masterDefaultLogLevel || 'master';
  }
  if (effectiveLogLevel && effectiveLogLevel !== "master") {
    queryParams.append('log', effectiveLogLevel);
  }

  let effectiveTlsMode = params.tlsMode;

  if (params.instanceType === "服务端") {
    if (effectiveTlsMode === 'master' || !effectiveTlsMode) {
      effectiveTlsMode = (masterConfigForInstance?.masterDefaultTlsMode && masterConfigForInstance.masterDefaultTlsMode !== 'master')
                            ? masterConfigForInstance.masterDefaultTlsMode
                            : '1'; // Default for server TLS is '1' (self-signed) if not master and master is 'master'
    }
    if (effectiveTlsMode === '0' || effectiveTlsMode === '2') {
      queryParams.append('tls', effectiveTlsMode);
      if (effectiveTlsMode === '2') {
        if (params.certPath && params.certPath.trim() !== '') queryParams.append('crt', params.certPath.trim());
        if (params.keyPath && params.keyPath.trim() !== '') queryParams.append('key', params.keyPath.trim());
      }
    }
  } else if (params.instanceType === "客户端") {
    if (params.isSingleEndedForward) {
      // No TLS params in URL for single-ended client
    } else {
      // For regular client, default TLS mode is '0' (no TLS to server) if not master and master is 'master'
      if (effectiveTlsMode === 'master' || !effectiveTlsMode) {
          effectiveTlsMode = (masterConfigForInstance?.masterDefaultTlsMode && masterConfigForInstance.masterDefaultTlsMode !== 'master')
                                  ? masterConfigForInstance.masterDefaultTlsMode
                                  : '0';
      }
      // Only append tls if it's 1 or 2 (explicitly enabling TLS towards server)
      if (effectiveTlsMode === '1' || effectiveTlsMode === '2') {
          queryParams.append('tls', effectiveTlsMode);
          if (effectiveTlsMode === '2') {
              if (params.certPath && params.certPath.trim() !== '') queryParams.append('crt', params.certPath.trim());
              if (params.keyPath && params.keyPath.trim() !== '') queryParams.append('key', params.keyPath.trim());
          }
      }
    }
    if (params.minPoolSize !== undefined) {
      queryParams.append('min', params.minPoolSize.toString());
    }
    if (params.maxPoolSize !== undefined) {
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
    const localListenAddress = values.tunnelAddress;
    const remoteTargetAddress = values.targetAddress;

    if (!remoteTargetAddress) {
      onLogLocal("单端转发模式下，目标地址 (业务数据) 是必需的。", "ERROR");
      return null;
    }

    clientParams = {
      instanceType: "客户端",
      isSingleEndedForward: true,
      tunnelKey: values.tunnelKey,
      tunnelAddress: localListenAddress,
      targetAddress: remoteTargetAddress,
      logLevel: clientLogLevel,
      tlsMode: '0',
      certPath: '',
      keyPath: '',
      minPoolSize: values.minPoolSize,
      maxPoolSize: values.maxPoolSize,
    };
  } else {
    const connectToServerTunnel = values.tunnelAddress;
    const clientLocalTargetPort = values.targetAddress;

    if (!connectToServerTunnel) {
      onLogLocal("连接到现有服务端时，服务端隧道地址是必需的。", "ERROR");
      return null;
    }

    let clientFullLocalForwardTargetAddress = `[::]:${(parseInt(extractPort(connectToServerTunnel) || "0", 10) + 1).toString()}`;
    if (clientLocalTargetPort && clientLocalTargetPort.trim() !== "" && /^[0-9]+$/.test(clientLocalTargetPort.trim())) {
      clientFullLocalForwardTargetAddress = `[::]:${clientLocalTargetPort.trim()}`;
    }

    clientParams = {
      instanceType: "客户端",
      isSingleEndedForward: false,
      tunnelKey: values.tunnelKey,
      tunnelAddress: connectToServerTunnel,
      targetAddress: clientFullLocalForwardTargetAddress,
      logLevel: clientLogLevel,
      tlsMode: clientTlsParamFromForm,
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
  const serverTunnelAddress = values.tunnelAddress;
  const serverTargetAddress = values.targetAddress;

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
