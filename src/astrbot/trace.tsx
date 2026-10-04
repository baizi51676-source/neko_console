/**
 * Trace page — turns per-message LLM call tracing on/off.
 *
 * Verified contract (AstrBot v4.28.2):
 *   GET /api/v1/trace/settings -> { trace_enable: boolean }
 *   PUT /api/v1/trace/settings { trace_enable: boolean }
 */
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ListTree, RefreshCw, ScrollText } from 'lucide-react';
import { logs as logsApi } from './endpoints';
import { useApp } from './state';
import { cn } from '@/lib/utils';

const card = 'rounded-xl border border-border/60 bg-card';
const chip = 'rounded-lg border border-border/60 px-2.5 py-1 text-xs font-medium transition hover:bg-accent/60 disabled:opacity-50';

function Toggle({ checked, disabled, onChange }: { checked: boolean; disabled?: boolean; onChange: (next: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition',
        checked ? 'border-primary/60 bg-primary/80' : 'border-border/60 bg-muted',
        disabled && 'opacity-50',
      )}
    >
      <span
        className={cn(
          'absolute h-4.5 w-4.5 rounded-full bg-white shadow transition-all',
          checked ? 'left-[22px]' : 'left-[3px]',
        )}
        style={{ height: 18, width: 18 }}
      />
    </button>
  );
}

export function TracePage({ onNavigate }: { onNavigate?: (id: string) => void }) {
  const { notify } = useApp();
  const [enabled, setEnabled] = useState<boolean | null>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = (await logsApi.traceSettings()) as Record<string, unknown>;
      setEnabled(Boolean(data?.trace_enable));
    } catch (error) {
      notify(error instanceof Error ? error.message : '追踪设置读取失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (next: boolean) => {
    setSaving(true);
    try {
      await logsApi.saveTraceSettings({ trace_enable: next });
      setEnabled(next);
      notify(next ? '调用追踪已开启' : '调用追踪已关闭');
    } catch (error) {
      notify(error instanceof Error ? error.message : '追踪设置保存失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3.5">
      <div className={cn(card, 'p-3.5')}>
        <div className="flex items-start gap-3">
          <ListTree className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">调用追踪</div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              开启后，机器人会把每一轮对话中主 Agent 的模型调用与工具调用记录成追踪数据，用于排查
              「模型到底调了什么、为什么这样回答」。关闭后不再写入新的追踪记录，已有的记录不受影响。
            </p>
          </div>
          <div className="flex items-center gap-2">
            {loading ? <span className="text-xs text-muted-foreground">读取中…</span> : null}
            <Toggle
              checked={Boolean(enabled)}
              disabled={loading || saving || enabled === null}
              onChange={(next) => void toggle(next)}
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium',
              enabled ? 'neko-soft-bg text-[var(--primary)]' : 'bg-muted text-muted-foreground',
            )}
          >
            <span className={cn('h-1.5 w-1.5 rounded-full', enabled ? 'neko-dot-accent' : 'bg-muted-foreground/50')} />
            {enabled ? '追踪已开启' : '追踪已关闭'}
          </span>
          <button type="button" className={cn(chip, 'inline-flex items-center gap-1.5')} disabled={loading} onClick={() => void load()}>
            <RefreshCw className="h-3.5 w-3.5" />
            刷新
          </button>
          {onNavigate ? (
            <button type="button" className={cn(chip, 'inline-flex items-center gap-1.5')} onClick={() => onNavigate('logs')}>
              <ScrollText className="h-3.5 w-3.5" />
              前往运行日志
            </button>
          ) : null}
        </div>
      </div>

      <div className={cn(card, 'p-3.5')}>
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 neko-warn" />
          <div className="text-sm font-medium">使用建议</div>
        </div>
        <ul className="mt-2 flex flex-col gap-1.5 text-xs leading-relaxed text-muted-foreground">
          <li>· 追踪会产生额外的磁盘写入，长期开启时请留意「统计 → 存储占用」的增长。</li>
          <li>· 排查完问题后建议关闭，避免在消息高峰时段积累过多无关记录。</li>
          <li>· 追踪记录的是模型调用链（消息、工具、耗时），不会把内容发送到外部服务。</li>
        </ul>
      </div>
    </div>
  );
}
