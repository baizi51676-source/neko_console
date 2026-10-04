/**
 * Backups page — create / upload / download / verify / rename / restore / delete.
 *
 * Verified contracts (AstrBot v4.28.2):
 *   GET    /api/v1/backups?page=&page_size=
 *          -> {items: [{filename, size, created_at, type, astrbot_version, exported_at}],
 *              total, page, page_size}
 *   POST   /api/v1/backups                       (create a new backup)
 *   GET    /api/v1/backups/{filename}            (download, binary)
 *   PATCH  /api/v1/backups/{filename} { new_name }
 *   DELETE /api/v1/backups/{filename}
 *   POST   /api/v1/backups/{filename}/check      (pre-flight check before restore)
 *   POST   /api/v1/backups/{filename}/import { confirmed: true }
 *   POST   /api/v1/backups/upload/init     { filename, total_size } -> upload session
 *   POST   /api/v1/backups/upload/chunk    multipart: upload_id, chunk_index, chunk
 *   POST   /api/v1/backups/upload/complete { upload_id }
 *   POST   /api/v1/backups/upload/abort    { upload_id }
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle, Archive, CheckCircle2, Download, Pencil, RefreshCw, RotateCcw, Trash2, Upload,
} from 'lucide-react';
import { backups as backupsApi, type Json } from './endpoints';
import { getToken, raw, send } from './api';
import { useApp } from './state';
import { cn } from '@/lib/utils';

const card = 'rounded-xl border border-border/60 bg-card';
const chip =
  'inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-2.5 py-1 text-xs font-medium transition hover:bg-accent/60 disabled:opacity-50';
const PAGE_SIZE = 20;

function fmtBytes(value: unknown): string {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

function fmtTime(value: unknown): string {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return '—';
  const ms = n > 1e12 ? n : n * 1000;
  return new Date(ms).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

interface BackupItem {
  filename?: string;
  size?: number;
  created_at?: number;
  type?: string;
  astrbot_version?: string;
  exported_at?: string | number;
}

async function downloadBackup(filename: string): Promise<void> {
  const token = getToken();
  const res = await fetch(`/api/v1/backups/${encodeURIComponent(filename)}`, {
    credentials: 'include',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`下载失败：HTTP ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function BackupsPage() {
  const { notify } = useApp();
  const [items, setItems] = useState<BackupItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [progress, setProgress] = useState('');
  const fileRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(
    async (target = page) => {
      setLoading(true);
      try {
        const data = (await backupsApi.list(target, PAGE_SIZE)) as Record<string, unknown>;
        const list = Array.isArray(data?.items) ? (data.items as BackupItem[]) : [];
        setItems(list);
        setTotal(typeof data?.total === 'number' ? (data.total as number) : list.length);
      } catch (error) {
        notify(error instanceof Error ? error.message : '备份列表读取失败', 'error');
      } finally {
        setLoading(false);
      }
    },
    [notify, page],
  );

  useEffect(() => {
    void load(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  /**
   * POST /backups only creates a background task (it returns `task_id`), the zip
   * itself is written asynchronously, so poll GET /backups/tasks/{id} until the
   * task settles and only then refresh the list.
   */
  const createBackup = async () => {
    setBusy('create');
    try {
      const created = (await backupsApi.create({})) as Record<string, unknown>;
      const taskId = String(created?.task_id ?? '');
      if (!taskId) {
        notify('备份任务已提交');
        setPage(1);
        await load(1);
        return;
      }

      notify('备份已在后台开始打包…');
      const startedAt = Date.now();
      for (;;) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        if (Date.now() - startedAt > 5 * 60 * 1000) {
          notify('备份仍在后台进行，稍后点「刷新」查看结果', 'error');
          break;
        }
        let info: Record<string, unknown> = {};
        try {
          info = (await backupsApi.task(taskId)) as Record<string, unknown>;
        } catch {
          break;
        }
        const status = String(info?.status ?? '');
        const progress = (info?.progress ?? info) as Record<string, unknown>;
        const message = progress?.message ?? info?.message;
        if (typeof message === 'string' && message) setProgress(String(message));
        if (status === 'completed') {
          notify('备份已完成');
          break;
        }
        if (status === 'failed') {
          notify(String(info?.error ?? '备份失败'), 'error');
          break;
        }
      }
      setProgress('');
      setPage(1);
      await load(1);
    } catch (error) {
      notify(error instanceof Error ? error.message : '创建备份失败', 'error');
    } finally {
      setBusy('');
    }
  };

  const rename = async (filename: string) => {
    const next = window.prompt('新的备份文件名（保留 .zip 后缀）', filename);
    if (!next || next === filename) return;
    setBusy(`rename:${filename}`);
    try {
      await backupsApi.rename(filename, next);
      notify('已重命名');
      await load(page);
    } catch (error) {
      notify(error instanceof Error ? error.message : '重命名失败', 'error');
    } finally {
      setBusy('');
    }
  };

  const check = async (filename: string) => {
    setBusy(`check:${filename}`);
    try {
      const data = (await backupsApi.check(filename)) as Record<string, unknown>;
      const valid = data?.valid !== false && data?.ok !== false;
      const parts: string[] = [valid ? '校验通过' : '校验未通过'];
      if (data?.can_import === false) parts.push('不可直接导入');
      const versionStatus = data?.version_status;
      if (typeof versionStatus === 'string') {
        parts.push(
          versionStatus === 'match'
            ? `版本一致（${String(data?.backup_version ?? '')}）`
            : `版本不同：备份 ${String(data?.backup_version ?? '?')} / 当前 ${String(data?.current_version ?? '?')}`,
        );
      }
      if (typeof data?.message === 'string' && data.message) parts.push(data.message);
      notify(parts.join(' · '), valid ? 'ok' : 'error');
    } catch (error) {
      notify(error instanceof Error ? error.message : '备份检查失败', 'error');
    } finally {
      setBusy('');
    }
  };

  const restore = async (filename: string) => {
    if (!window.confirm(`导入「${filename}」将覆盖当前 AstrBot 数据，确定继续？`)) return;
    if (!window.confirm('请再次确认：导入后需要重启 AstrBot 才能完全生效。是否继续？')) return;
    setBusy(`import:${filename}`);
    try {
      await backupsApi.import(filename);
      notify('备份已导入，请重启 AstrBot 生效');
      await load(page);
    } catch (error) {
      notify(error instanceof Error ? error.message : '导入失败', 'error');
    } finally {
      setBusy('');
    }
  };

  const remove = async (filename: string) => {
    if (!window.confirm(`删除备份「${filename}」？该操作不可撤销。`)) return;
    setBusy(`delete:${filename}`);
    try {
      await backupsApi.remove(filename);
      notify('备份已删除');
      await load(page);
    } catch (error) {
      notify(error instanceof Error ? error.message : '删除失败', 'error');
    } finally {
      setBusy('');
    }
  };

  const download = async (filename: string) => {
    setBusy(`download:${filename}`);
    try {
      await downloadBackup(filename);
    } catch (error) {
      notify(error instanceof Error ? error.message : '下载失败', 'error');
    } finally {
      setBusy('');
    }
  };

  /** Chunked upload: init -> chunk* -> complete (5 MB chunks). */
  const upload = async (file: File) => {
    if (!file.name.endsWith('.zip')) {
      notify('请选择 .zip 格式的备份文件', 'error');
      return;
    }
    const chunkSize = 5 * 1024 * 1024;
    let uploadId = '';
    try {
      setProgress('正在初始化上传…');
      const init = (await backupsApi.uploadInit({
        filename: file.name,
        total_size: file.size,
      })) as Record<string, unknown>;
      uploadId = String(init?.upload_id ?? init?.id ?? '');
      if (!uploadId) throw new Error('服务端未返回 upload_id');

      const totalChunks = Math.ceil(file.size / chunkSize);
      for (let index = 0; index < totalChunks; index += 1) {
        setProgress(`上传中 ${index + 1}/${totalChunks}`);
        const blob = file.slice(index * chunkSize, Math.min((index + 1) * chunkSize, file.size));
        const form = new FormData();
        form.append('upload_id', uploadId);
        form.append('chunk_index', String(index));
        form.append('chunk', blob, `${file.name}.part${index}`);
        const { res, body } = await raw('/api/v1/backups/upload/chunk', { method: 'POST', body: form });
        if (!res.ok) throw new Error(`分片 ${index + 1} 上传失败：HTTP ${res.status}`);
        if (body && typeof body === 'object' && (body as Json).status === 'error') {
          throw new Error(String((body as Json).message ?? '分片上传失败'));
        }
      }

      setProgress('正在合并…');
      await backupsApi.uploadComplete({ upload_id: uploadId });
      notify(`备份 ${file.name} 上传完成`);
      await load(page);
    } catch (error) {
      if (uploadId) {
        try {
          await send('/api/v1/backups/upload/abort', 'POST', { upload_id: uploadId });
        } catch {
          /* best effort cleanup */
        }
      }
      notify(error instanceof Error ? error.message : '上传失败', 'error');
    } finally {
      setProgress('');
    }
  };

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={chip} disabled={busy === 'create'} onClick={() => void createBackup()}>
          <Archive className="h-3.5 w-3.5" />
          立即创建备份
        </button>
        <button type="button" className={chip} disabled={Boolean(progress)} onClick={() => fileRef.current?.click()}>
          <Upload className="h-3.5 w-3.5" />
          上传备份文件
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".zip"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void upload(file);
          }}
        />
        <button type="button" className={chip} disabled={loading} onClick={() => void load(page)}>
          <RefreshCw className="h-3.5 w-3.5" />
          刷新
        </button>
        {progress ? <span className="text-xs text-muted-foreground">{progress}</span> : null}
        <span className="ml-auto text-xs text-muted-foreground">共 {total} 个备份</span>
      </div>

      <div className={cn(card, 'overflow-hidden')}>
        {loading && !items.length ? (
          <div className="py-12 text-center text-sm text-muted-foreground">正在读取备份列表…</div>
        ) : items.length ? (
          <div className="divide-y divide-border/60">
            {items.map((item) => {
              const filename = String(item.filename ?? '');
              const rowBusy = busy.endsWith(filename);
              return (
                <div key={filename} className="flex flex-wrap items-center gap-2 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{filename}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                      <span>{fmtBytes(item.size)}</span>
                      <span>创建于 {fmtTime(item.created_at)}</span>
                      <span
                        className={cn(
                          'rounded px-1.5 py-0.5',
                          item.type === 'imported' ? 'neko-chip-accent' : 'bg-muted',
                        )}
                      >
                        {item.type === 'imported' ? '导入的备份' : '服务器导出'}
                      </span>
                      <span>AstrBot {String(item.astrbot_version ?? '—')}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button type="button" className={chip} disabled={rowBusy} onClick={() => void download(filename)}>
                      <Download className="h-3.5 w-3.5" />
                      下载
                    </button>
                    <button type="button" className={chip} disabled={rowBusy} onClick={() => void check(filename)}>
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      检查
                    </button>
                    <button type="button" className={chip} disabled={rowBusy} onClick={() => void restore(filename)}>
                      <RotateCcw className="h-3.5 w-3.5" />
                      导入
                    </button>
                    <button type="button" className={chip} disabled={rowBusy} onClick={() => void rename(filename)}>
                      <Pencil className="h-3.5 w-3.5" />
                      重命名
                    </button>
                    <button
                      type="button"
                      className={cn(chip, 'text-destructive hover:bg-destructive/10')}
                      disabled={rowBusy}
                      onClick={() => void remove(filename)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      删除
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 py-14 text-center">
            <Archive className="h-6 w-6 text-muted-foreground/60" />
            <div className="text-sm font-medium">还没有备份</div>
            <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
              备份会把配置、人格、插件数据与数据库打包成 zip，方便迁移或回滚。点击上方
              「立即创建备份」生成第一个备份。
            </p>
          </div>
        )}
      </div>

      {pages > 1 ? (
        <div className="flex items-center justify-center gap-2">
          <button type="button" className={chip} disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            上一页
          </button>
          <span className="text-xs text-muted-foreground">
            第 {page} / {pages} 页
          </span>
          <button type="button" className={chip} disabled={page >= pages || loading} onClick={() => setPage((p) => Math.min(pages, p + 1))}>
            下一页
          </button>
        </div>
      ) : null}

      <div className={cn(card, 'flex items-start gap-2 p-3.5')}>
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 neko-warn" />
        <p className="text-xs leading-relaxed text-muted-foreground">
          导入备份会覆盖当前数据，建议先「立即创建备份」留一份现状；导入完成后需要重启 AstrBot
          才能让数据完全生效。上传的备份文件会保存在服务器的备份目录中，可随时下载或删除。
        </p>
      </div>
    </div>
  );
}
