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

## 部署（三种方式）

### 方式一：Docker Compose（推荐，含侧车）

仓库自带 `Dockerfile` 与 `docker-compose.yml`。侧车（`server/server.mjs`）负责主题/壁纸持久化、对话页数据、插件 zip 上传与 Cookie 处理。

```sh
git clone https://github.com/baizi51676-source/neko_console.git
cd neko_console
cp .env.example .env     # 填写 ASTRBOT_BASE（AstrBot 的 WebUI 地址）
docker compose up -d
```

然后打开 `http://<设备地址>:6186`。若 AstrBot 也在 docker 里，把它加入同一个网络后可直接用 `http://astrbot:6185`（`docker-compose.yml` 顶部有注释示例）。

也可以只跑一条命令（会询问地址与端口，镜像拉取失败时自动回退为本地构建）：

```sh
curl -fsSL https://raw.githubusercontent.com/baizi51676-source/neko_console/main/install.sh | sh
```

### 方式二：docker run

```sh
docker run -d --name neko-console --restart unless-stopped \
  -p 6186:6186 \
  -e ASTRBOT_BASE=http://192.168.1.10:6185 \
  -e NEKO_PASSWORD=你的侧车口令 \
  -v neko-data:/data \
  ghcr.io/baizi51676-source/neko_console:latest
```

镜像由 GitHub Actions 在推送 tag 时自动构建并发布到 GHCR（linux/amd64 + linux/arm64），无需任何额外凭据。

### 方式三：仅静态文件（功能受限）

`dist/` 可以直接交给 Nginx / Caddy 托管，但**外观页保存主题与壁纸、对话页数据、插件 zip 上传**依赖侧车，只部署静态文件时这些功能不可用（不推荐）。若确实要这么做，反代要求：

1. `/api/*` 反向代理到 AstrBot 的 WebUI（默认 `http://127.0.0.1:6185`）；
2. 前端与 API 必须**同源**，否则登录 Cookie / `Authorization` 不会生效；
3. 若 AstrBot 下发的 JWT Cookie 带 `Secure` 属性而你在 HTTP 下访问，需要在代理层去掉该属性（否则浏览器会丢弃它，表现为“登录成功但立刻掉线”）。

登录使用 AstrBot 控制台账号。

### 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `ASTRBOT_BASE` | `http://astrbot:6185` | AstrBot WebUI 地址（跨机时写宿主机 IP） |
| `PORT` | `6186` | 容器内监听端口（compose 用 `NEKO_PORT` 映射到宿主机） |
| `NEKO_PASSWORD` | 空 | 侧车访问口令，设置后首次访问需输入 |
| `DATA_DIR` | 镜像内 `/data` | 主题、壁纸等持久化目录（compose 默认挂到 `./data`） |
| `NEKO_MAX_PROXY_MB` | `6` | 上游超大 JSON 的代理上限，`0` = 不限制 |
| `NEKO_STRIP_COOKIE_SECURE` | `1` | 去掉上游 Cookie 的 `Secure` 属性 |
| `NEKO_VERBOSE` | `1` | 输出访问日志 |

### 常见问题

- **登录成功又立刻掉线**：Cookie `Secure` 问题（HTTP 访问时）。侧车默认已剥离；自建反代需要自己处理。
- **外观页提示保存失败 / 对话页没有数据**：说明只部署了静态文件，缺少侧车。
- **连不上 AstrBot**：容器内的 `127.0.0.1` 指容器自己，请填宿主机的局域网 IP，或把两个容器加入同一 docker 网络。

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