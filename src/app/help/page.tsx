
"use client";

import React, { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { AlertCircle, Info, ExternalLink } from 'lucide-react';
import { Alert, AlertTitle, AlertDescription as ShadAlertDescription } from '@/components/ui/alert'; // Renamed to avoid conflict

export default function HelpPage() {
  const [appDomain, setAppDomain] = useState<string>('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setAppDomain(window.location.origin);
    }
  }, []);

  return (
    <AppLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold font-title mb-2">帮助与说明</h1>
          <p className="text-lg text-muted-foreground font-sans">
            欢迎使用 NodePass 管理器！本页面提供功能概览、操作指南及常见问题排查。
          </p>
        </div>

        <Card className="shadow-lg card-hover-shadow">
          <CardHeader>
            <CardTitle className="font-title flex items-center">
              <Info size={22} className="mr-2 text-primary" />
              关于 NodePass 管理器
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm font-sans">
            <p>
              NodePass 管理器是一个为 <a href="https://github.com/yosebyte/nodepass" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">NodePass</a> 后端服务设计的前端管理面板。它提供了一个用户友好的界面来集中管理您的 NodePass 主控连接、实例（服务端/客户端）、可视化连接拓扑以及监控流量。
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-lg card-hover-shadow">
          <CardHeader>
            <CardTitle className="font-title">主要功能</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm font-sans">
            <ul className="list-disc list-outside pl-5 space-y-1">
              <li><strong>主控连接管理:</strong> 添加、编辑、删除和切换多个 NodePass 主控配置。</li>
              <li><strong>实例管理:</strong> 创建、启动、停止、重启、修改和删除 NodePass 实例。</li>
              <li><strong>连接拓扑可视化:</strong> 通过拖拽方式设计和展示实例间的连接关系，并一键提交创建。</li>
              <li><strong>流量统计:</strong> 查看各实例的 TCP 和 UDP 流量数据。</li>
              <li><strong>事件日志:</strong> 跟踪应用内的重要操作和状态变更。</li>
            </ul>
          </CardContent>
        </Card>

        <Card className="shadow-lg card-hover-shadow">
          <CardHeader>
            <CardTitle className="font-title">基本操作流程</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm font-sans">
            <ol className="list-decimal list-outside pl-5 space-y-2">
              <li>
                <strong>添加主控连接:</strong>
                <ul className="list-disc list-outside pl-6 mt-1">
                  <li>点击页面右上角的 <span className="font-semibold">设置图标</span>。</li>
                  <li>选择 “添加新主控” 或 “管理所有主控” 中的添加选项。</li>
                  <li>输入主控的 <span className="font-semibold">API 地址</span> (例如 `http://localhost:3000`) 和 <span className="font-semibold">令牌 (API Key)</span>。</li>
                  <li>(可选) 配置 API 前缀路径、主控默认日志级别和 TLS 模式作为参考。</li>
                  <li>保存配置。</li>
                </ul>
              </li>
              <li>
                <strong>选择活动主控:</strong>
                <ul className="list-disc list-outside pl-6 mt-1">
                  <li>添加至少一个主控后，通过设置菜单的 “切换活动主控” 选项选择一个作为当前操作的主控。</li>
                  <li>或者，在 “管理所有主控” 页面点击主控条目右侧的 “设为活动” 按钮。</li>
                </ul>
              </li>
              <li>
                <strong>管理实例:</strong>
                <ul className="list-disc list-outside pl-6 mt-1">
                  <li>在 <span className="font-semibold">主页</span> (概览页)，您可以看到当前活动主控下的实例列表。</li>
                  <li>您可以创建新实例、启动/停止/重启现有实例、查看实例详情和日志、修改实例配置或删除实例。</li>
                </ul>
              </li>
              <li>
                <strong>(可选) 使用拓扑图:</strong>
                <ul className="list-disc list-outside pl-6 mt-1">
                  <li>导航至 <span className="font-semibold">连接拓扑图</span> 页面 (通过设置菜单)。</li>
                  <li>从左侧面板拖拽主控和组件 (服务端/客户端/落地) 到画布。</li>
                  <li>连接节点以定义链路关系。节点属性会自动更新或可以手动编辑。</li>
                  <li>完成后，点击 “提交拓扑” 以在相应主控上批量创建实例。</li>
                </ul>
              </li>
              <li>
                <strong>(可选) 查看流量统计:</strong>
                <ul className="list-disc list-outside pl-6 mt-1">
                  <li>导航至 <span className="font-semibold">流量统计</span> 页面 (通过设置菜单) 查看所有已配置主控下各实例的流量信息。</li>
                </ul>
              </li>
            </ol>
          </CardContent>
        </Card>

        <Card className="shadow-lg card-hover-shadow">
          <CardHeader>
            <CardTitle className="font-title flex items-center">
              <AlertCircle size={22} className="mr-2 text-destructive" />
              故障排除 (Chrome 浏览器)
            </CardTitle>
            <CardDescription className="font-sans">
              如果您在使用 Chrome 浏览器连接 NodePass 主控时遇到问题，请参考以下说明。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 text-sm font-sans">
            <Alert variant="default" className="bg-muted/30">
              <Info className="h-4 w-4 text-blue-600" />
              <AlertTitle className="font-title text-base text-blue-700">HTTP 主控连接问题 (混合内容)</AlertTitle>
              <ShadAlertDescription className="mt-1 space-y-2">
                <p>
                  如果您的 NodePass 主控 API 通过 <strong>HTTP (非 HTTPS)</strong> 提供服务，而本管理器通过 HTTPS 访问，浏览器可能阻止连接。
                </p>
                <p className="font-semibold">解决方案:</p>
                <ol className="list-decimal list-outside pl-5 space-y-1">
                  <li>
                    在 Chrome 地址栏输入: <code className="bg-card p-1 rounded text-xs select-all">chrome://settings/content/siteDetails?site={appDomain || 'YOUR_APP_DOMAIN'}</code>
                    {appDomain && <span className="block text-xs text-muted-foreground">(当前应用域名已自动填充)</span>}
                    {!appDomain && <span className="block text-xs text-muted-foreground">(请将 YOUR_APP_DOMAIN 替换为当前 NodePass 管理器应用的域名)</span>}
                  </li>
                  <li>找到 “<strong>不安全内容</strong>”(Insecure content) 设置。</li>
                  <li>更改为 “<strong>允许</strong>”(Allow)。</li>
                  <li>刷新本 NodePass 管理器页面。</li>
                </ol>
              </ShadAlertDescription>
            </Alert>

            <Alert variant="default" className="bg-muted/30">
              <Info className="h-4 w-4 text-blue-600" />
              <AlertTitle className="font-title text-base text-blue-700">HTTPS (自签名证书) 主控连接问题</AlertTitle>
              <ShadAlertDescription className="mt-1 space-y-2">
                <p>
                  如果您的 NodePass 主控 API 通过 <strong>HTTPS</strong> 提供服务但使用<strong>自签名证书</strong>，浏览器会阻止连接。
                </p>
                <p className="font-semibold">解决方案:</p>
                <ol className="list-decimal list-outside pl-5 space-y-1">
                  <li>
                    在新的浏览器标签页中，<strong>直接访问您的 NodePass 主控的 API URL</strong>。
                    <span className="block text-xs text-muted-foreground">
                      (例如: `https://your-nodepass-api.example.com:3000`)
                    </span>
                  </li>
                  <li>您会看到安全警告页面。点击 “<strong>高级</strong>”(Advanced)。</li>
                  <li>
                    点击 “<strong>继续前往 {<em>主控API域名</em>} (不安全)</strong>” (Proceed to {<em>api_domain</em>} (unsafe))。
                  </li>
                  <li>接受证书后，返回本 NodePass 管理器页面并刷新。</li>
                </ol>
              </ShadAlertDescription>
            </Alert>
          </CardContent>
        </Card>

         <Card className="shadow-lg card-hover-shadow">
          <CardHeader>
            <CardTitle className="font-title">联系与支持</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm font-sans">
            <p>
              如果您遇到其他问题或有功能建议，欢迎通过以下方式联系或报告:
            </p>
            <ul className="list-disc list-outside pl-5">
              <li>
                NodePass (后端) 相关问题: <a href="https://github.com/yosebyte/nodepass/issues" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">NodePass GitHub Issues <ExternalLink size={14} className="inline-block ml-0.5" /></a>
              </li>
              <li>
                NodePass 管理器 (本前端) 相关问题: <a href="https://github.com/MK85Pilot/nodepass-panel/issues" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">NodePass Panel GitHub Issues <ExternalLink size={14} className="inline-block ml-0.5" /></a>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
