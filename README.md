# AI Motion Coach

React + TypeScript + Vite 的手机摄像头健身原型。姿态识别和动作计数在浏览器本地完成，支持深蹲、俯卧撑、平板支撑、俄罗斯转体、反向卷腹，并有中文语音、训练记录和每日热力图。

## 在另一台电脑继续开发

1. 安装 Node.js 20.19+ 或 22.12+、Git。
2. 克隆本仓库，在项目目录运行 `npm ci`。
3. 运行 `npm run dev`，按照终端显示的本地地址在电脑浏览器打开。摄像头需要授权。
4. 修改后运行 `npm run build` 检查编译和打包。

本地开发地址使用 `localhost`。若要用手机访问电脑开发服务，需要 HTTPS 或发布到已有的 CloudBase 地址，因为手机浏览器通常只在安全环境允许摄像头。

已发布的测试版：https://nanbuqu-dashboard-d0drnae5202324-1433064673.tcloudbaseapp.com/ai-motion-coach/

训练记录保存在使用者当前浏览器的本地存储中，不随 Git 仓库同步。仓库中包含运行所需的 MediaPipe 模型、WASM 和中文语音文件；本地 CloudBase 登录信息、缓存和构建产物不会提交。

当前算法和后续事项见 [NEXT-STEPS.md](NEXT-STEPS.md)。俄罗斯转体在真实手机上的计数稳定性仍需继续验证。
