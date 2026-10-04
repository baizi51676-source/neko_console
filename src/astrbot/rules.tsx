/**
 * Custom session rules page (\u81ea\u5b9a\u4e49\u89c4\u5219).
 *
 * Rules are stored per UMO (unified message origin) as single-key entries:
 *   session_service_config      -> { llm_enabled, persona_id, ... }
 *   kb_config                   -> { kb_ids: [], top_k }
 *   session_plugin_config       -> { disabled_plugins: [], enabled_plugins: [] }
 *   provider_perf_<type>        -> { provider_id, model? }
 * Each block saves independently, and can also fall back to raw JSON.
 */
import { ToggleSwitch } from '@/components/ui/toggle-switch';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  Check,
  Cpu,
  Database,
  Plug,
  Plus,
  RefreshCw,
  Save,
  Search,
  SlidersHorizontal,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toArray } from './api';
import { rules as rulesApi, type Json } from './endpoints';
import { useApp } from './state';

const card = 'rounded-xl border border-border/60 bg-card';
const btn =
  'inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50';
const btnPrimary =
  'inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground shadow-xs transition-colors hover:bg-primary/90 disabled:opacity-50';
const inputClass =
  'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30';
const mono = 'font-mono text-[11px]';

const RULE_LABELS: Record<string, string> = {
  session_service_config: '服务配置',
  kb_config: '知识库',
  session_plugin_config: '插件',
  provider_perf_chat_completion: '对话模型',
  provider_perf_speech_to_text: '语音识别模型',
  provider_perf_text_to_speech: '语音合成模型',
};

function str(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function RulesPage() {
  const { notify } = useApp();
  const [rules, setRules] = useState<Json[]>([]);
  const [umos, setUmos] = useState<Json[]>([]);
  const [available, setAvailable] = useState<Json>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [activeUmo, setActiveUmo] = useState('');
  const [addingUmo, setAddingUmo] = useState('');
  const [jsonDraft, setJsonDraft] = useState<{ key: string; text: string }>({ key: '', text: '' });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [rulePayload, umoPayload] = await Promise.all([
        rulesApi.list(),
        rulesApi.activeUmos().catch(() => ({}) as Json),
      ]);
      const raw = rulePayload as Json;
      setRules(toArray<Json>(raw.rules ?? raw.items ?? raw));
      setAvailable((raw as Json) || {});
      const umoRaw = umoPayload as Json;
      const infos = toArray<Json>(umoRaw.umo_infos ?? umoRaw.umos ?? umoRaw);
      setUmos(infos);
    } catch (e) {
      setError(e instanceof Error ? e.message : '规则读取失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Rules grouped by UMO: { umo: { rule_key: value } } */
  const byUmo = useMemo(() => {
    const map = new Map<string, Record<string, unknown>>();
    for (const item of rules) {
      const umo = str(item.umo ?? item.scope_id ?? item.id);
      if (!umo) continue;
      const bucket = map.get(umo) || {};
      if (item.rule_key) {
        bucket[str(item.rule_key)] = item.rule_value ?? null;
      } else if (item.rules && typeof item.rules === 'object') {
        Object.assign(bucket, item.rules as Record<string, unknown>);
      }
      map.set(umo, bucket);
    }
    return map;
  }, [rules]);

  const knownUmos = useMemo(() => {
    const names = new Set<string>();
    byUmo.forEach((_, key) => names.add(key));
    for (const info of umos) {
      const umo = str(info.umo ?? info);
      if (umo) names.add(umo);
    }
    return [...names];
  }, [byUmo, umos]);

  const labelOf = (umo: string) => {
    const info = umos.find((item) => str(item.umo ?? item) === umo);
    if (!info || typeof info !== 'object') return umo;
    const display = str(info.display_name || info.auto_name || info.session_id);
    return display ? `${display}（${umo}）` : umo;
  };

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return knownUmos;
    return knownUmos.filter((umo) => `${umo} ${labelOf(umo)}`.toLowerCase().includes(needle));
  }, [knownUmos, search, umos]);

  const providerOptions = (type: string) => {
    const key = type === 'chat' ? 'available_chat_providers' : type === 'stt' ? 'available_stt_providers' : 'available_tts_providers';
    return toArray<Json>(available[key]).map((item) => ({
      id: str(item.id ?? item.provider_id ?? item.name),
      label: str(item.name ?? item.id ?? item.provider_id),
    })).filter((item) => item.id);
  };

  const personaOptions = useMemo(
    () => toArray<Json>(available.available_personas).map((item) => ({ id: str(item.name ?? item.persona_id), label: str(item.name ?? item.persona_id) })).filter((item) => item.id),
    [available.available_personas],
  );

  const pluginOptions = useMemo(
    () => toArray<Json>(available.available_plugins).map((item) => ({ id: str(item.name ?? item.id), label: str(item.display_name ?? item.name ?? item.id) })).filter((item) => item.id),
    [available.available_plugins],
  );

  const kbOptions = useMemo(
    () => toArray<Json>(available.available_kbs).map((item) => ({ id: str(item.kb_id ?? item.id ?? item.name), label: str(item.name ?? item.kb_id) })).filter((item) => item.id),
    [available.available_kbs],
  );

  const configOf = (umo: string) => (byUmo.get(umo) || {}) as Record<string, unknown>;

  const saveRule = async (umo: string, ruleKey: string, value: unknown) => {
    setBusy(`${umo}:${ruleKey}`);
    try {
      await rulesApi.save({ umo, rule_key: ruleKey, rule_value: value });
      notify(`${RULE_LABELS[ruleKey] || ruleKey} 已保存`, 'ok');
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : '保存失败', 'error');
    } finally {
      setBusy('');
    }
  };

  const removeRule = async (umo: string, ruleKey: string) => {
    if (!window.confirm(`确定要删除该会话的「${RULE_LABELS[ruleKey] || ruleKey}」规则吗？`)) return;
    setBusy(`${umo}:${ruleKey}`);
    try {
      await rulesApi.remove({ umo, rule_key: ruleKey });
      notify('规则已删除', 'ok');
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : '删除失败', 'error');
    } finally {
      setBusy('');
    }
  };

  const addRule = async () => {
    const umo = addingUmo.trim();
    if (!umo) return notify('请选择或填写会话来源', 'error');
    setActiveUmo(umo);
    setAddingUmo('');
    notify('已选择会话，请配置各项规则', 'ok');
  };

  /* ------------------------------------------------------------ editor view */

  if (activeUmo) {
    const config = configOf(activeUmo);
    const service = (config.session_service_config || {}) as Record<string, unknown>;
    const kb = (config.kb_config || {}) as Record<string, unknown>;
    const plugin = (config.session_plugin_config || {}) as Record<string, unknown>;
    const chatPerf = (config.provider_perf_chat_completion || {}) as Record<string, unknown>;
    const sttPerf = (config.provider_perf_speech_to_text || {}) as Record<string, unknown>;
    const ttsPerf = (config.provider_perf_text_to_speech || {}) as Record<string, unknown>;
    const disabledPlugins = asArray(plugin.disabled_plugins).map((item) => str(item));
    const kbIds = asArray(kb.kb_ids).map((item) => str(item));

    const blocks: { key: string; title: string; icon: typeof Cpu; body: ReactNode }[] = [
      {
        key: 'session_service_config',
        title: '服务配置',
        icon: SlidersHorizontal,
        body: (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-xs">
              <ToggleSwitch
                value={service.llm_enabled !== false}
                onChange={(next) => void saveRule(activeUmo, 'session_service_config', { ...service, llm_enabled: next })}
                ariaLabel="在该会话启用 AI 对话"
              />
              <span>在该会话启用 AI 对话</span>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">强制使用人格</label>
              <select
                className={inputClass}
                value={str(service.persona_id)}
                onChange={(event) => void saveRule(activeUmo, 'session_service_config', { ...service, persona_id: event.target.value || null })}
              >
                <option value="">跟随配置文件</option>
                {personaOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ),
      },
      {
        key: 'kb_config',
        title: '知识库',
        icon: Database,
        body: (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-1.5">
              {kbOptions.length === 0 ? (
                <span className="text-[11px] text-muted-foreground">暂无可选知识库。</span>
              ) : (
                kbOptions.map((option) => {
                  const checked = kbIds.includes(option.id);
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => {
                        const next = checked ? kbIds.filter((id) => id !== option.id) : [...kbIds, option.id];
                        void saveRule(activeUmo, 'kb_config', { ...kb, kb_ids: next });
                      }}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px]',
                        checked ? 'border-primary/30 bg-primary/10 text-primary' : 'border-border bg-muted text-muted-foreground',
                      )}
                    >
                      {checked ? <Check className="size-3" /> : null}
                      {option.label}
                    </button>
                  );
                })
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">检索返回条数 top_k</label>
              <input
                className={cn(inputClass, 'max-w-[140px]')}
                type="number"
                value={Number(kb.top_k ?? 5)}
                onChange={(event) => void saveRule(activeUmo, 'kb_config', { ...kb, top_k: Number(event.target.value) })}
              />
            </div>
          </div>
        ),
      },
      {
        key: 'session_plugin_config',
        title: '禁用插件',
        icon: Plug,
        body: (
          <div className="flex flex-wrap gap-1.5">
            {pluginOptions.length === 0 ? (
              <span className="text-[11px] text-muted-foreground">暂无可选插件。</span>
            ) : (
              pluginOptions.map((option) => {
                const disabled = disabledPlugins.includes(option.id);
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => {
                      const next = disabled ? disabledPlugins.filter((id) => id !== option.id) : [...disabledPlugins, option.id];
                      void saveRule(activeUmo, 'session_plugin_config', { ...plugin, disabled_plugins: next });
                    }}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px]',
                      disabled ? 'border-destructive/40 bg-destructive/10 text-destructive' : 'border-border bg-muted text-muted-foreground',
                    )}
                  >
                    {disabled ? <X className="size-3" /> : null}
                    {option.label}
                  </button>
                );
              })
            )}
          </div>
        ),
      },
    ];

    const providerBlocks: { key: string; title: string; value: Record<string, unknown>; options: { id: string; label: string }[] }[] = [
      { key: 'provider_perf_chat_completion', title: '对话模型', value: chatPerf, options: providerOptions('chat') },
      { key: 'provider_perf_speech_to_text', title: '语音识别模型', value: sttPerf, options: providerOptions('stt') },
      { key: 'provider_perf_text_to_speech', title: '语音合成模型', value: ttsPerf, options: providerOptions('tts') },
    ];

    return (
      <div className="flex flex-col gap-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <button className={btn} onClick={() => setActiveUmo('')}>
              <X className="size-3.5" /> 返回
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold tracking-tight">自定义规则</h1>
              <p className={cn('truncate text-[11px] text-muted-foreground', mono)}>{labelOf(activeUmo)}</p>
            </div>
          </div>
          <button className={btn} onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} /> 刷新
          </button>
        </header>

        <div className="grid gap-4 xl:grid-cols-2">
          {blocks.map((block) => {
            const Icon = block.icon;
            const exists = Boolean(config[block.key]);
            return (
              <section key={block.key} className={cn(card, 'flex flex-col gap-3 p-4')}>
                <div className="flex items-center justify-between gap-2">
                  <h2 className="flex items-center gap-1.5 text-sm font-semibold">
                    <Icon className="size-4 text-primary" /> {block.title}
                    {exists ? <span className="rounded border border-primary/30 bg-primary/10 px-1.5 py-[1px] text-[10px] text-primary">已配置</span> : null}
                    {busy === `${activeUmo}:${block.key}` ? (
                      <span className="text-[10px] text-muted-foreground">保存中…</span>
                    ) : null}
                  </h2>
                  {exists ? (
                    <button className={cn(btn, 'text-destructive hover:bg-destructive/10')} onClick={() => void removeRule(activeUmo, block.key)}>
                      <Trash2 className="size-3.5" /> 清除
                    </button>
                  ) : null}
                </div>
                {block.body}
                <details className="mt-auto">
                  <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground">高级：直接编辑 JSON</summary>
                  <textarea
                    className="mt-2 h-24 w-full rounded-md border border-input bg-transparent p-2.5 font-mono text-[11px] outline-none"
                    value={jsonDraft.key === block.key ? jsonDraft.text : JSON.stringify(config[block.key] ?? {}, null, 2)}
                    onChange={(event) => setJsonDraft({ key: block.key, text: event.target.value })}
                  />
                  <button
                    className={cn(btn, 'mt-1.5')}
                    onClick={() => {
                      try {
                        const parsed = JSON.parse(jsonDraft.key === block.key ? jsonDraft.text : JSON.stringify(config[block.key] ?? {}));
                        void saveRule(activeUmo, block.key, parsed);
                        setJsonDraft({ key: '', text: '' });
                      } catch (e) {
                        notify(e instanceof Error ? e.message : 'JSON 格式错误', 'error');
                      }
                    }}
                  >
                    <Save className="size-3.5" /> 保存 JSON
                  </button>
                </details>
              </section>
            );
          })}

          {providerBlocks.map((block) => {
            const exists = Boolean(config[block.key]);
            return (
              <section key={block.key} className={cn(card, 'flex flex-col gap-3 p-4')}>
                <div className="flex items-center justify-between gap-2">
                  <h2 className="flex items-center gap-1.5 text-sm font-semibold">
                    <Cpu className="size-4 text-primary" /> {block.title}
                    {exists ? <span className="rounded border border-primary/30 bg-primary/10 px-1.5 py-[1px] text-[10px] text-primary">已配置</span> : null}
                    {busy === `${activeUmo}:${block.key}` ? (
                      <span className="text-[10px] text-muted-foreground">保存中…</span>
                    ) : null}
                  </h2>
                  {exists ? (
                    <button className={cn(btn, 'text-destructive hover:bg-destructive/10')} onClick={() => void removeRule(activeUmo, block.key)}>
                      <Trash2 className="size-3.5" /> 清除
                    </button>
                  ) : null}
                </div>
                <select
                  className={inputClass}
                  value={str(block.value.provider_id)}
                  onChange={(event) => void saveRule(activeUmo, block.key, { ...block.value, provider_id: event.target.value || null })}
                >
                  <option value="">跟随配置文件</option>
                  {block.options.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-muted-foreground">为该会话单独指定{block.title}，优先级高于配置文件。</p>
              </section>
            );
          })}
        </div>
      </div>
    );
  }

  /* -------------------------------------------------------------- list view */

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <SlidersHorizontal className="size-4 text-primary" /> 自定义规则
          </h1>
          <p className="text-xs text-muted-foreground">
            为特定会话单独指定模型、人格、知识库或插件开关；优先级高于配置文件。用 /sid 指令可以查看会话 ID。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className={cn(inputClass, 'h-8 w-auto min-w-[220px] py-0 text-xs')} value={addingUmo} onChange={(event) => setAddingUmo(event.target.value)}>
            <option value="">选择会话…</option>
            {knownUmos.map((umo) => (
              <option key={umo} value={umo}>
                {labelOf(umo)}
              </option>
            ))}
          </select>
          <button className={btnPrimary} onClick={() => void addRule()}>
            <Plus className="size-3.5" /> 配置该会话
          </button>
          <button className={btn} onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} /> 刷新
          </button>
        </div>
      </header>

      <div className="flex items-center gap-2">
        <span className="relative w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input className={cn(inputClass, 'h-8 pl-8 text-xs')} placeholder="搜索会话" value={search} onChange={(event) => setSearch(event.target.value)} />
        </span>
        <span className="text-[11px] text-muted-foreground">已配置规则的会话：{byUmo.size} 个</span>
      </div>

      {error ? (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {loading ? (
        <div className={cn(card, 'grid place-items-center p-10 text-xs text-muted-foreground')}>
          <span className="flex items-center gap-2">
            <RefreshCw className="size-4 animate-spin" /> 加载中…
          </span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card/40 px-6 py-11 text-center">
          <div className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
            <UserRound className="size-5" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-medium">还没有自定义规则</h3>
            <p className="text-xs text-muted-foreground">从上方选择一个会话开始配置，未配置的会话继续使用配置文件里的全局设置。</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col">
          {filtered.map((umo) => {
            const config = configOf(umo);
            const keys = Object.keys(config);
            return (
              <button
                key={umo}
                onClick={() => setActiveUmo(umo)}
                className="flex flex-wrap items-center gap-3 border-b border-border/60 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-accent/40"
              >
                <div className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-muted text-muted-foreground">
                  <UserRound className="size-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] font-medium">{labelOf(umo)}</div>
                  <div className={cn('truncate text-muted-foreground', mono)}>{umo}</div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {keys.length === 0 ? (
                    <span className="text-[11px] text-muted-foreground">无规则</span>
                  ) : (
                    keys.map((key) => (
                      <span key={key} className="rounded border border-primary/30 bg-primary/10 px-1.5 py-[1px] text-[10px] text-primary">
                        {RULE_LABELS[key] || key}
                      </span>
                    ))
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
