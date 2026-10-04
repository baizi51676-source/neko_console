import { useCallback, useEffect, useMemo, useState } from 'react';
import { ToggleSwitch } from '@/components/ui/toggle-switch';
import {
  Activity,
  Clock,
  Cpu,
  Database,
  Download,
  Info,
  LayoutDashboard,
  Palette,
  Plug,
  Radio,
  RefreshCw,
  Terminal,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmptyState } from './empty-state';

import { api, toArray } from './api';
import { logs as logsApi } from './endpoints';
import { useApp, useUptime } from './state';

const card = 'rounded-xl border border-border/60 bg-card';
const btn =
  'inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50';
const inputClass =
  'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30';

/* ------------------------------------------------------------------ */
/* overview                                                            */
/* ------------------------------------------------------------------ */

interface StatCard {
  label: string;
  value: string;
  hint: string;
  icon: typeof LayoutDashboard;
  target?: string;
}

export function OverviewPage({ onNavigate }: { onNavigate: (id: string) => void }) {
  const app = useApp();
  const uptime = useUptime();

  const storageText = useMemo(() => {
    const bytes = Number((app.storageValue?.total_size ?? app.storageValue?.size ?? app.storageValue?.used) as number);
    if (!Number.isFinite(bytes) || bytes <= 0) return '—';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = bytes;
    let index = 0;
    while (value >= 1024 && index < units.length - 1) {
      value /= 1024;
      index += 1;
    }
    return `${value >= 10 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`;
  }, [app.storageValue]);

  const tokenText = useMemo(() => {
    let sum: number | null = null;
    const walk = (node: unknown) => {
      if (!node || typeof node !== 'object') return;
      for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        if (typeof value === 'number' && /token/i.test(key) && !/limit|max|price/i.test(key)) sum = (sum || 0) + value;
        else if (value && typeof value === 'object') walk(value);
      }
    };
    walk(app.providerTokens);
    return sum === null ? '—' : (sum as number).toLocaleString('zh-CN');
  }, [app.providerTokens]);

  const [convoTotal, setConvoTotal] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    api
      .conversations(1, 1)
      .then((page) => {
        if (alive) setConvoTotal(page.total);
      })
      .catch(() => {
        if (alive) setConvoTotal(null);
      });
    return () => {
      alive = false;
    };
  }, []);

  const enabled = app.plugins.filter((p) => p.activated).length;
  const counts = {
    providers: (app.resources.providers || []).length,
    platforms: (app.resources.platforms || []).length,
    sessions: (app.resources.sessions || []).length,
  };

  const cards: StatCard[] = [
    { label: '核心版本', value: app.version || '—', hint: 'AstrBot 核心', icon: Info },
    { label: '运行时长', value: uptime, hint: '进程启动至今', icon: Clock },
    { label: '插件', value: `${enabled} / ${app.plugins.length}`, hint: '已启用 / 已安装', icon: Plug, target: 'plugins' },
    { label: '模型提供商', value: String(counts.providers), hint: '已配置', icon: Cpu, target: 'providers' },
    { label: '机器人', value: String(counts.platforms), hint: '消息平台连接', icon: Radio, target: 'platforms' },
    { label: '对话', value: convoTotal === null ? '—' : String(convoTotal), hint: '历史对话', icon: Activity, target: 'conversations' },
    { label: '存储占用', value: storageText, hint: '数据目录', icon: Database },
    { label: 'Token 用量', value: tokenText, hint: '按 provider 统计', icon: Zap },
  ];

  const quick: { label: string; icon: typeof LayoutDashboard; target: string }[] = [
    { label: '插件管理', icon: Plug, target: 'plugins' },
    { label: '插件市场', icon: Download, target: 'market' },
    { label: '运行日志', icon: Terminal, target: 'logs' },
    { label: '外观设置', icon: Palette, target: 'appearance' },
  ];

  return (
    <>
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(206px,1fr))]">
        {cards.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.label}
              type="button"
              onClick={() => item.target && onNavigate(item.target)}
              className={cn(
                card,
                'flex flex-col gap-2 p-4 text-left transition-[transform,box-shadow] duration-200',
                item.target && 'hover:-translate-y-px hover:shadow-md',
              )}
              style={{ transitionTimingFunction: 'cubic-bezier(0.22,1,0.36,1)' }}
            >
              <div className="flex items-center justify-between">
                <span className="text-[12.5px] text-muted-foreground">{item.label}</span>
                <span className="grid size-[26px] place-items-center rounded-md bg-accent text-accent-foreground">
                  <Icon className="size-4" />
                </span>
              </div>
              <div className="text-[22px] font-semibold leading-tight tracking-tight">{item.value}</div>
              <div className="text-[11.5px] text-muted-foreground">{item.hint}</div>
            </button>
          );
        })}
      </div>

      <div className={cn(card, 'p-4')}>
        <div className="mb-3 text-[13.5px] font-semibold">快捷入口</div>
        <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]">
          {quick.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                type="button"
                onClick={() => onNavigate(item.target)}
                className="flex items-center gap-2.5 rounded-lg border border-border bg-card/60 px-3 py-2.5 text-[13px] transition-colors hover:bg-accent/60"
              >
                <Icon className="size-4 text-muted-foreground" />
                {item.label}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* generic resource page                                               */
/* ------------------------------------------------------------------ */

/** Friendly per-resource copy when a list is genuinely empty. */
const EMPTY_HINTS: Record<string, string> = {
  sessions: '还没有对话记录。当机器人开始聊天后，对话会出现在这里。',
  knowledge: '还没有知识库。可在原版控制台创建后回到这里查看。',
  cron: '还没有未来任务。',
  backups: '还没有备份文件。',
  providers: '还没有配置模型提供商。',
  platforms: '还没有配置机器人（消息平台实例）。',
  personas: '还没有人格配置。',
  skills: '没有可用技能。',
  sources: '没有 Provider 来源。',
};

/* ------------------------------------------------------------------ */
/* logs                                                                */
/* ------------------------------------------------------------------ */

export function LogsPage() {
  const [lines, setLines] = useState<string[]>([]);
  const [auto, setAuto] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const payload: unknown = await logsApi.history();
      const data = typeof payload === 'string' ? payload : (payload as Record<string, unknown>);
      let rows: string[] = [];
      if (typeof data === 'string') {
        rows = data.split('\n');
      } else {
        const inner = (data?.logs ?? data?.content ?? data?.text ?? data?.lines) as unknown;
        if (Array.isArray(inner)) {
          rows = inner.map((entry) => {
            if (typeof entry === 'string') return entry;
            const rec = entry as Record<string, unknown>;
            const time = String(rec.time ?? rec.timestamp ?? '').slice(0, 23);
            const level = String(rec.level ?? '');
            const category = String(rec.category ?? '');
            const body = String(rec.data ?? rec.message ?? rec.text ?? '');
            return [time, level ? `[${level}]` : '', category, body].filter(Boolean).join(' ');
          });
        } else {
          rows = String(inner ?? '').split('\n');
        }
      }
      setLines(rows.filter((line) => line.trim().length).slice(-400));
    } catch (err) {
      setError(err instanceof Error ? err.message : '日志读取失败');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!auto) return;
    const timer = setInterval(() => void load(), 10000);
    return () => clearInterval(timer);
  }, [auto, load]);

  return (
    <div className={card}>
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <Terminal className="size-4 text-muted-foreground" />
        <span className="text-[13.5px] font-semibold">运行日志</span>
        <span className="rounded-full border border-border bg-muted px-2 py-px text-[11.5px] text-muted-foreground">{lines.length} 行</span>
        <div className="flex-1" />
        <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <ToggleSwitch value={auto} onChange={setAuto} ariaLabel="自动刷新" />
          <span>自动刷新</span>
        </div>
        <button type="button" className={btn} disabled={busy} onClick={() => void load()}>
          <RefreshCw className={cn('size-3.5', busy && 'animate-spin')} />
        </button>
      </div>
      <div className="max-h-[62vh] overflow-auto p-3">
        {error ? <p className="p-2 text-[12.5px] text-destructive">{error}</p> : null}
        {!error && !lines.length ? <p className="p-2 text-[12.5px] text-muted-foreground">暂无日志。</p> : null}
        {lines.map((line, index) => (
          <div
            key={index}
            className={cn(
              'whitespace-pre-wrap break-words px-1 py-px font-mono text-[11.5px] leading-relaxed',
              /ERRO|ERROR|Traceback/.test(line) ? 'text-destructive' : /WARN/.test(line) ? 'text-amber-600 dark:text-amber-400' : '',
            )}
            style={{ animation: 'log-row-in 0.2s cubic-bezier(0.16,1,0.3,1)' }}
          >
            {line}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* about                                                               */
/* ------------------------------------------------------------------ */

export function AboutPage() {
  const app = useApp();
  const enabled = app.plugins.filter((p) => p.activated).length;

  return (
    <div className="grid gap-3.5 md:grid-cols-2">
      <div className={card}>
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Info className="size-4 text-muted-foreground" />
          <span className="text-[13.5px] font-semibold">关于</span>
        </div>
        <dl className="grid grid-cols-[132px_1fr] gap-x-3 gap-y-2 p-4 text-[12.5px]">
          {[
            ['AstrBot 版本', app.version || '—'],
            ['账号', String(app.account?.username || app.account?.name || '—')],
            ['插件', `${enabled} / ${app.plugins.length}`],
            ['连接方式', 'Bearer / Cookie'],
            ['控制台', 'Neko Console (React)'],
          ].map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="break-words">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className={card}>
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Database className="size-4 text-muted-foreground" />
          <span className="text-[13.5px] font-semibold">数据概览</span>
        </div>
        <dl className="grid grid-cols-[132px_1fr] gap-x-3 gap-y-2 p-4 text-[12.5px]">
          {[
            ['模型提供商', String((app.resources.providers || []).length)],
            ['机器人', String((app.resources.platforms || []).length)],
            ['人格', String((app.resources.personas || []).length)],
            ['技能', String((app.resources.skills || []).length)],
            ['知识库', String((app.resources.knowledge || []).length)],
            ['聊天会话', String((app.resources.sessions || []).length)],
            ['未来任务', String((app.resources.cron || []).length)],
            ['备份', String((app.resources.backups || []).length)],
          ].map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

interface ConversationRow {
  cid: string;
  title?: string | null;
  platform?: string | null;
  user_id?: string | null;
  updated_at?: number | null;
  created_at?: number | null;
  message_count?: number | null;
  token_usage?: number | null;
  history_bytes?: number | null;
}

function humanBytes(value: number | null | undefined): string {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = n;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size >= 10 || index === 0 ? Math.round(size) : size.toFixed(1)} ${units[index]}`;
}

function fmtDateTime(value: number | null | undefined): string {
  if (!value) return '—';
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '—';
  const date = new Date(n < 1e12 ? n * 1000 : n);
  if (Number.isNaN(date.getTime())) return '—';
  const pad = (input: number) => String(input).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function conversationKind(userId?: string | null): string {
  if (!userId) return '—';
  if (userId.includes('GroupMessage')) return '群聊';
  if (userId.includes('FriendMessage')) return '私聊';
  const parts = userId.split(':');
  return parts.length > 1 ? parts[1] : '会话';
}

function conversationPeer(userId?: string | null): string {
  if (!userId) return '';
  const parts = userId.split(':');
  return parts.length > 2 ? parts[2] : userId;
}

/** Conversation history (AstrBot's 对话 page) — served stripped + paginated by the sidecar. */
export function ConversationsPage() {
  const { notify } = useApp();
  const [rows, setRows] = useState<ConversationRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [active, setActive] = useState<ConversationRow | null>(null);
  const [messages, setMessages] = useState<{ role?: string; time?: string | number | null; content?: string }[]>([]);
  const [msgBusy, setMsgBusy] = useState(false);
  const [msgError, setMsgError] = useState('');
  const [msgTruncated, setMsgTruncated] = useState(false);
  const pageSize = 20;

  const load = useCallback(
    async (nextPage: number, nextQuery: string) => {
      setBusy(true);
      setError('');
      try {
        const payload = await api.conversations(nextPage, pageSize, nextQuery);
        setRows(payload.items as ConversationRow[]);
        setTotal(payload.total);
        setPage(nextPage);
      } catch (err) {
        const message = err instanceof Error ? err.message : '对话列表读取失败';
        setError(message);
        notify(message, 'error');
      } finally {
        setBusy(false);
      }
    },
    [notify],
  );

  useEffect(() => {
    void load(1, '');
  }, [load]);

  const openConversation = async (row: ConversationRow) => {
    setActive(row);
    setMessages([]);
    setMsgError('');
    setMsgTruncated(false);
    setMsgBusy(true);
    try {
      const payload = await api.conversationMessages(row.cid);
      setMessages(payload.items);
      setMsgTruncated(Boolean(payload.truncated));
    } catch (err) {
      setMsgError(err instanceof Error ? err.message : '消息读取失败');
    } finally {
      setMsgBusy(false);
    }
  };

  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <>
      <div className={card}>
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
          <Activity className="size-4 text-muted-foreground" />
          <span className="text-[13.5px] font-semibold">对话记录</span>
          <span className="rounded-full border border-border bg-muted px-2 py-px text-[11.5px] text-muted-foreground">
            共 {total} 条
          </span>
          <div className="flex-1" />
          <input
            className={cn(inputClass, 'h-8 w-[200px] text-[13px]')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void load(1, query);
            }}
            placeholder="搜索标题 / 用户 / UMO…"
          />
          <button type="button" className={btn} disabled={busy} onClick={() => void load(1, query)}>
            <RefreshCw className={cn('size-3.5', busy && 'animate-spin')} />
          </button>
        </div>

        {busy && !rows.length ? (
          <div className="flex flex-col gap-2 p-4">
            <div className="h-9 animate-pulse rounded-md bg-muted" />
            <div className="h-9 animate-pulse rounded-md bg-muted" />
            <div className="h-9 animate-pulse rounded-md bg-muted" />
            <p className="text-[11.5px] text-muted-foreground">首次加载需要解析完整对话历史，耗时较长，请稍候…</p>
          </div>
        ) : error ? (
          <div className="p-4">
            <EmptyState icon={Activity} title="对话列表读取失败" description={error} />
          </div>
        ) : !rows.length ? (
          <div className="p-4">
            <EmptyState icon={Activity} title="暂无数据" description={EMPTY_HINTS.sessions || '还没有对话记录。'} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border text-left text-[11.5px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 font-semibold">对话</th>
                  <th className="px-4 py-2.5 font-semibold">类型</th>
                  <th className="px-4 py-2.5 font-semibold">规模</th>
                  <th className="px-4 py-2.5 font-semibold">最后活动</th>
                  <th className="px-4 py-2.5 text-right font-semibold">操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.cid} className="border-b border-border transition-colors last:border-b-0 hover:bg-accent/35">
                    <td className="px-4 py-3">
                      <div className="font-medium">{row.title || '无标题对话'}</div>
                      <div className="mt-0.5 text-[11.5px] text-muted-foreground">
                        {row.platform || '—'} · {conversationPeer(row.user_id) || row.cid}
                      </div>
                    </td>
                    <td className="px-4 py-3">{conversationKind(row.user_id)}</td>
                    <td className="px-4 py-3">{row.message_count != null ? row.message_count : humanBytes(row.history_bytes)}</td>
                    <td className="px-4 py-3 text-[11.5px] text-muted-foreground">{fmtDateTime(row.updated_at || row.created_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <button type="button" className={btn} onClick={() => void openConversation(row)}>
                        查看消息
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pages > 1 ? (
          <div className="flex items-center justify-center gap-3 border-t border-border px-4 py-3">
            <button type="button" className={btn} disabled={page <= 1 || busy} onClick={() => void load(page - 1, query)}>
              上一页
            </button>
            <span className="text-[12px] text-muted-foreground">
              {page} / {pages}
            </span>
            <button type="button" className={btn} disabled={page >= pages || busy} onClick={() => void load(page + 1, query)}>
              下一页
            </button>
          </div>
        ) : null}
      </div>

      {active ? (
        <>
          <div className="fixed inset-0 z-[60] bg-background/60 backdrop-blur-sm" onClick={() => setActive(null)} />
          <div className="fixed left-1/2 top-1/2 z-[61] flex max-h-[86vh] w-[calc(100%-2rem)] max-w-[720px] -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-border bg-popover shadow-xl">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <Activity className="size-4" />
              <span className="text-[13.5px] font-semibold">{active.title || '无标题对话'}</span>
              <span className="text-[11.5px] text-muted-foreground">
                {conversationKind(active.user_id)} · {conversationPeer(active.user_id)}
              </span>
              <div className="flex-1" />
              <button type="button" className={btn} onClick={() => setActive(null)}>
                关闭
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {!msgBusy && !msgError && messages.length ? (
                <p className="mb-3 text-[11.5px] text-muted-foreground">
                  共显示 {messages.length} 条{msgTruncated ? '（该对话历史过大，仅提取最近内容）' : ''}
                </p>
              ) : null}
              {msgBusy ? <p className="text-[12.5px] text-muted-foreground">正在读取消息…</p> : null}
              {msgError ? <p className="text-[12.5px] text-destructive">{msgError}</p> : null}
              {!msgBusy && !msgError && !messages.length ? (
                <p className="text-[12.5px] text-muted-foreground">没有读到消息内容。</p>
              ) : null}
              {messages.map((message, index) => (
                <div key={index} className="mb-2 rounded-lg border border-border bg-card/60 px-3 py-2">
                  <div className="mb-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span>{message.role || '消息'}</span>
                    {message.time ? <span>{String(message.time).slice(0, 23)}</span> : null}
                  </div>
                  <div className="whitespace-pre-wrap break-words text-[12.5px] leading-relaxed">{message.content}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}

export { toArray };