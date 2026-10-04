/**
 * Config file page \u2014 schema-driven visual editor + raw JSON mode.
 *
 * Parity target: AstrBot console \u201c\u914d\u7f6e\u6587\u4ef6\u201d\uff1aconfig profile switching (default / abconf),
 * four groups (AI / platform / plugin / extensions), per-field controls
 * (incl. _special provider & persona selectors), raw editor, import/export.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { redactedJson } from './redact';
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Code2,
  Copy,
  Download,
  FileJson,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  SlidersHorizontal,
  Trash2,
  Upload,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toArray } from './api';
import { configProfiles, knowledge as kbApi, personas as personaApi, providers as providerApi, type Json } from './endpoints';
import CONFIG_I18N from './config-i18n.json';
import { useApp } from './state';
import { ToggleSwitch } from '@/components/ui/toggle-switch';

const card = 'rounded-xl border border-border/60 bg-card';
const btn =
  'inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50';
const btnPrimary =
  'inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground shadow-xs transition-colors hover:bg-primary/90 disabled:opacity-50';
const inputClass =
  'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30';
const mono = 'font-mono text-[11px]';

/** Dotted config keys are long and rarely needed; show the useful tail and keep
 *  the full path available via the copy button / tooltip. */
/**
 * Normalise a config snapshot before comparing: `false` and a missing key mean
 * the same thing for these switches, so a boolean flipped back to its original
 * state must not leave “unsaved changes” behind.
 */
function normalizeConfig(value: unknown): unknown {
  if (value === undefined || value === false || value === null) return undefined;
  if (Array.isArray(value)) return value.map(normalizeConfig);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Json)) {
      const normalized = normalizeConfig(item);
      if (normalized !== undefined) out[key] = normalized;
    }
    // A branch that only exists because a switch was written and then switched
    // back carries no information — treat it as absent so the page does not
    // claim there are unsaved changes.
    return Object.keys(out).length ? out : undefined;
  }
  return value;
}

function snapshotKey(value: unknown): string {
  return JSON.stringify(normalizeConfig(value) ?? {});
}

function shortKey(path: string): string {
  const parts = String(path || '').split('.');
  return parts.length > 2 ? parts.slice(-2).join('.') : String(path || '');
}

const GROUP_LABELS: Record<string, string> = {
  ai_group: 'AI 配置',
  platform_group: '平台配置',
  plugin_group: '插件配置',
  ext_group: '扩展功能',
};

interface FieldMeta {
  type?: string;
  description?: string;
  hint?: string;
  options?: unknown[];
  _special?: string;
  items?: Record<string, FieldMeta>;
  default?: unknown;
  slider?: { min?: number; max?: number; step?: number };
}

function asText(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function getByPath(source: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && !Array.isArray(acc)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, source);
}

function setByPath(source: Json, path: string, value: unknown): Json {
  const clone = JSON.parse(JSON.stringify(source || {})) as Json;
  const keys = path.split('.');
  let cursor: Record<string, unknown> = clone;
  keys.forEach((key, index) => {
    if (index === keys.length - 1) {
      cursor[key] = value;
      return;
    }
    const next = cursor[key];
    if (!next || typeof next !== 'object' || Array.isArray(next)) {
      cursor[key] = {};
    }
    cursor = cursor[key] as Record<string, unknown>;
  });
  return clone;
}

/** Short human label for an i18n key such as `ai_group.agent_runner.ai.provider_id`. */
function tLookup(key?: string): string {
  if (!key) return '';
  const value = key
    .split('.')
    .reduce<unknown>(
      (acc, part) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[part] : undefined),
      CONFIG_I18N as unknown,
    );
  return typeof value === 'string' ? value : '';
}

/** Official enum labels, e.g. runner_type -> [内置 Agent, Dify, ...] */
function tLabels(key?: string): string[] {
  const base = String(key || '').replace(/\.description$/, '');
  if (!base) return [];
  const value = `${base}.labels`
    .split('.')
    .reduce<unknown>(
      (acc, part) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[part] : undefined),
      CONFIG_I18N as unknown,
    );
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

function fieldLabel(path: string, meta: FieldMeta): string {
  const key = String(meta.description || '');
  const parts = key.split('.');
  if (parts.length >= 2 && !/\s/.test(key)) {
    const leaf = parts[parts.length - 2];
    if (leaf && leaf !== 'description') return leaf;
  }
  return path.split('.').slice(-1)[0];
}

function fieldHint(meta: FieldMeta): string {
  const raw = String(meta.hint || '');
  return /\s/.test(raw) ? raw : '';
}

interface FieldRowProps {
  path: string;
  meta: FieldMeta;
  value: unknown;
  onChange: (path: string, value: unknown) => void;
  providers: { id: string; label: string }[];
  personas: { id: string; label: string }[];
  knowledge: { id: string; label: string }[];
}

function FieldRow({ path, meta, value, onChange, providers, personas, knowledge }: FieldRowProps) {
  const { notify } = useApp();

  const copyKey = useCallback(async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(path);
        notify('配置项名称已复制');
        return;
      }
    } catch {
      /* fall through to the legacy path */
    }
    try {
      const area = document.createElement('textarea');
      area.value = path;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
      notify('配置项名称已复制');
    } catch {
      notify('复制失败，请手动选择', 'error');
    }
  }, [notify, path]);

  const label = tLookup(meta.description) || fieldLabel(path, meta);
  const hint = tLookup(meta.hint) || fieldHint(meta);
  const type = String(meta.type || 'string');
  const special = String(meta._special || '');

  const options = useMemo(() => {
    const raw = Array.isArray(meta.options) ? meta.options : [];
    if (special === 'select_provider') return providers.map((item) => ({ value: item.id, label: item.label }));
    if (special === 'select_persona') return personas.map((item) => ({ value: item.id, label: item.label }));
    if (special === 'select_knowledgebase') return knowledge.map((item) => ({ value: item.id, label: item.label }));
    const translated = tLabels(meta.description);
    return raw.map((option, index) => {
      const friendly = translated[index];
      if (option && typeof option === 'object') {
        const rec = option as Record<string, unknown>;
        return {
          value: String(rec.value ?? rec.name ?? rec.label ?? ''),
          label: friendly || String(rec.label ?? rec.name ?? rec.value ?? ''),
        };
      }
      return { value: String(option), label: friendly || String(option) };
    });
  }, [meta.options, special, providers, personas, knowledge]);

  let control: ReactNode;
  if (type === 'bool') {
    control = (
      <ToggleSwitch
        value={Boolean(value)}
        onChange={(next) => onChange(path, next)}
        ariaLabel={label}
      />
    );
  } else if (type === 'int' || type === 'float') {
    control = (
      <input
        className={cn(inputClass, 'max-w-[220px]')}
        type="number"
        step={type === 'float' ? 'any' : 1}
        value={value === undefined || value === null ? '' : String(value)}
        onChange={(event) => {
          const raw = event.target.value;
          if (raw === '') return;
          onChange(path, type === 'float' ? Number(raw) : Math.trunc(Number(raw)));
        }}
      />
    );
  } else if (options.length) {
    control = (
      <select
        className={cn(inputClass, 'max-w-[320px]')}
        value={asText(value)}
        onChange={(event) => onChange(path, event.target.value)}
      >
        <option value="">未选择</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  } else if (type === 'text') {
    control = (
      <textarea
        className="h-24 w-full rounded-md border border-input bg-transparent p-2.5 font-mono text-[12px] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30"
        value={asText(value)}
        onChange={(event) => onChange(path, event.target.value)}
      />
    );
  } else if (type === 'list') {
    control = (
      <textarea
        className="h-20 w-full rounded-md border border-input bg-transparent p-2.5 font-mono text-[12px] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30"
        value={Array.isArray(value) ? value.map((item) => (typeof item === 'string' ? item : asText(item))).join('\n') : asText(value)}
        onChange={(event) => onChange(path, event.target.value.split('\n').filter((line) => line.trim()))}
      />
    );
  } else if (type === 'object' || type === 'dict') {
    control = (
      <textarea
        className="h-28 w-full rounded-md border border-input bg-transparent p-2.5 font-mono text-[12px] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30"
        value={asText(value)}
        onChange={(event) => {
          try {
            onChange(path, JSON.parse(event.target.value));
          } catch {
            /* keep typing */
          }
        }}
      />
    );
  } else {
    control = (
      <input
        className={cn(inputClass, 'max-w-[420px]')}
        value={asText(value)}
        onChange={(event) => onChange(path, event.target.value)}
      />
    );
  }

  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/50 py-3 last:border-b-0">
      <div className="min-w-0 flex-[1_1_240px] space-y-0.5">
        <div className="text-[12.5px] font-medium">{label}</div>
        {hint && hint !== path ? (
          <div className="text-[11px] leading-relaxed text-muted-foreground">{hint}</div>
        ) : null}
        <div className="flex min-w-0 items-center gap-1">
          <span className={cn(mono, 'truncate text-muted-foreground/60')} title={path}>
            {shortKey(path)}
          </span>
          <button
            type="button"
            onClick={() => void copyKey()}
            title={'复制配置项名称：' + path}
            aria-label="复制配置项名称"
            className="shrink-0 rounded p-0.5 text-muted-foreground/50 transition-colors hover:text-primary"
          >
            <Copy className="size-3" />
          </button>
        </div>
      </div>
      <div className="min-w-0 flex-[1_1_200px]">{control}</div>
    </div>
  );
}

export function ConfigEditorPage() {
  const { notify } = useApp();
  const [profiles, setProfiles] = useState<{ id: string; name: string }[]>([]);
  const [activeId, setActiveId] = useState('default');
  const [config, setConfig] = useState<Json>({});
  const [metadata, setMetadata] = useState<Json>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [baseline, setBaseline] = useState<Json>({});
  // Derived instead of a flag: flipping a switch back to its original value
  // must NOT leave “unsaved changes” behind.
  const dirty = useMemo(() => snapshotKey(config) !== snapshotKey(baseline), [config, baseline]);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'visual' | 'code'>('visual');
  const [rawText, setRawText] = useState('{}');
  const [rawError, setRawError] = useState('');
  const [revealSecrets, setRevealSecrets] = useState(false);
  /** Masked view of the JSON editor content (provider keys, tokens, ...). */
  const redactedText = useMemo(() => {
    try {
      return redactedJson(JSON.parse(rawText), false);
    } catch {
      return rawText;
    }
  }, [rawText]);
  const [group, setGroup] = useState('');
  const [section, setSection] = useState('');
  const [search, setSearch] = useState('');
  const [providers, setProviders] = useState<{ id: string; label: string }[]>([]);
  const [personas, setPersonas] = useState<{ id: string; label: string }[]>([]);
  const [knowledge, setKnowledge] = useState<{ id: string; label: string }[]>([]);

  /* ------------------------------------------------------------- loading */

  const loadProfiles = useCallback(async () => {
    try {
      const payload = (await configProfiles.list()) as Json;
      const list = toArray<Json>(payload.info_list ?? payload.profiles ?? payload).map((item) => ({
        id: String(item.id ?? item.name ?? ''),
        name: String(item.name ?? item.id ?? ''),
      }));
      setProfiles(list.filter((item) => item.id));
      return list;
    } catch (e) {
      notify(e instanceof Error ? e.message : '配置文件列表读取失败', 'error');
      return [];
    }
  }, [notify]);

  const loadProfile = useCallback(
    async (configId: string) => {
      setLoading(true);
      setError('');
      try {
        const payload = (await configProfiles.get(configId)) as Json;
        const data = (payload.config as Json) || payload;
        setConfig(data);
        setRawText(JSON.stringify(data, null, 2));
        setRawError('');
        setBaseline(JSON.parse(JSON.stringify(data || {})));
      } catch (e) {
        setError(e instanceof Error ? e.message : '配置读取失败');
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    (async () => {
      const [list, schemaPayload, providerPayload, personaPayload, kbPayload] = await Promise.all([
        loadProfiles(),
        configProfiles.schema().catch(() => ({}) as Json),
        providerApi.list().catch(() => ({}) as Json),
        personaApi.list().catch(() => []),
        kbApi.list().catch(() => ({}) as Json),
      ]);
      const meta = ((schemaPayload as Json).metadata as Json) || {};
      setMetadata(meta);
      const groups = Object.keys(meta);
      if (groups.length) {
        setGroup(groups[0]);
        const sections = Object.keys(((meta[groups[0]] as Json)?.metadata as Json) || {});
        setSection(sections[0] || '');
      }
      setProviders(
        toArray<Json>((providerPayload as Json).providers ?? providerPayload).map((item) => ({
          id: String(item.id ?? ''),
          label: `${String(item.id ?? '')}${item.provider_type ? ` · ${String(item.provider_type)}` : ''}`,
        })).filter((item) => item.id),
      );
      setPersonas(
        toArray<Json>(personaPayload).map((item) => ({ id: String(item.persona_id ?? item.id ?? ''), label: String(item.persona_id ?? item.id ?? '') })).filter((item) => item.id),
      );
      const kbRaw = (kbPayload as Json);
      setKnowledge(
        toArray<Json>(kbRaw.items ?? kbRaw.knowledge_bases ?? kbRaw)
          .map((item) => ({ id: String(item.kb_id ?? item.id ?? item.name ?? ''), label: String(item.name ?? item.kb_id ?? '') }))
          .filter((item) => item.id),
      );
      const preferred = list.find((item) => item.id === 'default')?.id || list[0]?.id || 'default';
      setActiveId(preferred);
      await loadProfile(preferred);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------------------------------------------------- field model */

  /**
   * AstrBot's config metadata mixes absolute (`agent_runner.runner_type`) and
   * section-relative (`provider_settings.enable`) paths. Resolve against the
   * live config so edits always land in the right place.
   */
  const resolvePath = useCallback(
    (rawPath: string, sectionKey: string) => {
      if (rawPath.startsWith(`${sectionKey}.`)) return rawPath;
      if (getByPath(config, rawPath) !== undefined) return rawPath;
      return `${sectionKey}.${rawPath}`;
    },
    [config],
  );

  const groups = useMemo(() => Object.keys(metadata), [metadata]);


  const sectionFields = useMemo(() => {
    const groupMeta = (metadata[group] as Json)?.metadata as Json | undefined;
    const node = (groupMeta?.[section] as Json) || {};
    const items = (node.items as Record<string, FieldMeta>) || {};
    return Object.entries(items).map(([rawPath, meta]) => ({
      path: resolvePath(rawPath, section),
      meta: meta as FieldMeta,
    }));
  }, [metadata, group, section, resolvePath]);

  const searchResults = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return [];
    const out: { path: string; meta: FieldMeta; group: string; section: string }[] = [];
    for (const groupKey of Object.keys(metadata)) {
      const sectionsMeta = ((metadata[groupKey] as Json)?.metadata as Json) || {};
      for (const sectionKey of Object.keys(sectionsMeta)) {
        const items = ((sectionsMeta[sectionKey] as Json)?.items as Record<string, FieldMeta>) || {};
        for (const [path, meta] of Object.entries(items)) {
          const haystack = `${path} ${meta?.description || ''}`.toLowerCase();
          if (haystack.includes(needle)) out.push({ path: resolvePath(path, sectionKey), meta, group: groupKey, section: sectionKey });
        }
      }
    }
    return out.slice(0, 60);
  }, [metadata, search, resolvePath]);

  /* ------------------------------------------------------------- actions */

  const updateField = (path: string, value: unknown) => {
    setConfig((prev) => setByPath(prev, path, value));
    void 0; // dirty is derived from the baseline
  };

  const save = async () => {
    setSaving(true);
    try {
      if (mode === 'code') {
        const parsed = JSON.parse(rawText);
        setConfig(parsed);
        await configProfiles.update(activeId, parsed);
      } else {
        await configProfiles.update(activeId, config);
      }
      setBaseline(JSON.parse(JSON.stringify(config || {})));
      notify('配置已保存', 'ok');
    } catch (e) {
      notify(e instanceof Error ? e.message : '保存失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  const createProfile = async () => {
    const name = window.prompt('新配置文件名称');
    if (!name || !name.trim()) return;
    try {
      await configProfiles.create({ name: name.trim(), config });
      notify('配置文件已创建', 'ok');
      await loadProfiles();
    } catch (e) {
      notify(e instanceof Error ? e.message : '创建失败', 'error');
    }
  };

  const renameProfile = async () => {
    const name = window.prompt('重命名配置文件', profiles.find((item) => item.id === activeId)?.name || activeId);
    if (!name || !name.trim()) return;
    try {
      await configProfiles.rename(activeId, name.trim());
      notify('已重命名', 'ok');
      await loadProfiles();
    } catch (e) {
      notify(e instanceof Error ? e.message : '重命名失败', 'error');
    }
  };

  const removeProfile = async () => {
    if (activeId === 'default') return notify('默认配置文件不可删除', 'error');
    if (!window.confirm(`确定要删除配置文件「${activeId}」吗？`)) return;
    try {
      await configProfiles.remove(activeId);
      notify('已删除', 'ok');
      const list = await loadProfiles();
      const next = list[0]?.id || 'default';
      setActiveId(next);
      await loadProfile(next);
    } catch (e) {
      notify(e instanceof Error ? e.message : '删除失败', 'error');
    }
  };

  const exportConfig = () => {
    const blob = new Blob([rawText], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${activeId}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const importConfig = async (file: File) => {
    try {
      const text = await file.text();
      JSON.parse(text);
      setRawText(text);
      setMode('code');
      setRawError('');
      void 0; // dirty is derived from the baseline
      notify('已载入文件，确认后点保存', 'ok');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'JSON 解析失败', 'error');
    }
  };

  const activeProfile = profiles.find((item) => item.id === activeId);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <SlidersHorizontal className="size-4 text-primary" /> 配置文件
          </h1>
          <p className="text-xs text-muted-foreground">
            这里配置机器人的对话模型、人格、知识库、工具等核心行为；未绑定到其他配置文件的会话使用默认配置。个别字段说明缺失时会回退显示字段路径。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className={cn(inputClass, 'h-8 w-auto min-w-[160px] py-0 text-xs')}
            value={activeId}
            onChange={(event) => {
              const next = event.target.value;
              if (dirty && !window.confirm('当前配置有未保存的更改，确定要切换吗？')) return;
              setActiveId(next);
              void loadProfile(next);
            }}
          >
            {profiles.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name === item.id ? item.id : `${item.name}（${item.id.slice(0, 8)}）`}
              </option>
            ))}
          </select>
          <button className={btn} onClick={() => void createProfile()}>
            <Plus className="size-3.5" /> 新建
          </button>
          <button className={btn} onClick={() => void renameProfile()} disabled={activeId === 'default'}>
            <Copy className="size-3.5" /> 重命名
          </button>
          <button className={cn(btn, 'text-destructive hover:bg-destructive/10')} onClick={() => void removeProfile()} disabled={activeId === 'default'}>
            <Trash2 className="size-3.5" /> 删除
          </button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
          {([
            { id: 'visual', label: '可视化编辑', icon: SlidersHorizontal },
            { id: 'code', label: '代码编辑', icon: Code2 },
          ] as const).map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => {
                  if (item.id === 'code') setRawText(JSON.stringify(config, null, 2));
                  if (item.id === 'visual') {
                    try {
                      setConfig(JSON.parse(rawText));
                      setRawError('');
                    } catch (e) {
                      setRawError(e instanceof Error ? e.message : 'JSON 格式错误');
                      return;
                    }
                  }
                  setMode(item.id);
                }}
                className={cn(
                  'inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors',
                  mode === item.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent',
                )}
              >
                <Icon className="size-3.5" /> {item.label}
              </button>
            );
          })}
        </div>

        {mode === 'visual' ? (
          <span className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              className={cn(inputClass, 'h-8 w-56 pl-8 text-xs')}
              placeholder="搜索字段（路径或说明）"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </span>
        ) : null}

        <div className="flex-1" />
        {dirty ? <span className="text-[11px] neko-warn">有未保存的更改</span> : null}
        <button className={btn} onClick={() => void loadProfile(activeId)} disabled={loading}>
          <RotateCcw className={cn('size-3.5', loading && 'animate-spin')} /> 重新载入
        </button>
        <button className={btn} onClick={exportConfig}>
          <Download className="size-3.5" /> 导出
        </button>
        <label className={cn(btn, 'cursor-pointer')}>
          <Upload className="size-3.5" /> 导入
          <input
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importConfig(file);
              event.target.value = '';
            }}
          />
        </label>
        <button className={btnPrimary} onClick={() => void save()} disabled={saving || !dirty}>
          {saving ? <RefreshCw className="size-3.5 animate-spin" /> : <Save className="size-3.5" />} 保存配置
        </button>
      </div>

      {error ? (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div>{error}</div>
        </div>
      ) : null}

      {loading ? (
        <div className={cn(card, 'grid place-items-center p-10 text-xs text-muted-foreground')}>
          <span className="flex items-center gap-2">
            <RefreshCw className="size-4 animate-spin" /> 加载中…
          </span>
        </div>
      ) : mode === 'code' ? (
        <section className={cn(card, 'p-3.5')}>
          <div className="mb-2 flex flex-wrap items-center gap-2 text-[11.5px] text-muted-foreground">
            <span>
              {revealSecrets
                ? '正在显示原始值，其中可能包含密钥。'
                : '密钥类字段已打码；需要编辑原文时请先显示原始值。'}
            </span>
            <button
              type="button"
              className="rounded border border-border px-1.5 py-[1px] text-[11px] transition-colors hover:bg-accent"
              onClick={() => setRevealSecrets((value) => !value)}
            >
              {revealSecrets ? '隐藏敏感值' : '显示原始值'}
            </button>
          </div>
          {rawError ? <p className="mb-2 text-[11.5px] text-destructive">JSON 错误：{rawError}</p> : null}
          <textarea
            className="h-[60vh] w-full rounded-lg border border-input bg-transparent p-3 font-mono text-[12px] leading-relaxed outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30"
            value={revealSecrets ? rawText : redactedText}
            readOnly={!revealSecrets}
            spellCheck={false}
            onChange={(event) => {
              setRawText(event.target.value);
              void 0; // dirty is derived from the baseline
              try {
                JSON.parse(event.target.value);
                setRawError('');
              } catch (e) {
                setRawError(e instanceof Error ? e.message : 'JSON 格式错误');
              }
            }}
          />
        </section>
      ) : search.trim() ? (
        <section className={cn(card, 'p-4')}>
          <div className="pb-2 text-xs text-muted-foreground">共 {searchResults.length} 个匹配字段</div>
          {searchResults.map((item) => (
            <FieldRow
              key={item.path}
              path={item.path}
              meta={item.meta}
              value={getByPath(config, item.path)}
              onChange={updateField}
              providers={providers}
              personas={personas}
              knowledge={knowledge}
            />
          ))}
        </section>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className={cn(card, 'h-fit p-2.5')}>
            {groups.map((groupKey) => {
              const sectionsMeta = ((metadata[groupKey] as Json)?.metadata as Json) || {};
              const isOpen = groupKey === group;
              return (
                <div key={groupKey} className="mb-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setGroup(groupKey);
                      const keys = Object.keys(sectionsMeta);
                      setSection(keys[0] || '');
                    }}
                    className={cn(
                      'flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs font-semibold transition-colors',
                      isOpen ? 'bg-primary/10 text-primary' : 'hover:bg-accent',
                    )}
                  >
                    <ChevronRight className={cn('size-3.5 transition-transform', isOpen && 'rotate-90')} />
                    {tLookup(`${groupKey}.name`) || GROUP_LABELS[groupKey] || groupKey}
                  </button>
                  {isOpen ? (
                    <div className="mt-0.5 space-y-0.5 pl-3">
                      {Object.keys(sectionsMeta).map((sectionKey) => (
                        <button
                          key={sectionKey}
                          type="button"
                          onClick={() => setSection(sectionKey)}
                          className={cn(
                            'flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-[11.5px] transition-colors',
                            sectionKey === section ? 'bg-accent font-medium' : 'text-muted-foreground hover:bg-accent/60',
                          )}
                        >
                          <span className="truncate">{tLookup(`${groupKey}.${sectionKey}.description`) || sectionKey}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </aside>

          <section className={cn(card, 'p-4')}>
            <div className="flex items-center justify-between pb-2">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <FileJson className="size-4 text-primary" />
                {tLookup(`${group}.name`) || GROUP_LABELS[group] || group} · {tLookup(`${group}.${section}.description`) || section}
              </div>
              <span className={cn(mono, 'text-muted-foreground')}>{sectionFields.length} 项</span>
            </div>
            {sectionFields.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">该分组没有可编辑字段。</p>
            ) : (
              sectionFields.map((item) => (
                <FieldRow
                  key={item.path}
                  path={item.path}
                  meta={item.meta}
                  value={getByPath(config, item.path)}
                  onChange={updateField}
                  providers={providers}
                  personas={personas}
                  knowledge={knowledge}
                />
              ))
            )}
            {dirty ? (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 p-2.5 text-[11px] text-muted-foreground">
                <Check className="size-3.5" /> 修改会先暂存到本地，点右上角「保存配置」写入 AstrBot。
              </div>
            ) : null}
            {activeProfile ? <div className={cn('mt-3 text-[11px] text-muted-foreground', mono)}>profile: {activeProfile.id}</div> : null}
          </section>
        </div>
      )}
    </div>
  );
}
