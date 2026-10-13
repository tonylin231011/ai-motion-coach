# 训练自动同步发布记录 · 2026-10-13

接续分支 `codex/training-auto-sync` 的 `1ddc64cdf81dedf44e2c0d67c2c97b53251ee144`，主分支基线 `5fc58813774053e751ebdedbcca12a6fe26e06ff`。沿用既有同步代码，本轮未修改检测器、摄像头管线、语音文件或前端同步业务代码。

## 部署

- 手机网站：https://nanbuqu-dashboard-d0drnae5202324-1433064673.tcloudbaseapp.com/ai-motion-coach/?v=sync-20261013
- 同步接口：https://nanbuqu-dashboard-d0drnae5202324-1433064673.ap-shanghai.app.tcloudbase.com/training-sync
- 环境 `nanbuqu-dashboard-d0drnae5202324`，地域上海；普通事件函数 `training-sync`，入口 `index.main`，Nodejs20.19，256MB，30秒超时。
- 专用集合 `motion_coach_sessions`，客户端ACL为ADMINONLY；`owner_id_asc` 索引为owner升序、_id升序。未复用工作看板集合。
- 独立HTTP路径 `/training-sync`。两枚不同的32随机字节写/只读密钥，函数仅配置SHA256，允许原手机网站Origin。明文仅保存在忽略的本机私人文件，未进入仓库、网页包或URL。
- 使用原有函数代码与锁文件安装依赖后部署；其他3个函数和3条路由未改动。
- 前端safe/verify发布249个文件，只更新教练子目录，入口最后上传、未prune。备份 `.cloudbase-backup/1791901957858/`。
- 线上入口、3个构建包、16段弯举/静蹲语音、模型和6个WASM配套文件逐字节一致；主包index-mi_6qi0L.js、样式index-DTOBUTzR.css。
- 工作看板根页面发布前后SHA256一致：14111ad50f9990cbbbfb6822a21520a6198a7d533a1456ae2e7e2821e3c120a7。未部署Fitness OS。

## 自动化验收

| 范围 | 结果 |
| --- | --- |
| 构建 | npm run build通过 |
| 同步 | test:sync 8项通过，含105条分页、鉴权、确认失败、重试、并发保存 |
| 弯举/静蹲 | test:curl 12项、test:wall-sit 7项通过 |
| 既有动作 | 最新源码编译后的6个detector/history回归脚本通过；检测器及音频与主分支基线无差异 |
| 真实HTTP/数据库 | 无密钥401、只读POST403、非法Origin403、合法预检204；初次补传、确认后不重复上传、丢失确认重传通过 |
| 记录保真 | 左右弯举arm_reps、转体sides、平板62345ms保持时长原样往返；不补重量/RPE |
| 自动上传 | 保存事件触发真实HTTPS；实际React SyncPanel监听器再次验证通过 |
| 自动重试 | 实际组件挂载，注入网络异常后恢复，原退避定时器自动上传；未点击同步或手动调用同步函数 |
| 跨设备模型 | 两个独立存储及隔离DOM，同一个真实CloudBase，新实例自动读取、按ID去重 |
| 清理 | 精准删除本轮6+2条合成记录，仅匹配其hash及固定owner；GET确认专用集合空，等待本人手机历史 |

真实后端和实际组件自动化验收通过，但隔离DOM不等于两部实体手机。内置浏览器访问超时，本轮未完成可视化截图、真人动作或语音听觉验收。不能声称用户手机记录已经迁移，也不能把合成测试当真人识别率验证；只确认原识别/语音源码与资源未变、自动化回归未退化。

## 首次手机连接

在实际训练的手机和原浏览器打开新版，展开“云端备份”，填写上述HTTPS接口与私人保存的**写密钥**，点击“连接并同步历史”。另一台自己的设备使用同一配置。首次补传原历史，之后结束训练自动同步；关闭浏览器不保证后台上传，下次打开继续。不要清除站点数据。

本机私人“手机同步配置.txt”在工作区忽略的 `outputs/training-deploy/`，不随仓库同步。另一开发电脑需要独立登录腾讯云。只读密钥不用于手机配置；接口可用不等于ChatGPT已经连接。

## 复测

- work/verify-training-sync-live.mjs：Node24，SYNC_CREDENTIAL_FILE指向忽略的writeToken/readToken JSON，SYNC_ARTIFACT_DIR为结果目录。会创建精确清理清单中的合成记录，复测后必须按清单清理，不混入真实统计。
- work/verify-sync-panel-live.mjs：同上，另需SYNC_TEST_RUNTIME指向单独安装jsdom@26.1.0的测试目录；内存转换实际组件，不修改业务源码。
- work/run-detector-regressions.mjs：先将检测器、activity/history/types编译到忽略的work/detector-test。
- work/verify-deployment.mjs：在本次dist所在项目运行。

## 遗留风险

锁定的腾讯SDK @cloudbase/node-sdk 3.18.3 / database 1.4.3 的依赖树npm audit仍有5项告警（4 high、1 moderate），涉及旧axios、lodash.set/unset。查询到的最新版仍包含相关依赖，未强行覆写不兼容依赖；不是“无漏洞”结论。部署仅供个人可信设备鉴权访问，不可开放为公共多用户服务，须跟踪腾讯SDK修复。服务端仅暴露鉴权记录写入与分页读取，不提供删除或任意查询API。
