/**
 * Settings page — runtime information, API keys and maintenance actions.
 *
 * Verified contracts (AstrBot v4.28.2):
 *   GET    /api/v1/system-config          -> { config, metadata, server_utc_time, server_utc_offset_minutes }
 *   GET    /api/v1/system-config/runtime  -> { metadata, config, platform_i18n_translations }
 *   GET    /api/v1/api-keys               -> [ApiKey]
 *   POST   /api/v1/api-keys { name, scopes, expires_in_days }
 *   POST   /api/v1/api-keys/{id}/revoke
 *   DELETE /api/v1/api-keys/{id}
 *   POST   /api/v1/system/restart
 *   GET    /api/v1/stats/start-time | /stats/versions | /stats/storage
 */
import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, Clock, Copy, Database, KeyRound, Plus, Power, RefreshCw, Server, Trash2, UserX,
} from 'lucide-react';
import { apiKeys as keysApi, configProfiles as profilesApi, stats as statsApi, type Json } from './endpoints';
import { useApp } from './state';
import { cn } from '@/lib/utils';

const card = 'rounded-xl border border-border/60 bg-card';
const chip =
  'inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-2.5 py-1 text-xs font-medium transition hover:bg-accent/60 disabled:opacity-50';
const chipPrimary =
  'inline-flex items-center gap-1.5 rounded-lg border border-[var(--primary)] bg-[var(--primary)] px-2.5 py-1 text-xs font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50';
const inputClass =
  'h-9 w-full rounded-lg border border-input bg-background/60 px-3 text-xs outline-none transition-colors placeholder:text-muted-foreground/70 focus-visible:border-[var(--primary)]';

function fmtTime(value: unknown): string {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    if (typeof value === 'string' && value) {
      const ms = Date.parse(value);
      if (Number.isFinite(ms)) return new Date(ms).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
      return value;
    }
    return '—';
  }
  const ms = n > 1e12 ? n : n * 1000;
  return new Date(ms).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

interface ApiKeyRow {
  id?: string;
  key_id?: string;
  name?: string;
  scopes?: string[] | string;
  created_at?: string | number;
  last_used_at?: string | number;
  expires_at?: string | number;
  revoked?: boolean;
  is_revoked?: boolean;
  status?: string;
}

export function SettingsPage({ onNavigate }: { onNavigate?: (id: string) => void }) {
  const { notify } = useApp();
  const [runtime, setRuntime] = useState<Json | null>();
  const [versions, setVersions] = useState<Json | null>();
  const [startTime, setStartTime] = useState<number | null>(null);
  const [storage, setStorage] = useState<Json | null>();
  const [profileCount, setProfileCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');

  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [keyName, setKeyName] = useState('');
  const [keyScopes, setKeyScopes] = useState('');
  const [keyDays, setKeyDays] = useState('');
  const [revealed, setRevealed] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ver, start, sto] = await Promise.all([
        statsApi.versions(),
        statsApi.startTime(),
        statsApi.storage(),
      ]);
      setVersions(ver as Json);
      setStorage(sto as Json);
      const parsed = typeof start === 'number' ? start : Number((start as Record<string, unknown>)?.start_time ?? 0);
      setStartTime(Number.isFinite(parsed) && parsed > 0 ? parsed : null);
    } catch (error) {
      notify(error instanceof Error ? error.message : '设置信息读取失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  const loadRuntime = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/system-config', { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { data?: Json };
      setRuntime((body?.data ?? null) as Json | null);
    } catch {
      setRuntime(null);
    }
    try {
      const list = await profilesApi.list();
      const rec = (list ?? {}) as Record<string, unknown>;
      const arr = Array.isArray(list)
        ? list
        : ((rec.info_list ?? rec.profiles ?? rec.items ?? rec.configs) as unknown[] | undefined);
      setProfileCount(Array.isArray(arr) ? arr.length : null);
    } catch {
      setProfileCount(null);
    }
  }, []);

  const loadKeys = useCallback(async () => {
    try {
      const list = await keysApi.list();
      const arr = Array.isArray(list) ? list : ((list as Record<string, unknown>)?.keys as unknown[] | undefined);
      setKeys(Array.isArray(arr) ? (arr as ApiKeyRow[]) : []);
    } catch {
      setKeys([]);
    }
  }, []);

  useEffect(() => {
    void load();
    void loadRuntime();
    void loadKeys();
  }, [load, loadRuntime, loadKeys]);

  const createKey = async () => {
    setBusy('create');
    try {
      const payload: Json = {};
      if (keyName.trim()) payload.name = keyName.trim();
      const scopes = keyScopes.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
      if (scopes.length) payload.scopes = scopes;
      if (keyDays.trim()) payload.expires_in_days = Number(keyDays.trim());
      const res = (await keysApi.create(payload)) as Json;
      const token = String((res as Record<string, unknown>)?.key ?? (res as Record<string, unknown>)?.api_key ?? (res as Record<string, unknown>)?.token ?? '');
      if (token) setRevealed(token);
      notify('API Key 已创建');
      setKeyName('');
      setKeyScopes('');
      setKeyDays('');
      await loadKeys();
    } catch (error) {
      notify(error instanceof Error ? error.message : '创建 API Key 失败', 'error');
    } finally {
      setBusy('');
    }
  };

  const revokeKey = async (id: string) => {
    if (!window.confirm('撤销后该 Key 立即失效（记录会保留），确定继续？')) return;
    setBusy(`revoke:${id}`);
    try {
      await keysApi.revoke(id);
      notify('API Key 已撤销');
      await loadKeys();
    } catch (error) {
      notify(error instanceof Error ? error.message : '撤销失败', 'error');
    } finally {
      setBusy('');
    }
  };

  const removeKey = async (id: string) => {
    if (!window.confirm('删除该 API Key 记录？该操作不可撤销。')) return;
    setBusy(`remove:${id}`);
    try {
      await keysApi.remove(id);
      notify('API Key 已删除');
      await loadKeys();
    } catch (error) {
      notify(error instanceof Error ? error.message : '删除失败', 'error');
    } finally {
      setBusy('');
    }
  };

  const restart = async () => {
    if (!window.confirm('重启 AstrBot 服务？重启期间机器人会短暂离线。')) return;
    if (!window.confirm('再次确认：确定立即重启？')) return;
    setBusy('restart');
    try {
      await statsApi.restart();
      notify('重启指令已下发，稍后刷新页面');
    } catch (error) {
      notify(error instanceof Error ? error.message : '重启失败', 'error');
    } finally {
      setBusy('');
    }
  };

  const copy = async (text: string) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        notify('已复制到剪贴板');
        return;
      }
    } catch {
      /* fall through */
    }
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
      notify('已复制到剪贴板');
    } catch {
      notify('复制失败', 'error');
    }
  };

  const config = (runtime?.config ?? {}) as Record<string, unknown>;
  const platforms = Array.isArray(config.platform) ? (config.platform as unknown[]) : [];
  const providers = Array.isArray(config.provider) ? (config.provider as unknown[]) : [];
  const serverTime = runtime?.server_utc_time;
  const offsetMinutes = runtime?.server_utc_offset_minutes;
  const timezone = String(config.timezone ?? '—');
  const configVersion = String(config.config_version ?? '—');

  const infoRows: [string, string][] = [
    ['AstrBot 核心', String(versions?.astrbot_version ?? '—')],
    ['控制台 WebUI', String(versions?.webui_version ?? '—')],
    ['启动时间', fmtTime(startTime)],
    ['服务器时间', (() => {
      if (!serverTime) return '—';
      const off = Number(offsetMinutes) || 0;
      const zone = `UTC${off >= 0 ? '+' : ''}${off / 60}`;
      const ms = Date.parse(String(serverTime));
      return Number.isFinite(ms)
        ? `${new Date(ms).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}（${zone}）`
        : `${String(serverTime)}（${zone}）`;
    })()],
    ['时区', timezone],
    ['配置版本', configVersion],
    ['机器人 / 模型提供商', `${platforms.length} / ${providers.length}`],
    ['配置档案', profileCount === null ? '—' : `${profileCount} 个`],
    ['存储占用', storage?.total_bytes ? `${(Number(storage.total_bytes) / 1024 / 1024).toFixed(1)} MB` : '—'],
  ];

  return (
    <div className="flex flex-col gap-3.5">
      <div className={cn(card, 'p-3.5')}>
        <div className="flex items-center gap-2">
          <Server className="h-4 w-4 text-muted-foreground" />
          <div className="text-sm font-medium">运行信息</div>
          <button type="button" className={cn(chip, 'ml-auto')} disabled={loading} onClick={() => void load()}>
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            刷新
          </button>
        </div>
        <div className="mt-2.5 grid gap-1.5 md:grid-cols-2">
          {infoRows.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-xs even:bg-accent/20">
              <span className="text-muted-foreground">{label}</span>
              <span className="truncate font-medium tabular-nums" title={value}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      <div className={cn(card, 'p-3.5')}>
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-muted-foreground" />
          <div className="text-sm font-medium">API Key</div>
          <span className="text-xs text-muted-foreground">供外部程序调用 AstrBot 开放接口</span>
        </div>

        <div className="mt-2.5 grid gap-2 md:grid-cols-[1fr_1fr_auto_auto]">
          <input className={inputClass} placeholder="名称（可选）" value={keyName} onChange={(e) => setKeyName(e.target.value)} />
          <input className={inputClass} placeholder="作用域，逗号分隔（留空为默认）" value={keyScopes} onChange={(e) => setKeyScopes(e.target.value)} />
          <input className={cn(inputClass, 'md:w-28')} placeholder="有效天数" value={keyDays} onChange={(e) => setKeyDays(e.target.value)} />
          <button type="button" className={chipPrimary} disabled={busy === 'create'} onClick={() => void createKey()}>
            <Plus className="h-3.5 w-3.5" />
            创建
          </button>
        </div>

        {revealed ? (
          <div className="mt-2.5 rounded-lg border border-[var(--primary-line)] bg-[var(--primary-soft)] p-2.5">
            <div className="text-[11px] text-muted-foreground">新 Key 只显示这一次，请立即复制保存：</div>
            <div className="mt-1 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate text-xs">{revealed}</code>
              <button type="button" className={chip} onClick={() => void copy(revealed)}>
                <Copy className="h-3.5 w-3.5" />
                复制
              </button>
              <button type="button" className={chip} onClick={() => setRevealed('')}>
                知道了
              </button>
            </div>
          </div>
        ) : null}

        <div className="mt-2.5 flex flex-col divide-y divide-border/60">
          {keys.map((item) => {
            const id = String(item.id ?? item.key_id ?? '');
            const revoked = Boolean(item.revoked ?? item.is_revoked ?? item.status === 'revoked');
            const scopes = Array.isArray(item.scopes) ? item.scopes.join(', ') : String(item.scopes ?? '默认');
            return (
              <div key={id || String(item.name)} className="flex flex-wrap items-center gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <span className="truncate">{item.name || '（未命名）'}</span>
                    {revoked ? <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">已撤销</span> : null}
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                    <span>作用域：{scopes || '默认'}</span>
                    <span>创建于 {fmtTime(item.created_at)}</span>
                    {item.expires_at ? <span>过期 {fmtTime(item.expires_at)}</span> : null}
                    {item.last_used_at ? <span>最近使用 {fmtTime(item.last_used_at)}</span> : null}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button type="button" className={chip} disabled={Boolean(busy) || revoked || !id} onClick={() => void revokeKey(id)}>
                    <UserX className="h-3.5 w-3.5" />
                    撤销
                  </button>
                  <button
                    type="button"
                    className={cn(chip, 'text-destructive hover:bg-destructive/10')}
                    disabled={Boolean(busy) || !id}
                    onClick={() => void removeKey(id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    删除
                  </button>
                </div>
              </div>
            );
          })}
          {!keys.length ? (
            <div className="py-6 text-center text-xs text-muted-foreground">
              还没有 API Key。外部脚本需要调用开放接口时，在这里创建。
            </div>
          ) : null}
        </div>
      </div>

      <div className={cn(card, 'p-3.5')}>
        <div className="flex items-center gap-2">
          <Power className="h-4 w-4 text-muted-foreground" />
          <div className="text-sm font-medium">维护</div>
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <button type="button" className={chip} disabled={busy === 'restart'} onClick={() => void restart()}>
            <Power className="h-3.5 w-3.5" />
            重启 AstrBot
          </button>
          {onNavigate ? (
            <>
              <button type="button" className={chip} onClick={() => onNavigate('config-editor')}>
                <Clock className="h-3.5 w-3.5" />
                配置文件
              </button>
              <button type="button" className={chip} onClick={() => onNavigate('backups')}>
                <Database className="h-3.5 w-3.5" />
                备份
              </button>
              <button type="button" className={chip} onClick={() => onNavigate('stats')}>
                <Database className="h-3.5 w-3.5" />
                统计与存储
              </button>
            </>
          ) : null}
        </div>
        <div className="mt-3 flex items-start gap-2 rounded-lg border neko-warn-border bg-amber-500/5 p-2.5 text-[11px] leading-relaxed neko-warn">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            重启会中断当前所有会话与正在执行的任务，建议在低峰期操作。修改运行参数请到
            「配置文件」页面（改完需要点保存才会写入）。
          </span>
        </div>
      </div>
    </div>
  );
}
