# coach18-wall 发布记录 · 2026-10-08

用户在本地验收完成后明确要求部署并提交到 Git 仓库。本次仅发布 AI Motion Coach，未部署 Fitness OS，未清理浏览器训练记录。

## 线上地址与范围

- 手机测试地址：https://nanbuqu-dashboard-d0drnae5202324-1433064673.tcloudbaseapp.com/ai-motion-coach/?v=coach18-wall
- 环境：`nanbuqu-dashboard-d0drnae5202324`
- 子目录：`ai-motion-coach`
- 仓库目标：`tonylin231011/ai-motion-coach`，`main` 分支。
- 主包：`index-DwVmRAf5.js`；样式：`index-DTOzXwG7.css`。

## 发布和验证

1. 7 项静蹲测试、12 项已有弯举测试和 `npm run build` 均通过。此前独立手机模拟浏览器已验证开始、暂停、下一组、达标、结束保存、刷新读取、历史进步和实际 JSON 下载；5 种手机尺寸无控件重叠或横向溢出，7 条新语音全部可解码。
2. 全局 CloudBase CLI 3.4.0 不支持安全发布参数，因此临时使用 3.8.5，不修改全局安装：

   ```powershell
   npx.cmd --yes --package @cloudbase/cli@3.8.5 tcb hosting deploy dist ai-motion-coach -e nanbuqu-dashboard-d0drnae5202324 --safe --verify --entry index.html --json
   ```

3. 249 个文件上传成功，0 失败，`verified: true`。先上传 248 个资源文件，再上传入口。未使用 `--prune`，旧资源保留。服务端回滚备份：`.cloudbase-backup/1791455333494/`。
4. `node work/verify-deployment.mjs` 通过：目录入口与 index.html 相同；所有构建 JS/CSS、7 条静蹲语音、9 条弯举语音、姿态模型均与本地构建 SHA256 一致；静蹲、弯举及导出功能标记存在。
5. 独立 Edge 手机模拟浏览器打开线上版本，页面标题为 AI Motion Coach，显示靠墙静蹲入口及目标选择、纯计时选项，中文语音正常进入播放状态。
6. 根目录工作看板发布前后 SHA256 一致：`8F723F47873A562260D37DA3EC2E5C49FA65E8F8048BB65759CC8E53DDA61845`。

## 使用与后续

- 腾讯云默认测试域名可能显示访问提示，阅读后点“确定访问”进入；这是平台访问机制。本轮未修改域名、安全策略或根目录站点。
- 在原训练浏览器打开带版本参数的地址即可。不要清除站点数据，训练记录不会随发布或 Git 同步转移。
- 自动起表的合成关键点测试已通过；真人手机摄像头和不同机位识别仍待实测。连续计时达标不认证完整姿势或贴墙状态。
- 发布日志、入口备份、浏览器截图和测试下载仅保存在 Git 忽略目录；凭据与构建产物不提交。
