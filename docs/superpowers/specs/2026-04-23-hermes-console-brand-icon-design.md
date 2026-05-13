# Hermes Console 品牌与桌面图标设计

## 背景
当前开发态桌面客户端在 macOS Dock 中仍显示 Electron 默认图标，应用内品牌位也使用通用终端图标，和 Hermes Console 的桌面客户端定位不匹配。

## 推荐方案
采用一套统一的 Hermes Console 品牌图标资产，并同时接入桌面壳与前端界面。

### 视觉方向
- 图形语义：`Hermes 信使翼 + OS 节点环 + H 控制台核心`。
- 风格：深色高对比底座、蓝色控制平面光晕、金色翼形线条，匹配当前米白/石色 UI，并在 Dock 小尺寸下保持可识别。
- 资产形态：优先保留 SVG 矢量源文件，同时生成 PNG 与 macOS `.icns`。

### 接入范围
1. `ui/public/brand/`：前端品牌与 favicon 使用的 SVG/PNG。
2. `ui/desktop/assets/`：Electron 主进程和 Dock 使用的 PNG/ICNS。
3. `ui/desktop/main.mjs`：启动时设置应用名、窗口图标、macOS Dock 图标。
4. `ui/package.json` 与 `ui/desktop/run-dev.mjs`：让开发态从项目包启动，读取 Hermes Console 产品名，降低继续显示 Electron 名称/默认标识的概率。
5. 应用内侧栏品牌位：从通用 Terminal 图标替换为统一品牌 mark。

## 验收标准
- 开发态启动后 `app.name` 为 `Hermes Console`。
- macOS Dock 中运行态图标不再是 Electron 默认图标。
- 浏览器/IAB favicon 使用 Hermes Console 图标。
- 应用内左侧品牌位和 Dock 图标视觉一致。
- `npm run build` 通过，重启客户端后 HTTP 与 Electron 窗口均可用。
