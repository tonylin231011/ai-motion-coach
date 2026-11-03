# AI Motion Coach V2.2 — 私有训练 MCP 服务

独立 Node.js 模块，复用已部署的 training-sync **GET** API。不会部署或修改手机前端、现有函数、数据库规则或工作看板。采用官方 MCP SDK 1.32.1 的 Streamable HTTP，无状态、JSON 响应模式。协议协商由 SDK 处理，不手写 JSON-RPC 协议实现。

## 状态与地址

当前是**服务端实现已测试、未部署/未完成真实连接验收**的版本。没有可交付的在线 MCP URL。
计划使用独立服务/独立主机，地址形如 `https://<新服务域名>/training-mcp/mcp`，这是模板，不能直接用于连接。不得把原 training-sync URL 当作 MCP URL。

## 工具

| 工具 | 参数/默认值 | 硬限制 |
| --- | --- | --- |
| list_recent_training | days=7, limit=50, offset=0, asOf=当前时刻 | 1–90天、每页1–100条 |
| list_exercise_history | exercise必填, days=90, 同上分页 | 1–365天、每页1–100条 |
| get_training_detail | sessionId必填, recordOffset=0, recordLimit=100 | 每页1–200条动作明细 |

exercise取 squat / pushup / plank / russian_twist / reverse_crunch / dumbbell_curl / wall_sit。日期为上海自然日：最近N天包括当天，以asOf结束。列表按endedAt降序、ID升序稳定排序。后续页传回同一asOf和nextOffset。源API不提供快照隔离，查询期间补传的旧记录可能改变分页位置；聚合多页时继续按ID去重。

已部署API按hash ID分页，不支持按时间/动作在服务端过滤，故每次列表查询扫描最多20页（2000条）；最大10MiB输入、单页2MiB、查询20秒，达到限制报错，绝不把部分数据称为完整历史。详情先定位摘要所在页，再仅取这一页的details=1，输出目标ID的有界动作片段。不能越过现有API读取数据库。历史超过限制时应另行评估只读API索引查询扩展，不在本模块偷偷改同步接口。

保留左右手armCounts与arm_reps、转体sides、计时hold.heldMs；durationMs保留为会话耗时。fast/shallow不是不合格率，valid可能为true。返回countingRules用于帮助模型正确解读，不推算重量/RPE/未观测动作质量。

## OAuth：需要真实授权服务器，不是拿CloudBase密钥冒充OAuth

本模块是OAuth资源服务器。登录、同意、授权码、PKCE、刷新与撤销由独立、受维护的OAuth/OIDC提供商承担；没有自制密码登录或静态令牌“伪OAuth”。部署方必须先配置该提供商，再启动本服务。

1. 选择支持授权码+PKCE S256、RFC8414发现、资源参数及MCP所需客户端注册方式的授权服务器。可用预注册OAuth客户端；不强制开启公开动态注册。不得假定任意OIDC租户默认就支持MCP。
2. 建立仅含 `training:read` 的资源，资源标识/访问令牌aud必须**精确等于MCP_PUBLIC_URL**。授权服务器需要接受并正确处理ChatGPT授权与换令牌请求里的resource参数。JWT访问令牌使用RS256或ES256，携带iss、aud、sub、iat、exp、scope，有效期建议5–15分钟，本服务最大接受token age为1小时。
3. 从ChatGPT自定义MCP设置读取它显示的实际OAuth回调地址，精确注册。不手猜回调；若使用预注册客户端，将客户端ID/所需secret填入ChatGPT的OAuth安全配置，而不是聊天。
4. 将你本人稳定的 `sub` 填入 `OAUTH_ALLOWED_SUBJECTS`，默认无允许用户，禁止星号；仅拥有同一提供商账号不足以访问你的数据。服务端对每个请求校验签名、issuer、audience、时间、scope及owner allowlist。只接收Authorization头，不接受URL令牌。
5. `OAUTH_JWKS_URL`必须与issuer同源。发布前运行 `node scripts/check-oauth.mjs` 检查元数据，再实测授权码、PKCE、resource、refresh及撤销。元数据检查通过不代表OAuth登录已验收。

公开发现路径：`/.well-known/oauth-protected-resource/training-mcp/mcp`；根发现路径返回相同信息。未认证请求返回401和带resource_metadata的WWW-Authenticate。每个工具声明oauth2 securitySchemes及readOnlyHint，客户端只能看到自身OAuth访问令牌；CloudBase只读密钥从不透传。

## 服务端秘密与运行

`.env.example`仅包含占位符。生产通过部署平台secret manager注入配置；优先把**现有只读密钥**挂载到 `TRAINING_READ_TOKEN_FILE`，文件内容仅为密钥字符串。也支持服务端 `TRAINING_READ_TOKEN` 环境变量。不要误用写密钥，不要把私人凭据JSON复制进镜像/仓库，不要通过URL、聊天或前端配置传递。容器中不需要腾讯云管理员密钥，也不需要数据库SDK。

```sh
cd services/training-mcp
npm ci --ignore-scripts
npm test
# 运行环境先注入所需变量/挂载secret
npm start
```

配置缺失时启动失败。固定上游为昨晚已部署的training-sync地址；工具参数无法指定URL、凭据或数据库查询。只使用GET，不提供训练写入/删除工具。OAuth令牌不发送给CloudBase，CloudBase只读密钥不发送给OAuth提供商。

## 独立部署

使用此目录作为Docker构建上下文：`docker build -t training-mcp:2.2.0 .`。Docker白名单仅复制package/lock/src，使用非root用户；不要把整个仓库作为构建上下文。部署到**新的独立容器服务**（例如CloudBase云托管），由该平台分配独立HTTPS域名，然后设置MCP_PUBLIC_URL。

独立服务需要路由 `/training-mcp/mcp`、`/training-mcp/healthz` 和两个公开metadata路径。不要复用training-sync普通事件函数；其网关响应模型与流式Node HTTP服务不同。不要修改原手机网站托管目录、根路径或工作看板路由。反向代理保留外部Host，TLS在平台终止，传输不重定向；若平台重写Host，应按平台受信任配置处理后再验收，不要移除Host检查。Origin只允许ChatGPT，无Origin的服务间调用仍需要OAuth。GET/DELETE MCP返回405（无SSE订阅/会话终止状态），POST为标准Streamable HTTP请求；元数据支持GET。

并发上限4，每个允许用户每分钟60次MCP请求，超出429；这是单实例限流，多副本需在网关另设总量上限。生产不记录请求头、body、令牌、训练明细；健康检查不暴露配置。

## 自动验收

- `npm test`：协议初始化/工具发现/调用使用真实回环HTTP+官方SDK，JWT使用测试签名密钥；上游训练是内存fixture，不能算真实云端训练。
- `npm run test:live`：需要服务端配置与 `MCP_ACCESS_TOKEN_FILE`（含已授权给本人的OAuth访问令牌）。读真实training-sync最近90天一条**已存在**记录，经远程MCP读取并逐字段比较摘要和第一条明细。无记录/无配置/鉴权失败均退出2，不创建或清理任何训练。报告仅输出检查项和ID哈希指纹，不输出训练内容/令牌。
- 真实脚本的SDK验证仍**不等于ChatGPT界面连接验证**。最后必须在ChatGPT创建并安装自定义MCP，完成OAuth，在新会话要求“读取最近7天训练，再读取其中一条动作明细”，核对真实记录。再试另一用户和写入要求：应拒绝/无工具可用。

## ChatGPT配置与兼容替代

官方当前文档入口为 ChatGPT Plugins → 加号 → Add custom MCP server → 填实际HTTPS MCP地址 → OAuth → 创建并安装。账号与工作区可能控制入口，不能仅根据Plus标签判定可用或不可用。本次没有已部署地址，也没有检查到账户插件管理界面，账号兼容性状态为**未验证**。

若账户没有自定义MCP入口：用支持Streamable HTTP与OAuth的本地Codex或其他MCP客户端连接**同一个服务**，仍直接读取云端且无须导出文件；或按官方Secure MCP Tunnel方案连接私有部署（另有平台/工作区权限要求）。不回退为公开JSON，不把CloudBase只读密钥作为客户端Bearer传入。若OAuth和公网部署暂时尚未完成，继续现有手机自动同步，先不要宣称ChatGPT已接通。

参考（核对于2026-10-14）：
- https://developers.openai.com/plugins/build/auth
- https://developers.openai.com/plugins/deploy/connect-chatgpt
- https://developers.openai.com/api/docs/guides/custom-mcp-server
- https://ts.sdk.modelcontextprotocol.io/server
