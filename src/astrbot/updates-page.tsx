/**
 * Update page — version checks, release list and core/dashboard updates.
 *
 * Verified contracts (AstrBot v4.28.2):
 *   GET  /api/v1/updates/check
 *        -> { version, has_new_version, dashboard_version, dashboard_has_new_version }
 *   GET  /api/v1/updates/releases -> [{ tag_name, published_at, body, ... }]
 *   POST /api/v1/updates/core   { version, reboot, proxy, progress_id }
 *        -> { id, status: 'running' }
 *   POST /api/v1/updates/dashboard {} -> { id, status }
 *   GET  /api/v1/updates/progress/{id} -> { id, status, message, percent?, ... }
 */
import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, CloudDownload, Download, RefreshCw, Rocket, Sparkles,
} from 'lucide-react';
import { updates as updatesApi, stats as statsApi, type Json } from './endpoints';
import { useApp } from './state';
import { cn } from '@/lib/utils';

const card = 'rounded-xl border border-border/60 bg-card';
const chip =
  'inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-2.5 py-1 text-xs font-medium transition hover:bg-accent/60 disabled:opacity-50';
const chipPrimary =
  'inline-flex items-center gap-1.5 rounded-lg border border-[var(--primary)] bg-[var(--primary)] px-2.5 py-1 text-xs font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50';

function fmtTime(value: unknown): string {
  if (!value) return '—';
  const raw = String(value);
  const ms = Date.parse(raw);
  if (Number.isFinite(ms)) {
    return new Date(ms).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  }
  return raw;
}

interface Release {
  tag_name?: string;
  published_at?: string;
  body?: string;
  prerelease?: boolean;
}

const DONE_STATES = ['idle', 'done', 'success', 'completed', 'finished', 'failed', 'error'];

export function UpdatesPage({ onNavigate }: { onNavigate?: (id: string) => void }) {
  const { notify } = useApp();
  const [check, setCheck] = useState<Json | null>();
  const [releases, setReleases] = useState<Release[]>([]);
  const [versions, setVersions] = useState<Json | null>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [progress, setProgress] = useState<Json | null>(null);
  const [proxy, setProxy] = useState('');
  const [showProxy, setShowProxy] = useState(false);
  const [expanded, setExpanded] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [checked, list, ver] = await Promise.all([
        updatesApi.check(),
        updatesApi.releases().catch(() => []),
        statsApi.versions(),
      ]);
      setCheck(checked as Json);
      setReleases(Array.isArray(list) ? (list as unknown as Release[]) : []);
      setVersions(ver as Json);
    } catch (error) {
      notify(error instanceof Error ? error.message : '版本信息读取失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void load();
  }, [load]);

  const poll = useCallback(async (taskId: string) => {
    for (let attempt = 0; attempt < 150; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      let info: Json | null = null;
      try {
        info = (await updatesApi.progress(taskId)) as Json;
      } catch {
        break;
      }
      setProgress(info);
      const status = String(info?.status ?? '');
      if (DONE_STATES.includes(status)) {
        if (status === 'failed' || status === 'error') notify(String(info?.message ?? '更新失败'), 'error');
        else notify('更新任务已结束，请等待服务重启后刷新页面');
        break;
      }
    }
    void load();
  }, [notify, load]);

  const runCore = async (version: string) => {
    const label = version === 'latest' ? '最新版本' : version;
    if (!window.confirm(`将 AstrBot 核心更新到 ${label}。\n\n更新过程中服务会重启，控制台会短暂断开，确定继续？`)) return;
    setBusy('core');
    setProgress(null);
    try {
      const res = (await updatesApi.core({ version, reboot: true, proxy: proxy || undefined })) as Json;
      notify(String((res as Record<string, unknown>)?.message ?? '更新任务已开始'));
      const id = String((res as Record<string, unknown>)?.id ?? '');
      if (id) await poll(id);
    } catch (error) {
      notify(error instanceof Error ? error.message : '启动更新失败', 'error');
    } finally {
      setBusy('');
    }
  };

  const runDashboard = async () => {
    if (!window.confirm('重新下载并覆盖 WebUI 静态资源？控制台会在完成后刷新。')) return;
    setBusy('dashboard');
    setProgress(null);
    try {
      const res = (await updatesApi.dashboard({ proxy: proxy || undefined })) as Json;
      notify(String((res as Record<string, unknown>)?.message ?? 'WebUI 更新任务已开始'));
      const id = String((res as Record<string, unknown>)?.id ?? '');
      if (id) await poll(id);
    } catch (error) {
      notify(error instanceof Error ? error.message : '启动 WebUI 更新失败', 'error');
    } finally {
      setBusy('');
    }
  };

  const coreVersion = String(versions?.astrbot_version ?? check?.version ?? '—');
  const dashVersion = String(versions?.webui_version ?? check?.dashboard_version ?? '—');
  const coreNew = Boolean(check?.has_new_version);
  const dashNew = Boolean(check?.dashboard_has_new_version);

  const running = Boolean(progress) && !DONE_STATES.includes(String(progress?.status ?? 'running'));
  const percentRaw = Number((progress as Record<string, unknown> | null)?.percent ?? (progress as Record<string, unknown> | null)?.progress ?? NaN);
  const percent = Number.isFinite(percentRaw) ? Math.max(0, Math.min(100, percentRaw <= 1 ? percentRaw * 100 : percentRaw)) : null;

  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid gap-3 md:grid-cols-2">
        <div className={cn(card, 'p-3.5')}>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Rocket className="h-3.5 w-3.5" />
            AstrBot 核心
          </div>
          <div className="mt-1.5 text-lg font-semibold">{coreVersion}</div>
          <div className="mt-1 text-[11px]">
            {coreNew ? (
              <span className="neko-chip-accent rounded px-1.5 py-0.5">有新版本可用</span>
            ) : (
              <span className="text-muted-foreground">已是最新版本</span>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <button type="button" className={chipPrimary} disabled={Boolean(busy)} onClick={() => void runCore('latest')}>
              <Download className="h-3.5 w-3.5" />
              更新到最新版
            </button>
            <button type="button" className={chip} disabled={loading} onClick={() => void load()}>
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
              重新检查
            </button>
          </div>
        </div>

        <div className={cn(card, 'p-3.5')}>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CloudDownload className="h-3.5 w-3.5" />
            控制台 WebUI
          </div>
          <div className="mt-1.5 text-lg font-semibold">{dashVersion}</div>
          <div className="mt-1 text-[11px]">
            {dashNew ? (
              <span className="neko-chip-accent rounded px-1.5 py-0.5">有新版本可用</span>
            ) : (
              <span className="text-muted-foreground">已是最新版本</span>
            )}
          </div>
          <div className="mt-3">
            <button type="button" className={chip} disabled={Boolean(busy)} onClick={() => void runDashboard()}>
              <CloudDownload className="h-3.5 w-3.5" />
              重新下载 WebUI
            </button>
          </div>
        </div>
      </div>

      {progress ? (
        <div className={cn(card, 'p-3.5')}>
          <div className="flex items-center gap-2">
            {running ? <RefreshCw className="h-3.5 w-3.5 animate-spin text-[var(--primary)]" /> : <CheckCircle2 className="h-3.5 w-3.5 text-[var(--primary)]" />}
            <div className="text-sm font-medium">更新进度</div>
            <span className="ml-auto text-xs text-muted-foreground">{String(progress.status ?? '')}</span>
          </div>
          {percent !== null ? (
            <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--primary-faint)]">
              <div className="h-full rounded-full bg-[var(--primary)] transition-all" style={{ width: `${percent}%` }} />
            </div>
          ) : null}
          {progress.message ? (
            <div className="mt-2 text-xs leading-relaxed text-muted-foreground">{String(progress.message)}</div>
          ) : null}
        </div>
      ) : null}

      <div className={cn(card, 'p-3.5')}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-auto flex items-center gap-1.5 text-sm font-medium">
            <Sparkles className="h-4 w-4 text-muted-foreground" />
            可用版本
          </div>
          <button type="button" className={chip} onClick={() => setShowProxy((v) => !v)}>
            {showProxy ? '隐藏代理设置' : '代理设置'}
          </button>
        </div>
        {showProxy ? (
          <input
            className="mt-2.5 h-9 w-full rounded-lg border border-input bg-background/60 px-3 text-xs outline-none focus-visible:border-[var(--primary)]"
            placeholder="下载代理，例如 http://127.0.0.1:7890（可留空）"
            value={proxy}
            onChange={(event) => setProxy(event.target.value)}
          />
        ) : null}

        <div className="mt-2.5 flex flex-col divide-y divide-border/60">
          {releases.slice(0, 20).map((item) => {
            const tag = String(item.tag_name ?? '');
            const open = expanded === tag;
            const isCurrent = tag.replace(/^v/, '') === coreVersion.replace(/^v/, '');
            return (
              <div key={tag} className="py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="flex min-w-0 items-center gap-1.5 text-left text-sm font-medium transition-colors hover:text-[var(--primary)]"
                    onClick={() => setExpanded(open ? '' : tag)}
                  >
                    {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                    <span className="truncate">{tag || '（无标签）'}</span>
                  </button>
                  {item.prerelease ? <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] neko-warn">预发布</span> : null}
                  {isCurrent ? <span className="neko-chip-accent rounded px-1.5 py-0.5 text-[10px]">当前版本</span> : null}
                  <span className="text-[11px] text-muted-foreground">{fmtTime(item.published_at)}</span>
                  <div className="ml-auto flex items-center gap-1.5">
                    <button
                      type="button"
                      className={chip}
                      disabled={Boolean(busy) || isCurrent}
                      onClick={() => void runCore(tag)}
                    >
                      更新到此版本
                    </button>
                  </div>
                </div>
                {open ? (
                  <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-border/60 bg-muted/20 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
                    {String(item.body ?? '（该版本没有说明）')}
                  </pre>
                ) : null}
              </div>
            );
          })}
          {!releases.length && !loading ? (
            <div className="py-6 text-center text-xs text-muted-foreground">未获取到版本列表，可点击「重新检查」重试</div>
          ) : null}
        </div>
      </div>

      <div className={cn(card, 'flex items-start gap-2 p-3.5')}>
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 neko-warn" />
        <div className="text-xs leading-relaxed text-muted-foreground">
          更新过程中 AstrBot 会重启，控制台短暂断开属于正常现象；重启完成后刷新页面即可。
          如果更新失败，可查看「日志」定位原因，或使用「备份」中的快照回滚。
          {onNavigate ? (
            <button type="button" className="ml-1 underline decoration-dotted underline-offset-2 hover:text-[var(--primary)]" onClick={() => onNavigate('logs')}>
              打开日志
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
