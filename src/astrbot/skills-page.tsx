/**
 * Skills page: local skill packages (upload / enable / inspect files / download)
 * plus the Neo skill candidates and releases.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  ChevronLeft,
  Download,
  FileCode2,
  Folder,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toArray } from './api';
import { skills as skillsApi, type Json } from './endpoints';
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

export function SkillsPage() {
  const { notify } = useApp();
  const [tab, setTab] = useState<'local' | 'neo'>('local');
  const [skills, setSkills] = useState<Json[]>([]);
  const [neoCandidates, setNeoCandidates] = useState<Json[]>([]);
  const [neoReleases, setNeoReleases] = useState<Json[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [active, setActive] = useState<Json | null>(null);
  const [files, setFiles] = useState<Json[]>([]);
  const [filePath, setFilePath] = useState('');
  const [fileContent, setFileContent] = useState('');
  const [fileDirty, setFileDirty] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [skillPayload, candidatePayload, releasePayload] = await Promise.all([
        skillsApi.list(),
        skillsApi.neo.candidates().catch(() => ({}) as Json),
        skillsApi.neo.releases().catch(() => ({}) as Json),
      ]);
      const raw = skillPayload as Json;
      setSkills(toArray<Json>(raw.skills ?? raw.items ?? raw));
      const cRaw = candidatePayload as Json;
      setNeoCandidates(toArray<Json>(cRaw.candidates ?? cRaw.items ?? cRaw));
      const rRaw = releasePayload as Json;
      setNeoReleases(toArray<Json>(rRaw.releases ?? rRaw.items ?? rRaw));
    } catch (e) {
      setError(e instanceof Error ? e.message : '技能列表读取失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return skills;
    return skills.filter((skill) =>
      [skill.name, skill.description].map((value) => str(value).toLowerCase()).some((value) => value.includes(needle)),
    );
  }, [skills, search]);

  const upload = async (fileList: FileList) => {
    setBusy('upload');
    try {
      const form = new FormData();
      Array.from(fileList).forEach((file) => form.append('files', file));
      await skillsApi.batch(form as unknown as Json);
      notify(`已上传 ${fileList.length} 个技能包（自动校验目录与 SKILL.md）`, 'ok');
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : '上传失败', 'error');
    } finally {
      setBusy('');
    }
  };

  const toggle = async (skill: Json) => {
    const name = str(skill.name);
    const next = !(skill.enabled !== false && skill.active !== false);
    setBusy(`en:${name}`);
    try {
      await skillsApi.setEnabled(name, next);
      setSkills((prev) => prev.map((row) => (str(row.name) === name ? { ...row, enabled: next, active: next } : row)));
      notify(next ? `已启用 ${name}` : `已停用 ${name}`, 'ok');
    } catch (e) {
      notify(e instanceof Error ? e.message : '状态更新失败', 'error');
    } finally {
      setBusy('');
    }
  };

  const remove = async (skill: Json) => {
    const name = str(skill.name);
    if (!window.confirm(`确定要删除技能「${name}」吗？`)) return;
    setBusy(`del:${name}`);
    try {
      await skillsApi.remove(name);
      setSkills((prev) => prev.filter((row) => str(row.name) !== name));
      if (active && str(active.name) === name) setActive(null);
      notify('已删除', 'ok');
    } catch (e) {
      notify(e instanceof Error ? e.message : '删除失败', 'error');
    } finally {
      setBusy('');
    }
  };

  const openSkill = async (skill: Json) => {
    const name = str(skill.name);
    setActive(skill);
    setFileContent('');
    setFilePath('');
    setFileDirty(false);
    setBusy('files');
    try {
      const payload = (await skillsApi.files(name)) as Json;
      const list = toArray<Json>(payload.entries ?? payload.files ?? payload.items ?? payload);
      setFiles(list);
    } catch (e) {
      notify(e instanceof Error ? e.message : '文件列表读取失败', 'error');
      setFiles([]);
    } finally {
      setBusy('');
    }
  };

  const openDir = async (dirPath: string) => {
    if (!active) return;
    setBusy('files');
    try {
      const payload = (await skillsApi.filesAt(str(active.name), dirPath)) as Json;
      setFiles(toArray<Json>(payload.entries ?? payload.files ?? payload));
      setFilePath('');
      setFileContent('');
    } catch (e) {
      notify(e instanceof Error ? e.message : '目录读取失败', 'error');
    } finally {
      setBusy('');
    }
  };

  const openFile = async (entry: Json) => {
    if (!active) return;
    const path = str(entry.path ?? entry.name ?? entry);
    setFilePath(path);
    setBusy(`file:${path}`);
    try {
      const payload = (await skillsApi.skillFile(str(active.name), path)) as Json;
      const content = str(payload.content ?? payload.text ?? payload.data ?? payload);
      setFileContent(content);
      setFileDirty(false);
    } catch (e) {
      notify(e instanceof Error ? e.message : '文件读取失败', 'error');
    } finally {
      setBusy('');
    }
  };

  const saveFile = async () => {
    if (!active || !filePath) return;
    setBusy('savefile');
    try {
      await skillsApi.saveFileContent(str(active.name), filePath, fileContent);
      notify('文件已保存', 'ok');
      setFileDirty(false);
    } catch (e) {
      notify(e instanceof Error ? e.message : '保存失败', 'error');
    } finally {
      setBusy('');
    }
  };

  const syncNeo = async () => {
    setBusy('sync');
    try {
      await skillsApi.neo.sync();
      notify('已请求同步 Neo 技能', 'ok');
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : '同步失败', 'error');
    } finally {
      setBusy('');
    }
  };

  /* ------------------------------------------------------------ file view */

  if (active) {
    return (
      <div className="flex flex-col gap-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <button className={btn} onClick={() => setActive(null)}>
              <ChevronLeft className="size-3.5" /> 返回
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold tracking-tight">{str(active.name)}</h1>
              <p className="line-clamp-1 text-[11px] text-muted-foreground">{str(active.description) || str(active.path)}</p>
            </div>
          </div>
          <a className={btn} href={`/api/v1/skills/archive?skill_name=${encodeURIComponent(str(active.name))}`} target="_blank" rel="noreferrer">
            <Download className="size-3.5" /> 下载技能包
          </a>
        </header>

        <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className={cn(card, 'h-fit p-2.5')}>
            <div className="flex items-center gap-1.5 px-1.5 pb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Folder className="size-3.5" /> 文件（{files.length}）
            </div>
            <div className="max-h-[60vh] space-y-0.5 overflow-auto">
              {busy === 'files' ? (
                <p className="p-2 text-[11px] text-muted-foreground">加载中…</p>
              ) : files.length === 0 ? (
                <p className="p-2 text-[11px] text-muted-foreground">没有文件。</p>
              ) : (
                files.map((entry) => {
                  const path = str(entry.path ?? entry.name ?? entry);
                  const isDir = str(entry.type) === 'directory';
                  return (
                    <button
                      key={path}
                      onClick={() => (isDir ? void openDir(path) : void openFile(entry))}
                      className={cn(
                        'flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-[11.5px] transition-colors',
                        path === filePath ? 'bg-primary/10 text-primary' : 'hover:bg-accent',
                      )}
                    >
                      {isDir ? <Folder className="size-3 shrink-0" /> : <FileCode2 className="size-3 shrink-0" />}
                      <span className="truncate">{path}</span>
                      {entry.editable === false ? <span className="ml-auto text-[9px] text-muted-foreground">只读</span> : null}
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          <section className={cn(card, 'flex flex-col gap-2 p-3.5')}>
            <div className="flex items-center justify-between gap-2">
              <span className={cn(mono, 'truncate text-muted-foreground')}>{filePath || '选择左侧文件查看内容'}</span>
              {fileDirty ? <span className="text-[11px] neko-warn">有未保存的更改</span> : null}
              <button className={btnPrimary} onClick={() => void saveFile()} disabled={!filePath || !fileDirty || busy === 'savefile'}>
                保存文件
              </button>
            </div>
            <textarea
              className="h-[60vh] w-full rounded-lg border border-input bg-transparent p-3 font-mono text-[12px] leading-relaxed outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30"
              value={fileContent}
              spellCheck={false}
              placeholder="选择左侧文件开始编辑"
              onChange={(event) => {
                setFileContent(event.target.value);
                setFileDirty(true);
              }}
            />
          </section>
        </div>
      </div>
    );
  }

  /* -------------------------------------------------------------- listing */

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <BookOpen className="size-4 text-primary" /> 技能
          </h1>
          <p className="text-xs text-muted-foreground">
            技能是给 Agent 的可复用流程与规范（含 SKILL.md）；上传 zip 包即自动校验并安装，可在人格里绑定。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className={btn} onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} /> 刷新
          </button>
          <label className={btnPrimary + ' cursor-pointer'}>
            <Upload className="size-3.5" /> {busy === 'upload' ? '上传中…' : '上传技能包'}
            <input
              type="file"
              accept=".zip"
              multiple
              className="hidden"
              onChange={(event) => {
                if (event.target.files?.length) void upload(event.target.files);
                event.target.value = '';
              }}
            />
          </label>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
          {([
            { id: 'local', label: '本地技能', count: skills.length },
            { id: 'neo', label: 'Neo 技能', count: neoCandidates.length + neoReleases.length },
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
        {tab === 'local' ? (
          <input
            className={cn(inputClass, 'h-8 w-56 text-xs')}
            placeholder="搜索技能"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        ) : (
          <button className={btn} onClick={() => void syncNeo()} disabled={busy === 'sync'}>
            <RefreshCw className={cn('size-3.5', busy === 'sync' && 'animate-spin')} /> 同步 Neo 技能
          </button>
        )}
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
      ) : tab === 'local' ? (
        filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card/40 px-6 py-11 text-center">
            <div className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
              <BookOpen className="size-5" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-medium">还没有技能</h3>
              <p className="text-xs text-muted-foreground">上传包含 SKILL.md 的 zip 包即可安装。</p>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {filtered.map((skill) => {
              const name = str(skill.name);
              const enabled = skill.enabled !== false && skill.active !== false;
              return (
                <article key={name} className={cn(card, 'flex flex-col gap-2.5 p-3.5')}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-start gap-2.5">
                      <div className="grid size-9 shrink-0 place-items-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
                        <BookOpen className="size-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{name}</div>
                        <div className="line-clamp-2 text-[11px] text-muted-foreground">{str(skill.description) || '无描述'}</div>
                      </div>
                    </div>
                    {enabled ? (
                      <span className="shrink-0 rounded-full border neko-chip-accent px-2 py-[3px] text-[11px] text-[var(--primary)]">启用</span>
                    ) : (
                      <span className="shrink-0 rounded-full border border-border bg-muted px-2 py-[3px] text-[11px] text-muted-foreground">已停用</span>
                    )}
                  </div>
                  <div className={cn(mono, 'truncate text-muted-foreground')}>{str(skill.path)}</div>
                  <div className="mt-auto flex flex-wrap items-center gap-2">
                    <button className={btn} onClick={() => void toggle(skill)} disabled={busy === `en:${name}`}>
                      {enabled ? '停用' : '启用'}
                    </button>
                    <button className={btn} onClick={() => void openSkill(skill)} disabled={busy === 'files'}>
                      查看文件
                    </button>
                    <a
                      className={btn}
                      href={`/api/v1/skills/archive?skill_name=${encodeURIComponent(name)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Download className="size-3.5" />
                    </a>
                    <button
                      className={cn(btn, 'ml-auto text-destructive hover:bg-destructive/10 hover:text-destructive')}
                      onClick={() => void remove(skill)}
                      disabled={busy === `del:${name}`}
                    >
                      <Trash2 className="size-3.5" /> 删除
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )
      ) : neoCandidates.length + neoReleases.length === 0 ? (
        <div className={cn(card, 'p-8 text-center text-xs text-muted-foreground')}>
          暂无 Neo 技能数据。点击「同步 Neo 技能」从后端拉取候选与发布记录。
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className={cn(card, 'p-4')}>
            <h2 className="pb-2 text-sm font-semibold">候选（{neoCandidates.length}）</h2>
            {neoCandidates.map((item, index) => (
              <div key={index} className="border-b border-border/50 py-2 last:border-b-0">
                <div className={cn('text-[12.5px] font-medium', mono)}>{str(item.name ?? item.skill_name ?? item.id)}</div>
                <div className="text-[11px] text-muted-foreground">{str(item.description ?? item.status ?? '')}</div>
              </div>
            ))}
          </section>
          <section className={cn(card, 'p-4')}>
            <h2 className="pb-2 text-sm font-semibold">发布记录（{neoReleases.length}）</h2>
            {neoReleases.map((item, index) => (
              <div key={index} className="border-b border-border/50 py-2 last:border-b-0">
                <div className={cn('text-[12.5px] font-medium', mono)}>{str(item.name ?? item.skill_name ?? item.id)}</div>
                <div className="text-[11px] text-muted-foreground">{str(item.version ?? item.created_at ?? '')}</div>
              </div>
            ))}
          </section>
        </div>
      )}
    </div>
  );
}
