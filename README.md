# Neko Console

一个独立、可自托管的 AstrBot 网页控制台（非官方）。

界面层为完全独立实现：**不包含任何受限许可的 UI 代码**，全部依赖均为 MIT / ISC / Apache-2.0。

## 特性

- **功能覆盖**：仪表盘、机器人（平台实例）、模型提供商与提供商源、配置文件、人格、知识库、技能、插件与插件市场、MCP 服务、工具与指令（按插件归类）、对话记录、日志、调用追踪、备份、更新、外观、设置、关于
- **界面**：侧边栏 + 顶栏 + 移动端底部导航；主题（浅色 / 深色 / 跟随系统）、强调色、品牌文字、背景壁纸（模糊 / 暗化）、毛玻璃效果，侧边栏条目可逐项隐藏
- **安全**：配置文件页的 JSON 编辑器对密钥类字段**默认打码**（隐藏状态标志除外），插件 / 平台配置查看同样默认打码，可显式点“显示原始值”
- **兼容**：识别强制桌面视口的内置浏览器并提供缩放开关；不使用 `color-mix()` 也能呈现主色（派生色以 rgba 注入）
- **开发体验**：TypeScript 严格模式零错误，`tsc --noEmit` 可直接作为提交门禁

## 技术栈

React 19 · Vite · Tailwind CSS 4 · lucide-react（图标）· motion（动效）· clsx + tailwind-merge

## 快速开始

```sh
npm install
npm run dev         # 开发服务器
npm run typecheck   # tsc --noEmit
npm run build       # 产物输出到 dist/
```

要求 Node 20+。若 npm 官方源不可达，可使用镜像：

```sh
npm i --registry=https://registry.npmmirror.com
```

## 部署

`dist/` 是纯静态产物，交给任意静态服务器即可，但必须：

1. 把 `/api/*` 反向代理到 AstrBot 的 WebUI（默认 `http://127.0.0.1:6185`）；
2. 让前端与 API **同源**，否则登录 Cookie / `Authorization` 不会生效；
3. 若 AstrBot 下发的 JWT Cookie 带 `Secure` 属性而你在 HTTP 下访问，需要在代理层去掉该属性（否则浏览器会丢弃它，表现为“登录成功但立刻掉线”）。

登录使用 AstrBot 控制台账号。

## 与 AstrBot 的关系

本项目**不是** AstrBot 官方产物，不包含也不修改 AstrBot 的源代码，仅通过其 REST API 与一个未经修改的 AstrBot 实例通信。细节见 `THIRD_PARTY_NOTICES.md`。

## 许可

MIT，见 [LICENSE](LICENSE)。第三方依赖清单、以及与 AstrBot（AGPL-3.0）的关系说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 致谢

- [AstrBot](https://github.com/AstrBotDevs/AstrBot) — 后端框架与 REST API
- [SnowLuma](https://github.com/SnowLuma/SnowLuma) — 早期版本的界面基底，现已完全移除（见 THIRD_PARTY_NOTICES 的历史说明）
- [shadcn/ui](https://github.com/shadcn-ui/ui) — 组件与 token 命名约定（MIT）
- [lucide](https://github.com/lucide-icons/lucide) — 矢量图标（ISC）
- [Tailwind CSS](https://github.com/tailwindlabs/tailwindcss) · [Vite](https://github.com/vitejs/vite) · [React](https://github.com/facebook/react) — 构建与运行时基础（MIT）