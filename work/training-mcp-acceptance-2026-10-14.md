# V2.2 MCP验收记录 · 2026-10-14

## 结论

独立服务端实现与本地自动化测试通过；**未部署、未完成真实云端鉴权查询、未完成ChatGPT插件连接**。不得当作已取消手动导出的最终上线版本。原手机自动同步继续使用；本次不改现有training-sync/前端/工作看板。

## 已完成

- 阅读 training-sync-release-2026-10-13.md、OPPO修复记录、AGENTS及当前training-sync服务端；复用固定现有GET API。
- 独立services/training-mcp模块，官方MCP SDK Streamable HTTP，3个只读工具，OAuth资源服务器及protected-resource发现；使用外部受维护的OAuth授权服务器，校验JWT签名、issuer、audience、expiry、iat、scope、本人subject。
- 上游只读密钥仅服务端secret/env，固定API、禁止重定向，不转发客户端OAuth令牌。无数据库直连，无写入/删除工具。
- 分页扫描、ID去重、上海自然日、工具分页、动作单位、实际保持时长、质量提示语义；有界扫描失败时不输出伪完整结果。
- 独立Docker发布配置、参数模板、配置文档、OAuth发现预检及只读真实验收脚本。

## 实际证据

| 检查 | 状态 | 证据与限制 |
| --- | --- | --- |
| 本地自动测试 | 通过 | 10项，涵盖认证与拒绝、空数据、分页/去重、时区/动作筛选、口径、体积/页数/超时、协议初始化/发现/调用 |
| MCP HTTP | 通过 | 真实回环HTTP+官方客户端SDK，三个工具可调用；未知工具/越界参数拒绝，DELETE 405 |
| OAuth JWT | 通过 | 测试签名密钥；错误issuer/audience/subject/scope、过期/缺失exp、超龄、篡改签名与静态API密钥被拒绝。不是已完成第三方OAuth登录 |
| 工具元数据 | 通过 | 原始wire上的securitySchemes与_meta兼容声明、只读注解均检查 |
| 依赖审计 | 通过 | 本模块npm audit --omit=dev：0条已知告警（不包含旧腾讯SDK模块，不等于永无漏洞） |
| 真实API网络探测 | 受阻 | 未附凭据GET在当前云端环境返回HTTP200、text/html、Site Unavailable；不是训练JSON，也不能据此判断腾讯云服务全局故障 |
| 真实云端验收脚本 | 未通过 | npm run test:live退出2；缺失服务端只读密钥、OAuth配置与访问令牌，不用模拟数据替代 |
| MCP部署 | 未执行 | 无可用部署授权/OAuth提供商配置/只读secret；没有对外MCP地址 |
| ChatGPT插件连接 | 未执行 | 无部署地址及OAuth配置；没有读取到真实既有训练。不能判断该用户账户是否支持安装 |

## 接续必需配置

在已登录腾讯云、可访问私人只读密钥的可信环境接续。配置支持PKCE S256、resource audience及客户端注册的OAuth授权服务器；配置用户subject allowlist。通过secret manager将现有只读密钥挂载到新服务。详情见services/training-mcp/README.md。

按顺序执行：npm ci → npm test → OAuth元数据预检 → 独立容器服务部署 → 真实OAuth授权 → test:live既有记录逐字段对照 → ChatGPT创建自定义MCP并实际调用 → 保存已脱敏上线报告。成功前不合并主分支、不更改手机网站链接、不宣称真人历史已读取。

本次真实查询验证不得使用旧的write/read联合部署脚本，因为那些脚本会创建测试训练；MCP验收只运行新只读脚本。原同步功能与现存数据不需要重建。
