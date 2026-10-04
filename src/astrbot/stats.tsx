/**
 * Statistics page — runtime health, message volume, token usage, storage.
 *
 * Verified against AstrBot v4.28.2:
 *   GET  /api/v1/stats?offset_sec=N
 *        -> { platform[], message_count, platform_count, plugin_count, plugins[],
 *             message_time_series: [[ts, count], ...],
 *             running: {hours, minutes, seconds}, memory: {process, system} (MB),
 *             cpu_percent, thread_count, start_time }
 *   GET  /api/v1/stats/provider-tokens?days=N
 *        -> { days, trend: {series: [{name, data: [[ts, tokens]], total_tokens}], total_series},
 *             range_total_tokens, range_total_calls, range_avg_ttft_ms,
 *             range_avg_duration_ms, range_avg_tpm, range_success_rate,
 *             range_by_provider: [{provider_id, tokens}],
 *             today_total_tokens, today_total_calls, today_by_model, today_by_provider }
 *   GET  /api/v1/stats/storage  -> { logs: {...}, cache: {...}, total_bytes }
 *   GET  /api/v1/stats/versions -> { webui_version, astrbot_version, astrbot_code_version }
 *   POST /api/v1/stats/storage/cleanup { target: 'all' | 'cache' | 'logs' }
 */
import { useCallback, useEffect, useState } from 'react';
import {
  Activity, Cpu, Database, HardDrive, Layers, MessageSquare, RefreshCw, Timer, Trash2, Users,
} from 'lucide-react';
import { stats as statsApi, type Json } from './endpoints';
import { useApp } from './state';
import { cn } from '@/lib/utils';

const card = 'rounded-xl border border-border/60 bg-card';
const chip = 'rounded-lg border border-border/60 px-2.5 py-1 text-xs font-medium transition';

const nf = new Intl.NumberFormat('zh-CN');

function num(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function fmtCount(value: unknown): string {
  const n = num(value);
  return n === null ? '—' : nf.format(Math.round(n));
}

function fmtBytes(value: unknown): string {
  const n = num(value);
  if (n === null || n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

function fmtMb(value: unknown): string {
  const n = num(value);
  if (n === null) return '—';
  if (n >= 1024) return `${(n / 1024).toFixed(1)} GB`;
  return `${Math.round(n)} MB`;
}

function fmtRunning(value: unknown): string {
  const rec = (value ?? {}) as Record<string, unknown>;
  const hours = num(rec.hours) ?? 0;
  const minutes = num(rec.minutes) ?? 0;
  const days = Math.floor(hours / 24);
  return days > 0 ? `${days} 天 ${hours % 24} 小时` : `${hours} 小时 ${minutes} 分`;
}

function fmtClock(seconds: unknown): string {
  const n = num(seconds);
  if (!n) return '—';
  return new Date(n * 1000).toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

function fmtMs(value: unknown): string {
  const n = num(value);
  if (n === null || n <= 0) return '—';
  if (n >= 1000) return `${(n / 1000).toFixed(1)} s`;
  return `${Math.round(n)} ms`;
}

function fmtRate(value: unknown): string {
  const n = num(value);
  if (n === null) return '—';
  const pct = n <= 1 ? n * 100 : n;
  return `${pct.toFixed(1)}%`;
}

/** Accepts either a dict ({key: value}) or a list of records. */
function seriesPoints(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (Array.isArray(item)) return num(item[1]) ?? 0;
    if (item && typeof item === 'object') return num((item as Record<string, unknown>).value) ?? 0;
    return num(item) ?? 0;
  });
}

function dictRows(value: unknown): [string, number][] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return (value as unknown[])
      .map((item) => {
        const rec = (item ?? {}) as Record<string, unknown>;
        const key = String(rec.name ?? rec.model ?? rec.provider_id ?? rec.provider ?? rec.id ?? '');
        const val = num(rec.tokens ?? rec.total_tokens ?? rec.count ?? rec.value) ?? 0;
        return [key, val] as [string, number];
      })
      .filter(([key]) => key)
      .sort((a, b) => b[1] - a[1]);
  }
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, val]) => [key, num(val) ?? 0] as [string, number])
      .sort((a, b) => b[1] - a[1]);
  }
  return [];
}

function Sparkline({ points, className }: { points: number[]; className?: string }) {
  if (points.length < 2) return <div className={cn('h-8', className)} />;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const span = Math.max(max - min, 1);
  const d = points
    .map((p, i) => `${((i / (points.length - 1)) * 100).toFixed(2)},${(27 - ((p - min) / span) * 25).toFixed(2)}`)
    .join(' ');
  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" className={cn('h-8 w-full text-primary', className)}>
      <polyline points={d} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Chart series all derive from the accent colour, using decreasing
 * opacity so multi-model graphs stay readable but visually unified. */
const SERIES_COLOR = 'var(--primary)';
const seriesOpacity = (index: number) => Math.max(0.34, 1 - index * 0.15);

function MultiLine({ series }: { series: { name: string; points: number[] }[] }) {
  const max = Math.max(1, ...series.flatMap((item) => item.points));
  const len = Math.max(2, ...series.map((item) => item.points.length));
  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-32 w-full">
      {series.map((item, idx) => (
        <polyline
          key={item.name}
          points={item.points
            .map((p, i) => `${((i / (len - 1)) * 100).toFixed(2)},${(38 - (p / max) * 34).toFixed(2)}`)
            .join(' ')}
          fill="none"
          stroke={SERIES_COLOR}
          strokeOpacity={seriesOpacity(idx)}
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}

export function StatsPage({ onNavigate }: { onNavigate?: (id: string) => void }) {
  const { notify } = useApp();
  const [overview, setOverview] = useState<Json | null>();
  const [tokens, setTokens] = useState<Json | null>();
  const [storage, setStorage] = useState<Json | null>();
  const [versions, setVersions] = useState<Json | null>();
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');

  const load = useCallback(
    async (range: number) => {
      setLoading(true);
      try {
        const [ov, st, vs] = await Promise.all([
          statsApi.overview(),
          statsApi.storage(),
          statsApi.versions(),
        ]);
        setOverview(ov as Json);
        setStorage(st as Json);
        setVersions(vs as Json);
        try {
          setTokens((await statsApi.providerTokens(range)) as Json);
        } catch {
          setTokens(null);
        }
      } catch (error) {
        notify(error instanceof Error ? error.message : '统计数据读取失败', 'error');
      } finally {
        setLoading(false);
      }
    },
    [notify],
  );

  useEffect(() => {
    void load(days);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const cleanup = async (target: string) => {
    const label = target === 'all' ? '全部缓存与日志' : target === 'cache' ? '缓存目录' : '日志目录';
    if (!window.confirm(`确定清理${label}？该操作不可撤销。`)) return;
    setBusy(target);
    try {
      await statsApi.cleanup({ target });
      notify('清理完成');
      await load(days);
    } catch (error) {
      notify(error instanceof Error ? error.message : '清理失败', 'error');
    } finally {
      setBusy('');
    }
  };

  const kpis = [
    { label: '消息总数', value: fmtCount(overview?.message_count), icon: MessageSquare, hint: '累计接收的消息' },
    { label: '机器人', value: fmtCount(overview?.platform_count), icon: Users, hint: '已连接的消息平台实例' },
    { label: '已装插件', value: fmtCount(overview?.plugin_count), icon: Layers, hint: '含内置插件' },
    { label: '运行时长', value: fmtRunning(overview?.running), icon: Timer, hint: `启动于 ${fmtClock(overview?.start_time)}` },
    { label: 'CPU', value: overview?.cpu_percent === undefined ? '—' : `${num(overview?.cpu_percent)?.toFixed(1) ?? '0'}%`, icon: Cpu, hint: '最近一次采样' },
    {
      label: '内存',
      value: fmtMb((overview?.memory as Record<string, unknown> | undefined)?.process),
      icon: Database,
      hint: `系统 ${fmtMb((overview?.memory as Record<string, unknown> | undefined)?.system)}`,
    },
    { label: '线程数', value: fmtCount(overview?.thread_count), icon: Activity, hint: '运行中的线程' },
  ];

  const messageSeries = seriesPoints(overview?.message_time_series);
  const trend = (tokens?.trend ?? {}) as Record<string, unknown>;
  const trendSeries = Array.isArray(trend.series)
    ? (trend.series as Record<string, unknown>[]).map((item) => ({
        name: String(item.name ?? '模型'),
        points: seriesPoints(item.data),
      }))
    : [];
  const byProvider = dictRows(tokens?.range_by_provider);
  const todayModels = dictRows(tokens?.today_by_model);
  const todayProviders = dictRows(tokens?.today_by_provider);
  const plugins = Array.isArray(overview?.plugins) ? (overview?.plugins as Record<string, unknown>[]) : [];
  const storageLogs = (storage?.logs ?? {}) as Record<string, unknown>;
  const storageCache = (storage?.cache ?? {}) as Record<string, unknown>;

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={cn(chip, 'inline-flex items-center gap-1.5 hover:bg-accent/60')}
          onClick={() => void load(days)}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          刷新
        </button>
        {loading ? <span className="text-xs text-muted-foreground">正在读取…</span> : null}
        <span className="ml-auto text-xs text-muted-foreground">
          AstrBot {String(versions?.astrbot_version ?? '—')} · WebUI {String(versions?.webui_version ?? '—')}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {kpis.map((item) => (
          <div key={item.label} className={cn(card, 'p-3')}>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <item.icon className="h-3.5 w-3.5" />
              {item.label}
            </div>
            <div className="mt-1.5 text-lg font-semibold tabular-nums">{item.value}</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">{item.hint}</div>
          </div>
        ))}
      </div>

      <div className={cn(card, 'p-3.5')}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">消息量趋势</div>
            <div className="text-xs text-muted-foreground">最近 24 小时的消息条数</div>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            峰值 {fmtCount(messageSeries.length ? Math.max(...messageSeries) : null)}
          </div>
        </div>
        <Sparkline points={messageSeries} className="mt-2" />
      </div>

      <div className={cn(card, 'p-3.5')}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-auto">
            <div className="text-sm font-medium">模型用量</div>
            <div className="text-xs text-muted-foreground">Token 消耗、调用次数与响应表现</div>
          </div>
          {[1, 7, 30].map((value) => (
            <button
              key={value}
              type="button"
              className={cn(chip, days === value ? 'border-primary/60 bg-primary/10 text-primary' : 'hover:bg-accent/60')}
              onClick={() => setDays(value)}
            >
              {value} 天
            </button>
          ))}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="rounded-lg border border-border/60 p-2.5">
            <div className="text-[11px] text-muted-foreground">消耗 Token</div>
            <div className="text-base font-semibold tabular-nums">{fmtCount(tokens?.range_total_tokens)}</div>
          </div>
          <div className="rounded-lg border border-border/60 p-2.5">
            <div className="text-[11px] text-muted-foreground">调用次数</div>
            <div className="text-base font-semibold tabular-nums">{fmtCount(tokens?.range_total_calls)}</div>
          </div>
          <div className="rounded-lg border border-border/60 p-2.5">
            <div className="text-[11px] text-muted-foreground">平均首字延迟</div>
            <div className="text-base font-semibold tabular-nums">{fmtMs(tokens?.range_avg_ttft_ms)}</div>
          </div>
          <div className="rounded-lg border border-border/60 p-2.5">
            <div className="text-[11px] text-muted-foreground">成功率</div>
            <div className="text-base font-semibold tabular-nums">{fmtRate(tokens?.range_success_rate)}</div>
          </div>
        </div>

        {trendSeries.length ? (
          <div className="mt-3">
            <MultiLine series={trendSeries} />
            <div className="mt-1.5 flex flex-wrap gap-3">
              {trendSeries.map((item, idx) => (
                <span key={item.name} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ background: SERIES_COLOR, opacity: seriesOpacity(idx) }}
                  />
                  {item.name}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-3 rounded-lg border border-dashed border-border/60 py-6 text-center text-xs text-muted-foreground">
            该时间范围内没有模型调用记录
          </div>
        )}

        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-border/60 p-2.5">
            <div className="text-xs font-medium">今日汇总</div>
            <div className="mt-1.5 flex justify-between text-xs">
              <span className="text-muted-foreground">Token</span>
              <span className="tabular-nums">{fmtCount(tokens?.today_total_tokens)}</span>
            </div>
            <div className="mt-1 flex justify-between text-xs">
              <span className="text-muted-foreground">调用</span>
              <span className="tabular-nums">{fmtCount(tokens?.today_total_calls)}</span>
            </div>
          </div>
          <div className="rounded-lg border border-border/60 p-2.5">
            <div className="text-xs font-medium">今日 · 按模型</div>
            {todayModels.length ? (
              todayModels.slice(0, 5).map(([name, value]) => (
                <div key={name} className="mt-1 flex justify-between gap-2 text-xs">
                  <span className="truncate text-muted-foreground">{name}</span>
                  <span className="tabular-nums">{fmtCount(value)}</span>
                </div>
              ))
            ) : (
              <div className="mt-1.5 text-xs text-muted-foreground">暂无记录</div>
            )}
          </div>
          <div className="rounded-lg border border-border/60 p-2.5">
            <div className="text-xs font-medium">区间 · 按提供商</div>
            {(byProvider.length ? byProvider : todayProviders).slice(0, 5).map(([name, value]) => (
              <div key={name} className="mt-1 flex justify-between gap-2 text-xs">
                <span className="truncate text-muted-foreground">{name}</span>
                <span className="tabular-nums">{fmtCount(value)}</span>
              </div>
            ))}
            {!byProvider.length && !todayProviders.length ? (
              <div className="mt-1.5 text-xs text-muted-foreground">暂无记录</div>
            ) : null}
          </div>
        </div>
      </div>

      <div className={cn(card, 'p-3.5')}>
        <div className="flex items-center gap-2">
          <HardDrive className="h-4 w-4 text-muted-foreground" />
          <div className="text-sm font-medium">存储占用</div>
          <span className="ml-auto text-xs text-muted-foreground">合计 {fmtBytes(storage?.total_bytes)}</span>
        </div>
        <div className="mt-2.5 grid gap-2 md:grid-cols-2">
          {[
            { key: 'logs', label: '日志', info: storageLogs },
            { key: 'cache', label: '缓存与临时文件', info: storageCache },
          ].map((item) => (
            <div key={item.key} className="flex items-center gap-2 rounded-lg border border-border/60 p-2.5">
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium">{item.label}</div>
                <div className="truncate text-[11px] text-muted-foreground">{String(item.info.path ?? '')}</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold tabular-nums">{fmtBytes(item.info.size_bytes)}</div>
                <div className="text-[11px] text-muted-foreground">{fmtCount(item.info.file_count)} 个文件</div>
              </div>
              <button
                type="button"
                className={cn(chip, 'hover:bg-accent/60 disabled:opacity-50')}
                disabled={busy === item.key}
                onClick={() => void cleanup(item.key)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            className={cn(chip, 'inline-flex items-center gap-1.5 hover:bg-accent/60 disabled:opacity-50')}
            disabled={busy === 'all'}
            onClick={() => void cleanup('all')}
          >
            <Trash2 className="h-3.5 w-3.5" />
            清理全部
          </button>
        </div>
      </div>

      <div className={cn(card, 'p-3.5')}>
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-muted-foreground" />
          <div className="text-sm font-medium">插件版本</div>
          <span className="ml-auto text-xs text-muted-foreground">{plugins.length} 个</span>
          {onNavigate ? (
            <button type="button" className={cn(chip, 'hover:bg-accent/60')} onClick={() => onNavigate('plugins')}>
              管理插件
            </button>
          ) : null}
        </div>
        <div className="mt-2.5 grid gap-1.5 md:grid-cols-2">
          {plugins.map((item) => (
            <div key={String(item.name)} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs even:bg-accent/20">
              <span className={cn('h-1.5 w-1.5 rounded-full', item.is_enabled ? 'neko-dot-accent' : 'bg-muted-foreground/40')} />
              <span className="truncate">{String(item.name ?? '')}</span>
              <span className="ml-auto shrink-0 text-muted-foreground tabular-nums">{String(item.version ?? '')}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
