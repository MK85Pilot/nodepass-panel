# NodePass 前端管理面板

[![部署到 Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FMK85Pilot%2Fnodepass-panel)

这是一个为 [NodePass (yosebyte/nodepass)](https://github.com/yosebyte/nodepass) 设计的前端管理面板。它提供了一个用户友好的界面来管理您的 NodePass 服务。

**在线演示:** [https://nodepass-panel.vercel.app/](https://nodepass-panel.vercel.app/)



## 部署到 Vercel

Vercel 是部署此前端面板的推荐方式。

1.  **Fork 本仓库** (如果你还没有这样做)。
2.  登录到你的 [Vercel](https://vercel.com) 账户。
3.  点击 "New Project"。
4.  选择 "Import Git Repository"，然后选择你 Fork 的仓库。
5.  点击 "Deploy"。

部署完成后，你将获得一个 Vercel 域名 (例如 `xxx.vercel.app`)，前端面板将通过该域名访问。

**重要提示关于 CORS:**
确保你的 NodePass 后端服务已正确配置 CORS (跨源资源共享)，允许来自你的 Vercel 部署域名的请求。否则，前端将无法与后端 API 通信。


## 📄 许可证

该项目使用 [MIT](LICENSE) 许可证。

## 🙏 致谢

*   [yosebyte/nodepass](https://github.com/yosebyte/nodepass) - 强大的后端服务。