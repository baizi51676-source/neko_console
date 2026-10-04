/**
 * Personas page (\u4eba\u683c\u8bbe\u5b9a).
 *
 * Layout: folder tree on the left, persona cards on the right, inline editor
 * for prompt / preset dialogs / tool & skill bindings / folder move.
 * Parity target: AstrBot console \u2192 \u4eba\u683c.
 */
import { ToggleSwitch } from '@/components/ui/toggle-switch';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FolderTree,
  FolderPlus,
  Heart,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  Download,
  X,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toArray } from './api';
import { personas as personasApi, skills as skillsApi, subagents as subagentsApi, type Json } from './endpoints';
import { useApp } from './state';

const card = 'rounded-xl border border-border/60 bg-card';
const btn =
  'inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50';
const btnPrimary =
  'inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground shadow-xs transition-colors hover:bg-primary/90 disabled:opacity-50';
const inputClass =
  'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30';
const labelClass = 'text-xs font-medium';

interface DialogPair {
  user: string;
  assistant: string;
}

interface PersonaDraft {
  persona_id: string;
  system_prompt: string;
  custom_error_message: string;
  folder_id: string;
  begin_dialogs: DialogPair[];
  tools: string[];
  skills: string[] | null;
  isNew: boolean;
}

function str(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map((v) => str(v)).join(', ');
  return String(value);
}

function toDialogs(value: unknown): DialogPair[] {
  const list = Array.isArray(value) ? value : [];
  return list
    .map((item) => {
      if (Array.isArray(item)) return { user: str(item[0]), assistant: str(item[1]) };
      if (item && typeof item === 'object') {
        const rec = item as Record<string, unknown>;
        return { user: str(rec.user ?? rec.human ?? rec[0]), assistant: str(rec.assistant ?? rec.bot ?? rec[1]) };
      }
      return { user: str(item), assistant: '' };
    })
    .filter((pair) => pair.user || pair.assistant);
}

export function PersonasPage() {
  const { notify } = useApp();
  const [personas, setPersonas] = useState<Json[]>([]);
  const [folders, setFolders] = useState<Json[]>([]);
  const [tools, setTools] = useState<{ name: string; description?: string }[]>([]);
  const [skills, setSkills] = useState<{ name: string; description?: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [activeFolder, setActiveFolder] = useState<string>('__all__');
  const [search, setSearch] = useState('');
  const [toolSearch, setToolSearch] = useState('');
  const [draft, setDraft] = useState<PersonaDraft | null>(null);
  const importRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [personaPayload, folderPayload, toolPayload, skillPayload] = await Promise.all([
        personasApi.list(),
        personasApi.folders.list().catch(() => []),
        subagentsApi.availableTools().catch(() => []),
        skillsApi.list().catch(() => []),
      ]);
      setPersonas(toArray<Json>(personaPayload));
      setFolders(toArray<Json>(folderPayload));
      setTools(
        toArray<Json>(toolPayload).map((item) => ({ name: str(item.name ?? item.id), description: str(item.description) })).filter((t) => t.name),
      );
      setSkills(
        toArray<Json>((skillPayload as Json)?.skills ?? skillPayload)
          .map((item) => ({ name: str(item.name ?? item.id), description: str(item.description) }))
          .filter((s) => s.name),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : '人格列表读取失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const persona of personas) {
      const key = str(persona.folder_id) || '__root__';
      map.set(key, (map.get(key) || 0) + 1);
    }
    return map;
  }, [personas]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return personas.filter((persona) => {
      if (activeFolder === '__all__') {
        /* keep all */
      } else if (activeFolder === '__root__') {
        if (str(persona.folder_id)) return false;
      } else if (str(persona.folder_id) !== activeFolder) {
        return false;
      }
      if (!needle) return true;
      return [persona.persona_id, persona.system_prompt].map((v) => str(v).toLowerCase()).some((v) => v.includes(needle));
    });
  }, [personas, activeFolder, search]);

  const openNew = () => {
    setDraft({
      persona_id: '',
      system_prompt: '',
      custom_error_message: '',
      folder_id: activeFolder.startsWith('__') ? '' : activeFolder,
      begin_dialogs: [],
      tools: [],
      skills: null,
      isNew: true,
    });
  };

  const openEdit = (persona: Json) => {
    setDraft({
      persona_id: str(persona.persona_id),
      system_prompt: str(persona.system_prompt),
      custom_error_message: str(persona.custom_error_message),
      folder_id: str(persona.folder_id),
      begin_dialogs: toDialogs(persona.begin_dialogs),
      tools: Array.isArray(persona.tools) ? (persona.tools as string[]).map((t) => str(t)) : [],
      skills: Array.isArray(persona.skills) ? (persona.skills as string[]).map((s) => str(s)) : null,
      isNew: false,
    });
  };

  const save = async () => {
    if (!draft) return;
    const id = draft.persona_id.trim();
    if (!id) return notify('请填写人格 ID', 'error');
    const payload: Json = {
      persona_id: id,
      system_prompt: draft.system_prompt,
      custom_error_message: draft.custom_error_message || null,
      begin_dialogs: draft.begin_dialogs.filter((pair) => pair.user || pair.assistant).map((pair) => [pair.user, pair.assistant]),
      tools: draft.tools,
      skills: draft.skills,
      folder_id: draft.folder_id || null,
    };
    setBusy('save');
    try {
      if (draft.isNew) await personasApi.create(payload);
      else await personasApi.update({ ...payload, id });
      notify(draft.isNew ? '人格创建成功' : '人格已保存', 'ok');
      setDraft(null);
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : '保存失败', 'error');
    } finally {
      setBusy('');
    }
  };

  const remove = async (persona: Json) => {
    const id = str(persona.persona_id);
    if (!window.confirm(`确定要删除人格 "${id}" 吗？此操作不可撤销。`)) return;
    setBusy(`del:${id}`);
    try {
      await personasApi.remove(id);
      setPersonas((prev) => prev.filter((row) => str(row.persona_id) !== id));
      notify('已删除', 'ok');
    } catch (e) {
      notify(e instanceof Error ? e.message : '删除失败', 'error');
    } finally {
      setBusy('');
    }
  };

  const createFolder = async () => {
    const name = window.prompt('新文件夹名称');
    if (!name || !name.trim()) return;
    setBusy('folder');
    try {
      await personasApi.folders.create({ folder_id: name.trim(), name: name.trim() });
      notify('文件夹创建成功', 'ok');
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : '创建失败', 'error');
    } finally {
      setBusy('');
    }
  };

  const renameFolder = async (folder: Json) => {
    const id = str(folder.folder_id ?? folder.id);
    const next = window.prompt('重命名文件夹', str(folder.name) || id);
    if (!next || !next.trim()) return;
    setBusy(`rf:${id}`);
    try {
      await personasApi.folders.update(id, { name: next.trim() });
      notify('已重命名', 'ok');
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : '重命名失败', 'error');
    } finally {
      setBusy('');
    }
  };

  const removeFolder = async (folder: Json) => {
    const id = str(folder.folder_id ?? folder.id);
    if (!window.confirm(`确定要删除文件夹 "${str(folder.name) || id}" 吗？其中的人格不会被删除。`)) return;
    setBusy(`df:${id}`);
    try {
      await personasApi.folders.remove(id);
      notify('已删除文件夹', 'ok');
      if (activeFolder === id) setActiveFolder('__all__');
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : '删除失败', 'error');
    } finally {
      setBusy('');
    }
  };

  const exportPersona = (persona: Json) => {
    const data = {
      persona_id: str(persona.persona_id),
      system_prompt: str(persona.system_prompt),
      begin_dialogs: toDialogs(persona.begin_dialogs),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${str(persona.persona_id) || 'persona'}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const importPersona = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Json;
      if (!parsed.system_prompt) throw new Error('文件缺少 system_prompt');
      setDraft({
        persona_id: str(parsed.persona_id) || file.name.replace(/\.json$/i, ''),
        system_prompt: str(parsed.system_prompt),
        custom_error_message: str(parsed.custom_error_message),
        folder_id: activeFolder.startsWith('__') ? '' : activeFolder,
        begin_dialogs: toDialogs(parsed.begin_dialogs),
        tools: [],
        skills: null,
        isNew: true,
      });
      notify('已导入草稿，确认后保存（工具/技能需重新选择）', 'ok');
    } catch (e) {
      notify(e instanceof Error ? e.message : '导入失败', 'error');
    }
  };

  const folderOptions = folders.map((folder) => ({
    id: str(folder.folder_id ?? folder.id),
    name: str(folder.name) || str(folder.folder_id ?? folder.id),
  }));

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold tracking-tight">人格设定</h1>
          <p className="text-xs text-muted-foreground">
            管理人格角色：系统提示词、预设对话、可用工具与技能。人格可以在机器人或会话规则中指定。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className={btn} onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} /> 刷新
          </button>
          <button className={btn} onClick={() => importRef.current?.click()}>
            <Upload className="size-3.5" /> 导入
          </button>
          <button className={btnPrimary} onClick={openNew}>
            <Plus className="size-3.5" /> 创建人格
          </button>
          <input
            ref={importRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importPersona(file);
              event.target.value = '';
            }}
          />
        </div>
      </header>

      {draft ? (
        <section className={cn(card, 'p-4')}>
          <div className="flex items-start justify-between gap-3">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold">
              <Heart className="size-4 text-primary" /> {draft.isNew ? '创建人格' : `编辑人格 · ${draft.persona_id}`}
            </h2>
            <button className={btn} onClick={() => setDraft(null)}>
              <X className="size-3.5" /> 取消
            </button>
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <div className="space-y-1.5">
              <label className={labelClass}>人格 ID</label>
              <input
                className={inputClass}
                value={draft.persona_id}
                disabled={!draft.isNew}
                onChange={(event) => setDraft({ ...draft, persona_id: event.target.value })}
              />
              <p className="text-[11px] text-muted-foreground">仅小写字母、数字、下划线与连字符。</p>
            </div>
            <div className="space-y-1.5">
              <label className={labelClass}>所属文件夹</label>
              <select className={inputClass} value={draft.folder_id} onChange={(event) => setDraft({ ...draft, folder_id: event.target.value })}>
                <option value="">未分组</option>
                {folderOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-3 space-y-1.5">
            <label className={labelClass}>系统提示词</label>
            <textarea
              className="h-56 w-full rounded-md border border-input bg-transparent p-3 font-mono text-[12px] leading-relaxed outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30"
              value={draft.system_prompt}
              spellCheck={false}
              onChange={(event) => setDraft({ ...draft, system_prompt: event.target.value })}
            />
          </div>

          <div className="mt-3 space-y-1.5">
            <label className={labelClass}>自定义报错回复（可选）</label>
            <input
              className={inputClass}
              placeholder="模型请求失败时优先发送这条内容"
              value={draft.custom_error_message}
              onChange={(event) => setDraft({ ...draft, custom_error_message: event.target.value })}
            />
          </div>

          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between">
              <label className={labelClass}>预设对话（{draft.begin_dialogs.length} 对）</label>
              <button className={btn} onClick={() => setDraft({ ...draft, begin_dialogs: [...draft.begin_dialogs, { user: '', assistant: '' }] })}>
                <Plus className="size-3.5" /> 添加对话对
              </button>
            </div>
            {draft.begin_dialogs.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">预设对话能帮助模型更快进入角色。</p>
            ) : (
              <div className="space-y-2">
                {draft.begin_dialogs.map((pair, index) => (
                  <div key={index} className="grid gap-2 rounded-lg border border-border/60 bg-muted/30 p-2 md:grid-cols-2">
                    <textarea
                      className="h-16 rounded-md border border-input bg-card p-2 text-[12px] outline-none"
                      placeholder="用户消息"
                      value={pair.user}
                      onChange={(event) => {
                        const next = [...draft.begin_dialogs];
                        next[index] = { ...pair, user: event.target.value };
                        setDraft({ ...draft, begin_dialogs: next });
                      }}
                    />
                    <div className="flex gap-2">
                      <textarea
                        className="h-16 flex-1 rounded-md border border-input bg-card p-2 text-[12px] outline-none"
                        placeholder="AI 回答"
                        value={pair.assistant}
                        onChange={(event) => {
                          const next = [...draft.begin_dialogs];
                          next[index] = { ...pair, assistant: event.target.value };
                          setDraft({ ...draft, begin_dialogs: next });
                        }}
                      />
                      <button
                        className={cn(btn, 'h-16 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive')}
                        onClick={() => setDraft({ ...draft, begin_dialogs: draft.begin_dialogs.filter((_, i) => i !== index) })}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className={labelClass}>可用工具（{draft.tools.length} / {tools.length}）</label>
                <div className="flex items-center gap-1.5">
                  <button className={btn} onClick={() => setDraft({ ...draft, tools: tools.map((t) => t.name) })}>
                    全选
                  </button>
                  <button className={btn} onClick={() => setDraft({ ...draft, tools: [] })}>
                    清空
                  </button>
                </div>
              </div>
              <input
                className={cn(inputClass, 'h-8 text-xs')}
                placeholder="搜索工具"
                value={toolSearch}
                onChange={(event) => setToolSearch(event.target.value)}
              />
              <div className="max-h-60 space-y-1 overflow-auto rounded-lg border border-border/60 bg-muted/20 p-2">
                {tools
                  .filter((tool) => !toolSearch || tool.name.toLowerCase().includes(toolSearch.toLowerCase()))
                  .map((tool) => {
                    const checked = draft.tools.includes(tool.name);
                    return (
                      <label key={tool.name} className="flex cursor-pointer items-start gap-2 rounded px-1.5 py-1 hover:bg-accent/60">
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={checked}
                          onChange={() =>
                            setDraft({
                              ...draft,
                              tools: checked ? draft.tools.filter((name) => name !== tool.name) : [...draft.tools, tool.name],
                            })
                          }
                        />
                        <span className="min-w-0">
                          <span className="block truncate font-mono text-[11px]">{tool.name}</span>
                          {tool.description ? (
                            <span className="block truncate text-[10px] text-muted-foreground">{tool.description}</span>
                          ) : null}
                        </span>
                      </label>
                    );
                  })}
              </div>
            </div>

            <div className="space-y-2">
              <label className={labelClass}>技能绑定</label>
              <div className="flex items-center gap-2 text-xs">
                <ToggleSwitch
                  value={draft.skills === null}
                  onChange={(next) => setDraft({ ...draft, skills: next ? null : [] })}
                  ariaLabel="使用全部技能"
                />
                <span>使用全部技能</span>
              </div>
              {draft.skills !== null ? (
                <div className="max-h-60 space-y-1 overflow-auto rounded-lg border border-border/60 bg-muted/20 p-2">
                  {skills.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">暂无可选技能。</p>
                  ) : (
                    skills.map((skill) => {
                      const checked = (draft.skills || []).includes(skill.name);
                      return (
                        <label key={skill.name} className="flex cursor-pointer items-start gap-2 rounded px-1.5 py-1 hover:bg-accent/60">
                          <input
                            type="checkbox"
                            className="mt-0.5"
                            checked={checked}
                            onChange={() =>
                              setDraft({
                                ...draft,
                                skills: checked
                                  ? (draft.skills || []).filter((name) => name !== skill.name)
                                  : [...(draft.skills || []), skill.name],
                              })
                            }
                          />
                          <span className="min-w-0">
                            <span className="block truncate font-mono text-[11px]">{skill.name}</span>
                            {skill.description ? (
                              <span className="block truncate text-[10px] text-muted-foreground">{skill.description}</span>
                            ) : null}
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-4 flex items-center justify-end gap-2">
            <button className={btn} onClick={() => setDraft(null)}>
              取消
            </button>
            <button className={btnPrimary} onClick={() => void save()} disabled={busy === 'save'}>
              <Check className="size-3.5" /> {busy === 'save' ? '保存中…' : '保存'}
            </button>
          </div>
        </section>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">读取失败：{error}</div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <aside className={cn(card, 'h-fit p-2.5')}>
          <div className="flex items-center justify-between px-1.5 pb-2">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <FolderTree className="size-3.5" /> 文件夹
            </span>
            <button className={cn(btn, 'h-7 px-2')} onClick={() => void createFolder()} disabled={busy === 'folder'}>
              <FolderPlus className="size-3.5" />
            </button>
          </div>
          <div className="space-y-0.5">
            {[
              { id: '__all__', name: '全部人格', count: personas.length },
              { id: '__root__', name: '未分组', count: counts.get('__root__') || 0 },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveFolder(item.id)}
                className={cn(
                  'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                  activeFolder === item.id ? 'bg-primary/10 font-medium text-primary' : 'hover:bg-accent',
                )}
              >
                <span className="truncate">{item.name}</span>
                <span className="text-[10px] text-muted-foreground">{item.count}</span>
              </button>
            ))}
            {folderOptions.map((option) => (
              <div key={option.id} className="group flex items-center gap-1">
                <button
                  onClick={() => setActiveFolder(option.id)}
                  className={cn(
                    'flex flex-1 items-center justify-between rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                    activeFolder === option.id ? 'bg-primary/10 font-medium text-primary' : 'hover:bg-accent',
                  )}
                >
                  <span className="truncate">{option.name}</span>
                  <span className="text-[10px] text-muted-foreground">{counts.get(option.id) || 0}</span>
                </button>
                <button className="hidden rounded p-1 text-muted-foreground hover:bg-accent group-hover:block" onClick={() => void renameFolder(folders.find((f) => str(f.folder_id ?? f.id) === option.id) || {})}>
                  <Pencil className="size-3" />
                </button>
                <button className="hidden rounded p-1 text-destructive hover:bg-destructive/10 group-hover:block" onClick={() => void removeFolder(folders.find((f) => str(f.folder_id ?? f.id) === option.id) || {})}>
                  <Trash2 className="size-3" />
                </button>
              </div>
            ))}
          </div>
        </aside>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                className={cn(inputClass, 'h-8 pl-8 text-xs')}
                placeholder="搜索人格 ID 或提示词"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </span>
            <span className="text-[11px] text-muted-foreground">{filtered.length} 个人格</span>
          </div>

          {loading ? (
            <div className={cn(card, 'grid place-items-center p-10 text-xs text-muted-foreground')}>
              <span className="flex items-center gap-2">
                <RefreshCw className="size-4 animate-spin" /> 加载中…
              </span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card/40 px-6 py-11 text-center">
              <div className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
                <Heart className="size-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-medium">这里还没有人格</h3>
                <p className="text-xs text-muted-foreground">创建一个人格，为机器人设定角色、语气与可用能力。</p>
              </div>
              <button className={btnPrimary} onClick={openNew}>
                <Plus className="size-3.5" /> 创建人格
              </button>
            </div>
          ) : (
            <div className="grid gap-3 xl:grid-cols-2">
              {filtered.map((persona) => {
                const id = str(persona.persona_id);
                const prompt = str(persona.system_prompt);
                const toolCount = Array.isArray(persona.tools) ? persona.tools.length : 0;
                const skillCount = Array.isArray(persona.skills) ? persona.skills.length : 0;
                const folderName = folderOptions.find((option) => option.id === str(persona.folder_id))?.name;
                return (
                  <article key={id} className={cn(card, 'flex flex-col gap-2.5 p-3.5')}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="grid size-8 shrink-0 place-items-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
                          <Heart className="size-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{id}</div>
                          <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                            <span className="rounded border border-border bg-muted px-1.5 py-[1px]">{toolCount} 工具</span>
                            <span className="rounded border border-border bg-muted px-1.5 py-[1px]">
                              {skillCount ? `${skillCount} 技能` : '全部技能'}
                            </span>
                            {folderName ? <span className="truncate">{folderName}</span> : null}
                          </div>
                        </div>
                      </div>
                    </div>

                    <p className="line-clamp-3 whitespace-pre-wrap text-[11px] leading-relaxed text-muted-foreground">
                      {prompt.slice(0, 220) || '（未设置提示词）'}
                    </p>

                    <div className="mt-auto flex items-center gap-2">
                      <button className={btn} onClick={() => openEdit(persona)}>
                        <Pencil className="size-3.5" /> 编辑
                      </button>
                      <button className={btn} onClick={() => exportPersona(persona)}>
                        <Download className="size-3.5" /> 导出
                      </button>
                      <button
                        className={cn(btn, 'ml-auto text-destructive hover:bg-destructive/10 hover:text-destructive')}
                        onClick={() => void remove(persona)}
                        disabled={busy === `del:${id}`}
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
      </div>
    </div>
  );
}
