/**
 * Single source of truth for the sidebar navigation.
 *
 * The shell (app.tsx) renders this list; the appearance page lists the same
 * items so the user can hide them. Keeping one list matters: the appearance
 * page used to carry its own copy and silently drifted (it was missing 设置 and
 * had 配置文件 in the wrong group).
 */
import {
  Activity,
  Archive,
  BarChart3,
  BookOpen,
  Clock,
  Cpu,
  Database,
  Download,
  Info,
  LayoutDashboard,
  ListTree,
  Palette,
  Plug,
  Radio,
  Server,
  Settings2,
  SlidersHorizontal,
  Terminal,
  Users,
  Waypoints,
  Workflow,
} from 'lucide-react';

export type PageId =
  | 'dashboard'
  | 'platforms'
  | 'providers'
  | 'sources'
  | 'personas'
  | 'knowledge'
  | 'skills'
  | 'subagents'
  | 'cron'
  | 'rules'
  | 'plugins'
  | 'market'
  | 'mcp'
  | 'handlers'
  | 'stats'
  | 'conversations'
  | 'logs'
  | 'trace'
  | 'config'
  | 'backups'
  | 'updates'
  | 'appearance'
  | 'about'
  | 'settings';

export interface NavItem {
  id: PageId;
  label: string;
  icon: typeof LayoutDashboard;
}

export const NAV: { group: string; items: NavItem[] }[] = [
  { group: '总览', items: [{ id: 'dashboard', label: '仪表盘', icon: LayoutDashboard }] },
  {
    group: '接入',
    items: [
      { id: 'platforms', label: '机器人', icon: Radio },
      { id: 'providers', label: '模型提供商', icon: Cpu },
      { id: 'config', label: '配置文件', icon: Settings2 },
    ],
  },
  {
    group: '智能',
    items: [
      { id: 'personas', label: '人格', icon: Users },
      { id: 'knowledge', label: '知识库', icon: Database },
      { id: 'skills', label: '技能', icon: BookOpen },
      { id: 'subagents', label: '子代理', icon: Workflow },
      { id: 'cron', label: '未来任务', icon: Clock },
      { id: 'rules', label: '自定义规则', icon: SlidersHorizontal },
    ],
  },
  {
    group: '扩展',
    items: [
      { id: 'plugins', label: '插件', icon: Plug },
      { id: 'market', label: '插件市场', icon: Download },
      { id: 'mcp', label: 'MCP 服务', icon: Server },
      { id: 'handlers', label: '管理行为', icon: ListTree },
    ],
  },
  {
    group: '数据',
    items: [
      { id: 'stats', label: '统计', icon: BarChart3 },
      { id: 'conversations', label: '对话', icon: Activity },
      { id: 'logs', label: '日志', icon: Terminal },
      { id: 'trace', label: '追踪', icon: Waypoints },
    ],
  },
  {
    group: '系统',
    items: [
      { id: 'backups', label: '备份', icon: Archive },
      { id: 'updates', label: '更新', icon: Download },
      { id: 'appearance', label: '外观', icon: Palette },
      { id: 'settings', label: '设置', icon: Settings2 },
      { id: 'about', label: '关于', icon: Info },
    ],
  },
];

/** Flat list of every navigation item. */
export const NAV_ITEMS: NavItem[] = NAV.flatMap((group) => group.items);
