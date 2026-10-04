/**
 * Future tasks page (\u672a\u6765\u4efb\u52a1) \u2014 AstrBot wakes itself up on a schedule and delivers the
 * result back to a session.
 *
 * Contract: POST /cron/jobs { name, note, session, timezone, enabled,
 * cron_expression } or { run_once: true, run_at } ; PATCH /cron/jobs/{id} ;
 * POST /cron/jobs/{id}/run ; DELETE /cron/jobs/{id}.
 */
import { ToggleSwitch } from '@/components/ui/toggle-switch';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Clock,
  Plus,
  RefreshCw,
  Rocket,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toArray } from './api';
import { cron as cronApi, rules as rulesApi, type Json } from './endpoints';
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

type Schedule = 'daily' | 'weekly' | 'monthly' | 'interval' | 'cron' | 'once';

interface Draft {
  id: string;
  name: string;
  note: string;
  schedule: Schedule;
  time: string;      // HH:MM
  weekday: string;   // 0-6
  monthday: string;  // 1-31
  intervalValue: string;
  intervalUnit: 'minutes' | 'hours' | 'days';
  cron: string;
  runAt: string;     // datetime-local
  session: string;
  timezone: string;
  enabled: boolean;
  extra: Json;
}

const EMPTY_DRAFT: Draft = {
  id: '',
  name: '',
  note: '',
  schedule: 'daily',
  time: '09:00',
  weekday: '1',
  monthday: '1',
  intervalValue: '30',
  intervalUnit: 'minutes',
  cron: '',
  runAt: '',
  session: '',
  timezone: '',
  enabled: true,
  extra: {},
};

function buildCron(draft: Draft): string {
  const [hourRaw, minuteRaw] = (draft.time || '09:00').split(':');
  const hour = String(Number(hourRaw || 9));
  const minute = String(Number(minuteRaw || 0));
  if (draft.schedule === 'daily') return `${minute} ${hour} * * *`;
  if (draft.schedule === 'weekly') return `${minute} ${hour} * * ${draft.weekday || '1'}`;
  if (draft.schedule === 'monthly') return `${minute} ${hour} ${draft.monthday || '1'} * *`;
  if (draft.schedule === 'interval') {
    const value = Math.max(1, Number(draft.intervalValue || 1));
    if (draft.intervalUnit === 'minutes') return `*/${value} * * * *`;
    if (draft.intervalUnit === 'hours') return `0 */${value} * * *`;
    return `0 0 */${value} * *`;
  }
  if (draft.schedule === 'cron') return draft.cron.trim();
  return '';
}

function describeSchedule(draft: Draft): string {
  if (draft.schedule === 'once') return `一次性 · ${draft.runAt || '未设置时间'}`;
  const cron = buildCron(draft);
  const label =
    draft.schedule === 'daily'
      ? `每天 ${draft.time}`
      : draft.schedule === 'weekly'
        ? `每周${['周日', '周一', '周二', '周三', '周四', '周五', '周六'][Number(draft.weekday)] || ''} ${draft.time}`
        : draft.schedule === 'monthly'
          ? `每月 ${draft.monthday} 日 ${draft.time}`
          : draft.schedule === 'interval'
            ? `每隔 ${draft.intervalValue} ${draft.intervalUnit === 'minutes' ? '分钟' : draft.intervalUnit === 'hours' ? '小时' : '天'}`
            : '自定义 Cron';
  return cron ? `${label}（${cron}）` : label;
}

export function CronPage() {
  const { notify } = useApp();
  const [jobs, setJobs] = useState<Json[]>([]);
  const [umos, setUmos] = useState<Json[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [jobPayload, umoPayload] = await Promise.all([
        cronApi.list(),
        rulesApi.activeUmos().catch(() => ({}) as Json),
      ]);
      const raw = jobPayload as Json;
      setJobs(toArray<Json>(raw.jobs ?? raw.items ?? raw));
      const umoRaw = umoPayload as Json;
      setUmos(toArray<Json>(umoRaw.umo_infos ?? umoRaw.umos ?? umoRaw));
    } catch (e) {
      setError(e instanceof Error ? e.message : '未来任务读取失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const umoLabel = useMemo(() => {
    const map = new Map<string, string>();
    for (const info of umos) {
      const umo = str(info.umo ?? info);
      const label = str(info.display_name || info.auto_name || info.session_id) || umo;
      if (umo) map.set(umo, label);
    }
    return map;
  }, [umos]);

  const jobId = (job: Json) => str(job.id ?? job.job_id ?? job.task_id);

  const openNew = () => {
    const now = new Date(Date.now() + 10 * 60 * 1000);
    const pad = (value: number) => String(value).padStart(2, '0');
    const runAt = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
    setDraft({ ...EMPTY_DRAFT, runAt });
  };

  const openEdit = (job: Json) => {
    const cron = str(job.cron_expression ?? job.cron);
    const runOnce = Boolean(job.run_once) || Boolean(job.run_at);
    const { id, job_id, task_id, name, note, session, timezone, enabled, run_at, payload, ...rest } = job as Json;
    setDraft({
      ...EMPTY_DRAFT,
      id: str(id ?? job_id ?? task_id),
      name: str(name),
      note: str(note ?? job.description),
      schedule: runOnce && !cron ? 'once' : cron ? 'cron' : 'daily',
      cron,
      runAt: str(run_at).slice(0, 16),
      session: str(session),
      timezone: str(timezone),
      enabled: enabled !== false,
      extra: (rest || {}) as Json,
    });
  };

  const submit = async () => {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) return notify('请填写任务名称', 'error');
    if (!draft.note.trim()) return notify('请填写任务需求（要做什么）', 'error');
    const payload: Json = {
      ...draft.extra,
      name,
      note: draft.note,
      session: draft.session || undefined,
      timezone: draft.timezone || undefined,
      enabled: draft.enabled,
    };
    if (draft.schedule === 'once') {
      if (!draft.runAt) return notify('请选择执行时间', 'error');
      payload.run_once = true;
      payload.run_at = draft.runAt;
    } else {
      const cron = buildCron(draft);
      if (!cron) return notify('请填写 Cron 表达式', 'error');
      payload.run_once = false;
      payload.cron_expression = cron;
    }

    setBusy('save');
    try {
      if (draft.id) await cronApi.update(draft.id, payload);
      else await cronApi.create(payload);
      notify(draft.id ? '任务已更新' : '任务已创建', 'ok');
      setDraft(null);
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : '保存失败', 'error');
    } finally {
      setBusy('');
    }
  };

  const runNow = async (job: Json) => {
    const id = jobId(job);
    if (!id) return;
    setBusy(`run:${id}`);
    try {
      await cronApi.run(id);
      notify('已触发执行', 'ok');
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : '执行失败', 'error');
    } finally {
      setBusy('');
    }
  };

  const toggleJob = async (job: Json) => {
    const id = jobId(job);
    if (!id) return;
    const next = !(job.enabled !== false);
    setBusy(`en:${id}`);
    try {
      await cronApi.update(id, { enabled: next });
      setJobs((prev) => prev.map((row) => (jobId(row) === id ? { ...row, enabled: next } : row)));
      notify(next ? '已启用' : '已停用', 'ok');
    } catch (e) {
      notify(e instanceof Error ? e.message : '状态更新失败', 'error');
    } finally {
      setBusy('');
    }
  };

  const removeJob = async (job: Json) => {
    const id = jobId(job);
    if (!id) return;
    if (!window.confirm(`确定要删除任务「${str(job.name)}」吗？`)) return;
    setBusy(`del:${id}`);
    try {
      await cronApi.remove(id);
      setJobs((prev) => prev.filter((row) => jobId(row) !== id));
      notify('已删除', 'ok');
    } catch (e) {
      notify(e instanceof Error ? e.message : '删除失败', 'error');
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <Clock className="size-4 text-primary" /> 未来任务
          </h1>
          <p className="text-xs text-muted-foreground">
            到点自动唤醒机器人去完成任务，并把结果投递回指定会话（也可以直接在聊天里让机器人自己创建）。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className={btn} onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} /> 刷新
          </button>
          <button className={btnPrimary} onClick={openNew}>
            <Plus className="size-3.5" /> 新建任务
          </button>
        </div>
      </header>

      {error ? (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {draft ? (
        <section className={cn(card, 'p-4')}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">{draft.id ? '编辑任务' : '新建任务'}</h2>
            <button className={btn} onClick={() => setDraft(null)}>
              <X className="size-3.5" /> 取消
            </button>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">任务名称</label>
              <input className={inputClass} placeholder="例如 每日早报" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">投递到（可选）</label>
              <select className={inputClass} value={draft.session} onChange={(event) => setDraft({ ...draft, session: event.target.value })}>
                <option value="">不投递</option>
                {[...umoLabel.entries()].map(([umo, label]) => (
                  <option key={umo} value={umo}>
                    {label}（{umo}）
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-xs font-medium">任务需求（到点时交给机器人的指令）</label>
              <textarea
                className="h-20 w-full rounded-md border border-input bg-transparent p-2.5 text-[12px] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30"
                placeholder="例如：总结今天群里讨论的重点，并@提醒我"
                value={draft.note}
                onChange={(event) => setDraft({ ...draft, note: event.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium">执行方式</label>
              <select
                className={inputClass}
                value={draft.schedule}
                onChange={(event) => setDraft({ ...draft, schedule: event.target.value as Schedule })}
              >
                <option value="daily">每天</option>
                <option value="weekly">每周</option>
                <option value="monthly">每月</option>
                <option value="interval">间隔</option>
                <option value="cron">自定义 Cron</option>
                <option value="once">仅一次</option>
              </select>
            </div>

            {draft.schedule === 'daily' || draft.schedule === 'weekly' || draft.schedule === 'monthly' ? (
              <div className="space-y-1.5">
                <label className="text-xs font-medium">时间</label>
                <input className={inputClass} type="time" value={draft.time} onChange={(event) => setDraft({ ...draft, time: event.target.value })} />
              </div>
            ) : null}

            {draft.schedule === 'weekly' ? (
              <div className="space-y-1.5">
                <label className="text-xs font-medium">星期</label>
                <select className={inputClass} value={draft.weekday} onChange={(event) => setDraft({ ...draft, weekday: event.target.value })}>
                  {['周日', '周一', '周二', '周三', '周四', '周五', '周六'].map((label, index) => (
                    <option key={label} value={String(index)}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {draft.schedule === 'monthly' ? (
              <div className="space-y-1.5">
                <label className="text-xs font-medium">日期</label>
                <select className={inputClass} value={draft.monthday} onChange={(event) => setDraft({ ...draft, monthday: event.target.value })}>
                  {Array.from({ length: 31 }, (_, index) => String(index + 1)).map((day) => (
                    <option key={day} value={day}>
                      {day} 日
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {draft.schedule === 'interval' ? (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium">每隔</label>
                  <input className={inputClass} type="number" min={1} value={draft.intervalValue} onChange={(event) => setDraft({ ...draft, intervalValue: event.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium">单位</label>
                  <select className={inputClass} value={draft.intervalUnit} onChange={(event) => setDraft({ ...draft, intervalUnit: event.target.value as Draft['intervalUnit'] })}>
                    <option value="minutes">分钟</option>
                    <option value="hours">小时</option>
                    <option value="days">天</option>
                  </select>
                </div>
              </>
            ) : null}

            {draft.schedule === 'cron' ? (
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-xs font-medium">Cron 表达式</label>
                <input className={cn(inputClass, mono)} placeholder="0 9 * * *" value={draft.cron} onChange={(event) => setDraft({ ...draft, cron: event.target.value })} />
              </div>
            ) : null}

            {draft.schedule === 'once' ? (
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-xs font-medium">执行时间</label>
                <input className={inputClass} type="datetime-local" value={draft.runAt} onChange={(event) => setDraft({ ...draft, runAt: event.target.value })} />
              </div>
            ) : null}

            <div className="space-y-1.5">
              <label className="text-xs font-medium">时区（可选）</label>
              <input className={inputClass} placeholder="Asia/Shanghai" value={draft.timezone} onChange={(event) => setDraft({ ...draft, timezone: event.target.value })} />
            </div>
            <div className="flex items-center gap-2 self-end text-xs">
              <ToggleSwitch
                value={draft.enabled}
                onChange={(next) => setDraft({ ...draft, enabled: next })}
                ariaLabel="创建后立即生效"
              />
              <span>创建后立即生效</span>
            </div>
          </div>

          <p className="mt-3 rounded-lg border border-border/60 bg-muted/30 p-2.5 text-[11px] text-muted-foreground">
            将按此计划执行：{describeSchedule(draft)}
          </p>

          <div className="mt-3 flex justify-end gap-2">
            <button className={btn} onClick={() => setDraft(null)}>
              取消
            </button>
            <button className={btnPrimary} onClick={() => void submit()} disabled={busy === 'save'}>
              <Save className="size-3.5" /> {busy === 'save' ? '保存中…' : draft.id ? '保存修改' : '创建任务'}
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
      ) : jobs.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card/40 px-6 py-11 text-center">
          <div className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
            <Clock className="size-5" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-medium">还没有未来任务</h3>
            <p className="text-xs text-muted-foreground">创建一个未来任务，或直接在聊天里让机器人「每天 9 点提醒我…」。</p>
          </div>
          <button className={btnPrimary} onClick={openNew}>
            <Plus className="size-3.5" /> 新建任务
          </button>
        </div>
      ) : (
        <div className="flex flex-col">
          {jobs.map((job) => {
            const id = jobId(job);
            const enabled = job.enabled !== false;
            const session = str(job.session);
            const cron = str(job.cron_expression ?? job.cron);
            const runAt = str(job.run_at);
            return (
              <div key={id} className="flex flex-wrap items-center gap-3 border-b border-border/60 px-4 py-3 last:border-b-0">
                <div className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-muted text-muted-foreground">
                  <Clock className="size-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[12.5px] font-medium">{str(job.name) || '未命名任务'}</span>
                    {cron ? <span className={cn(mono, 'rounded border border-border bg-muted px-1.5 py-[1px]')}>{cron}</span> : null}
                    {runAt ? <span className={cn(mono, 'rounded border border-border bg-muted px-1.5 py-[1px]')}>{runAt.slice(0, 16)}</span> : null}
                    {enabled ? null : (
                      <span className="rounded border border-border bg-muted px-1.5 py-[1px] text-[10px] text-muted-foreground">已停用</span>
                    )}
                  </div>
                  <div className="line-clamp-1 text-[11px] text-muted-foreground">{str(job.note ?? job.description) || '无需求描述'}</div>
                  {session ? (
                    <div className={cn(mono, 'truncate text-muted-foreground/80')}>投递至 {umoLabel.get(session) || session}</div>
                  ) : null}
                </div>
                <button className={btn} onClick={() => void runNow(job)} disabled={busy === `run:${id}`}>
                  <Rocket className="size-3.5" /> 立即执行
                </button>
                <button className={btn} onClick={() => void toggleJob(job)} disabled={busy === `en:${id}`}>
                  {enabled ? '停用' : '启用'}
                </button>
                <button className={btn} onClick={() => openEdit(job)}>
                  编辑
                </button>
                <button
                  className={cn(btn, 'text-destructive hover:bg-destructive/10 hover:text-destructive')}
                  onClick={() => void removeJob(job)}
                  disabled={busy === `del:${id}`}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
