/**
 * Knowledge base page (tab style).
 *
 * List view -> detail view with tabs: \u6587\u6863 / \u5206\u5757 / \u68c0\u7d22\u6d4b\u8bd5 / \u8bbe\u7f6e.
 * Supports multipart file upload, pasted text (import API), URL import,
 * chunk browsing/deletion, retrieval testing and settings editing.
 */
import { ToggleSwitch } from '@/components/ui/toggle-switch';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  ChevronLeft,
  Database,
  FileText,
  Link2,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toArray } from './api';
import { knowledge as kbApi, providers as providersApi, type Json } from './endpoints';
import { useApp } from './state';

const card = 'rounded-xl border border-border/60 bg-card';
const btn =
  'inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50';
const btnPrimary =
  'inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground shadow-xs transition-colors hover:bg-primary/90 disabled:opacity-50';
const inputClass =
  'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30';
const labelClass = 'text-xs font-medium';
const mono = 'font-mono text-[11px]';

function str(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

function num(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function kbIdOf(item: Json): string {
  return str(item.kb_id ?? item.id ?? item.name ?? item.kb_name);
}

function kbNameOf(item: Json): string {
  return str(item.name ?? item.kb_name ?? item.kb_id ?? item.id);
}

type TabId = 'documents' | 'chunks' | 'retrieve' | 'settings';

export function KnowledgePage() {
  const { notify } = useApp();
  const [items, setItems] = useState<Json[]>([]);
  const [providers, setProviders] = useState<Json[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState('');
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Json>({ name: '', description: '', emoji: '', embedding_provider_id: '', rerank_provider_id: '' });

  const [active, setActive] = useState<Json | null>(null);
  const [tab, setTab] = useState<TabId>('documents');
  const [docs, setDocs] = useState<Json[]>([]);
  const [docSearch, setDocSearch] = useState('');
  const [chunks, setChunks] = useState<Json[]>([]);
  const [chunkQuery, setChunkQuery] = useState('');
  const [retrieveQuery, setRetrieveQuery] = useState('');
  const [retrieveTopK, setRetrieveTopK] = useState(5);
  const [retrieveRerank, setRetrieveRerank] = useState(true);
  const [hits, setHits] = useState<Json[]>([]);
  const [urlDraft, setUrlDraft] = useState('');
  const [textDraft, setTextDraft] = useState({ name: '', content: '' });
  const [taskInfo, setTaskInfo] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [kbPayload, providerPayload] = await Promise.all([
        kbApi.list(),
        providersApi.list().catch(() => ({}) as Json),
      ]);
      const raw = kbPayload as Json;
      setItems(toArray<Json>(raw.items ?? raw.knowledge_bases ?? raw));
      setProviders(toArray<Json>((providerPayload as Json)?.providers ?? providerPayload));
    } catch (e) {
      setError(e instanceof Error ? e.message : '知识库读取失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const loadDocs = useCallback(
    async (kbId: string, keyword = '') => {
      try {
        const payload = await kbApi.documents(kbId);
        const raw = payload as Json;
        let list = toArray<Json>(raw.items ?? raw.documents ?? raw);
        if (keyword) {
          const needle = keyword.toLowerCase();
          list = list.filter((doc) => str(doc.file_name ?? doc.name).toLowerCase().includes(needle));
        }
        setDocs(list);
      } catch (e) {
        notify(e instanceof Error ? e.message : '文档读取失败', 'error');
      }
    },
    [notify],
  );

  const loadChunks = useCallback(
    async (kbId: string, keyword = '') => {
      try {
        const payload = await kbApi.chunks(kbId, keyword || undefined);
        const raw = payload as Json;
        setChunks(toArray<Json>(raw.items ?? raw.chunks ?? raw));
      } catch (e) {
        notify(e instanceof Error ? e.message : '分块读取失败', 'error');
      }
    },
    [notify],
  );

  const openKb = async (item: Json) => {
    const id = kbIdOf(item);
    setActive(item);
    setTab('documents');
    setHits([]);
    setChunks([]);
    setBusy('open');
    try {
      const detail = await kbApi.get(id).catch(() => item);
      const merged = { ...item, ...((detail as Json) || {}) };
      setActive(merged);
      await Promise.all([loadDocs(id), loadChunks(id)]);
    } finally {
      setBusy('');
    }
  };

  const embeddingOptions = useMemo(
    () =>
      providers
        .filter((provider) => str(provider.provider_type) === 'embedding' || str(provider.type).includes('embedding'))
        .map((provider) => ({ id: str(provider.id), label: `${str(provider.id)}${provider.model ? ` · ${str(provider.model)}` : ''}` })),
    [providers],
  );

  const rerankOptions = useMemo(
    () =>
      providers
        .filter((provider) => str(provider.provider_type) === 'rerank' || str(provider.type).includes('rerank'))
        .map((provider) => ({ id: str(provider.id), label: str(provider.id) })),
    [providers],
  );

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) =>
      [kbNameOf(item), str(item.description)].map((value) => value.toLowerCase()).some((value) => value.includes(needle)),
    );
  }, [items, search]);

  const createKb = async () => {
    const name = str(draft.name).trim();
    const embedding = str(draft.embedding_provider_id).trim();
    if (!name) return notify('请填写知识库名称', 'error');
    if (!embedding) return notify('请选择嵌入模型提供商', 'error');
    setBusy('create');
    try {
      await kbApi.create({ name, description: str(draft.description), emoji: str(draft.emoji), embedding_provider_id: embedding, rerank_provider_id: str(draft.rerank_provider_id) || null });
      notify('知识库创建成功', 'ok');
      setCreating(false);
      setDraft({ name: '', description: '', emoji: '', embedding_provider_id: '', rerank_provider_id: '' });
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : '创建失败', 'error');
    } finally {
      setBusy('');
    }
  };

  const removeKb = async (item: Json) => {
    const id = kbIdOf(item);
    if (!window.confirm(`确定要删除知识库「${kbNameOf(item)}」吗？文档、分块与关联配置都会被永久删除。`)) return;
    setBusy(`del:${id}`);
    try {
      await kbApi.remove(id);
      setItems((prev) => prev.filter((row) => kbIdOf(row) !== id));
      if (active && kbIdOf(active) === id) setActive(null);
      notify('知识库已删除', 'ok');
    } catch (e) {
      notify(e instanceof Error ? e.message : '删除失败', 'error');
    } finally {
      setBusy('');
    }
  };

  const uploadFiles = async (files: FileList) => {
    if (!active) return;
    const kbId = kbIdOf(active);
    setBusy('upload');
    setTaskInfo('');
    try {
      const form = new FormData();
      form.append('kb_id', kbId);
      Array.from(files).forEach((file) => form.append('file', file));
      const out = (await kbApi.addDocument(kbId, form as unknown as Json)) as Json;
      const task = str(out?.task_id);
      notify(`已提交 ${files.length} 个文件${task ? `，任务 ${task.slice(0, 8)}` : ''}`, 'ok');
      if (task) setTaskInfo(task);
      await loadDocs(kbId);
    } catch (e) {
      notify(e instanceof Error ? e.message : '上传失败', 'error');
    } finally {
      setBusy('');
    }
  };

  const importText = async () => {
    if (!active) return;
    const kbId = kbIdOf(active);
    const content = textDraft.content.trim();
    if (!content) return notify('请粘贴要导入的文本', 'error');
    setBusy('text');
    try {
      const out = (await kbApi.importFile(kbId, {
        documents: [{ file_name: textDraft.name.trim() || `text-${Date.now()}.txt`, chunks: content.split(/\n{2,}/).filter(Boolean) }],
      })) as Json;
      notify(`文本已提交导入${out?.task_id ? `（任务 ${str(out.task_id).slice(0, 8)}）` : ''}`, 'ok');
      setTextDraft({ name: '', content: '' });
      await loadDocs(kbId);
    } catch (e) {
      notify(e instanceof Error ? e.message : '导入失败', 'error');
    } finally {
      setBusy('');
    }
  };

  const importUrl = async () => {
    if (!active) return;
    const kbId = kbIdOf(active);
    const url = urlDraft.trim();
    if (!url) return notify('请填写网址', 'error');
    setBusy('url');
    try {
      const out = (await kbApi.importUrl(kbId, { url })) as Json;
      notify(`已提交 URL 导入${out?.task_id ? `（任务 ${str(out.task_id).slice(0, 8)}）` : ''}`, 'ok');
      setUrlDraft('');
      await loadDocs(kbId);
    } catch (e) {
      notify(e instanceof Error ? e.message : '导入失败', 'error');
    } finally {
      setBusy('');
    }
  };

  const removeDoc = async (doc: Json) => {
    if (!active) return;
    const kbId = kbIdOf(active);
    const docId = str(doc.document_id ?? doc.id ?? doc.file_name);
    if (!window.confirm(`确定要删除文档「${str(doc.file_name ?? docId)}」吗？`)) return;
    setBusy(`dd:${docId}`);
    try {
      await kbApi.removeDocument(kbId, docId);
      setDocs((prev) => prev.filter((row) => str(row.document_id ?? row.id ?? row.file_name) !== docId));
      notify('文档已删除', 'ok');
    } catch (e) {
      notify(e instanceof Error ? e.message : '删除失败', 'error');
    } finally {
      setBusy('');
    }
  };

  const removeChunk = async (chunk: Json) => {
    if (!active) return;
    const kbId = kbIdOf(active);
    const chunkId = str(chunk.chunk_id ?? chunk.id);
    if (!chunkId) return;
    setBusy(`dc:${chunkId}`);
    try {
      await kbApi.removeChunk(kbId, chunkId);
      setChunks((prev) => prev.filter((row) => str(row.chunk_id ?? row.id) !== chunkId));
      notify('分块已删除', 'ok');
    } catch (e) {
      notify(e instanceof Error ? e.message : '删除失败', 'error');
    } finally {
      setBusy('');
    }
  };

  const runRetrieve = async () => {
    if (!active) return;
    const kbId = kbIdOf(active);
    const query = retrieveQuery.trim();
    if (!query) return notify('请输入检索内容', 'error');
    setBusy('retrieve');
    try {
      const payload = (await kbApi.retrieve(kbId, { query, top_k: retrieveTopK, rerank: retrieveRerank })) as Json;
      setHits(toArray<Json>(payload?.results ?? payload?.items ?? payload));
      notify('检索完成', 'ok');
    } catch (e) {
      notify(e instanceof Error ? e.message : '检索失败', 'error');
    } finally {
      setBusy('');
    }
  };

  const saveSettings = async () => {
    if (!active) return;
    const kbId = kbIdOf(active);
    setBusy('save');
    try {
      await kbApi.update(kbId, {
        name: kbNameOf(active),
        description: str(active.description),
        emoji: str(active.emoji),
        rerank_provider_id: str(active.rerank_provider_id) || null,
        chunk_size: num(active.chunk_size) || undefined,
        chunk_overlap: num(active.chunk_overlap) || undefined,
      });
      notify('知识库设置已保存', 'ok');
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : '保存失败', 'error');
    } finally {
      setBusy('');
    }
  };

  /* ------------------------------------------------------------- list view */

  if (!active) {
    return (
      <div className="flex flex-col gap-4">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-lg font-semibold tracking-tight">知识库</h1>
            <p className="text-xs text-muted-foreground">为机器人提供可检索的长期资料。支持上传文件、粘贴文本与从网页导入。</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                className={cn(inputClass, 'h-8 w-52 pl-8 text-xs')}
                placeholder="搜索知识库"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </span>
            <button className={btn} onClick={() => void load()} disabled={loading}>
              <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} /> 刷新
            </button>
            <button className={btnPrimary} onClick={() => setCreating((value) => !value)}>
              {creating ? <X className="size-3.5" /> : <Plus className="size-3.5" />} {creating ? '收起' : '创建知识库'}
            </button>
          </div>
        </header>

        {creating ? (
          <section className={cn(card, 'p-4')}>
            <h2 className="text-sm font-semibold">创建知识库</h2>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <label className={labelClass}>名称 *</label>
                <input className={inputClass} value={str(draft.name)} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
              </div>
              <div className="space-y-1.5">
                <label className={labelClass}>图标（可选）</label>
                <input className={inputClass} placeholder="一个符号或短文本" value={str(draft.emoji)} onChange={(event) => setDraft({ ...draft, emoji: event.target.value })} />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <label className={labelClass}>描述（可选）</label>
                <input className={inputClass} value={str(draft.description)} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
              </div>
              <div className="space-y-1.5">
                <label className={labelClass}>嵌入模型提供商 *</label>
                <select className={inputClass} value={str(draft.embedding_provider_id)} onChange={(event) => setDraft({ ...draft, embedding_provider_id: event.target.value })}>
                  <option value="">请选择</option>
                  {embeddingOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-muted-foreground">创建后无法更改嵌入模型，需要更换请新建知识库。</p>
              </div>
              <div className="space-y-1.5">
                <label className={labelClass}>重排序模型（可选）</label>
                <select className={inputClass} value={str(draft.rerank_provider_id)} onChange={(event) => setDraft({ ...draft, rerank_provider_id: event.target.value })}>
                  <option value="">不使用</option>
                  {rerankOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button className={btn} onClick={() => setCreating(false)}>
                取消
              </button>
              <button className={btnPrimary} onClick={() => void createKb()} disabled={busy === 'create'}>
                {busy === 'create' ? '创建中…' : '创建'}
              </button>
            </div>
          </section>
        ) : null}

        {error ? <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">读取失败：{error}</div> : null}

        {loading ? (
          <div className={cn(card, 'grid place-items-center p-10 text-xs text-muted-foreground')}>
            <span className="flex items-center gap-2">
              <RefreshCw className="size-4 animate-spin" /> 加载中…
            </span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card/40 px-6 py-11 text-center">
            <div className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
              <Database className="size-5" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-medium">还没有知识库</h3>
              <p className="text-xs text-muted-foreground">创建后即可上传资料，让机器人在回答时检索引用。</p>
            </div>
            <button className={btnPrimary} onClick={() => setCreating(true)}>
              <Plus className="size-3.5" /> 创建知识库
            </button>
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
            {filtered.map((item) => {
              const id = kbIdOf(item);
              return (
                <article key={id} className={cn(card, 'flex flex-col gap-2.5 p-3.5')}>
                  <div className="flex items-start gap-2.5">
                    <div className="grid size-9 shrink-0 place-items-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
                      {str(item.emoji) ? <span className="text-base leading-none">{str(item.emoji)}</span> : <BookOpen className="size-4" />}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{kbNameOf(item)}</div>
                      <div className="truncate text-[11px] text-muted-foreground">{str(item.description) || '暂无描述'}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span className="rounded border border-border bg-muted px-1.5 py-[1px]">{num(item.document_count ?? item.doc_count)} 文档</span>
                    <span className="rounded border border-border bg-muted px-1.5 py-[1px]">{num(item.chunk_count ?? item.chunks)} 分块</span>
                    {item.embedding_provider_id ? <span className={cn(mono, 'truncate')}>{str(item.embedding_provider_id)}</span> : null}
                  </div>
                  <div className="mt-auto flex items-center gap-2">
                    <button className={btn} onClick={() => void openKb(item)} disabled={busy === 'open'}>
                      打开
                    </button>
                    <button
                      className={cn(btn, 'ml-auto text-destructive hover:bg-destructive/10 hover:text-destructive')}
                      onClick={() => void removeKb(item)}
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
    );
  }

  /* ----------------------------------------------------------- detail view */

  const kbId = kbIdOf(active);
  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: 'documents', label: '文档', count: docs.length },
    { id: 'chunks', label: '分块', count: chunks.length },
    { id: 'retrieve', label: '检索测试' },
    { id: 'settings', label: '设置' },
  ];

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <button className={btn} onClick={() => setActive(null)}>
            <ChevronLeft className="size-3.5" /> 返回
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold tracking-tight">{kbNameOf(active)}</h1>
            <p className={cn('truncate text-[11px] text-muted-foreground', mono)}>{kbId}</p>
          </div>
        </div>
        <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
          {tabs.map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={cn(
                'inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors',
                tab === item.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent',
              )}
            >
              {item.label}
              {item.count !== undefined ? (
                <span className={cn('rounded px-1 text-[10px]', tab === item.id ? 'bg-primary-foreground/15' : 'bg-muted')}>{item.count}</span>
              ) : null}
            </button>
          ))}
        </div>
      </header>

      {tab === 'documents' ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <section className={cn(card, 'flex flex-col gap-3 p-3.5')}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="relative flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  className={cn(inputClass, 'h-8 pl-8 text-xs')}
                  placeholder="搜索文档"
                  value={docSearch}
                  onChange={(event) => {
                    setDocSearch(event.target.value);
                    void loadDocs(kbId, event.target.value);
                  }}
                />
              </span>
              <button className={btn} onClick={() => void loadDocs(kbId, docSearch)}>
                <RefreshCw className="size-3.5" /> 刷新
              </button>
            </div>

            {docs.length === 0 ? (
              <p className="py-8 text-center text-xs text-muted-foreground">暂无文档，右侧上传文件、粘贴文本或从 URL 导入。</p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-border/60">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/40 text-[11px] text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">文档</th>
                      <th className="px-3 py-2 font-medium">分块</th>
                      <th className="px-3 py-2 font-medium">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {docs.map((doc) => {
                      const docId = str(doc.document_id ?? doc.id ?? doc.file_name);
                      return (
                        <tr key={docId} className="border-t border-border/60">
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                              <span className="truncate">{str(doc.file_name ?? doc.name ?? docId)}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{num(doc.chunk_count ?? doc.chunks ?? doc.count)}</td>
                          <td className="px-3 py-2">
                            <button
                              className={cn(btn, 'h-7 text-destructive hover:bg-destructive/10 hover:text-destructive')}
                              onClick={() => void removeDoc(doc)}
                              disabled={busy === `dd:${docId}`}
                            >
                              <Trash2 className="size-3" /> 删除
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {taskInfo ? (
              <p className="text-[11px] text-muted-foreground">
                导入任务：<span className={mono}>{taskInfo}</span>（后台处理中，可稍后刷新文档列表）
              </p>
            ) : null}
          </section>

          <aside className="space-y-3">
            <section className={cn(card, 'p-3.5')}>
              <h2 className="flex items-center gap-1.5 text-sm font-semibold">
                <Upload className="size-4 text-primary" /> 上传文件
              </h2>
              <p className="mt-1 text-[11px] text-muted-foreground">支持 txt / md / pdf / docx 等，可多选。</p>
              <label className={cn(btnPrimary, 'mt-2 w-full cursor-pointer')}>
                <Upload className="size-3.5" /> {busy === 'upload' ? '上传中…' : '选择文件'}
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(event) => {
                    if (event.target.files?.length) void uploadFiles(event.target.files);
                    event.target.value = '';
                  }}
                />
              </label>
            </section>

            <section className={cn(card, 'p-3.5')}>
              <h2 className="flex items-center gap-1.5 text-sm font-semibold">
                <FileText className="size-4 text-primary" /> 粘贴文本
              </h2>
              <input
                className={cn(inputClass, 'mt-2 h-8 text-xs')}
                placeholder="文档名称（可选）"
                value={textDraft.name}
                onChange={(event) => setTextDraft({ ...textDraft, name: event.target.value })}
              />
              <textarea
                className="mt-2 h-28 w-full rounded-md border border-input bg-transparent p-2.5 text-[12px] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30"
                placeholder="粘贴文本内容，空行会作为分块边界"
                value={textDraft.content}
                onChange={(event) => setTextDraft({ ...textDraft, content: event.target.value })}
              />
              <button className={cn(btnPrimary, 'mt-2 w-full')} onClick={() => void importText()} disabled={busy === 'text'}>
                {busy === 'text' ? '提交中…' : '导入文本'}
              </button>
            </section>

            <section className={cn(card, 'p-3.5')}>
              <h2 className="flex items-center gap-1.5 text-sm font-semibold">
                <Link2 className="size-4 text-primary" /> 从网址导入
              </h2>
              <input
                className={cn(inputClass, 'mt-2 h-8 text-xs')}
                placeholder="https://example.com/doc"
                value={urlDraft}
                onChange={(event) => setUrlDraft(event.target.value)}
              />
              <button className={cn(btn, 'mt-2 w-full')} onClick={() => void importUrl()} disabled={busy === 'url'}>
                {busy === 'url' ? '提交中…' : '导入网页'}
              </button>
            </section>
          </aside>
        </div>
      ) : null}

      {tab === 'chunks' ? (
        <section className={cn(card, 'flex flex-col gap-3 p-3.5')}>
          <div className="flex items-center gap-2">
            <span className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                className={cn(inputClass, 'h-8 pl-8 text-xs')}
                placeholder="按关键词过滤分块"
                value={chunkQuery}
                onChange={(event) => setChunkQuery(event.target.value)}
              />
            </span>
            <button className={btn} onClick={() => void loadChunks(kbId, chunkQuery)}>
              <Search className="size-3.5" /> 查询
            </button>
          </div>
          {chunks.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">暂无分块。上传文档后这里会显示切分结果。</p>
          ) : (
            <div className="space-y-2">
              {chunks.map((chunk) => {
                const chunkId = str(chunk.chunk_id ?? chunk.id ?? Math.random().toString(36));
                return (
                  <article key={chunkId} className="rounded-lg border border-border/60 bg-muted/20 p-2.5">
                    <div className="flex items-center justify-between gap-2 pb-1.5">
                      <span className={cn(mono, 'truncate text-muted-foreground')}>
                        {str(chunk.file_name ?? chunk.document_name ?? chunk.source) || '分块'}
                      </span>
                      <button
                        className={cn(btn, 'h-6 px-2 text-destructive hover:bg-destructive/10 hover:text-destructive')}
                        onClick={() => void removeChunk(chunk)}
                        disabled={busy === `dc:${chunkId}`}
                      >
                        <Trash2 className="size-3" />
                      </button>
                    </div>
                    <p className="whitespace-pre-wrap break-words text-[12px] leading-relaxed text-foreground/90">
                      {str(chunk.content ?? chunk.text ?? chunk.chunk).slice(0, 700)}
                    </p>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      ) : null}

      {tab === 'retrieve' ? (
        <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
          <section className={cn(card, 'h-fit space-y-3 p-3.5')}>
            <h2 className="flex items-center gap-1.5 text-sm font-semibold">
              <Sparkles className="size-4 text-primary" /> 检索测试
            </h2>
            <textarea
              className="h-24 w-full rounded-md border border-input bg-transparent p-2.5 text-[12px] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30"
              placeholder="输入要检索的问题或关键词"
              value={retrieveQuery}
              onChange={(event) => setRetrieveQuery(event.target.value)}
            />
            <div className="space-y-1.5">
              <label className={labelClass}>返回条数 top_k：{retrieveTopK}</label>
              <input type="range" min={1} max={20} value={retrieveTopK} className="w-full" onChange={(event) => setRetrieveTopK(Number(event.target.value))} />
            </div>
            <div className="flex items-center gap-2 text-xs">
              <ToggleSwitch value={retrieveRerank} onChange={setRetrieveRerank} ariaLabel="启用重排序" />
              <span>启用重排序</span>
            </div>
            <button className={cn(btnPrimary, 'w-full')} onClick={() => void runRetrieve()} disabled={busy === 'retrieve'}>
              {busy === 'retrieve' ? '检索中…' : '开始检索'}
            </button>
          </section>

          <section className={cn(card, 'p-3.5')}>
            {hits.length === 0 ? (
              <p className="py-8 text-center text-xs text-muted-foreground">检索结果会显示在这里。</p>
            ) : (
              <div className="space-y-2">
                {hits.map((hit, index) => (
                  <article key={index} className="rounded-lg border border-border/60 bg-muted/20 p-2.5">
                    <div className="flex items-center justify-between gap-2 pb-1.5 text-[11px] text-muted-foreground">
                      <span className="truncate">{str(hit.file_name ?? hit.source ?? hit.document_name) || `结果 ${index + 1}`}</span>
                      <span className={mono}>
                        {hit.score !== undefined ? `score ${Number(hit.score).toFixed(4)}` : ''}
                        {hit.similarity !== undefined ? ` · ${Number(hit.similarity).toFixed(4)}` : ''}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap break-words text-[12px] leading-relaxed text-foreground/90">
                      {str(hit.content ?? hit.text ?? hit.chunk).slice(0, 800)}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      ) : null}

      {tab === 'settings' ? (
        <section className={cn(card, 'space-y-3 p-4')}>
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <Settings2 className="size-4 text-primary" /> 知识库设置
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className={labelClass}>名称</label>
              <input className={inputClass} value={kbNameOf(active)} onChange={(event) => setActive({ ...active, name: event.target.value })} />
            </div>
            <div className="space-y-1.5">
              <label className={labelClass}>图标</label>
              <input className={inputClass} value={str(active.emoji)} onChange={(event) => setActive({ ...active, emoji: event.target.value })} />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <label className={labelClass}>描述</label>
              <input className={inputClass} value={str(active.description)} onChange={(event) => setActive({ ...active, description: event.target.value })} />
            </div>
            <div className="space-y-1.5">
              <label className={labelClass}>嵌入模型（创建后不可更改）</label>
              <input className={cn(inputClass, mono)} value={str(active.embedding_provider_id) || '—'} disabled />
            </div>
            <div className="space-y-1.5">
              <label className={labelClass}>重排序模型</label>
              <select className={inputClass} value={str(active.rerank_provider_id)} onChange={(event) => setActive({ ...active, rerank_provider_id: event.target.value })}>
                <option value="">不使用</option>
                {rerankOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className={btnPrimary} onClick={() => void saveSettings()} disabled={busy === 'save'}>
              {busy === 'save' ? '保存中…' : '保存设置'}
            </button>
            <span className="text-[11px] text-muted-foreground">修改名称后，请同步更新引用该知识库的配置。</span>
          </div>
          <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/20 p-2.5 text-[11px] text-muted-foreground">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <span>删除知识库会连带删除全部文档、分块与向量索引，且不可恢复。</span>
          </div>
        </section>
      ) : null}
    </div>
  );
}
