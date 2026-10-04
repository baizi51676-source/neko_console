/**
 * Robots / platform adapters page.
 *
 * Full CRUD over AstrBot's `/api/v1/bots` + `/api/v1/bot-types`, including the
 * create wizard (pick type + id + config), enable switches, connection test
 * and delete. Feature parity target: AstrBot console → 机器人.
 */
import { ToggleSwitch } from '@/components/ui/toggle-switch';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Plus,
  Power,
  RefreshCw,
  Radio,
  Trash2,
  Wand2,
  X,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toArray } from './api';
import { bots as botsApi, type BotTypeInfo, type Json } from './endpoints';
import { redactSecrets } from './redact';
import { useApp } from './state';

const card = 'rounded-xl border border-border/60 bg-card';
const btn =
  'inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50';
const btnPrimary =
  'inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground shadow-xs transition-colors hover:bg-primary/90 disabled:opacity-50';
const inputClass =
  'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30';
const mono = 'font-mono text-[11px]';

function idOf(bot: Json): string {
  return String(bot.id ?? bot.bot_id ?? '');
}

function typeOf(bot: Json): string {
  return String(bot.type ?? bot.platform ?? '');
}

function enabledOf(bot: Json): boolean {
  const raw = bot.enable ?? bot.enabled;
  return raw === undefined ? true : Boolean(raw);
}

function configOf(bot: Json): Json {
  const direct = bot.config;
  if (direct && typeof direct === 'object' && !Array.isArray(direct)) return direct as Json;
  const clone: Json = { ...bot };
  for (const key of ['config', 'enabled', 'enable']) delete clone[key];
  return clone;
}

function StatusPill({ tone, children }: { tone: 'ok' | 'off' | 'warn'; children: React.ReactNode }) {
  const map = {
    ok: 'neko-chip-accent',
    off: 'border-border bg-muted text-muted-foreground',
    warn: 'neko-warn-chip neko-warn',
  } as const;
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-[3px] text-[11px] font-medium', map[tone])}>
      {children}
    </span>
  );
}


function ConfigPreview({ config }: { config: Json }) {
  const [reveal, setReveal] = useState(false);
  return (
    <details className="group rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
      <summary className="flex cursor-pointer items-center justify-between gap-2 text-[11px] font-medium text-muted-foreground hover:text-foreground">
        <span>查看配置</span>
        <span
          role="button"
          tabIndex={0}
          onClick={(event) => {
            event.preventDefault();
            setReveal((value) => !value);
          }}
          className="rounded border border-border bg-card px-1.5 py-[1px] text-[10px] font-normal hover:bg-accent"
        >
          {reveal ? '隐藏敏感值' : '显示敏感值'}
        </span>
      </summary>
      <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-muted-foreground">
        {JSON.stringify(reveal ? config : redactSecrets(config), null, 2)}
      </pre>
    </details>
  );
}

export function PlatformsPage() {
  const { notify } = useApp();
  const [list, setList] = useState<Json[]>([]);
  const [types, setTypes] = useState<BotTypeInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string>('');
  const [error, setError] = useState('');
  const [wizardOpen, setWizardOpen] = useState(false);

  const [draftType, setDraftType] = useState('');
  const [draftId, setDraftId] = useState('');
  const [draftConfig, setDraftConfig] = useState('{}');
  const [draftEnabled, setDraftEnabled] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [botsPayload, typesPayload] = await Promise.all([botsApi.list(), botsApi.types()]);
      setList(toArray<Json>(botsPayload));
      const typeList = Array.isArray(typesPayload)
        ? (typesPayload as BotTypeInfo[])
        : toArray<BotTypeInfo>((typesPayload as { bot_types?: unknown })?.bot_types);
      setTypes(typeList);
    } catch (e) {
      setError(e instanceof Error ? e.message : '机器人列表读取失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    const on = list.filter((bot) => enabledOf(bot)).length;
    const typeCount = new Set(list.map((bot) => typeOf(bot)).filter(Boolean)).size;
    return { total: list.length, on, off: list.length - on, typeCount };
  }, [list]);

  const resetDraft = () => {
    setDraftType(types[0]?.type || types[0]?.id || '');
    setDraftId('');
    setDraftConfig('{}');
    setDraftEnabled(true);
  };

  const openWizard = () => {
    resetDraft();
    setWizardOpen(true);
  };

  const submit = async () => {
    const botId = draftId.trim();
    const type = (draftType || '').trim();
    if (!botId) return notify('请填写机器人 ID', 'error');
    if (botId.includes(':') || botId.includes('!')) return notify('机器人 ID 不能包含 ":" 或 "!"', 'error');
    if (!type) return notify('请选择适配器类型', 'error');
    let extra: Json = {};
    try {
      extra = draftConfig.trim() ? (JSON.parse(draftConfig) as Json) : {};
    } catch {
      return notify('高级配置不是合法 JSON', 'error');
    }
    if (list.some((bot) => idOf(bot) === botId)) return notify(`机器人 ID "${botId}" 已存在`, 'error');

    setBusy('create');
    try {
      await botsApi.create({ bot_id: botId, config: { type, id: botId, enable: draftEnabled, ...extra } });
      notify('机器人创建成功', 'ok');
      setWizardOpen(false);
      resetDraft();
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : '创建失败', 'error');
    } finally {
      setBusy('');
    }
  };

  const toggle = async (bot: Json) => {
    const botId = idOf(bot);
    const next = !enabledOf(bot);
    setBusy(`toggle:${botId}`);
    try {
      await botsApi.setEnabled(botId, next);
      setList((prev) =>
        prev.map((row) => (idOf(row) === botId ? { ...row, enable: next, enabled: next } : row)),
      );
      notify(next ? '已启用' : '已停用', 'ok');
    } catch (e) {
      notify(e instanceof Error ? e.message : '状态更新失败', 'error');
    } finally {
      setBusy('');
    }
  };

  const test = async (bot: Json) => {
    const botId = idOf(bot);
    setBusy(`test:${botId}`);
    try {
      const out = await botsApi.test(botId);
      const ok = (out as { success?: boolean; ok?: boolean })?.success ?? (out as { ok?: boolean })?.ok ?? true;
      notify(ok ? `连通正常：${botId}` : `测试失败：${botId}`, ok ? 'ok' : 'error');
    } catch (e) {
      notify(e instanceof Error ? e.message : '测试失败', 'error');
    } finally {
      setBusy('');
    }
  };

  const remove = async (bot: Json) => {
    const botId = idOf(bot);
    if (!window.confirm(`确定要删除机器人 "${botId}" 吗？此操作不可撤销。`)) return;
    setBusy(`remove:${botId}`);
    try {
      await botsApi.remove(botId);
      setList((prev) => prev.filter((row) => idOf(row) !== botId));
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
          <h1 className="text-lg font-semibold tracking-tight">机器人</h1>
          <p className="text-xs text-muted-foreground">
            管理平台适配器实例，一个实例对应一个消息平台连接（QQ / 飞书 / 企业微信 / 微信 / Telegram 等）。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className={btn} onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} /> 刷新
          </button>
          <button className={btnPrimary} onClick={openWizard}>
            <Plus className="size-3.5" /> 创建机器人
          </button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: '机器人总数', value: stats.total, hint: '已配置的平台适配器' },
          { label: '运行中', value: stats.on, hint: '已启用并对外连接' },
          { label: '已停用', value: stats.off, hint: '不会收发消息' },
          { label: '适配器类型', value: stats.typeCount, hint: '用到的平台类型数量' },
        ].map((item) => (
          <div key={item.label} className={cn(card, 'p-3.5')}>
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{item.label}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{item.value}</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">{item.hint}</div>
          </div>
        ))}
      </div>

      {error ? (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div className="space-y-1">
            <div className="font-medium">读取失败</div>
            <div className="text-destructive/80">{error}</div>
          </div>
        </div>
      ) : null}

      {wizardOpen ? (
        <section className={cn(card, 'p-4')}>
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-0.5">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold">
                <Wand2 className="size-4 text-primary" /> 创建机器人
              </h2>
              <p className="text-xs text-muted-foreground">选择适配器类型并填写实例 ID，需要时可在高级配置里补充连接参数。</p>
            </div>
            <button className={btn} onClick={() => setWizardOpen(false)}>
              <X className="size-3.5" /> 取消
            </button>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[260px_1fr]">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium">适配器类型</label>
                <select className={inputClass} value={draftType} onChange={(e) => setDraftType(e.target.value)}>
                  {types.length === 0 ? <option value="">（无可选类型）</option> : null}
                  {types.map((t) => (
                    <option key={t.type || t.id} value={t.type || t.id}>
                      {t.display_name || t.type || t.id}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">机器人 ID</label>
                <input
                  className={inputClass}
                  placeholder="例如 my_qq_bot"
                  value={draftId}
                  onChange={(e) => setDraftId(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">全局唯一，不能包含 “:” 或 “!”。</p>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <ToggleSwitch value={draftEnabled} onChange={setDraftEnabled} ariaLabel="创建后立即启用" />
                <span>创建后立即启用</span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium">高级配置（JSON，可选）</label>
                <span className="text-[11px] text-muted-foreground">
                  {types.find((t) => (t.type || t.id) === draftType)?.description || ''}
                </span>
              </div>
              <textarea
                className="h-40 w-full rounded-md border border-input bg-transparent p-3 font-mono text-[12px] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30"
                value={draftConfig}
                spellCheck={false}
                onChange={(e) => setDraftConfig(e.target.value)}
              />
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-muted-foreground">
                  会与 <code className={mono}>type</code> / <code className={mono}>id</code> / <code className={mono}>enable</code> 合并后提交。
                </span>
                <button className={btnPrimary} onClick={() => void submit()} disabled={busy === 'create'}>
                  {busy === 'create' ? '创建中…' : '创建'}
                </button>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {loading ? (
        <div className={cn(card, 'grid place-items-center p-10 text-xs text-muted-foreground')}>
          <span className="flex items-center gap-2">
            <RefreshCw className="size-4 animate-spin" /> 加载中…
          </span>
        </div>
      ) : list.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card/40 px-6 py-11 text-center">
          <div className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
            <Radio className="size-5" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-medium">还没有机器人</h3>
            <p className="text-xs text-muted-foreground">创建一个平台适配器，把 AstrBot 接入 QQ、飞书、企业微信等消息平台。</p>
          </div>
          <button className={btnPrimary} onClick={openWizard}>
            <Plus className="size-3.5" /> 创建机器人
          </button>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {list.map((bot) => {
            const botId = idOf(bot);
            const enabled = enabledOf(bot);
            const type = typeOf(bot);
            const typeMeta = types.find((t) => (t.type || t.id) === type);
            const cfg = configOf(bot);
            const errText = String(bot.error || bot.last_error || '');
            return (
              <article key={botId || Math.random().toString(36)} className={cn(card, 'flex flex-col gap-3 p-3.5')}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <div
                      className={cn(
                        'grid size-9 shrink-0 place-items-center rounded-lg border',
                        enabled ? 'border-primary/25 bg-primary/10 text-primary' : 'border-border bg-muted text-muted-foreground',
                      )}
                    >
                      <Radio className="size-4" />
                    </div>
                    <div className="min-w-0 space-y-0.5">
                      <div className="truncate text-sm font-medium">{botId || '（未命名）'}</div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {typeMeta?.display_name || type || '未知类型'}
                        {typeMeta?.support_streaming_message ? ' · 支持流式' : ''}
                        {typeMeta?.support_proactive_message ? ' · 支持主动消息' : ''}
                      </div>
                    </div>
                  </div>
                  {enabled ? (
                    <StatusPill tone="ok">
                      <CheckCircle2 className="size-3" /> 运行中
                    </StatusPill>
                  ) : (
                    <StatusPill tone="off">已停用</StatusPill>
                  )}
                </div>

                {errText ? (
                  <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-[11px] text-destructive">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                    <span className="line-clamp-3">{errText}</span>
                  </div>
                ) : null}

                <ConfigPreview config={cfg} />

                <div className="mt-auto flex items-center gap-2">
                  <button className={btn} onClick={() => void toggle(bot)} disabled={busy === `toggle:${botId}`}>
                    <Power className="size-3.5" /> {enabled ? '停用' : '启用'}
                  </button>
                  <button className={btn} onClick={() => void test(bot)} disabled={busy === `test:${botId}`}>
                    <Zap className="size-3.5" /> {busy === `test:${botId}` ? '测试中…' : '测试'}
                  </button>
                  <button
                    className={cn(btn, 'ml-auto text-destructive hover:bg-destructive/10 hover:text-destructive')}
                    onClick={() => void remove(bot)}
                    disabled={busy === `remove:${botId}`}
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