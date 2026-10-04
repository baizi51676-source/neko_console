/**
 * Sub-agent orchestration page (\u5b50\u4ee3\u7406\u7f16\u6392).
 *
 * The main agent keeps its own tools and may hand off parts of a task to
 * sub-agents (`transfer_to_<name>` tools). Config shape:
 *   { main_enable, remove_main_duplicate_tools, agents: [{ name, provider_id, persona_id, description }] }
 */
import { ToggleSwitch } from '@/components/ui/toggle-switch';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Plus,
  RefreshCw,
  Save,
  Users,
  Trash2,
  Workflow,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toArray } from './api';
import { personas as personaApi, providers as providerApi, subagents as subagentsApi, type Json } from './endpoints';
import { useApp } from './state';

const card = 'rounded-xl border border-border/60 bg-card';
const btn =
  'inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50';
const btnPrimary =
  'inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground shadow-xs transition-colors hover:bg-primary/90 disabled:opacity-50';
const inputClass =
  'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30';
const mono = 'font-mono text-[11px]';

interface AgentDraft {
  name: string;
  provider_id: string;
  persona_id: string;
  description: string;
  enable: boolean;
  extra: Json;
}

function str(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

export function SubAgentsPage() {
  const { notify } = useApp();
  const [config, setConfig] = useState<Json>({});
  const [providers, setProviders] = useState<{ id: string; label: string }[]>([]);
  const [personas, setPersonas] = useState<{ id: string; label: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<AgentDraft | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [configPayload, providerPayload, personaPayload] = await Promise.all([
        subagentsApi.config(),
        providerApi.list().catch(() => ({}) as Json),
        personaApi.list().catch(() => []),
      ]);
      setConfig((configPayload as Json) || {});
      setProviders(
        toArray<Json>((providerPayload as Json).providers ?? providerPayload)
          .filter((item) => !item.provider_type || str(item.provider_type) === 'chat_completion')
          .map((item) => ({ id: str(item.id), label: `${str(item.id)}${item.model ? ` · ${str(item.model)}` : ''}` }))
          .filter((item) => item.id),
      );
      setPersonas(
        toArray<Json>(personaPayload)
          .map((item) => ({ id: str(item.persona_id ?? item.id), label: str(item.persona_id ?? item.id) }))
          .filter((item) => item.id),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : '子代理配置读取失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const agents = useMemo(() => toArray<Json>(config.agents), [config.agents]);
  const enabled = config.main_enable === true || config.enable === true;
  const dedupe = config.remove_main_duplicate_tools === true;

  const persist = async (patch: Json) => {
    const next: Json = {
      main_enable: enabled,
      remove_main_duplicate_tools: dedupe,
      agents,
      ...patch,
    };
    setConfig(next);
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload: Json = {
        main_enable: enabled,
        remove_main_duplicate_tools: dedupe,
        agents,
      };
      await subagentsApi.save(payload);
      notify('子代理配置已保存', 'ok');
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : '保存失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  const openNew = () => {
    setEditing(-1);
    setDraft({ name: '', provider_id: '', persona_id: '', description: '', enable: true, extra: {} });
  };

  const openEdit = (index: number) => {
    const agent = agents[index] || {};
    const { name, provider_id, persona_id, description, enable, ...rest } = agent as Json;
    setEditing(index);
    setDraft({
      name: str(name),
      provider_id: str(provider_id),
      persona_id: str(persona_id),
      description: str(description),
      enable: enable !== false,
      extra: rest,
    });
  };

  const applyDraft = () => {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) return notify('请填写 Agent 名称（小写字母、数字与下划线）', 'error');
    if (!/^[a-z][a-z0-9_]*$/.test(name)) return notify('名称只能用小写字母/数字/下划线，且以字母开头', 'error');
    if (agents.some((agent, index) => str(agent.name) === name && index !== editing)) {
      return notify('已存在同名子代理', 'error');
    }
    const record: Json = {
      ...draft.extra,
      name,
      provider_id: draft.provider_id || null,
      persona_id: draft.persona_id || null,
      description: draft.description,
      enable: draft.enable,
    };
    const nextAgents = [...agents];
    if (editing === -1) nextAgents.push(record);
    else if (editing !== null) nextAgents[editing] = record;
    void persist({ agents: nextAgents });
    setEditing(null);
    setDraft(null);
  };

  const removeAgent = async (index: number) => {
    const name = str(agents[index]?.name);
    if (!window.confirm(`确定要删除子代理「${name}」吗？`)) return;
    const nextAgents = agents.filter((_, i) => i !== index);
    await persist({ agents: nextAgents });
    notify('已删除，记得点保存生效', 'ok');
  };

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <Workflow className="size-4 text-primary" /> 子代理编排
          </h1>
          <p className="text-xs text-muted-foreground">
            主代理可以把部分任务交给子代理；每个子代理会以 <code className={mono}>transfer_to_名称</code> 工具的形式出现，并在绑定的系统提示词下工作。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className={btn} onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} /> 刷新
          </button>
          <button className={btnPrimary} onClick={() => void save()} disabled={saving || loading}>
            <Save className="size-3.5" /> {saving ? '保存中…' : '保存配置'}
          </button>
        </div>
      </header>

      {error ? (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <section className={cn(card, 'space-y-3 p-4')}>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <ToggleSwitch
            value={enabled}
            onChange={(next) => void persist({ main_enable: next })}
            ariaLabel="启用子代理编排"
          />
          <span className="font-medium">启用子代理编排</span>
          <span className="text-muted-foreground">启用后子代理将作为工具交给主代理，按需移交（handoff）。</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <ToggleSwitch
            value={dedupe}
            onChange={(next) => void persist({ remove_main_duplicate_tools: next })}
            ariaLabel="隐藏与子代理重叠的工具"
          />
          <span className="font-medium">隐藏与子代理重叠的工具</span>
          <span className="text-muted-foreground">避免主代理与子代理重复持有同一个工具。</span>
        </div>
        {!enabled ? (
          <p className="rounded-lg border border-border/60 bg-muted/30 p-2.5 text-[11px] text-muted-foreground">
            当前未启用编排；保存后子代理不会被主代理调用。
          </p>
        ) : null}
      </section>

      {draft ? (
        <section className={cn(card, 'p-4')}>
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold">
              <Users className="size-4 text-primary" /> {editing === -1 ? '新增子代理' : `编辑子代理 · ${draft.name}`}
            </h2>
            <button
              className={btn}
              onClick={() => {
                setEditing(null);
                setDraft(null);
              }}
            >
              <X className="size-3.5" /> 取消
            </button>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Agent 名称</label>
              <input
                className={cn(inputClass, mono)}
                placeholder="例如 code_helper"
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              />
              <p className="text-[11px] text-muted-foreground">
                会生成工具 <code className={mono}>transfer_to_{draft.name || '名称'}</code>，只能用小写字母/数字/下划线。
              </p>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">对话模型（可选）</label>
              <select
                className={inputClass}
                value={draft.provider_id}
                onChange={(event) => setDraft({ ...draft, provider_id: event.target.value })}
              >
                <option value="">跟随全局默认</option>
                {providers.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">绑定人格</label>
              <select
                className={inputClass}
                value={draft.persona_id}
                onChange={(event) => setDraft({ ...draft, persona_id: event.target.value })}
              >
                <option value="">不绑定</option>
                {personas.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground">子代理会继承该人格的系统提示词与可用工具。</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">对主 LLM 的描述</label>
              <input
                className={inputClass}
                placeholder="什么情况下应该把任务交给它"
                value={draft.description}
                onChange={(event) => setDraft({ ...draft, description: event.target.value })}
              />
            </div>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button
              className={btn}
              onClick={() => {
                setEditing(null);
                setDraft(null);
              }}
            >
              取消
            </button>
            <button className={btnPrimary} onClick={applyDraft}>
              <Check className="size-3.5" /> 应用到列表
            </button>
          </div>
        </section>
      ) : null}

      <section className={cn(card, 'p-4')}>
        <div className="flex items-center justify-between pb-3">
          <h2 className="text-sm font-semibold">子代理（{agents.length}）</h2>
          <button className={btnPrimary} onClick={openNew}>
            <Plus className="size-3.5" /> 新增子代理
          </button>
        </div>
        {loading ? (
          <p className="py-6 text-center text-xs text-muted-foreground">加载中…</p>
        ) : agents.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">还没有子代理。添加一个后记得点右上角「保存配置」。</p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {agents.map((agent, index) => {
              const name = str(agent.name);
              const persona = str(agent.persona_id);
              const provider = str(agent.provider_id);
              return (
                <article key={`${name}-${index}`} className="flex flex-col gap-2 rounded-xl border border-border/60 p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{name || '未命名'}</div>
                      <div className={cn(mono, 'truncate text-muted-foreground')}>transfer_to_{name || '...'}</div>
                    </div>
                    {agent.enable === false ? (
                      <span className="rounded-full border border-border bg-muted px-2 py-[3px] text-[11px] text-muted-foreground">停用</span>
                    ) : (
                      <span className="rounded-full border neko-chip-accent px-2 py-[3px] text-[11px] text-[var(--primary)]">启用</span>
                    )}
                  </div>
                  <dl className="grid gap-1 text-[11px]">
                    <div className="flex gap-2">
                      <dt className="w-16 shrink-0 text-muted-foreground">人格</dt>
                      <dd className="truncate">{persona || '未绑定'}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="w-16 shrink-0 text-muted-foreground">模型</dt>
                      <dd className="truncate">{provider || '跟随全局'}</dd>
                    </div>
                  </dl>
                  <p className="line-clamp-2 text-[11px] text-muted-foreground">{str(agent.description) || '未填写描述'}</p>
                  <div className="mt-auto flex items-center gap-2">
                    <button className={btn} onClick={() => openEdit(index)}>
                      编辑
                    </button>
                    <button
                      className={btn}
                      onClick={() => {
                        const nextAgents = [...agents];
                        nextAgents[index] = { ...agents[index], enable: agents[index].enable === false };
                        void persist({ agents: nextAgents });
                      }}
                    >
                      {agent.enable === false ? '启用' : '停用'}
                    </button>
                    <button
                      className={cn(btn, 'ml-auto text-destructive hover:bg-destructive/10 hover:text-destructive')}
                      onClick={() => void removeAgent(index)}
                    >
                      <Trash2 className="size-3.5" /> 删除
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
