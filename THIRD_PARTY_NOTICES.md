# 第三方声明 / Third-party notices

本控制台（Neko Console）**不是 AstrBot 官方产物**，其中也**不包含任何 SnowLuma 代码**。
它是一个独立实现，通过 AstrBot 的 REST API（需登录凭据）与一个**未经修改**的
AstrBot 实例通信。

## 使用的第三方软件（均为宽松许可）

| 组件 | 许可 |
|---|---|
| React / React DOM | MIT |
| Vite / @vitejs/plugin-react | MIT |
| Tailwind CSS / @tailwindcss/vite | MIT |
| clsx | MIT |
| tailwind-merge | MIT |
| lucide-react（图标） | ISC |
| motion（动画） | MIT |
| TypeScript | Apache-2.0 |

各组件的版权归其作者所有，完整许可文本随 npm 包分发（`node_modules/<pkg>/LICENSE`）。

## 与 AstrBot 的关系

- AstrBot：**AGPL-3.0**（https://github.com/AstrBotDevs/AstrBot）。
- 本控制台不包含、不修改 AstrBot 的**源代码**，仅通过其 REST API 交互。
- ⚠️ 唯一例外：`src/astrbot/config-i18n.json` 取自 AstrBot 仓库的
  `dashboard/src/i18n/locales/zh-CN/features/config-metadata.json`（v4.28.2），
  内容未作修改，仅用于把配置字段映射成中文说明。**该文件仍受 AGPL-3.0 约束**，
  再分发本项目时请保留此声明；如需完全规避，可删除该文件（界面会回退为显示
  字段路径）或替换为自行编写的说明表。
- 若你对 AstrBot 本身打了补丁并对网络用户提供服务，AGPL 第 13 条要求向这些
  用户提供修改后的源码。
- "AstrBot" 名称与标识归其作者所有；本项目仅作描述性使用，不暗示官方身份。

## 历史说明

本控制台的早期版本曾基于 SnowLuma 的界面源码（SnowLuma Source-Available
Non-Commercial License）。该依赖已**完全移除**：当前版本的界面层（布局、组件、
样式 token）均为独立实现，不再包含其任何代码或样式副本。