# Hermes Console macOS 原生质感图标重设计

## 用户反馈
上一版图标过于复杂，金色翼形和大面积轨道让图标显得花、游戏化，不符合 Hermes Console 作为桌面生产力客户端的气质。

## 选定方向
用户选择 B：macOS 原生质感版。

## 视觉原则
- 去掉翅膀、金色、复杂环线，避免游戏化和廉价科技感。
- 保留 Hermes Console 的核心识别：`H`、控制平面、Agent 节点。
- 采用 macOS Dock 常见的圆角方形、玻璃高光、柔和渐变、内外阴影。
- 小尺寸优先：Dock 缩小时仍以清晰的 `H` 作为第一识别点。

## 图形方案
- 底座：蓝紫深海渐变圆角方形，带内描边和顶部玻璃反光。
- 主体：中心白色玻璃质感 `H`，使用圆角几何块而不是文字字体，保证可控和清晰。
- 辅助语义：一条细蓝色控制轨道和一个小型节点点缀，不喧宾夺主。
- 应用内品牌位：继续复用同一 SVG/PNG，保持 Dock、favicon、侧栏品牌一致。

## 接入范围
继续覆盖现有资产路径，不引入新的业务代码：
- `ui/public/brand/hermes-console.svg`
- `ui/public/brand/hermes-console-*.png`
- `ui/desktop/assets/hermes-console-icon.png`
- `ui/desktop/assets/hermes-console-icon.icns`

## 验收标准
- 新图标不再包含金色翼形和复杂大环。
- Dock 图标更接近 macOS 原生应用质感。
- `npm run build` 通过。
- 重启桌面客户端后 4174 服务可访问，Electron 窗口可打开。
