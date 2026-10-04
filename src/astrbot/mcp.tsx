/**
 * MCP services page \u2014 MCP servers only.
 *
 * The LLM tool list lives on the \u7ba1\u7406\u884c\u4e3a (Handlers) page: tools are "what the model can do",
 * while MCP servers are just external tool providers that need installing here.
 */
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, Network, Plus, RefreshCw, Server, Trash2, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toArray } from './api';
import { tools as toolsApi, type Json } from './endpoints';
import { useApp } from './state';

const card = 'rounded-xl border border-border/60 bg-card';
const btn =
  'inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50';
const btnPrimary =
  'inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground shadow-xs transition-colors hover:bg-primary/90 disabled:opacity-50';
const inputClass =
  'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30';
const mono = 'font-mono text-[11px]';

function str(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

const SAMPLE_CONFIG = `{
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
  "env": {}
}`;

export function McpPage() {
  const { notify } = useApp();
  const [servers, setServers] = useState<Json[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftConfig, setDraftConfig] = useState(SAMPLE_CONFIG);
  const [editing, setEditing] = useState('');
  const [editConfig, setEditConfig] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const payload = await toolsApi.mcp.list().catch(() => []);
      setServers(toArray<Json>(payload));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'MCP 服务器读取失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const serverNameOf = (server: Json) => str(server.name ?? server.server_name ?? server.id);

  const createServer = async () => {
    const name = draftName.trim();
    if (!name) return notify('请填写 MCP 服务器名称', 'error');
    let config: Json = {};
    try {
      config = draftConfig.trim() ? (JSON.parse(draftConfig) as Json) : {};
    } catch {
      return notify('配置不是合法 JSON', 'error');
    }
    setBusy('create');
    try {
      await toolsApi.mcp.create({ name, config, enabled: true });
      notify('MCP 服务器已添加', 'ok');
      setCreating(false);
      setDraftName('');
      setDraftConfig(SAMPLE_CONFIG);
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : '添加失败', 'error');
    } finally {
      setBusy('');
    }
  };

  const toggleServer = async (server: Json) => {
    const name = serverNameOf(server);
    const next = !(server.enabled !== false && server.active !== false);
    setBusy(`en:${name}`);
    try {
      await toolsApi.mcp.setEnabledByName(name, next);
      setServers((prev) => prev.map((row) => (serverNameOf(row) === name ? { ...row, enabled: next, active: next } : row)));
      notify(next ? '已启用' : '已禁用', 'ok');
    } catch (e) {
      notify(e instanceof Error ? e.message : '状态更新失败', 'error');
    } finally {
      setBusy('');
    }
  };

  const testServer = async (server: Json) => {
    const name = serverNameOf(server);
    setBusy(`test:${name}`);
    try {
      await toolsApi.mcp.testByName(name);
      notify(`连接正常：${name}`, 'ok');
    } catch (e) {
      notify(e instanceof Error ? e.message : `连接失败：${name}`, 'error');
    } finally {
      setBusy('');
    }
  };

  const removeServer = async (server: Json) => {
    const name = serverNameOf(server);
    if (!window.confirm(`确定要删除 MCP 服务器「${name}」吗？`)) return;
    setBusy(`del:${name}`);
    try {
      await toolsApi.mcp.removeByName(name);
      setServers((prev) => prev.filter((row) => serverNameOf(row) !== name));
      notify('已删除', 'ok');
    } catch (e) {
      notify(e instanceof Error ? e.message : '删除失败', 'error');
    } finally {
      setBusy('');
    }
  };

  const saveServerConfig = async (server: Json) => {
    const name = serverNameOf(server);
    let config: Json = {};
    try {
      config = JSON.parse(editConfig) as Json;
    } catch {
      return notify('配置不是合法 JSON', 'error');
    }
    setBusy(`save:${name}`);
    try {
      await toolsApi.mcp.updateByName(name, { config });
      notify('配置已保存', 'ok');
      setEditing('');
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : '保存失败', 'error');
    } finally {
      setBusy('');
    }
  };

  const syncModelScope = async () => {
    setBusy('sync');
    try {
      await toolsApi.mcp.syncModelScope();
      notify('已请求从 ModelScope 同步', 'ok');
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : '同步失败', 'error');
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <Network className="size-4 text-primary" /> MCP 服务
          </h1>
          <p className="text-xs text-muted-foreground">
            MCP（Model Context Protocol）服务器是外部工具的提供方，在这里安装与连接；安装后它提供的工具会出现在「管理行为 → 工具」里。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className={btn} onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} /> 刷新
          </button>
          <button className={btn} onClick={() => void syncModelScope()} disabled={busy === 'sync'}>
            <Zap className="size-3.5" /> ModelScope 同步
          </button>
          <button className={btnPrimary} onClick={() => setCreating((value) => !value)}>
            <Plus className="size-3.5" /> 添加服务器
          </button>
        </div>
      </header>

      {error ? (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {creating ? (
        <section className={cn(card, 'p-4')}>
          <h2 className="text-sm font-semibold">添加 MCP 服务器</h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            支持本地命令（command / args / env）或远程地址（url / transport）；不熟悉时可直接从 ModelScope 同步。
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-[220px_minmax(0,1fr)]">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">名称</label>
              <input className={inputClass} placeholder="例如 filesystem" value={draftName} onChange={(event) => setDraftName(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">配置（JSON）</label>
              <textarea
                className="h-36 w-full rounded-md border border-input bg-transparent p-3 font-mono text-[12px] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30"
                value={draftConfig}
                spellCheck={false}
                onChange={(event) => setDraftConfig(event.target.value)}
              />
            </div>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button className={btn} onClick={() => setCreating(false)}>
              取消
            </button>
            <button className={btnPrimary} onClick={() => void createServer()} disabled={busy === 'create'}>
              {busy === 'create' ? '添加中…' : '添加'}
            </button>
          </div>
        </section>
      ) : null}

      {loading ? (
        <div className={cn(card, 'grid place-items-center p-10 text-xs text-muted-foreground')}>
          <span className="flex items-center gap-2">
            <RefreshCw className="size-4 animate-spin" /> 加载中…
          </span>
        </div>
      ) : servers.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card/40 px-6 py-11 text-center">
          <div className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
            <Server className="size-5" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-medium">还没有 MCP 服务器</h3>
            <p className="text-xs text-muted-foreground">添加一个 MCP 服务器，或从 ModelScope 同步现成的服务。</p>
          </div>
          <button className={btnPrimary} onClick={() => setCreating(true)}>
            <Plus className="size-3.5" /> 添加服务器
          </button>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {servers.map((server) => {
            const name = serverNameOf(server);
            const enabled = server.enabled !== false && server.active !== false;
            const isEditing = editing === name;
            return (
              <article key={name} className={cn(card, 'flex flex-col gap-2.5 p-3.5')}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{name}</div>
                    <div className={cn(mono, 'truncate text-muted-foreground')}>
                      {str(server.command || server.url || server.transport) || '本地命令 / 远程地址'}
                    </div>
                  </div>
                  {enabled ? (
                    <span className="inline-flex items-center gap-1 rounded-full border neko-chip-accent px-2 py-[3px] text-[11px] text-[var(--primary)]">
                      <Check className="size-3" /> 启用
                    </span>
                  ) : (
                    <span className="rounded-full border border-border bg-muted px-2 py-[3px] text-[11px] text-muted-foreground">已禁用</span>
                  )}
                </div>

                {isEditing ? (
                  <>
                    <textarea
                      className="h-32 w-full rounded-md border border-input bg-transparent p-2.5 font-mono text-[12px] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30"
                      value={editConfig}
                      spellCheck={false}
                      onChange={(event) => setEditConfig(event.target.value)}
                    />
                    <div className="flex items-center gap-2">
                      <button className={btnPrimary} onClick={() => void saveServerConfig(server)} disabled={busy === `save:${name}`}>
                        保存
                      </button>
                      <button className={btn} onClick={() => setEditing('')}>
                        取消
                      </button>
                    </div>
                  </>
                ) : (
                  <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-border/60 bg-muted/30 p-2.5 font-mono text-[11px] text-muted-foreground">
                    {JSON.stringify(server, null, 2)}
                  </pre>
                )}

                <div className="mt-auto flex flex-wrap items-center gap-2">
                  <button className={btn} onClick={() => void toggleServer(server)} disabled={busy === `en:${name}`}>
                    {enabled ? '禁用' : '启用'}
                  </button>
                  <button className={btn} onClick={() => void testServer(server)} disabled={busy === `test:${name}`}>
                    <Zap className="size-3.5" /> 测试
                  </button>
                  <button
                    className={btn}
                    onClick={() => {
                      setEditing(name);
                      setEditConfig(JSON.stringify(server.config ?? server, null, 2));
                    }}
                  >
                    编辑
                  </button>
                  <button
                    className={cn(btn, 'ml-auto text-destructive hover:bg-destructive/10 hover:text-destructive')}
                    onClick={() => void removeServer(server)}
                    disabled={busy === `del:${name}`}
                  >
                    <Trash2 className="size-3.5" /> 删除
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
