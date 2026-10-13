# 训练自动同步 · 2026-10-13 · 待部署

## 当前状态

基于 main `5fc58813774053e751ebdedbcca12a6fe26e06ff` 实施。未部署、未迁移真实记录，未建立 ChatGPT 连接，手机现网仍是旧版本。此分支是因发布环境受阻保存的接续工作，不代表发布完成。不得清理用户浏览器数据。

已实现：保存后的自动同步、首次历史补传、按训练 ID 幂等写入、成功确认后才记已同步、断网/失败重试、重新打开页面补传、另一设备获取云端历史、分页只读接口。所有摄像头与检测算法保持原样。本期为单人私有部署；不支持公共多用户注册。

验证：`npm run build`；`npm run test:sync`（8项）；既有 `test:curl`（12项）、`test:wall-sit`（7项）。数据层测试使用内存替身，客户端网络测试使用 fetch 替身。尚未通过真实腾讯云数据库、手机端端到端测试。云端环境运行 CloudBase CLI 3.8.5 时，在读取网卡信息的启动阶段报 `uv_interface_addresses` 系统错误，未能进入登录或部署操作。

## 在原已登录 CloudBase 的电脑接续

1. 获取本分支到现有完整仓库；保留已有改动。正常 checkout 必须包含原有 `public` 模型和音频（本次云端仅取文本源码，不能用这里不含模型/音频的 dist 发布）。执行 npm ci 和上述测试。
2. 仅操作环境 `nanbuqu-dashboard-d0drnae5202324`。新建文档型集合 `motion_coach_sessions`，客户端安全规则为禁止直接读写，仅服务端云函数访问。为 owner（升序）、_id（升序）配置查询所需索引。不要复用/修改工作看板集合。
3. 生成两枚不同的至少32随机字节密钥：训练设备使用写密钥，AI使用只读密钥。只将 SHA256（小写64位hex）放入函数环境变量，不把密钥提交代码、放 URL 或 VITE 变量。
4. 新建**普通事件云函数** `training-sync`（不是 HTTP 函数类型），Node.js 20 或更新受支持版本，入口 index.main，代码来自 `cloudfunctions/training-sync/`，安装锁定依赖。设置 `SYNC_OWNER_ID`（固定私有用户标识）、`SYNC_WRITE_TOKEN_SHA256`、`SYNC_READ_TOKEN_SHA256`、`ALLOWED_ORIGINS=https://nanbuqu-dashboard-d0drnae5202324-1433064673.tcloudbaseapp.com`。通过 CloudBase HTTP 访问服务绑定独立路径 `/training-sync`，验证 event 的 method/headers/body/query 字段与代码一致，不暴露其他函数。
5. 先验证无密钥返回401、只读密钥POST返回403、写密钥可写、重复写只有一条。通过GET分页及 details=1验证记录保持一致；总请求大小限制512KB，每条记录一请求。确认云端执行角色有目标集合权限。不要用未鉴权的公开 JSON 替代接口。
6. 发布前端前执行 `npm run build`，按 AGENTS.md 的 --safe --verify 方式仅发布 `dist` 到 `ai-motion-coach` 子目录；不使用 --prune。运行 `node work/verify-deployment.mjs`。全部验证通过后才合并主分支，保存实际发布记录。
7. 手机原浏览器打开新版，在“云端备份”填入确认过的HTTPS接口和写密钥，首次连接自动补传本机历史。观察记录总数。另一设备同配置查询相同记录。训练结束后无需手动导出。断网训练、联网重试、关闭重开、重复上传都需真人设备验收。首次迁移无需再次上传JSON；源数据来自手机本地。

## AI读取接口与剩余连接工作

GET `<endpoint>`，Authorization: Bearer <只读密钥>。默认返回每条训练的汇总字段与分页游标；GET `?details=1`返回动作明细，后续页携带`cursor`。保持原始计数单位：俄罗斯转体每侧计次、弯举每只手计次、静态动作看hold.heldMs；durationMs是会话时长。fast/shallow只作提示，不换算不合格率。

接口就绪不等于ChatGPT已连接。需要在可安全保管只读密钥且有网络权限的执行环境中验证一次读取；或另行配置受认证MCP/连接器。不得承诺普通聊天仅凭知道网址就能读取私人数据。此分支未包含MCP/自动定期Agent。

## 运维与边界

- 写密钥只授权本人的训练记录，不是腾讯云管理员密钥；浏览器localStorage保存它，断开连接会移除。只在个人可信设备配置；丢失设备后轮换函数密钥。
- 重试发生在页面打开时；关闭浏览器后不承诺后台同步，下次打开会补传。
- 本地保留原始记录，缓存已确认指纹占用额外本地空间；容量错误会显示同步失败，不会删除训练。
- 相同训练ID视为同一条最终记录；API写入为upsert。不提供删除API或通用数据库查询。
- 不同设备必须使用同一个人配置。切换到另一个人的服务会补传本机历史，本版本不提供多账户功能。

参考： https://docs.cloudbase.net/service/access-cloud-function （普通云函数HTTP访问）；https://docs.cloudbase.net/cloud-function/how-coding （CommonJS入口）；https://docs.cloudbase.net/api-reference/server/node-sdk （数据库SDK）。
