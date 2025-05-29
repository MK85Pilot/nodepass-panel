
// import { type NextRequest } from 'next/server';

// This proxy is no longer used as SSE is handled client-side via fetch.
// Keeping the file structure but commenting out the content.

// export async function GET(request: NextRequest) {
//   const searchParams = request.nextUrl.searchParams;
//   const targetUrl = searchParams.get('targetUrl');
//   const token = searchParams.get('token');

//   if (!targetUrl) {
//     console.error('Proxy: Missing targetUrl query parameter');
//     return new Response('代理错误: 缺少 targetUrl 查询参数', { 
//       status: 400, 
//       headers: { 'Content-Type': 'text/plain; charset=utf-8' } 
//     });
//   }
  
//   if (!token) {
//      console.error('Proxy: API token (X-API-Key) is missing in the request to the proxy. Cannot authenticate to upstream.');
//      return new Response('代理错误: API 令牌丢失，无法向上游服务器认证。', {
//         status: 400,
//         headers: { 'Content-Type': 'text/plain; charset=utf-8' }
//      });
//   }

//   let upstreamResponse;
//   try {
//     console.log(`Proxy: Attempting to connect to target event stream. URL: ${targetUrl}, Token: Present (masked)`);

//     const headers: HeadersInit = {
//       'Accept': 'text/event-stream',
//       'Connection': 'keep-alive', 
//       'X-API-Key': token,
//     };

//     upstreamResponse = await fetch(targetUrl, {
//       method: 'GET',
//       headers: headers,
//       cache: 'no-store',
//       // duplex: 'half' might be needed for some environments if streaming request body, but not for GET SSE.
//     });

//     if (!upstreamResponse.ok) {
//       let errorResponseMessage = `上游目标错误: ${upstreamResponse.status} ${upstreamResponse.statusText}`;
//       try {
//         const bodyText = await upstreamResponse.text();
//         if (bodyText && bodyText.trim().length > 0 && bodyText.length < 512 && !bodyText.includes('\uFFFD')) {
//             errorResponseMessage = bodyText; 
//         }
//       } catch (e) {
//         console.warn(`Proxy: Failed to read upstream error response body (Status: ${upstreamResponse.status}). Upstream status: ${upstreamResponse.statusText}. Read error: ${e instanceof Error ? e.message : String(e)}`);
//       }
//       console.error(`Proxy: Error from target event stream. Status: ${upstreamResponse.status}, URL: ${targetUrl}, Response Message: "${errorResponseMessage}"`);
//       return new Response(`代理错误: 目标服务器响应 ${upstreamResponse.status}。消息: ${errorResponseMessage}`, { 
//         status: upstreamResponse.status, 
//         headers: { 'Content-Type': 'text/plain; charset=utf-8' } 
//       });
//     }

//     if (!upstreamResponse.body) {
//       console.error(`Proxy: Upstream server did not return a readable stream. URL: ${targetUrl}`);
//       return new Response('代理错误: 目标服务器未返回可读流。', { 
//         status: 500,
//         headers: { 'Content-Type': 'text/plain; charset=utf-8' } 
//       });
//     }
    
//     const readableStream = new ReadableStream({
//       async start(controller) {
//         const reader = upstreamResponse!.body!.getReader(); 
//         const decoder = new TextDecoder(); 

//         function push() {
//           reader.read().then(({ done, value }) => {
//             if (done) {
//               console.log('Proxy: Upstream target stream closed. URL:', targetUrl);
//               controller.close();
//               return;
//             }
//             const chunk = decoder.decode(value, { stream: true });
//             controller.enqueue(new TextEncoder().encode(chunk));
//             push();
//           }).catch(error => {
//             console.error('Proxy: Error reading from target stream. URL:', targetUrl, 'Error:', error);
//             controller.error(error);
//           });
//         }
//         push();
//       },
//       cancel(reason) {
//         console.log('Proxy: Client cancelled stream read. URL:', targetUrl, 'Reason:', reason);
//       }
//     });

//     return new Response(readableStream, {
//       headers: {
//         'Content-Type': 'text/event-stream; charset=utf-8',
//         'Cache-Control': 'no-cache',
//         'Connection': 'keep-alive',
//       },
//     });

//   } catch (error) {
//     console.error(`Proxy: Error in event proxy handler. Target URL: ${targetUrl}. Error details:`, error);
//     const errorMessage = error instanceof Error ? error.message : '未知服务器错误';
    
//     if (!upstreamResponse) {
//       return new Response(`代理错误: 无法连接到上游目标服务器 (${targetUrl})。错误: ${errorMessage}`, { 
//         status: 502, 
//         headers: { 'Content-Type': 'text/plain; charset=utf-8' }  
//       });
//     }

//     return new Response(`代理错误: ${errorMessage}`, { 
//       status: 500, 
//       headers: { 'Content-Type': 'text/plain; charset=utf-8' }  
//     });
//   }
// }

    