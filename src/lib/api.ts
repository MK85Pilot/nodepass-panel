
import type { Instance as NodelessInstance, CreateInstanceRequest, UpdateInstanceRequest, MasterInfo } from '@/types/nodepass';

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
      cache: 'no-store',
      mode: 'cors', 
      credentials: 'omit', 
    });
  } catch (networkError: any) {
    console.error(`Network error while requesting ${fullRequestUrl}:`, networkError);
    
    let errorMessage = `网络请求失败 (${networkError.message || '未知错误'})。`;
    const lowerCaseErrorMessage = networkError.message?.toLowerCase() || "";

    if (lowerCaseErrorMessage.includes('failed to fetch')) {
      let specificErrorHandled = false;
      try {
        const targetUrl = new URL(fullRequestUrl); // Check if fullRequestUrl is a valid URL first
        const isFrontendSecure = typeof window !== 'undefined' && window.location.protocol === 'https:';

        if (targetUrl.protocol === 'http:' && isFrontendSecure) {
          errorMessage = `检测到混合内容请求 (HTTPS 页面请求 HTTP 资源)。您的浏览器可能已阻止此请求。请参考应用内帮助文档中的“HTTP 主控连接问题 (混合内容)”部分进行浏览器设置。`;
          specificErrorHandled = true;
        } else if (targetUrl.protocol === 'https:') {
          errorMessage = `连接到 ${fullRequestUrl} (HTTPS) 失败。如果目标 API 使用自签名 SSL 证书，请尝试在浏览器新标签页中直接访问此 API 地址并接受安全警告。详情请参考应用内帮助文档中的“HTTPS (自签名证书) 主控连接问题”部分。若非证书问题，请检查 CORS 配置、网络连接或服务器状态。`;
          specificErrorHandled = true;
        }
      } catch (urlParseError) {
        // fullRequestUrl might not be a valid URL, proceed with generic error
        console.warn("Could not parse fullRequestUrl for specific error diagnosis:", fullRequestUrl, urlParseError);
      }

      if (!specificErrorHandled) {
        errorMessage = `网络请求至 ${fullRequestUrl} 失败。这通常是由于目标服务器的 CORS 策略阻止了请求 (缺少 Access-Control-Allow-Origin 头部)、网络连接问题或服务器未运行。请检查网络连接和目标服务器的 CORS 配置。`;
        try {
            const urlObject = new URL(fullRequestUrl);
            const ipv4Regex = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;
            if (ipv4Regex.test(urlObject.hostname)) {
                errorMessage += ` 对于IPv4地址 (${urlObject.hostname})，请额外确认NodePass服务已在该IPv4地址和端口 (${urlObject.port || '默认'}) 上监听。确保服务监听在 '0.0.0.0:${urlObject.port || '默认端口'}' (所有网络接口) 或具体的 '${urlObject.hostname}:${urlObject.port || '默认端口'}'。`;
            }
        } catch (e) { /* ignore parsing error if fullRequestUrl is malformed */ }
      }
    } else {
      // Other network errors not "Failed to fetch"
      errorMessage = `网络请求至 ${fullRequestUrl} 发生错误: ${networkError.message || '未知网络错误'}。请检查您的网络连接和目标服务器状态。`;
    }

    const error = new Error(errorMessage);
    (error as any).cause = networkError; 
    throw error;
  }

  if (!response.ok) {
    let errorBody;
    try {
      errorBody = await response.json();
    } catch (e) {
      errorBody = { message: response.statusText };
    }
    const error = new Error(`API 错误: ${response.status} ${errorBody?.message || response.statusText}`);
    (error as any).status = response.status; 
    (error as any).body = errorBody; 
    throw error;
  }

  if (response.status === 204) { // No Content
    return null as T; 
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
    return request<Instance[]>(`${apiRootUrl}/instances`, {}, token);
  },
  
  createInstance: (data: CreateInstanceRequest, apiRootUrl: string, token: string) => {
    checkApiRootUrl(apiRootUrl, '创建实例');
    return request<Instance>(`${apiRootUrl}/instances`, { method: 'POST', body: JSON.stringify(data) }, token);
  },
  
  getInstance: (id: string, apiRootUrl: string, token: string) => {
    checkApiRootUrl(apiRootUrl, `获取实例 ${id}`);
    return request<Instance>(`${apiRootUrl}/instances/${id}`, {}, token);
  },
  
  updateInstance: (id: string, data: UpdateInstanceRequest, apiRootUrl: string, token: string) => {
    checkApiRootUrl(apiRootUrl, `更新实例 ${id}`);
    return request<Instance>(`${apiRootUrl}/instances/${id}`, { method: 'PATCH', body: JSON.stringify(data) }, token);
  },
  
  deleteInstance: (id: string, apiRootUrl: string, token: string) => {
    checkApiRootUrl(apiRootUrl, `删除实例 ${id}`);
    return request<void>(`${apiRootUrl}/instances/${id}`, { method: 'DELETE' }, token);
  },

  getMasterInfo: (apiRootUrl: string, token: string) => {
    checkApiRootUrl(apiRootUrl, '获取主控信息');
    return request<MasterInfo>(`${apiRootUrl}/info`, {}, token);
  },
};

export const getEventsUrl = (apiRootUrl: string | null): string => {
  if (!apiRootUrl) throw new Error("API 根地址 (apiRootUrl) 未配置，无法获取事件 URL。");
  return `${apiRootUrl}/events`;
};
