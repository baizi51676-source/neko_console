/**
 * Appearance page \u2014 Neko Console's own theme studio.
 *
 * Everything here maps to a
 * real switch in the sidecar (theme.json) and takes effect immediately:
 *   light / dark / system, accent colour, brand text, wallpaper (+blur/dim),
 *   sidebar item visibility.
 */
import { ToggleSwitch } from '@/components/ui/toggle-switch';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check,
  Image as ImageIcon,
  LayoutDashboard,
  Moon,
  Monitor,
  Palette,
  RefreshCw,
  RotateCcw,
  Sun,
  Trash2,
  Upload,
  Eye,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from './api';
import { NAV } from './nav';
import { useApp } from './state';

const card = 'rounded-xl border border-border/60 bg-card';
const btn =
  'inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50';
const btnPrimary =
  'inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground shadow-xs transition-colors hover:bg-primary/90 disabled:opacity-50';
const inputClass =
  'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30';
const labelClass = 'text-xs font-medium';

const PRESETS = ['#0ea5e9', '#0d9fdb', '#0284c7', '#2563eb', '#6366f1', '#8b5cf6', '#a855f7', '#ec4899', '#ef4444', '#f59e0b', '#10b981', '#14b8a6'];

interface UploadItem {
  name: string;
  url: string;
  size?: number;
  mtime?: number;
}

function MiniPreview({
  isDark,
  primary,
  wallpaper,
  brand,
}: {
  isDark: boolean;
  primary: string;
  wallpaper?: { url?: string; blur?: number; dim?: number };
  brand: { title: string; subtitle: string };
}) {
  const accent = primary || '#0ea5e9';
  const bg = isDark ? '#0b1116' : '#f7f9fb';
  const panel = isDark ? '#121a21' : '#ffffff';
  const line = isDark ? 'rgba(255,255,255,.08)' : 'rgba(15,23,42,.08)';
  const text = isDark ? 'rgba(255,255,255,.82)' : 'rgba(15,23,42,.82)';
  const blur = wallpaper?.blur || 0;
  const dim = (wallpaper?.dim || 0) / 100;
  return (
    <div
      className="relative overflow-hidden rounded-xl border"
      style={{ borderColor: line, background: bg, height: 216 }}
    >
      {wallpaper?.url ? (
        <div
          className="absolute inset-0"
          style={{ backgroundImage: `url(${wallpaper.url})`, backgroundSize: 'cover', backgroundPosition: 'center', filter: `blur(${blur}px)` }}
        />
      ) : null}
      {dim > 0 ? <div className="absolute inset-0" style={{ background: `rgba(0,0,0,${dim})` }} /> : null}
      <div className="relative flex h-full">
        <div className="flex w-[78px] flex-col gap-1.5 border-r p-2" style={{ borderColor: line, background: panel, opacity: wallpaper?.url ? 0.94 : 1 }}>
          <div className="flex items-center gap-1.5">
            <div className="grid size-4 place-items-center rounded" style={{ background: accent }}>
              <LayoutDashboard className="size-2.5 text-white" />
            </div>
            <div className="truncate text-[7px] font-semibold" style={{ color: text }}>
              {brand.title || 'AstrBot'}
            </div>
          </div>
          <div className="mt-1 space-y-1">
            {['\u4eea\u8868\u76d8', '\u673a\u5668\u4eba', '\u6a21\u578b', '\u4eba\u683c', '\u63d2\u4ef6'].map((item, index) => (
              <div
                key={item}
                className="truncate rounded px-1 py-[3px] text-[6.5px]"
                style={index === 1 ? { background: `${accent}26`, color: accent } : { color: text, opacity: 0.75 }}
              >
                {item}
              </div>
            ))}
          </div>
        </div>
        <div className="flex-1 p-2.5">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-[8px] font-semibold" style={{ color: text }}>
              {brand.subtitle || 'Neko Console'}
            </div>
            <div className="grid size-4 place-items-center rounded-full" style={{ background: panel, border: `1px solid ${line}` }}>
              <Moon className="size-2" style={{ color: text }} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {[0, 1, 2].map((index) => (
              <div key={index} className="rounded-md p-1.5" style={{ background: panel, border: `1px solid ${line}` }}>
                <div className="h-1.5 w-6 rounded" style={{ background: index === 1 ? accent : line }} />
                <div className="mt-1 h-1 w-8 rounded" style={{ background: line }} />
              </div>
            ))}
          </div>
          <div className="mt-2 rounded-md p-2" style={{ background: panel, border: `1px solid ${line}` }}>
            <div className="h-1.5 w-14 rounded" style={{ background: accent }} />
            <div className="mt-1.5 space-y-1">
              {[0, 1, 2].map((index) => (
                <div key={index} className="h-1 rounded" style={{ background: line, width: `${72 - index * 14}%` }} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AppearancePage() {
  const app = useApp();
  const { notify } = app;
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [blurDraft, setBlurDraft] = useState(0);
  const [dimDraft, setDimDraft] = useState(0);
  const [busy, setBusy] = useState('');
  const [brandTitle, setBrandTitle] = useState('');
  const [brandSubtitle, setBrandSubtitle] = useState('');

  const theme = app.theme || {};
  const ui = theme.ui || {};
  const wallpaper = ui.wallpaper || {};
  const hidden = theme.nav?.hidden || [];
  const mode = ui.theme === 'dark' ? 'dark' : ui.theme === 'system' ? 'system' : 'light';
  const wallpaperDirty =
    Number(ui.wallpaper?.blur || 0) !== blurDraft || Number(ui.wallpaper?.dim || 0) !== dimDraft;
  const glassEnabled = ui.glass !== false;
  const isDark = mode === 'dark' || (mode === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  useEffect(() => {
    setBrandTitle(theme.brand?.title || '');
    setBrandSubtitle(theme.brand?.subtitle || '');
  }, [theme.brand?.title, theme.brand?.subtitle]);

  const loadUploads = useCallback(async () => {
    try {
      const res = await fetch('/__neko/api/uploads', { credentials: 'include' });
      if (!res.ok) throw new Error(`图库读取失败（HTTP ${res.status}）`);
      const payload = (await res.json()) as { items?: UploadItem[] };
      setUploads(Array.isArray(payload.items) ? payload.items : []);
    } catch {
      // a failed read must not look like an empty gallery
      setUploads([]);
      notify('图库读取失败，请确认已登录后重试', 'error');
    }
  }, [notify]);

  useEffect(() => {
    void loadUploads();
  }, [loadUploads]);

  // Slider values stay local until the user hits save.
  useEffect(() => {
    setBlurDraft(Number(app.theme.ui?.wallpaper?.blur || 0));
    setDimDraft(Number(app.theme.ui?.wallpaper?.dim || 0));
  }, [app.theme.ui?.wallpaper?.blur, app.theme.ui?.wallpaper?.dim, app.theme.ui?.wallpaper?.url]);

  const save = useCallback(
    async (patch: Parameters<typeof app.saveTheme>[0], message = '已保存') => {
      try {
        await app.saveTheme(patch);
        notify(message, 'ok');
      } catch (e) {
        notify(e instanceof Error ? e.message : '保存失败', 'error');
      }
    },
    [app, notify],
  );

  const saveWallpaper = async () => {
    setBusy('wall');
    await save({ ui: { ...ui, wallpaper: { ...wallpaper, blur: blurDraft, dim: dimDraft } } }, '背景设置已保存');
    setBusy('');
  };

  const setMode = (next: string) => void save({ ui: { ...ui, theme: next } }, next === 'system' ? '已切换为跟随系统' : next === 'dark' ? '已切换为深色' : '已切换为浅色');

  const toggleItem = (id: string) => {
    const next = hidden.includes(id) ? hidden.filter((item) => item !== id) : [...hidden, id];
    void save({ nav: { ...(theme.nav || {}), hidden: next } }, '侧边栏已更新');
  };

  const removeUpload = async (item: UploadItem) => {
    setBusy(`del:${item.name}`);
    try {
      const res = await fetch(`/__neko/api/uploads/${encodeURIComponent(item.name)}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error(`删除失败（HTTP ${res.status}）`);
      if (wallpaper.url?.includes(item.name)) void save({ ui: { ...ui, wallpaper: { ...wallpaper, url: '' } } }, '已移除背景');
      await loadUploads();
      notify('图片已删除', 'ok');
    } catch (e) {
      notify(e instanceof Error ? e.message : '删除失败', 'error');
    } finally {
      setBusy('');
    }
  };

  const uploadFile = async (file: File) => {
    if (file.size > 8 * 1024 * 1024) return notify('图片过大（上限 8MB）', 'error');
    setBusy('upload');
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('读取文件失败'));
        reader.readAsDataURL(file);
      });
      const out = await api.uploadImage(dataUrl);
      await save({ ui: { ...ui, wallpaper: { ...wallpaper, url: out.url } } }, '背景已更新');
      await loadUploads();
    } catch (e) {
      notify(e instanceof Error ? e.message : '上传失败', 'error');
    } finally {
      setBusy('');
    }
  };

  const stats = useMemo(
    () => ({
      total: NAV.reduce((acc, group) => acc + group.items.length, 0),
      hiddenCount: hidden.length,
    }),
    [hidden.length],
  );

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <Palette className="size-4 text-primary" /> 外观
          </h1>
          <p className="text-xs text-muted-foreground">主题模式、强调色、品牌文字、背景壁纸与侧边栏编排。修改即时生效并保存在控制台。</p>
        </div>
        <div className="flex items-center gap-2">
          <button className={btn} onClick={() => void loadUploads()}>
            <RefreshCw className="size-3.5" /> 刷新图库
          </button>
          <button
            className={btn}
            onClick={() =>
              void save(
                { ui: { ...ui, primary: '', wallpaper: { url: '', blur: 0, dim: 0 } }, nav: { hidden: [] } },
                '已恢复默认外观',
              )
            }
          >
            <RotateCcw className="size-3.5" /> 恢复默认
          </button>
        </div>
      </header>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-4">
          <section className={cn(card, 'p-4')}>
            <h2 className="text-sm font-semibold">主题模式</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">浅色 / 深色 / 跟随系统。</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {[
                { id: 'light', label: '浅色', icon: Sun },
                { id: 'dark', label: '深色', icon: Moon },
                { id: 'system', label: '跟随系统', icon: Monitor },
              ].map((item) => {
                const Icon = item.icon;
                const active = mode === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setMode(item.id)}
                    className={cn(
                      'flex items-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-medium transition-colors',
                      active ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border bg-card hover:bg-accent',
                    )}
                  >
                    <Icon className="size-4" />
                    {item.label}
                    {active ? <Check className="ml-auto size-3.5" /> : null}
                  </button>
                );
              })}
            </div>
          </section>

          <section className={cn(card, 'p-4')}>
            <h2 className="text-sm font-semibold">毛玻璃效果</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">侧边栏、顶栏与底部导航变为半透明模糊质感，配合背景壁纸观感更好。</p>
            <div className="mt-3 flex items-center gap-2 text-xs">
              <ToggleSwitch
                value={glassEnabled}
                onChange={(next) => void save({ ui: { ...ui, glass: next } }, next ? '已开启毛玻璃' : '已关闭毛玻璃')}
                ariaLabel="启用毛玻璃"
              />
              <span>启用毛玻璃</span>
            </div>
          </section>

          <section className={cn(card, 'p-4')}>
            <h2 className="text-sm font-semibold">强调色</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">影响按钮、选中态与图表主色。</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {PRESETS.map((color) => (
                <button
                  key={color}
                  onClick={() => void save({ ui: { ...ui, primary: color } }, '强调色已更新')}
                  className={cn(
                    'grid size-8 place-items-center rounded-lg border transition-transform hover:scale-105',
                    (ui.primary || '').toLowerCase() === color ? 'border-foreground/40 ring-2 ring-ring/40' : 'border-border',
                  )}
                  style={{ background: color }}
                >
                  {(ui.primary || '').toLowerCase() === color ? <Check className="size-4 text-white" /> : null}
                </button>
              ))}
              <label className={cn(btn, 'cursor-pointer gap-2')}>
                <input
                  type="color"
                  className="size-4 cursor-pointer border-0 bg-transparent p-0"
                  value={ui.primary || '#0ea5e9'}
                  onChange={(event) => void save({ ui: { ...ui, primary: event.target.value } }, '强调色已更新')}
                />
                自定义
              </label>
              {ui.primary ? (
                <button className={btn} onClick={() => void save({ ui: { ...ui, primary: '' } }, '已恢复默认强调色')}>
                  <RotateCcw className="size-3.5" /> 默认
                </button>
              ) : null}
            </div>
          </section>

          <section className={cn(card, 'p-4')}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold">品牌文字</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  侧边栏左上角与登录页显示的名称，留空即使用默认值。
                </p>
              </div>
              {theme.brand?.title || theme.brand?.subtitle ? (
                <button
                  className={btn}
                  onClick={() => {
                    setBrandTitle('');
                    setBrandSubtitle('');
                    void save({ brand: { title: '', subtitle: '' } }, '已恢复默认品牌文字');
                  }}
                >
                  <RotateCcw className="size-3.5" /> 默认
                </button>
              ) : null}
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className={labelClass}>品牌名称</label>
                <input className={inputClass} value={brandTitle} placeholder="AstrBot" onChange={(event) => setBrandTitle(event.target.value)} onBlur={() => void save({ brand: { ...(theme.brand || {}), title: brandTitle } }, '品牌文字已更新')} />
                <p className="text-[11px] text-muted-foreground">例如「AstrBot」或你自己的名字</p>
              </div>
              <div className="space-y-1.5">
                <label className={labelClass}>品牌副标题</label>
                <input className={inputClass} value={brandSubtitle} placeholder="Neko Console" onChange={(event) => setBrandSubtitle(event.target.value)} onBlur={() => void save({ brand: { ...(theme.brand || {}), subtitle: brandSubtitle } }, '品牌文字已更新')} />
                <p className="text-[11px] text-muted-foreground">显示在名称下方，可留空</p>
              </div>
            </div>
          </section>

          <section className={cn(card, 'p-4')}>
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold">背景壁纸</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">上传图片或从图库选择，可调节模糊与暗化。</p>
              </div>
              <label className={cn(btnPrimary, 'cursor-pointer')}>
                <Upload className="size-3.5" /> {busy === 'upload' ? '上传中…' : '上传图片'}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadFile(file);
                    event.target.value = '';
                  }}
                />
              </label>
            </div>

            {uploads.length === 0 ? (
              <p className="mt-3 text-[11px] text-muted-foreground">图库为空，上传一张图片作为背景。</p>
            ) : (
              <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {uploads.map((item) => (
                  <div key={item.name} className="group relative overflow-hidden rounded-lg border border-border">
                    <button className="block h-20 w-full bg-cover bg-center" style={{ backgroundImage: `url(${item.url})` }} onClick={() => void save({ ui: { ...ui, wallpaper: { ...wallpaper, url: item.url } } }, '背景已应用')} />
                    {wallpaper.url?.includes(item.name) ? (
                      <span className="absolute left-1 top-1 rounded bg-primary px-1 py-[1px] text-[9px] text-primary-foreground">当前</span>
                    ) : null}
                    <button
                      className="absolute right-1 top-1 hidden rounded bg-black/60 p-1 text-white group-hover:block"
                      onClick={() => void removeUpload(item)}
                      disabled={busy === `del:${item.name}`}
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between"><label className={labelClass}>模糊 {blurDraft}px</label>{wallpaperDirty ? <span className="text-[10px] neko-warn">未保存</span> : null}</div>
                <input
                  type="range"
                  min={0}
                  max={24}
                  value={blurDraft}
                  className="w-full"
                  onChange={(event) => setBlurDraft(Number(event.target.value))}
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between"><label className={labelClass}>暗化 {dimDraft}%</label>{wallpaperDirty ? <span className="text-[10px] neko-warn">未保存</span> : null}</div>
                <input
                  type="range"
                  min={0}
                  max={90}
                  value={dimDraft}
                  className="w-full"
                  onChange={(event) => setDimDraft(Number(event.target.value))}
                />
              </div>
            </div>

            {wallpaperDirty ? (
              <button className={cn(btnPrimary, 'mt-3')} onClick={() => void saveWallpaper()} disabled={busy === 'wall'}>
                <Check className="size-3.5" /> {busy === 'wall' ? '保存中…' : '保存背景设置'}
              </button>
            ) : null}

            {wallpaper.url ? (
              <button className={cn(btn, 'mt-3')} onClick={() => void save({ ui: { ...ui, wallpaper: { ...wallpaper, url: '' } } }, '背景已清除')}>
                <Trash2 className="size-3.5" /> 清除背景
              </button>
            ) : null}
          </section>

          <section className={cn(card, 'p-4')}>
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold">侧边栏条目</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  隐藏不常用的入口（共 {stats.total} 项，已隐藏 {stats.hiddenCount} 项），设置仅保存在浏览器所在控制台。
                </p>
              </div>
              <button className={btn} onClick={() => void save({ nav: { hidden: [] } }, '已全部显示')}>
                <Eye className="size-3.5" /> 全部显示
              </button>
            </div>
            <div className="mt-3 space-y-3">
              {NAV.map((group) => (
                <div key={group.group}>
                  <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{group.group}</div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {group.items.map((item) => {
                      const visible = !hidden.includes(item.id);
                      return (
                        <button
                          key={item.id}
                          onClick={() => toggleItem(item.id)}
                          className={cn(
                            'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors',
                            visible ? 'border-primary/30 bg-primary/10 text-primary' : 'border-border bg-muted text-muted-foreground',
                          )}
                        >
                          {visible ? <Check className="size-3" /> : <Trash2 className="size-3" />}
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="space-y-3 xl:sticky xl:top-20 xl:h-fit">
          <section className={cn(card, 'p-3.5')}>
            <div className="flex items-center gap-2 pb-2.5">
              <ImageIcon className="size-3.5 text-primary" />
              <span className="text-xs font-semibold">实时预览</span>
            </div>
            <MiniPreview
              isDark={isDark}
              primary={ui.primary || ''}
              wallpaper={{ ...wallpaper, blur: blurDraft, dim: dimDraft }}
              brand={{ title: brandTitle || theme.brand?.title || 'AstrBot', subtitle: brandSubtitle || theme.brand?.subtitle || 'Neko Console' }}
            />
            <div className="mt-3 space-y-1 text-[11px] text-muted-foreground">
              <div>模式：{mode === 'system' ? '跟随系统' : mode === 'dark' ? '深色' : '浅色'}</div>
              <div>强调色：{ui.primary || '默认'}</div>
              <div>背景：{wallpaper.url ? '已设置' : '无'}</div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
