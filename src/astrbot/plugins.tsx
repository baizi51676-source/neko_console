import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ToggleSwitch } from '@/components/ui/toggle-switch';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  BookOpen,
  Check,
  Download,
  ExternalLink,
  FileText,
  Info,
  Loader2,
  Package,
  Plug,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmptyState } from './empty-state';
import { SchemaField } from './schema-field';
import { renderMarkdown } from './markdown';
import { useApp } from './state';
import { api, type MarketEntry, type PluginInfo, type PluginSchemaNode } from './api';
import { plugins as pluginsApi } from './endpoints';

const btn =
  'inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium text-foreground shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50';
const btnPrimary =
  'inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground shadow-xs transition-colors hover:bg-primary/90 disabled:opacity-50';
const btnGhost =
  'inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50';
const btnDanger =
  'inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-destructive/40 px-2.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50';
const inputClass =
  'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30';

function Toggle({ value, onChange, disabled }: { value: boolean; onChange: (next: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      disabled={disabled}
      onClick={() => onChange(!value)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50',
        value ? 'bg-primary' : 'bg-input',
      )}
    >
      <span
        className={cn(
          'absolute size-4 rounded-full bg-white shadow-xs transition-transform duration-150',
          value ? 'translate-x-[18px]' : 'translate-x-0.5',
        )}
        style={{ transitionTimingFunction: 'cubic-bezier(0.16,1,0.3,1)' }}
      />
    </button>
  );
}

function Badge({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'ok' | 'primary' | 'warn' }) {
  const map: Record<string, string> = {
    muted: 'border-border bg-muted text-muted-foreground',
    ok: 'neko-chip-accent',
    primary: 'border-primary/30 bg-primary/10 text-primary',
    warn: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  };
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-px text-[11.5px] whitespace-nowrap', map[tone])}>
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* plugin detail sheet                                                 */
/* ------------------------------------------------------------------ */

/** Avatar for a plugin / market entry, with a fallback when the logo 404s. */
function LogoBox({ src, fallbackClass = 'size-4' }: { src?: string; fallbackClass?: string }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) return <Package className={fallbackClass} />;
  return (
    <img src={src} alt="" loading="lazy" className="size-full object-cover" onError={() => setBroken(true)} />
  );
}

type Tab = 'config' | 'readme' | 'changelog' | 'info';

function PluginSheet({ plugin, onClose }: { plugin: PluginInfo; onClose: () => void }) {
  const { notify } = useApp();
  const [tab, setTab] = useState<Tab>('config');
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [schemaNode, setSchemaNode] = useState<PluginSchemaNode | null>(null);
  const [logLevel, setLogLevel] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [readme, setReadme] = useState('');
  const [readmeError, setReadmeError] = useState('');
  const [changelog, setChangelog] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void (async () => {
      try {
        const [cfg, sch] = await Promise.all([pluginsApi.config(plugin.name), pluginsApi.schema(plugin.name)]);
        if (!alive) return;
        const schemaSource = (sch?.metadata || cfg?.metadata || null) as Record<string, PluginSchemaNode> | null;
        let node: PluginSchemaNode | null = null;
        if (schemaSource && typeof schemaSource === 'object') {
          node = 'items' in schemaSource ? (schemaSource as PluginSchemaNode) : (Object.values(schemaSource)[0] as PluginSchemaNode);
        }
        setSchemaNode(node || null);
        const defaults: Record<string, unknown> = {};
        if (node?.items) {
          for (const [key, field] of Object.entries(node.items)) {
            if (field && field.default !== undefined) defaults[key] = field.default;
          }
        }
        const values = (cfg?.config && typeof cfg.config === 'object' ? cfg.config : {}) as Record<string, unknown>;
        setConfig({ ...defaults, ...values });
        setLogLevel(cfg?.log_level || '');
      } catch (error) {
        notify(error instanceof Error ? error.message : '读取插件配置失败', 'error');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [plugin.name, notify]);

  const loadReadme = useCallback(async () => {
    setReadmeError('');
    try {
      const payload = await pluginsApi.readme(plugin.name);
      const content = typeof payload === 'string' ? payload : payload?.content || '';
      if (content) setReadme(content);
      else setReadmeError('该插件没有 README 文件');
    } catch (error) {
      setReadmeError(error instanceof Error ? error.message : 'README 读取失败');
    }
  }, [plugin.name]);

  useEffect(() => {
    if (tab === 'readme' && !readme && !readmeError) void loadReadme();
    if (tab === 'changelog' && !changelog) {
      void (async () => {
        try {
          const payload = await pluginsApi.changelog(plugin.name);
          const content = typeof payload === 'string' ? payload : payload?.content || '';
          setChangelog(content || '（没有更新日志）');
        } catch {
          setChangelog('（没有更新日志）');
        }
      })();
    }
  }, [tab, readme, readmeError, changelog, plugin.name, loadReadme]);

  const fields = useMemo(() => Object.entries(schemaNode?.items || {}), [schemaNode]);

  const save = async () => {
    setSaving(true);
    try {
      await pluginsApi.saveConfig(plugin.name, config);
      notify('已保存并重载插件');
      await pluginsApi.reload(plugin.name).catch(() => undefined);
    } catch (error) {
      notify(error instanceof Error ? error.message : '保存失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={onClose}
        className="fixed inset-0 z-[60] bg-background/60 backdrop-blur-sm"
      />
      <motion.aside
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className="fixed inset-y-0 right-0 z-[61] flex w-[min(680px,94vw)] flex-col border-l border-border bg-popover shadow-xl"
      >
        <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3.5">
          <div className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-md bg-muted text-muted-foreground">
            <LogoBox src={plugin.logo} />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{plugin.display_name || plugin.name}</div>
            <div className="truncate text-[11.5px] text-muted-foreground">
              {plugin.name} · {plugin.version} · {plugin.author}
            </div>
          </div>
          <div className="flex-1" />
          <button type="button" onClick={onClose} className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="关闭">
            <X className="size-4" />
          </button>
        </div>

        <div className="flex shrink-0 gap-0.5 overflow-x-auto border-b border-border px-4">
          {([
            ['config', '配置', Settings2],
            ['readme', 'README', FileText],
            ['changelog', '更新日志', BookOpen],
            ['info', '信息', Info],
          ] as [Tab, string, typeof Settings2][]).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                'flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-[13px] transition-colors whitespace-nowrap',
                tab === id ? 'border-primary font-semibold text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-auto p-4">
          {tab === 'config' ? (
            loading ? (
              <div className="flex flex-col gap-2">
                <div className="h-9 animate-pulse rounded-md bg-muted" />
                <div className="h-9 animate-pulse rounded-md bg-muted" />
                <div className="h-9 animate-pulse rounded-md bg-muted" />
              </div>
            ) : !fields.length ? (
              <EmptyState icon={Settings2} title="该插件没有可配置项" description="它没有定义 _conf_schema.json。" />
            ) : (
              <>
                {fields.map(([key, field]) => (
                  <SchemaField
                    key={key}
                    nameKey={key}
                    schema={field}
                    value={config[key]}
                    onChange={(next) => setConfig((current) => ({ ...current, [key]: next }))}
                  />
                ))}
                <div className="mt-1 flex items-center gap-2">
                  <button type="button" className={btnPrimary} disabled={saving} onClick={() => void save()}>
                    {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                    保存并重载
                  </button>
                  <button type="button" className={btn} onClick={() => setTab('config')} disabled>
                    已读取
                  </button>
                </div>

                <div className="mt-5 border-t border-border pt-4">
                  <div className="mb-2 text-[12.5px] font-medium text-foreground/85">插件日志级别</div>
                  <div className="flex flex-wrap gap-1.5">
                    {['DEBUG', 'INFO', 'WARNING', 'ERROR'].map((level) => (
                      <button
                        key={level}
                        type="button"
                        className={logLevel === level ? btnPrimary : btn}
                        onClick={() => {
                          setLogLevel(level);
                          void pluginsApi
                            .setLogLevel(plugin.name, level)
                            .then(() => notify(`日志级别已设为 ${level}`))
                            .catch((error: unknown) => notify(error instanceof Error ? error.message : '设置失败', 'error'));
                        }}
                      >
                        {level}
                      </button>
                    ))}
                    <button
                      type="button"
                      className={btn}
                      onClick={() => {
                        setLogLevel('');
                        void pluginsApi.setLogLevel(plugin.name, null).catch(() => undefined);
                      }}
                    >
                      默认
                    </button>
                  </div>
                </div>
              </>
            )
          ) : null}

          {tab === 'readme' ? (
            readmeError ? (
              <EmptyState icon={FileText} title={readmeError} />
            ) : readme ? (
              <div className="md-body text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: renderMarkdown(readme) }} />
            ) : (
              <div className="h-1 animate-pulse rounded bg-muted" />
            )
          ) : null}

          {tab === 'changelog' ? (
            <div className="md-body text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: renderMarkdown(changelog || '（没有更新日志）') }} />
          ) : null}

          {tab === 'info' ? (
            <dl className="grid grid-cols-[132px_1fr] gap-x-3 gap-y-1.5 text-[12.5px]">
              {[
                ['插件 ID', plugin.name],
                ['显示名称', plugin.display_name || '—'],
                ['版本', plugin.version || '—'],
                ['可用更新', plugin.online_version || '—'],
                ['作者', plugin.author || '—'],
                ['市场名称', plugin.marketplace_name || '—'],
                ['安装来源', plugin.install_source || '—'],
                ['支持平台', (plugin.support_platforms || []).join(', ') || '—'],
                ['目录', plugin.root_dir_name || '—'],
                ['状态', plugin.activated ? '已启用' : '已禁用'],
              ].map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="break-words">{value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      </motion.aside>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* install dialog                                                      */
/* ------------------------------------------------------------------ */

type InstallMode = 'github' | 'url' | 'upload';

function InstallDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { notify } = useApp();
  const [mode, setMode] = useState<InstallMode>('github');
  const [repository, setRepository] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const install = async (run: () => Promise<unknown>) => {
    setBusy(true);
    setMessage('');
    try {
      await run();
      setMessage('安装成功');
      notify('插件安装成功');
      onDone();
    } catch (error) {
      const text = error instanceof Error ? error.message : '安装失败';
      setMessage(text);
      notify(text, 'error');
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      setMessage('zip 不能超过 8MB（上传上限）');
      return;
    }
    setBusy(true);
    setMessage(`正在上传 ${file.name} …`);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('文件读取失败'));
        reader.readAsDataURL(file);
      });
      await api.uploadPluginZip(file.name, dataUrl);
      setMessage('上传安装成功');
      notify('插件安装成功');
      onDone();
    } catch (error) {
      const text = error instanceof Error ? error.message : '上传失败';
      setMessage(text);
      notify(text, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-background/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: -8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        className="fixed left-1/2 top-1/2 z-[61] flex w-[calc(100%-2rem)] max-w-[560px] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-2xl border border-border bg-popover p-5 shadow-xl"
      >
        <div className="flex items-center gap-2 text-[14.5px] font-semibold">
          <Plus className="size-4" /> 安装插件
          <div className="flex-1" />
          <button type="button" onClick={onClose} className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>

        <div className="inline-flex w-fit gap-0.5 rounded-md border border-border bg-muted p-0.5">
          {([
            ['github', 'GitHub'],
            ['url', '直链 zip'],
            ['upload', '本地上传'],
          ] as [InstallMode, string][]).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setMode(id)}
              className={cn(
                'rounded px-2.5 py-1 text-[12.5px] transition-colors',
                mode === id ? 'bg-card font-semibold shadow-xs' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === 'github' ? (
          <div className="flex flex-col gap-3">
            <input className={inputClass} value={repository} onChange={(e) => setRepository(e.target.value)} placeholder="owner/repo" />
            <button
              type="button"
              className={btnPrimary}
              disabled={busy || !repository.trim()}
              onClick={() => void install(() => pluginsApi.installGithub(repository.trim()))}
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
              从 GitHub 安装
            </button>
          </div>
        ) : null}

        {mode === 'url' ? (
          <div className="flex flex-col gap-3">
            <input className={inputClass} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…/plugin.zip" />
            <button
              type="button"
              className={btnPrimary}
              disabled={busy || !url.trim()}
              onClick={() => void install(() => pluginsApi.installUrl(url.trim()))}
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
              从直链安装
            </button>
          </div>
        ) : null}

        {mode === 'upload' ? (
          <div className="flex flex-col gap-3">
            <label className={cn(btn, 'h-auto cursor-pointer justify-start py-3')}>
              <Upload className="size-3.5" />
              选择 zip 文件（≤8MB）
              <input type="file" accept=".zip" className="hidden" disabled={busy} onChange={(e) => void onFile(e.target.files?.[0])} />
            </label>
            <p className="text-[11.5px] text-muted-foreground">上传后由控制台转发给 AstrBot 完成安装。</p>
          </div>
        ) : null}

        {message ? <p className="text-[12.5px] text-muted-foreground">{message}</p> : null}
      </motion.div>
    </>
  );
}

function UninstallDialog({ plugin, onClose, onDone }: { plugin: PluginInfo; onClose: () => void; onDone: () => void }) {
  const { notify } = useApp();
  const [deleteConfig, setDeleteConfig] = useState(false);
  const [deleteData, setDeleteData] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-background/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: -8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        className="fixed left-1/2 top-1/2 z-[61] flex w-[calc(100%-2rem)] max-w-[480px] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-2xl border border-border bg-popover p-5 shadow-xl"
      >
        <div className="flex items-center gap-2 text-[14.5px] font-semibold text-destructive">
          <AlertTriangle className="size-4" /> 卸载插件
        </div>
        <p className="text-[12.5px] leading-relaxed text-muted-foreground">
          即将卸载 <strong className="text-foreground">{plugin.display_name || plugin.name}</strong>。可选择是否一并删除它的配置与数据。
        </p>
        <div className="flex items-center gap-2 text-[12.5px]">
          <ToggleSwitch value={deleteConfig} onChange={setDeleteConfig} ariaLabel="删除该插件的配置" />
          <span>删除该插件的配置</span>
        </div>
        <div className="flex items-center gap-2 text-[12.5px]">
          <ToggleSwitch value={deleteData} onChange={setDeleteData} ariaLabel="删除该插件的数据目录" />
          <span>删除该插件的数据目录</span>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className={btn} onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className={btnDanger}
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void pluginsApi
                .uninstall(plugin.name, deleteConfig, deleteData)
                .then(() => {
                  notify(`已卸载 ${plugin.display_name || plugin.name}`);
                  onDone();
                })
                .catch((error: unknown) => notify(error instanceof Error ? error.message : '卸载失败', 'error'))
                .finally(() => setBusy(false));
            }}
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
            确认卸载
          </button>
        </div>
      </motion.div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* plugins page                                                        */
/* ------------------------------------------------------------------ */

function PluginPageViewer({
  pluginId,
  pageName,
  title,
  onClose,
}: {
  pluginId: string;
  pageName: string;
  title: string;
  onClose: () => void;
}) {
  const { notify } = useApp();
  const [src, setSrc] = useState('');
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  // 1) resolve the real page entry (content_path + asset token)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const payload = (await pluginsApi.pageEntry(pluginId, pageName)) as Record<string, unknown>;
        const data = ((payload && typeof payload === 'object' && 'data' in payload
          ? (payload as { data?: unknown }).data
          : payload) || {}) as Record<string, unknown>;
        const contentPath = String(data.content_path || data.contentPath || '');
        if (!alive) return;
        setSrc(contentPath || pluginsApi.pageUrl(pluginId, pageName));
      } catch (error) {
        if (!alive) return;
        setSrc(pluginsApi.pageUrl(pluginId, pageName));
        notify(error instanceof Error ? error.message : '插件页面加载失败', 'error');
      }
    })();
    return () => {
      alive = false;
    };
  }, [pluginId, pageName, notify]);

  const origin = typeof window === 'undefined' ? '' : window.location.origin;

  const extensionUrl = useCallback(
    (endpoint: string, params?: Record<string, unknown>) => {
      const path = String(endpoint || '').replace(/^[/]+/, '');
      const url = `/api/v1/plugins/extensions/${encodeURIComponent(pluginId)}/${path}`;
      if (!params) return url;
      const search = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null) continue;
        search.set(key, String(value));
      }
      const qs = search.toString();
      return qs ? `${url}?${qs}` : url;
    },
    [pluginId],
  );

  const postToFrame = useCallback(
    (message: Record<string, unknown>) => {
      const target = frameRef.current?.contentWindow;
      if (!target || !origin) return;
      target.postMessage({ channel: 'astrbot-plugin-page', ...message }, origin);
    },
    [origin],
  );

  const postContext = useCallback(() => {
    postToFrame({
      kind: 'context',
      context: {
        locale: 'zh-CN',
        isDark: document.documentElement.classList.contains('dark'),
        theme: document.documentElement.dataset.theme || 'light',
        plugin: { name: pluginId, page: pageName },
      },
    });
  }, [pluginId, pageName, postToFrame]);

  // 2) bridge host: answer AstrBotPluginPage requests coming from the iframe
  useEffect(() => {
    if (!origin) return;
    const sseSources = new Map<string, EventSource>();

    const handleRequest = async (msg: Record<string, unknown>) => {
      const action = String(msg.action || '');
      const requestId = String(msg.requestId || '');
      const respond = (data: unknown) => postToFrame({ kind: 'response', requestId, ok: true, data });

      if (action === 'api:get') {
        const res = await fetch(extensionUrl(String(msg.endpoint), msg.params as Record<string, unknown> | undefined), {
          credentials: 'include',
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        respond(data);
        return;
      }

      if (action === 'api:post') {
        const res = await fetch(extensionUrl(String(msg.endpoint)), {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(msg.body ?? {}),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        respond(data);
        return;
      }

      if (action === 'files:upload') {
        const form = new FormData();
        const buffer = msg.fileBuffer as ArrayBuffer | undefined;
        if (buffer) {
          form.append(
            'file',
            new Blob([buffer], { type: String(msg.fileType || 'application/octet-stream') }),
            String(msg.fileName || 'upload.bin'),
          );
        }
        const res = await fetch(extensionUrl(String(msg.endpoint)), {
          method: 'POST',
          credentials: 'include',
          body: form,
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        respond(data);
        return;
      }

      if (action === 'files:download') {
        const res = await fetch(extensionUrl(String(msg.endpoint), msg.params as Record<string, unknown> | undefined), {
          credentials: 'include',
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = String(msg.filename || 'download');
        link.click();
        URL.revokeObjectURL(link.href);
        respond({ ok: true });
        return;
      }

      if (action === 'sse:subscribe') {
        const subscriptionId = String(msg.subscriptionId || '');
        if (subscriptionId) {
          const source = new EventSource(extensionUrl(String(msg.endpoint), msg.params as Record<string, unknown> | undefined));
          sseSources.set(subscriptionId, source);
          source.onopen = () => postToFrame({ kind: 'sse_state', subscriptionId, state: 'open' });
          source.onerror = () => postToFrame({ kind: 'sse_state', subscriptionId, state: 'error' });
          source.onmessage = (event) =>
            postToFrame({
              kind: 'sse_message',
              subscriptionId,
              data: event.data,
              eventType: 'message',
              lastEventId: event.lastEventId,
            });
        }
        respond({ subscriptionId: msg.subscriptionId });
        return;
      }

      if (action === 'sse:unsubscribe') {
        const subscriptionId = String(msg.subscriptionId || '');
        sseSources.get(subscriptionId)?.close();
        sseSources.delete(subscriptionId);
        respond({ ok: true });
        return;
      }

      throw new Error(`不支持的操作：${action}`);
    };

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== origin) return;
      if (event.source !== frameRef.current?.contentWindow) return;
      const msg = event.data as Record<string, unknown> | null;
      if (!msg || msg.channel !== 'astrbot-plugin-page') return;
      if (msg.kind === 'ready') {
        postContext();
        return;
      }
      if (msg.kind !== 'request') return;
      void handleRequest(msg).catch((error: unknown) => {
        postToFrame({
          kind: 'response',
          requestId: String(msg.requestId || ''),
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    };

    window.addEventListener('message', onMessage);
    const timers = [0, 300, 900, 1800, 3000].map((delay) => window.setTimeout(postContext, delay));
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      window.removeEventListener('message', onMessage);
      sseSources.forEach((source) => source.close());
    };
  }, [origin, extensionUrl, postContext, postToFrame]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[80] flex flex-col bg-background"
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <FileText className="size-4 text-muted-foreground" />
        <span className="text-[13px] font-semibold">{title}</span>
        <span className="text-[11px] text-muted-foreground">{pluginId}</span>
        <div className="flex-1" />
        <button type="button" className={btn} onClick={onClose}>
          关闭
        </button>
      </div>
      {src ? (
        <iframe
          ref={frameRef}
          title={title}
          src={src}
          onLoad={postContext}
          className="w-full flex-1 border-0 bg-background"
        />
      ) : (
        <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">加载插件页面…</div>
      )}
    </motion.div>
  );
}

function PluginPagesButton({ plugin }: { plugin: PluginInfo }) {
  const { notify } = useApp();
  const [pages, setPages] = useState<{ name: string; title: string }[] | null>(null);
  const [open, setOpen] = useState<{ name: string; title: string } | null>(null);

  const discover = () => {
    const declared = Array.isArray(plugin.pages) ? plugin.pages : [];
    const list = declared
      .map((item) => {
        if (typeof item === 'string') return { name: item, title: item };
        const rec = (item || {}) as Record<string, unknown>;
        const name = String(rec.name || rec.page_name || rec.id || '');
        return { name, title: String(rec.title || rec.display_name || name) };
      })
      .filter((item) => item.name);
    if (!list.length) {
      notify('该插件没有自带界面', 'error');
      return;
    }
    if (list.length === 1) {
      setOpen(list[0]);
      return;
    }
    setPages(list);
  };

  return (
    <>
      <button type="button" className={btn} onClick={discover}>
        <ExternalLink className="size-3.5" /> 界面
      </button>
      <AnimatePresence>
        {pages ? (
          <motion.div
            key="page-picker"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] grid place-items-center bg-black/50 p-4"
            onClick={() => setPages(null)}
          >
            <div
              className="w-full max-w-sm rounded-xl border border-border bg-card p-4"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="text-[13px] font-semibold">选择要打开的页面</div>
              <div className="mt-2 flex flex-col gap-1.5">
                {pages.map((page) => (
                  <button
                    key={page.name}
                    type="button"
                    className={cn(btn, 'justify-start')}
                    onClick={() => {
                      setOpen({ name: page.name, title: page.title || page.name });
                      setPages(null);
                    }}
                  >
                    {page.title || page.name}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        ) : null}
        {open ? (
          <PluginPageViewer
            key={open.name}
            pluginId={plugin.name}
            pageName={open.name}
            title={open.title}
            onClose={() => setOpen(null)}
          />
        ) : null}
      </AnimatePresence>
    </>
  );
}

export function PluginsPage() {
  const { plugins, reloadPlugins, notify, loading } = useApp();
  const [query, setQuery] = useState('');
  const [sheet, setSheet] = useState<PluginInfo | null>(null);
  const [installOpen, setInstallOpen] = useState(false);
  const [uninstall, setUninstall] = useState<PluginInfo | null>(null);
  const [rowBusy, setRowBusy] = useState<string>('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return plugins;
    return plugins.filter((p) => [p.name, p.display_name, p.desc, p.author].join(' ').toLowerCase().includes(q));
  }, [plugins, query]);

  const activeCount = plugins.filter((p) => p.activated).length;

  const act = async (id: string, run: () => Promise<unknown>, okMessage: string) => {
    setRowBusy(id);
    try {
      await run();
      notify(okMessage);
    } catch (error) {
      notify(error instanceof Error ? error.message : '操作失败', 'error');
    } finally {
      setRowBusy('');
    }
  };

  return (
    <>
      <div className="rounded-xl border border-border/60 bg-card">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
          <Plug className="size-4 text-muted-foreground" />
          <span className="text-[13.5px] font-semibold">已安装插件</span>
          <Badge tone={activeCount ? 'ok' : 'muted'}>
            {activeCount} / {plugins.length} 启用
          </Badge>
          <div className="flex-1" />
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              className={cn(inputClass, 'h-8 w-[190px] pl-8 text-[13px]')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索插件…"
            />
          </div>
          <button type="button" className={btn} disabled={loading} onClick={() => void reloadPlugins()}>
            <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
          </button>
          <button type="button" className={btnPrimary} onClick={() => setInstallOpen(true)}>
            <Plus className="size-3.5" /> 安装插件
          </button>
        </div>

        {!plugins.length ? (
          <div className="p-4">
            <EmptyState
              icon={Plug}
              title="还没有安装插件"
              description="从插件市场安装，或用 GitHub / zip 包导入。"
              action={
                <button type="button" className={btnPrimary} onClick={() => setInstallOpen(true)}>
                  <Plus className="size-3.5" /> 安装插件
                </button>
              }
            />
          </div>
        ) : (
          <div className="flex flex-col">
            {filtered.map((plugin) => {
              const busy = rowBusy === plugin.name;
              return (
                <div
                  key={plugin.name}
                  className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 transition-colors last:border-b-0 hover:bg-accent/35"
                >
                  <div className="grid size-[34px] shrink-0 place-items-center overflow-hidden rounded-md bg-muted text-muted-foreground">
                    <LogoBox src={plugin.logo} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 text-[13.5px] font-semibold">
                      {plugin.display_name || plugin.name}
                      <Badge>{plugin.version || '—'}</Badge>
                      {plugin.online_version ? <Badge tone="primary">可更新 {plugin.online_version}</Badge> : null}
                      {plugin.reserved ? <Badge>内置</Badge> : null}
                    </div>
                    <div className="mt-0.5 line-clamp-2 text-[11.5px] leading-relaxed text-muted-foreground">
                      {plugin.desc || plugin.name} · {plugin.author || '未知作者'}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Toggle
                      value={Boolean(plugin.activated)}
                      disabled={busy}
                      onChange={(next) =>
                        void act(
                          plugin.name,
                          () => pluginsApi.setEnabled(plugin.name, next),
                          `${next ? '已启用' : '已禁用'} ${plugin.display_name || plugin.name}`,
                        ).then(() => reloadPlugins())
                      }
                    />
                    <button type="button" className={btn} onClick={() => setSheet(plugin)}>
                      <Settings2 className="size-3.5" /> 配置
                    </button>
                    {Array.isArray(plugin.pages) && plugin.pages.length ? <PluginPagesButton plugin={plugin} /> : null}
                    <button type="button" className={btnGhost} onClick={() => { setSheet(plugin); }}>
                      <FileText className="size-3.5" /> README
                    </button>
                    <button
                      type="button"
                      className={btnGhost}
                      disabled={busy}
                      onClick={() =>
                        void act(plugin.name, () => pluginsApi.reload(plugin.name), `已重载 ${plugin.display_name || plugin.name}`)
                      }
                    >
                      <RefreshCw className="size-3.5" />
                    </button>
                    {plugin.online_version ? (
                      <button
                        type="button"
                        className={btnGhost}
                        disabled={busy}
                        onClick={() =>
                          void act(plugin.name, () => pluginsApi.update(plugin.name), `已请求更新 ${plugin.display_name || plugin.name}`).then(
                            () => setTimeout(() => void reloadPlugins(), 1500),
                          )
                        }
                      >
                        <Download className="size-3.5" />
                      </button>
                    ) : null}
                    <button type="button" className={btnGhost} onClick={() => setUninstall(plugin)}>
                      <Trash2 className="size-3.5" />
                    </button>
                    {plugin.repo ? (
                      <a className={btnGhost} href={plugin.repo} target="_blank" rel="noreferrer" title={plugin.repo}>
                        <ExternalLink className="size-3.5" />
                      </a>
                    ) : null}
                    {busy ? <Loader2 className="size-3.5 animate-spin text-muted-foreground" /> : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <AnimatePresence>
        {sheet ? (
          <PluginSheet
            key={sheet.name}
            plugin={sheet}
            onClose={() => {
              setSheet(null);
              void reloadPlugins();
            }}
          />
        ) : null}
        {installOpen ? (
          <InstallDialog
            key="install"
            onClose={() => setInstallOpen(false)}
            onDone={() => void reloadPlugins()}
          />
        ) : null}
        {uninstall ? (
          <UninstallDialog
            key="uninstall"
            plugin={uninstall}
            onClose={() => setUninstall(null)}
            onDone={() => {
              setUninstall(null);
              void reloadPlugins();
            }}
          />
        ) : null}
      </AnimatePresence>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* market page                                                         */
/* ------------------------------------------------------------------ */

const PAGE_SIZE = 24;

export function MarketPage() {
  const { notify } = useApp();
  const [entries, setEntries] = useState<MarketEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [installing, setInstalling] = useState('');
  const [category, setCategory] = useState('__all__');
  const loadedRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const payload = (await pluginsApi.market()) as Record<string, unknown>;
      const list: MarketEntry[] = Object.entries(payload || {})
        .filter(([key]) => key !== '$meta')
        .map(([key, value]) => {
          const item = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
          return {
            key,
            display_name: String(item.display_name || item.name || key),
            desc: String(item.desc || item.description || ''),
            author: String(item.author || key.split('/')[0]),
            version: item.version ? String(item.version) : '',
            repo: item.repo ? String(item.repo) : `https://github.com/${key}`,
            category: item.category ? String(item.category) : '未分类',
            logo: item.logo ? String(item.logo) : '',
            support_platforms: Array.isArray(item.support_platforms) ? (item.support_platforms as string[]) : [],
          };
        });
      setEntries(list);
      setPage(1);
    } catch (error) {
      notify(error instanceof Error ? error.message : '市场数据读取失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    void load();
  }, [load]);

  const categories = useMemo(() => {
    const set = new Set(entries.map((entry) => entry.category || '未分类'));
    return ['__all__', ...[...set].sort()];
  }, [entries]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((entry) => {
      if (category !== '__all__' && (entry.category || '未分类') !== category) return false;
      if (!q) return true;
      return [entry.key, entry.display_name, entry.desc, entry.author, entry.category]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [entries, query, category]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="rounded-xl border border-border/60 bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <Download className="size-4 text-muted-foreground" />
        <span className="text-[13.5px] font-semibold">插件市场</span>
        <Badge>{filtered.length} 个</Badge>
        <div className="flex-1" />
        <select
          className={cn(inputClass, 'h-8 w-auto min-w-[132px] py-0 text-[12px]')}
          value={category}
          onChange={(event) => {
            setCategory(event.target.value);
            setPage(1);
          }}
        >
          {categories.map((item) => (
            <option key={item} value={item}>
              {item === '__all__' ? '全部分类' : item}
            </option>
          ))}
        </select>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            className={cn(inputClass, 'h-8 w-[200px] pl-8 text-[13px]')}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="搜索市场…"
          />
        </div>
        <button type="button" className={btn} disabled={loading} onClick={() => void load()}>
          <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
        </button>
      </div>

      {loading && !entries.length ? (
        <div className="p-4">
          <div className="relative h-1 overflow-hidden rounded-full bg-muted">
            <span className="absolute inset-y-0 w-1/4 animate-[progress-marquee_1.1s_ease-in-out_infinite] rounded-full bg-primary" />
          </div>
          <p className="mt-3 text-[12px] text-muted-foreground">正在拉取市场索引…</p>
        </div>
      ) : !entries.length ? (
        <div className="p-4">
          <EmptyState
            icon={Download}
            title="尚未加载市场数据"
            description="点击刷新从 AstrBot 官方插件市场拉取索引。"
            action={
              <button type="button" className={btnPrimary} onClick={() => void load()}>
                <RefreshCw className="size-3.5" /> 加载市场
              </button>
            }
          />
        </div>
      ) : (
        <>
          <div className="flex flex-col">
            {visible.map((entry) => (
              <div key={entry.key} className="flex items-start gap-3 border-b border-border px-4 py-3 last:border-b-0">
                <div className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-md bg-muted text-muted-foreground">
                  <LogoBox src={entry.logo} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5 text-[13.5px] font-semibold">
                    {entry.display_name}
                    {entry.version ? <Badge>{entry.version}</Badge> : null}
                    {entry.category ? <Badge>{entry.category}</Badge> : null}
                  </div>
                  <div className="mt-0.5 line-clamp-2 text-[11.5px] leading-relaxed text-muted-foreground">{entry.desc}</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground/80">{entry.key}</div>
                </div>
                <button
                  type="button"
                  className={btn}
                  disabled={installing === entry.key}
                  onClick={() => {
                    setInstalling(entry.key);
                    void pluginsApi
                      // market keys are the "owner/repo" slug; entry.repo is a full URL
                      .installGithub(entry.key)
                      .then(() => notify(`已安装 ${entry.display_name}`))
                      .catch((error: unknown) => notify(error instanceof Error ? error.message : '安装失败', 'error'))
                      .finally(() => setInstalling(''));
                  }}
                >
                  {installing === entry.key ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                  安装
                </button>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-center gap-3 border-t border-border px-4 py-3">
            <button type="button" className={btn} disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              上一页
            </button>
            <span className="text-[12px] text-muted-foreground">
              {page} / {pages}
            </span>
            <button type="button" className={btn} disabled={page >= pages} onClick={() => setPage((p) => Math.min(pages, p + 1))}>
              下一页
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export { Badge, btn, btnGhost, btnPrimary, inputClass, Toggle };
