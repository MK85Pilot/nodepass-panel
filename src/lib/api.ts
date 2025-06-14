
import type { Instance as NodelessInstance, CreateInstanceRequest, UpdateInstanceRequest } from '@/types/nodepass'; // ModifyInstanceConfigRequest removed

// Re-export Instance to avoid direct dependency on types/nodepass elsewhere if not needed.
export type Instance = NodelessInstance;


async function request<T>(
  fullRequestUrl: string,
  options: RequestInit = {},
  token: string | null
): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.append('Content-Type', 'application/json');
  if (token) {
    headers.append('X-API-Key', token);
  }

  let response;
  try {
    response = await fetch(fullRequestUrl, {
      ...options,
      headers,
    });
  } catch (networkError: any) {
    // Handle network errors (like "Failed to fetch")
    console.error(`Network error while requesting ${fullRequestUrl}:`, networkError);
    let errorMessage = `网络请求失败: ${networkError.message}. 请检查网络连接和目标服务器 (${fullRequestUrl}) 的 CORS 配置。`;
    // Provide a more specific hint if it's a typical "Failed to fetch" error often caused by CORS
    if (networkError.message?.toLowerCase().includes('failed to fetch')) {
        errorMessage += ' 这通常是由于目标服务器的CORS策略阻止了请求 (缺少 Access-Control-Allow-Origin 头部), 或网络连接问题。';
    }
    const error = new Error(errorMessage);
    (error as any).cause = networkError; // Preserve the original error if needed
    throw error;
  }

  if (!response.ok) {
    let errorBody;
    try {
      errorBody = await response.json();
    } catch (e) {
      // If response is not JSON, use statusText
      errorBody = { message: response.statusText };
    }
    const error = new Error(`API 错误: ${response.status} ${errorBody?.message || response.statusText}`);
    (error as any).status = response.status; // Attach status for further handling if needed
    (error as any).body = errorBody; // Attach body for further handling
    throw error;
  }

  if (response.status === 204) { // No Content
    return null as T; // Or handle as appropriate for void responses
  }

  return response.json();
}

const checkApiRootUrl = (apiRootUrl: string | null | undefined, operation: string): void => {
  if (!apiRootUrl || typeof apiRootUrl !== 'string' || apiRootUrl.trim() === '') {
    throw new Error(`无法 ${operation}: API 根地址 (apiRootUrl) 未配置或无效。`);
  }
};

export const nodePassApi = {
  getInstances: (apiRootUrl: string, token: string) => {
    checkApiRootUrl(apiRootUrl, '获取实例列表');
    return request<Instance[]>(`${apiRootUrl}/v1/instances`, {}, token);
  },
  
  createInstance: (data: CreateInstanceRequest, apiRootUrl: string, token: string) => {
    checkApiRootUrl(apiRootUrl, '创建实例');
    return request<Instance>(`${apiRootUrl}/v1/instances`, { method: 'POST', body: JSON.stringify(data) }, token);
  },
  
  getInstance: (id: string, apiRootUrl: string, token: string) => {
    checkApiRootUrl(apiRootUrl, `获取实例 ${id}`);
    return request<Instance>(`${apiRootUrl}/v1/instances/${id}`, {}, token);
  },
  
  updateInstance: (id: string, data: UpdateInstanceRequest, apiRootUrl: string, token: string) => {
    checkApiRootUrl(apiRootUrl, `更新实例 ${id}`);
    return request<Instance>(`${apiRootUrl}/v1/instances/${id}`, { method: 'PATCH', body: JSON.stringify(data) }, token);
  },

  // modifyInstanceConfig function removed
  
  deleteInstance: (id: string, apiRootUrl: string, token: string) => {
    checkApiRootUrl(apiRootUrl, `删除实例 ${id}`);
    return request<void>(`${apiRootUrl}/v1/instances/${id}`, { method: 'DELETE' }, token);
  },
};

export const getEventsUrl = (apiRootUrl: string | null): string => {
  if (!apiRootUrl) throw new Error("API 根地址 (apiRootUrl) 未配置，无法获取事件 URL。");
  return `${apiRootUrl}/v1/events`;
};

