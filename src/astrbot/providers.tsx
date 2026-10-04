/**
 * Model providers page (提供商 + 提供商源).
 *
 * Parity target: AstrBot console \u201c\u6a21\u578b\u63d0\u4f9b\u5546\u201d \u2014 provider CRUD with type filters,
 * connectivity test, provider-source management and per-source model discovery.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  KeyRound,
  Layers,
  Plus,
  RefreshCw,
  Server,
  Trash2,
  Wand2,
  X,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toArray } from './api';
import { providers as providersApi, type Json } from './endpoints';
import { maskSecret, redactSecrets } from './redact';
import { useApp } from './state';

const card = 'rounded-xl border border-border/60 bg-card';
const btn =
  'inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50';
const btnPrimary =
  'inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground shadow-xs transition-colors hover:bg-primary/90 disabled:opacity-50';
const inputClass =
  'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30';
const mono = 'font-mono text-[11px]';

const TYPE_LABELS: Record<string, string> = {
  chat_completion: '对话',
  speech_to_text: '语音转文字',
  text_to_speech: '文本转语音',
  embedding: '嵌入',
  rerank: '重排序',
  agent_runner: 'Agent 执行器',
};

function typeLabel(value: string): string {
  return TYPE_LABELS[value] || value || '未知';
}

function str(value: unknown): string {
  if (Array.isArray(value)) return value.join(', ');
  if (value === null || value === undefined) return '';
  return String(value);
}

function KeyPreview({ value }: { value: unknown }) {
  const [reveal, setReveal] = useState(false);
  const text = str(value);
  if (!text) return <span className="text-muted-foreground">未设置</span>;
  // Reuse the shared redaction rule instead of keeping a second one here.
  const shown = reveal
    ? text
    : text
        .split(/([,，\s]+)/)
        .map((part) => (/^[,，\s]*$/.test(part) ? part : maskSecret(part)))
        .join('');
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn(mono, 'break-all')}>{shown}</span>
      <button
        type="button"
        className="rounded border border-border px-1.5 py-[1px] text-[10px] text-muted-foreground hover:bg-accent"
        onClick={() => setReveal((v) => !v)}
      >
        {reveal ? '隐藏' : '显示'}
      </button>
    </span>
  );
}

function ConfigDetails({ value }: { value: Json }) {
  const [reveal, setReveal] = useState(false);
  return (
    <details className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
      <summary className="flex cursor-pointer items-center justify-between gap-2 text-[11px] font-medium text-muted-foreground hover:text-foreground">
        <span>查看配置</span>
        <span
          role="button"
          tabIndex={0}
          onClick={(event) => {
            event.preventDefault();
            setReveal((v) => !v);
          }}
          className="rounded border border-border bg-card px-1.5 py-[1px] text-[10px] font-normal hover:bg-accent"
        >
          {reveal ? '隐藏敏感值' : '显示敏感值'}
        </span>
      </summary>
      <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-muted-foreground">
        {JSON.stringify(reveal ? value : redactSecrets(value), null, 2)}
      </pre>
    </details>
  );
}

interface TemplateOption {
  key: string;
  value: Json;
}

export function ProvidersPage() {
  const { notify } = useApp();
  const [tab, setTab] = useState<'providers' | 'sources'>('providers');
  const [providers, setProviders] = useState<Json[]>([]);
  const [sources, setSources] = useState<Json[]>([]);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [openForm, setOpenForm] = useState(false);
  const [modelsOf, setModelsOf] = useState<Record<string, string[] | 'loading'>>({});

  const [formTemplate, setFormTemplate] = useState('');
  const [formId, setFormId] = useState('');
  const [formBase, setFormBase] = useState('');
  const [formKey, setFormKey] = useState('');
  const [formModel, setFormModel] = useState('');
  const [formExtra, setFormExtra] = useState('{}');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [providerPayload, sourcePayload, schemaPayload] = await Promise.all([
        providersApi.list(),
        providersApi.sources.list(),
        providersApi.schema().catch(() => ({}) as Json),
      ]);
      setProviders(toArray<Json>((providerPayload as Json)?.providers ?? providerPayload));
      setSources(toArray<Json>((sourcePayload as Json)?.provider_sources ?? sourcePayload));

      const templateMap = ((schemaPayload as Json)?.config_schema as Json)?.provider as Json | undefined;
      const raw = (templateMap?.config_template as Json) || {};
      const options: TemplateOption[] = Object.entries(raw).map(([key, value]) => ({
        key,
        value: (value && typeof value === 'object' ? value : {}) as Json,
      }));
      setTemplates(options);
      if (!formTemplate && options.length) setFormTemplate(options[0].key);
    } catch (e) {
      setError(e instanceof Error ? e.message : '提供商列表读取失败');
    } finally {
      setLoading(false);
    }
  }, [formTemplate]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const providerTypes = useMemo(() => {
    const set = new Set(providers.map((item) => str(item.provider_type)).filter(Boolean));
    return ['all', ...[...set].sort()];
  }, [providers]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return providers.filter((item) => {
      const typeOk = typeFilter === 'all' || str(item.provider_type) === typeFilter;
      if (!typeOk) return false;
      if (!needle) return true;
      return [item.id, item.provider, item.type, item.model, item.api_base]
        .map((v) => str(v).toLowerCase())
        .some((v) => v.includes(needle));
    });
  }, [providers, typeFilter, search]);

  const resetForm = () => {
    setFormId('');
    setFormBase('');
    setFormKey('');
    setFormModel('');
    setFormExtra('{}');
  };

  const templateValue = (): Json => templates.find((t) => t.key === formTemplate)?.value || {};

  const applyTemplateDefaults = (key: string) => {
    setFormTemplate(key);
    const tpl = templates.find((t) => t.key === key)?.value;
    if (tpl) {
      setFormBase(str(tpl.api_base));
      setFormId(str(tpl.id));
    }
  };

  const toggleProvider = async (item: Json) => {
    const id = str(item.id);
    const next = !(item.enable !== false);
    setBusy(`p:${id}`);
    try {
      await providersApi.setEnabled(id, next);
      setProviders((prev) => prev.map((row) => (str(row.id) === id ? { ...row, enable: next } : row)));
      notify(next ? '已启用' : '已禁用', 'ok');
    } catch (e) {
      notify(e instanceof Error ? e.message : '状态更新失败', 'error');
    } finally {
      setBusy('');
    }
  };

  const testProvider = async (item: Json) => {
    const id = str(item.id);
    setBusy(`t:${id}`);
    try {
      await providersApi.test(id);
      notify(`测试通过：${id}`, 'ok');
    } catch (e) {
      notify(e instanceof Error ? e.message : `测试失败：${id}`, 'error');
    } finally {
      setBusy('');
    }
  };

  const removeProvider = async (item: Json) => {
    const id = str(item.id);
    if (!window.confirm(`确定要删除模型提供商 "${id}" 吗？`)) return;
    setBusy(`d:${id}`);
    try {
      await providersApi.remove(id);
      setProviders((prev) => prev.filter((row) => str(row.id) !== id));
      notify('已删除', 'ok');
    } catch (e) {
      notify(e instanceof Error ? e.message : '删除失败', 'error');
    } finally {
      setBusy('');
    }
  };

  const submitProvider = async () => {
    const id = formId.trim() || str(templateValue().id);
    if (!id) return notify('请填写提供商 ID', 'error');
    let extra: Json = {};
    try {
      extra = formExtra.trim() ? (JSON.parse(formExtra) as Json) : {};
    } catch {
      return notify('高级配置不是合法 JSON', 'error');
    }
    const tpl = templateValue();
    const payload: Json = {
      ...tpl,
      ...extra,
      id,
      provider: str(extra.provider || tpl.provider || id),
      enable: true,
    };
    if (formBase.trim()) payload.api_base = formBase.trim();
    if (formKey.trim()) payload.key = formKey.split(/[\n,]/).map((v) => v.trim()).filter(Boolean);
    if (formModel.trim()) payload.model = formModel.trim();

    setBusy('create-provider');
    try {
      await providersApi.create(payload);
      notify('提供商创建成功', 'ok');
      setOpenForm(false);
      resetForm();
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : '创建失败', 'error');
    } finally {
      setBusy('');
    }
  };

  const submitSource = async () => {
    const id = formId.trim() || str(templateValue().id);
    if (!id) return notify('请填写提供商源 ID', 'error');
    let extra: Json = {};
    try {
      extra = formExtra.trim() ? (JSON.parse(formExtra) as Json) : {};
    } catch {
      return notify('高级配置不是合法 JSON', 'error');
    }
    const tpl = templateValue();
    const payload: Json = {
      ...tpl,
      ...extra,
      id,
      provider: str(extra.provider || tpl.provider || id),
      enable: true,
    };
    if (formBase.trim()) payload.api_base = formBase.trim();
    if (formKey.trim()) payload.key = formKey.split(/[\n,]/).map((v) => v.trim()).filter(Boolean);

    setBusy('create-source');
    try {
      await providersApi.sources.create(payload);
      notify('提供商源创建成功', 'ok');
      setOpenForm(false);
      resetForm();
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : '创建失败', 'error');
    } finally {
      setBusy('');
    }
  };

  const removeSource = async (item: Json) => {
    const id = str(item.id);
    if (!window.confirm(`确定要删除提供商源 "${id}" 吗？关联的模型配置也会一并删除。`)) return;
    setBusy(`ds:${id}`);
    try {
      await providersApi.sources.remove(id);
      setSources((prev) => prev.filter((row) => str(row.id) !== id));
      notify('已删除', 'ok');
    } catch (e) {
      notify(e instanceof Error ? e.message : '删除失败', 'error');
    } finally {
      setBusy('');
    }
  };

  const fetchModels = async (item: Json) => {
    const id = str(item.id);
    setModelsOf((prev) => ({ ...prev, [id]: 'loading' }));
    try {
      const payload = await providersApi.sources.models(id);
      const list = toArray<unknown>((payload as Json)?.models ?? payload).map((m) =>
        typeof m === 'string' ? m : str((m as Json)?.id ?? (m as Json)?.name),
      );
      setModelsOf((prev) => ({ ...prev, [id]: list.filter(Boolean) }));
      notify(`获取到 ${list.length} 个模型`, 'ok');
    } catch (e) {
      setModelsOf((prev) => ({ ...prev, [id]: [] }));
      notify(e instanceof Error ? e.message : '获取模型列表失败', 'error');
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold tracking-tight">模型提供商</h1>
          <p className="text-xs text-muted-foreground">
            管理对话、语音、嵌入、重排序等服务商。提供商源用于批量管理同一服务商的 API Key 与模型列表。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className={btn} onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} /> 刷新
          </button>
          <button
            className={btnPrimary}
            onClick={() => {
              resetForm();
              setOpenForm((v) => !v);
            }}
          >
            {openForm ? <X className="size-3.5" /> : <Plus className="size-3.5" />}
            {openForm ? '收起表单' : tab === 'providers' ? '新增提供商' : '新增提供商源'}
          </button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
          {([
            { id: 'providers', label: '提供商', count: providers.length },
            { id: 'sources', label: '提供商源', count: sources.length },
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

        {tab === 'providers' ? (
          <>
            <select className={cn(inputClass, 'h-8 w-auto min-w-[130px] py-0 text-xs')} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              {providerTypes.map((type) => (
                <option key={type} value={type}>
                  {type === 'all' ? '全部类型' : typeLabel(type)}
                </option>
              ))}
            </select>
            <input
              className={cn(inputClass, 'h-8 w-auto min-w-[180px] py-0 text-xs')}
              placeholder="搜索 ID / 模型 / 地址"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </>
        ) : null}
      </div>

      {openForm ? (
        <section className={cn(card, 'p-4')}>
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <Wand2 className="size-4 text-primary" />
            {tab === 'providers' ? '新增模型提供商' : '新增提供商源'}
          </h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">类型模板</label>
              <select className={inputClass} value={formTemplate} onChange={(e) => applyTemplateDefaults(e.target.value)}>
                {templates.length === 0 ? <option value="">（无模板，使用高级配置）</option> : null}
                {templates.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.key}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground">
                {str(templateValue().type) ? `接口类型：${str(templateValue().type)}` : '模板提供默认字段，可在高级配置中覆盖'}
              </p>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">ID</label>
              <input className={inputClass} placeholder="例如 openai / my_source" value={formId} onChange={(e) => setFormId(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Base URL</label>
              <input className={inputClass} placeholder="https://api.example.com/v1" value={formBase} onChange={(e) => setFormBase(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">API Key</label>
              <input className={inputClass} placeholder="sk-...（多个用逗号或换行分隔）" value={formKey} onChange={(e) => setFormKey(e.target.value)} />
            </div>
            {tab === 'providers' ? (
              <div className="space-y-1.5">
                <label className="text-xs font-medium">模型（可选）</label>
                <input className={inputClass} placeholder="例如 mimo-v2.6-flash" value={formModel} onChange={(e) => setFormModel(e.target.value)} />
              </div>
            ) : null}
          </div>
          <div className="mt-3 space-y-1.5">
            <label className="text-xs font-medium">高级配置（JSON，可选）</label>
            <textarea
              className="h-32 w-full rounded-md border border-input bg-transparent p-3 font-mono text-[12px] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30"
              value={formExtra}
              spellCheck={false}
              onChange={(e) => setFormExtra(e.target.value)}
            />
          </div>
          <div className="mt-3 flex items-center justify-end gap-2">
            <button className={btn} onClick={() => setOpenForm(false)}>
              取消
            </button>
            <button
              className={btnPrimary}
              onClick={() => void (tab === 'providers' ? submitProvider() : submitSource())}
              disabled={busy.startsWith('create')}
            >
              {busy.startsWith('create') ? '提交中…' : '创建'}
            </button>
          </div>
        </section>
      ) : null}

      {error ? (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div>
            <div className="font-medium">读取失败</div>
            <div className="text-destructive/80">{error}</div>
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className={cn(card, 'grid place-items-center p-10 text-xs text-muted-foreground')}>
          <span className="flex items-center gap-2">
            <RefreshCw className="size-4 animate-spin" /> 加载中…
          </span>
        </div>
      ) : tab === 'providers' ? (
        filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card/40 px-6 py-11 text-center">
            <div className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
              <Cpu className="size-5" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-medium">暂无模型提供商</h3>
              <p className="text-xs text-muted-foreground">新增一个提供商，让机器人具备对话、语音或嵌入能力。</p>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {filtered.map((item) => {
              const id = str(item.id);
              const enabled = item.enable !== false;
              return (
                <article key={id} className={cn(card, 'flex flex-col gap-3 p-3.5')}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-2.5">
                      <div
                        className={cn(
                          'grid size-9 shrink-0 place-items-center rounded-lg border',
                          enabled ? 'border-primary/25 bg-primary/10 text-primary' : 'border-border bg-muted text-muted-foreground',
                        )}
                      >
                        <Cpu className="size-4" />
                      </div>
                      <div className="min-w-0 space-y-0.5">
                        <div className="truncate text-sm font-medium">{id}</div>
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                          <span className="rounded border border-border bg-muted px-1.5 py-[1px]">{typeLabel(str(item.provider_type))}</span>
                          {item.model ? <span className="truncate">{str(item.model)}</span> : null}
                        </div>
                      </div>
                    </div>
                    {enabled ? (
                      <span className="inline-flex items-center gap-1 rounded-full border neko-chip-accent px-2 py-[3px] text-[11px] font-medium text-[var(--primary)]">
                        <CheckCircle2 className="size-3" /> 启用
                      </span>
                    ) : (
                      <span className="rounded-full border border-border bg-muted px-2 py-[3px] text-[11px] text-muted-foreground">已禁用</span>
                    )}
                  </div>

                  <dl className="grid gap-1.5 text-[11px]">
                    <div className="flex items-center gap-2">
                      <dt className="w-20 shrink-0 text-muted-foreground">接口地址</dt>
                      <dd className={cn(mono, 'truncate')}>{str(item.api_base) || '—'}</dd>
                    </div>
                    <div className="flex items-start gap-2">
                      <dt className="flex w-20 shrink-0 items-center gap-1 text-muted-foreground">
                        <KeyRound className="size-3" /> API Key
                      </dt>
                      <dd className="min-w-0">
                        <KeyPreview value={item.key} />
                      </dd>
                    </div>
                    <div className="flex items-center gap-2">
                      <dt className="w-20 shrink-0 text-muted-foreground">来源</dt>
                      <dd className={cn(mono, 'truncate')}>{str(item.provider_source_id) || '—'}</dd>
                    </div>
                  </dl>

                  <ConfigDetails value={item} />

                  <div className="mt-auto flex items-center gap-2">
                    <button className={btn} onClick={() => void toggleProvider(item)} disabled={busy === `p:${id}`}>
                      {enabled ? '禁用' : '启用'}
                    </button>
                    <button className={btn} onClick={() => void testProvider(item)} disabled={busy === `t:${id}`}>
                      <Zap className="size-3.5" /> {busy === `t:${id}` ? '测试中…' : '测试'}
                    </button>
                    <button
                      className={cn(btn, 'ml-auto text-destructive hover:bg-destructive/10 hover:text-destructive')}
                      onClick={() => void removeProvider(item)}
                      disabled={busy === `d:${id}`}
                    >
                      <Trash2 className="size-3.5" /> 删除
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )
      ) : sources.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card/40 px-6 py-11 text-center">
          <div className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
            <Layers className="size-5" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-medium">暂无提供商源</h3>
            <p className="text-xs text-muted-foreground">提供商源用于集中管理同一服务商的地址与密钥，并批量获取模型列表。</p>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {sources.map((item) => {
            const id = str(item.id);
            const enabled = item.enable !== false;
            const models = modelsOf[id];
            return (
              <article key={id} className={cn(card, 'flex flex-col gap-3 p-3.5')}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <div className={cn('grid size-9 shrink-0 place-items-center rounded-lg border', enabled ? 'border-primary/25 bg-primary/10 text-primary' : 'border-border bg-muted text-muted-foreground')}>
                      <Server className="size-4" />
                    </div>
                    <div className="min-w-0 space-y-0.5">
                      <div className="truncate text-sm font-medium">{id}</div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {str(item.provider)} · {typeLabel(str(item.provider_type))}
                      </div>
                    </div>
                  </div>
                  <button className={btn} onClick={() => void fetchModels(item)} disabled={models === 'loading'}>
                    <RefreshCw className={cn('size-3.5', models === 'loading' && 'animate-spin')} /> 获取模型
                  </button>
                </div>

                <dl className="grid gap-1.5 text-[11px]">
                  <div className="flex items-center gap-2">
                    <dt className="w-20 shrink-0 text-muted-foreground">接口地址</dt>
                    <dd className={cn(mono, 'truncate')}>{str(item.api_base) || '—'}</dd>
                  </div>
                  <div className="flex items-start gap-2">
                    <dt className="flex w-20 shrink-0 items-center gap-1 text-muted-foreground">
                      <KeyRound className="size-3" /> API Key
                    </dt>
                    <dd className="min-w-0">
                      <KeyPreview value={item.key} />
                    </dd>
                  </div>
                </dl>

                {Array.isArray(models) ? (
                  <div className="rounded-lg border border-border/60 bg-muted/30 p-2">
                    {models.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground">未获取到模型。</p>
                    ) : (
                      <div className="flex max-h-32 flex-wrap gap-1 overflow-auto">
                        {models.map((name) => (
                          <span key={name} className={cn(mono, 'rounded border border-border bg-card px-1.5 py-[1px]')}>
                            {name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}

                <ConfigDetails value={item} />

                <div className="mt-auto flex items-center gap-2">
                  <button
                    className={cn(btn, 'ml-auto text-destructive hover:bg-destructive/10 hover:text-destructive')}
                    onClick={() => void removeSource(item)}
                    disabled={busy === `ds:${id}`}
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
