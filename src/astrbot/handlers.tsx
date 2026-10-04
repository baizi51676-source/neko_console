/**
 * Behaviour management page (\u7ba1\u7406\u884c\u4e3a) \u2014 what the bot can actually do.
 *
 * Both lists are grouped by the plugin that provides them:
 *   - tools    (LLM tools, grouped via each plugin's `components[type=llm_tool]`)
 *   - commands (grouped via the `plugin_display_name` returned by /commands)
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ListTree,
  Plug,
  RefreshCw,
  Search,
  Terminal,
  Wrench,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toArray } from './api';
import { commands as commandsApi, plugins as pluginsApi, tools as toolsApi, type Json } from './endpoints';
import { useApp } from './state';

/** Tool -> plugin label; kept at module scope so switching pages does not
 * re-fetch every plugin detail again (that is ~11 requests per visit). */
let TOOL_OWNER_CACHE: Record<string, string> | null = null;

const card = 'rounded-xl border border-border/60 bg-card';
const btn =
  'inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50';
const inputClass =
  'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30';
const mono = 'font-mono text-[11px]';

function str(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

interface Group<T> {
  key: string;
  label: string;
  sub?: string;
  items: T[];
}

function groupBy<T>(items: T[], keyOf: (item: T) => string, labelOf: (item: T) => string): Group<T>[] {
  const map = new Map<string, Group<T>>();
  for (const item of items) {
    const key = keyOf(item) || '__other__';
    const bucket = map.get(key) || { key, label: labelOf(item) || key, items: [] };
    bucket.items.push(item);
    map.set(key, bucket);
  }
  return [...map.values()].sort((a, b) => {
    if (a.key === '__other__') return 1;
    if (b.key === '__other__') return -1;
    return b.items.length - a.items.length;
  });
}

export function HandlersPage() {
  const { notify } = useApp();
  const [tab, setTab] = useState<'tools' | 'commands'>('tools');
  const [tools, setTools] = useState<Json[]>([]);
  const [commands, setCommands] = useState<Json[]>([]);
  const [conflicts, setConflicts] = useState<Json[]>([]);
  const [toolOwner, setToolOwner] = useState<Record<string, string>>({});
  const [ownerLoading, setOwnerLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [toolPayload, commandPayload, conflictPayload] = await Promise.all([
        toolsApi.list().catch(() => []),
        commandsApi.list().catch(() => ({}) as Json),
        commandsApi.conflicts().catch(() => []),
      ]);
      setTools(toArray<Json>(toolPayload));
      setCommands(toArray<Json>((commandPayload as Json).items ?? commandPayload));
      setConflicts(toArray<Json>(conflictPayload));
    } catch (e) {
      setError(e instanceof Error ? e.message : '读取失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /* map every llm tool to the plugin that registered it (lazy, only on the tools tab) */
  useEffect(() => {
    if (TOOL_OWNER_CACHE) {
      setToolOwner(TOOL_OWNER_CACHE);
      return;
    }
    const unmapped = tools.some((tool) => !toolOwner[str(tool.name ?? tool.id)]);
    if (tab !== 'tools' || ownerLoading || !unmapped) return;
    setOwnerLoading(true);
    (async () => {
      try {
        const list = toArray<Json>(await pluginsApi.list());
        const details = await Promise.all(
          list.map(async (plugin) => {
            const id = str(plugin.name);
            try {
              const detail = (await pluginsApi.detail(id)) as Json;
              return { id, label: str(plugin.display_name || id), components: toArray<Json>(detail.components) };
            } catch {
              return { id, label: str(plugin.display_name || id), components: [] };
            }
          }),
        );
        const map: Record<string, string> = {};
        for (const entry of details) {
          for (const component of entry.components) {
            if (str(component.type) !== 'llm_tool') continue;
            const name = str(component.handler_name || component.name);
            if (name) map[name] = entry.label;
          }
        }
        // Fallback: several plugins never list their tools in `components`,
        // so match the tool name against the plugin's short name instead.
        for (const tool of tools) {
          const name = str(tool.name ?? tool.id);
          if (!name || map[name]) continue;
          const lower = name.toLowerCase();
          for (const entry of details) {
            const short = entry.id.replace(/^astrbot_plugin_/i, '').toLowerCase();
            if (short.length >= 4 && lower.startsWith(short)) {
              map[name] = entry.label;
              break;
            }
          }
        }
        TOOL_OWNER_CACHE = map;
        setToolOwner(map);
      } catch {
        setToolOwner({});
      } finally {
        setOwnerLoading(false);
      }
    })();
  }, [tab, toolOwner, ownerLoading, tools]);

  const needle = search.trim().toLowerCase();

  const filteredTools = useMemo(() => {
    if (!needle) return tools;
    return tools.filter((tool) =>
      [tool.name, tool.description].map((value) => str(value).toLowerCase()).some((value) => value.includes(needle)),
    );
  }, [tools, needle]);

  const filteredCommands = useMemo(() => {
    if (!needle) return commands;
    return commands.filter((command) =>
      [command.effective_command, command.original_command, command.description, command.plugin_display_name, str((command.aliases as string[])?.join(' '))]
        .map((value) => str(value).toLowerCase())
        .some((value) => value.includes(needle)),
    );
  }, [commands, needle]);

  const toolGroups = useMemo(
    () =>
      groupBy<Json>(
        filteredTools,
        (tool) => toolOwner[str(tool.name ?? tool.id)] || '__other__',
        (tool) => {
          const owner = toolOwner[str(tool.name ?? tool.id)];
          if (!owner) return '内置能力（AstrBot 核心）';
          if (owner === 'astrbot') return '内置工具（AstrBot 自带）';
          return owner;
        },
      ),
    [filteredTools, toolOwner],
  );

  const commandGroups = useMemo(
    () =>
      groupBy<Json>(
        filteredCommands,
        (command) => str(command.plugin_display_name || command.plugin) || '__other__',
        (command) => str(command.plugin_display_name || command.plugin) || '内置指令（AstrBot 自带）',
      ),
    [filteredCommands],
  );

  const toggleTool = async (tool: Json) => {
    const id = str(tool.name ?? tool.id);
    const next = !(tool.enabled !== false);
    setBusy(`tool:${id}`);
    try {
      await toolsApi.setEnabled(id, next);
      setTools((prev) => prev.map((row) => (str(row.name ?? row.id) === id ? { ...row, enabled: next } : row)));
      notify(next ? `已启用 ${id}` : `已禁用 ${id}`, 'ok');
    } catch (e) {
      notify(e instanceof Error ? e.message : '更新失败', 'error');
    } finally {
      setBusy('');
    }
  };

  const setToolPermission = async (tool: Json, permission: string) => {
    const id = str(tool.name ?? tool.id);
    setBusy(`perm:${id}`);
    try {
      await toolsApi.setPermission(id, { permission });
      setTools((prev) => prev.map((row) => (str(row.name ?? row.id) === id ? { ...row, permission } : row)));
      notify('权限已更新', 'ok');
    } catch (e) {
      notify(e instanceof Error ? e.message : '权限更新失败', 'error');
    } finally {
      setBusy('');
    }
  };

  const toggleCommand = async (command: Json) => {
    const id = str(command.handler_full_name);
    const next = !(command.enabled !== false);
    setBusy(`cmd:${id}`);
    try {
      await commandsApi.update(id, { enabled: next });
      setCommands((prev) => prev.map((row) => (str(row.handler_full_name) === id ? { ...row, enabled: next } : row)));
      notify(next ? `已启用 /${str(command.effective_command)}` : `已禁用 /${str(command.effective_command)}`, 'ok');
    } catch (e) {
      notify(e instanceof Error ? e.message : '更新失败', 'error');
    } finally {
      setBusy('');
    }
  };

  const setCommandPermission = async (command: Json, permission: string) => {
    const id = str(command.handler_full_name);
    setBusy(`cmdperm:${id}`);
    try {
      await commandsApi.update(id, { permission_group: permission });
      setCommands((prev) => prev.map((row) => (str(row.handler_full_name) === id ? { ...row, permission } : row)));
      notify('权限已更新', 'ok');
    } catch (e) {
      notify(e instanceof Error ? e.message : '权限更新失败', 'error');
    } finally {
      setBusy('');
    }
  };

  const groupHeader = (key: string, label: string, count: number) => {
    const isCollapsed = Boolean(collapsed[key]);
    return (
      <button
        type="button"
        onClick={() => setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }))}
        className="flex w-full items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-left transition-colors hover:bg-accent/50"
      >
        {isCollapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        <Plug className="size-3.5 text-muted-foreground" />
        <span className="text-[12.5px] font-semibold">{label}</span>
        <span className="rounded bg-card px-1.5 py-[1px] text-[10px] text-muted-foreground">{count}</span>
      </button>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <ListTree className="size-4 text-primary" /> 管理行为
          </h1>
          <p className="text-xs text-muted-foreground">
            机器人「能做什么」：交给模型的工具，以及用户可用的指令 —— 按提供它们的插件分组展示，可单独控制启用状态与可用范围。
          </p>
        </div>
        <div className="flex items-center gap-2">
          {tab === 'tools' && ownerLoading ? <span className="text-[11px] text-muted-foreground">正在归类插件…</span> : null}
          <button className={btn} onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} /> 刷新
          </button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
          {([
            { id: 'tools', label: '工具', count: tools.length },
            { id: 'commands', label: '指令', count: commands.length },
          ] as const).map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={cn(
                'inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors',
                tab === item.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent',
              )}
            >
              {item.label}
              <span className={cn('rounded px-1 text-[10px]', tab === item.id ? 'bg-primary-foreground/15' : 'bg-muted')}>
                {item.count}
              </span>
            </button>
          ))}
        </div>
        <span className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            className={cn(inputClass, 'h-8 w-56 pl-8 text-xs')}
            placeholder={tab === 'tools' ? '搜索工具名称或说明' : '搜索指令、别名或插件'}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </span>
        <span className="text-[11px] text-muted-foreground">
          {tab === 'tools' ? `${toolGroups.length} 个插件提供工具` : `${commandGroups.length} 个插件提供指令`}
        </span>
      </div>

      {error ? (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {conflicts.length > 0 ? (
        <div className="flex items-start gap-2 rounded-xl border neko-warn-border bg-amber-500/5 p-3 text-xs neko-warn">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div className="space-y-1">
            <div className="font-medium">发现 {conflicts.length} 个指令冲突</div>
            <div className="neko-warn">多个插件注册了同名指令，实际生效的是其中一个。</div>
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className={cn(card, 'grid place-items-center p-10 text-xs text-muted-foreground')}>
          <span className="flex items-center gap-2">
            <RefreshCw className="size-4 animate-spin" /> 加载中…
          </span>
        </div>
      ) : tab === 'tools' ? (
        toolGroups.length === 0 ? (
          <div className={cn(card, 'p-8 text-center text-xs text-muted-foreground')}>没有匹配的工具。</div>
        ) : (
          <div className="flex flex-col gap-3">
            {toolGroups.map((group) => (
              <section key={group.key} className="overflow-hidden rounded-xl border border-border/60">
                {groupHeader(`tool:${group.key}`, group.label, group.items.length)}
                {collapsed[`tool:${group.key}`] ? null : (
                  <div className="flex flex-col">
                    {group.items.map((tool) => {
                      const id = str(tool.name ?? tool.id);
                      const enabled = tool.enabled !== false;
                      return (
                        <div key={id} className="flex flex-wrap items-center gap-3 border-b border-border/50 px-3 py-2.5 last:border-b-0">
                          <div className="grid size-7 shrink-0 place-items-center rounded-lg border border-border bg-muted text-muted-foreground">
                            <Wrench className="size-3" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className={cn('truncate text-[12px] font-medium', mono)}>{id}</div>
                            <div className="line-clamp-2 text-[11px] text-muted-foreground">{str(tool.description)}</div>
                          </div>
                          <select
                            className={cn(inputClass, 'h-8 w-auto min-w-[104px] py-0 text-xs')}
                            value={str(tool.permission) || 'everyone'}
                            onChange={(event) => void setToolPermission(tool, event.target.value)}
                            disabled={busy === `perm:${id}`}
                          >
                            <option value="everyone">所有用户</option>
                            <option value="admin">仅管理员</option>
                          </select>
                          <button className={btn} onClick={() => void toggleTool(tool)} disabled={busy === `tool:${id}`}>
                            {enabled ? '禁用' : '启用'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            ))}
          </div>
        )
      ) : commandGroups.length === 0 ? (
        <div className={cn(card, 'p-8 text-center text-xs text-muted-foreground')}>没有匹配的指令。</div>
      ) : (
        <div className="flex flex-col gap-3">
          {commandGroups.map((group) => (
            <section key={group.key} className="overflow-hidden rounded-xl border border-border/60">
              {groupHeader(`cmd:${group.key}`, group.label, group.items.length)}
              {collapsed[`cmd:${group.key}`] ? null : (
                <div className="flex flex-col">
                  {group.items.map((command) => {
                    const id = str(command.handler_full_name);
                    const enabled = command.enabled !== false;
                    const aliases = Array.isArray(command.aliases) ? (command.aliases as string[]) : [];
                    return (
                      <div key={id} className="flex flex-wrap items-center gap-3 border-b border-border/50 px-3 py-2.5 last:border-b-0">
                        <div className="grid size-7 shrink-0 place-items-center rounded-lg border border-border bg-muted text-muted-foreground">
                          <Terminal className="size-3" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className={cn('text-[12px] font-medium', mono)}>/{str(command.effective_command || command.original_command)}</span>
                            {aliases.length ? <span className={cn(mono, 'text-muted-foreground')}>别名：{aliases.map((alias) => `/${alias}`).join(' ')}</span> : null}
                            {command.has_conflict ? (
                              <span className="rounded border neko-warn-chip px-1.5 py-[1px] text-[10px] neko-warn">冲突</span>
                            ) : null}
                            {command.plugin_activated === false ? (
                              <span className="rounded border border-border bg-muted px-1.5 py-[1px] text-[10px] text-muted-foreground">插件未启用</span>
                            ) : null}
                          </div>
                          <div className="line-clamp-1 text-[11px] text-muted-foreground">{str(command.description) || '无描述'}</div>
                        </div>
                        <select
                          className={cn(inputClass, 'h-8 w-auto min-w-[104px] py-0 text-xs')}
                          value={str(command.permission) || 'everyone'}
                          onChange={(event) => void setCommandPermission(command, event.target.value)}
                          disabled={busy === `cmdperm:${id}`}
                        >
                          <option value="everyone">所有用户</option>
                          <option value="admin">仅管理员</option>
                        </select>
                        <button className={btn} onClick={() => void toggleCommand(command)} disabled={busy === `cmd:${id}`}>
                          {enabled ? '禁用' : '启用'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
