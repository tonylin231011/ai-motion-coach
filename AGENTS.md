# AI Motion Coach 工作约定

用户于 2026-09-30 明确授权：今后完成 AI Motion Coach 更新后，验证通过即发布到现有手机测试站点，再同步 GitHub；不要把仅本地修改或仅上传仓库当作已发布。

## 更新交付顺序

1. 保留已有修改与浏览器训练记录；检查相关测试并执行 `npm run build`。
2. 将 `dist` 发布到 CloudBase 环境 `nanbuqu-dashboard-d0drnae5202324` 的 **`ai-motion-coach` 子目录**。不得发布到根目录，不得覆盖根目录工作看板，不得部署 Fitness OS。不要使用删除额外远端文件的 `--prune`。
3. 优先采用 CloudBase 的 `--safe --verify` 发布；入口 HTML 在资源之后上传。运行 `node work/verify-deployment.mjs` 核对线上文件与本地构建一致，检查页面入口。验证失败不能宣称已完成。
4. 保存更新与发布说明，提交并同步到 `tonylin231011/ai-motion-coach`。不要强制推送，不要提交凭据、缓存、训练隐私数据或构建产物。
5. 向用户提供手机链接及发布、仓库同步结果；若授权失效或无法完成其中一步，明确说明实际状态和阻碍。

测试网址：https://nanbuqu-dashboard-d0drnae5202324-1433064673.tcloudbaseapp.com/ai-motion-coach/

CloudBase 授权仅在已登录的电脑本地使用，不随仓库同步。另一台电脑需要独立登录。刷新建议可以使用版本查询参数，不要让用户清除浏览器站点数据，否则会丢失本地训练记录。
