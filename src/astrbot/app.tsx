import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertCircle,
  Eye,
  EyeOff,
  LayoutGrid,
  Loader2,
  LogIn,
  LogOut,
  Moon,
  Palette,
  RefreshCw,
  ShieldCheck,
  Sun,
} from 'lucide-react';
import { NAV, type PageId } from './nav';
import { cn } from '@/lib/utils';
import { useApp } from './state';
import { NekoMark, applyAccentVars, clearAccentVars, paintRootBackground } from './brand';
/* pages are code-split: each section only loads when opened */
const OverviewPage = lazy(() => import('./pages').then((m) => ({ default: m.OverviewPage })));
const LogsPage = lazy(() => import('./pages').then((m) => ({ default: m.LogsPage })));
const AboutPage = lazy(() => import('./pages').then((m) => ({ default: m.AboutPage })));
const ConversationsPage = lazy(() => import('./pages').then((m) => ({ default: m.ConversationsPage })));
const PluginsPage = lazy(() => import('./plugins').then((m) => ({ default: m.PluginsPage })));
const MarketPage = lazy(() => import('./plugins').then((m) => ({ default: m.MarketPage })));
const PlatformsPage = lazy(() => import('./platforms').then((m) => ({ default: m.PlatformsPage })));
const ProvidersPage = lazy(() => import('./providers').then((m) => ({ default: m.ProvidersPage })));
const PersonasPage = lazy(() => import('./personas').then((m) => ({ default: m.PersonasPage })));
const AppearancePage = lazy(() => import('./appearance').then((m) => ({ default: m.AppearancePage })));
const KnowledgePage = lazy(() => import('./knowledge').then((m) => ({ default: m.KnowledgePage })));
const ConfigEditorPage = lazy(() => import('./config-page').then((m) => ({ default: m.ConfigEditorPage })));
const McpPage = lazy(() => import('./mcp').then((m) => ({ default: m.McpPage })));
const SkillsPage = lazy(() => import('./skills-page').then((m) => ({ default: m.SkillsPage })));
const HandlersPage = lazy(() => import('./handlers').then((m) => ({ default: m.HandlersPage })));
const RulesPage = lazy(() => import('./rules').then((m) => ({ default: m.RulesPage })));
const SubAgentsPage = lazy(() => import('./subagents').then((m) => ({ default: m.SubAgentsPage })));
const CronPage = lazy(() => import('./cron').then((m) => ({ default: m.CronPage })));
const StatsPage = lazy(() => import('./stats').then((m) => ({ default: m.StatsPage })));
const TracePage = lazy(() => import('./trace').then((m) => ({ default: m.TracePage })));
const BackupsPage = lazy(() => import('./backups').then((m) => ({ default: m.BackupsPage })));
const UpdatesPage = lazy(() => import('./updates-page').then((m) => ({ default: m.UpdatesPage })));
const NekoSettingsPage = lazy(() => import('./settings').then((m) => ({ default: m.SettingsPage })));

function PageFallback() {
  return (
    <div className="grid place-items-center rounded-xl border border-border/60 bg-card p-12 text-xs text-muted-foreground">
      <span className="flex items-center gap-2">
        <RefreshCw className="size-4 animate-spin" /> 加载中…
      </span>
    </div>
  );
}

const TAB_IDS: PageId[] = ['dashboard', 'plugins', 'market', 'logs', 'appearance'];

function readableOn(hex: string): string {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((char) => char + char).join('') : clean;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.62 ? '#0b1220' : '#ffffff';
}

function StatusDot({ tone, pulse }: { tone: 'ok' | 'danger' | 'muted'; pulse?: boolean }) {
  const color = tone === 'ok' ? 'neko-dot-accent' : tone === 'danger' ? 'bg-red-500' : 'bg-muted-foreground/50';
  return (
    <span className="relative inline-flex size-2 items-center justify-center">
      {pulse ? <span className={cn('absolute inset-0 rounded-full opacity-40', color)} style={{ animation: 'ping-soft 1.6s cubic-bezier(0,0,0.2,1) infinite' }} /> : null}
      <span className={cn('relative size-2 rounded-full', color)} />
    </span>
  );
}

function Toasts() {
  const { toasts } = useApp();
  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-[90] flex -translate-x-1/2 flex-col items-center gap-2">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              'pointer-events-auto max-w-[92vw] rounded-lg border bg-popover px-4 py-2.5 text-sm shadow-lg',
              toast.tone === 'error' ? 'border-destructive/40 text-destructive' : 'neko-chip-accent',
            )}
          >
            {toast.message}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function LoginPanel() {
  const app = useApp();
  const { login, notify } = app;
  const [username, setUsername] = useState('astrbot');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [reveal, setReveal] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await login(username.trim(), password, code || undefined);
    } catch (err) {
      const message = err instanceof Error ? err.message : '登录失败';
      setError(message);
      notify(message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const inputClass =
    'h-10 w-full rounded-lg border border-input bg-background/60 px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/20';

  const brandTitle = app.theme.brand?.title || 'AstrBot';
  const brandSubtitle = app.theme.brand?.subtitle || 'Neko Console';
  const highlights = [
    { icon: LayoutGrid, text: '插件 / 人格 / 知识库 / 模型 / 备份，功能对齐官方控制台' },
    { icon: Palette, text: '强调色、深色模式、背景壁纸与毛玻璃，改完即时生效' },
    { icon: ShieldCheck, text: '控制台口令与 AstrBot 账号各自独立' },
  ];

  return (
    <div className="relative grid min-h-dvh place-items-center overflow-hidden p-5">
      <div
        className="pointer-events-none absolute -left-28 -top-36 h-[420px] w-[420px] rounded-full"
        style={{ background: 'radial-gradient(closest-side, var(--primary), transparent)', opacity: 0.18 }}
      />
      <div
        className="pointer-events-none absolute -bottom-44 -right-28 h-[380px] w-[380px] rounded-full"
        style={{ background: 'radial-gradient(closest-side, var(--primary), transparent)', opacity: 0.12 }}
      />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-[860px] overflow-hidden rounded-3xl border border-border bg-card shadow-2xl md:grid md:grid-cols-[1.02fr_1fr]"
      >
        <div className="hidden flex-col justify-between gap-8 border-r border-border p-8 md:flex">
          <div>
            <div className="flex items-center gap-2.5">
              <NekoMark size={40} />
              <div className="min-w-0">
                <div className="truncate text-[15px] font-semibold leading-tight">{brandTitle}</div>
                <div className="truncate text-[11.5px] text-muted-foreground">{brandSubtitle}</div>
              </div>
            </div>
            <h1 className="mt-7 text-[22px] font-semibold leading-snug tracking-tight">管理你的 AstrBot</h1>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              原版控制台的换肤界面：功能逐项对齐官方 WebUI，版面按使用场景重新分区，外观可自由调整。
            </p>
          </div>
          <ul className="flex flex-col gap-2.5 text-xs text-muted-foreground">
            {highlights.map((item) => (
              <li key={item.text} className="flex items-start gap-2">
                <item.icon className="mt-0.5 size-3.5 shrink-0 text-primary" />
                <span className="leading-relaxed">{item.text}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="p-6 md:p-8">
          <div className="mb-5 flex items-center gap-2.5 md:hidden">
            <NekoMark size={32} />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold leading-tight">{brandTitle}</div>
              <div className="truncate text-[11px] text-muted-foreground">{brandSubtitle}</div>
            </div>
          </div>

          <h2 className="text-[17px] font-semibold tracking-tight">登录控制台</h2>
          <p className="mb-5 mt-1 text-xs text-muted-foreground">使用 AstrBot 控制台账号登录</p>

          <label className="mb-3 flex flex-col gap-1.5">
            <span className="text-[12.5px] font-medium text-foreground/85">用户名</span>
            <input className={inputClass} value={username} onChange={(e) => setUsername(e.target.value)} />
          </label>

          <label className="mb-3 flex flex-col gap-1.5">
            <span className="text-[12.5px] font-medium text-foreground/85">密码</span>
            <span className="flex items-center gap-2">
              <input
                className={inputClass}
                type={reveal ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void submit();
                }}
              />
              <button
                type="button"
                onClick={() => setReveal((v) => !v)}
                className="grid size-10 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-primary"
                aria-label={reveal ? '隐藏密码' : '显示密码'}
              >
                {reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </span>
          </label>

          {showCode ? (
            <label className="mb-3 flex flex-col gap-1.5">
              <span className="text-[12.5px] font-medium text-foreground/85">两步验证码</span>
              <input className={inputClass} value={code} onChange={(e) => setCode(e.target.value)} placeholder="6 位数字" />
            </label>
          ) : (
            <button
              type="button"
              onClick={() => setShowCode(true)}
              className="text-[12px] text-muted-foreground underline decoration-dotted underline-offset-4 transition-colors hover:text-primary"
            >
              使用两步验证码
            </button>
          )}

          {error ? (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
              <span className="leading-relaxed">{error}</span>
            </div>
          ) : null}

          <button
            type="button"
            disabled={busy}
            onClick={() => void submit()}
            className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <LogIn className="size-4" />}
            {busy ? '正在登录…' : '登录'}
          </button>

          <p className="mt-4 text-center text-[11px] leading-relaxed text-muted-foreground">
            若通过公网访问，浏览器/客户端可能还需要输入控制台口令，它与这里的账号不同。
          </p>
        </div>
      </motion.div>
    </div>
  );
}

export function Shell() {
  const app = useApp();
  const [page, setPage] = useState<PageId>('dashboard');

  const themeMode = app.theme.ui?.theme === 'dark' ? 'dark' : app.theme.ui?.theme === 'system' ? 'system' : 'light';
  const [systemDark, setSystemDark] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches,
  );
  const isDark = themeMode === 'system' ? systemDark : themeMode === 'dark';
  const accent = app.theme.ui?.primary || '';
  const wallpaper = app.theme.ui?.wallpaper || {};

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    // Older WebViews only implement the deprecated addListener API; calling a
    // missing addEventListener here used to take the whole shell down.
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', handler);
      return () => media.removeEventListener('change', handler);
    }
    media.addListener(handler);
    return () => media.removeListener(handler);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', isDark);
    root.dataset.theme = isDark ? 'dark' : 'light';
    root.style.colorScheme = isDark ? 'dark' : 'light';
    // keep the root painted so no host default (black) shows through the
    // transparent body when a wallpaper is enabled
    paintRootBackground(root, isDark ? '#0b0f14' : '#ffffff');
  }, [isDark]);

  useEffect(() => {
    const root = document.documentElement;
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(accent)) {
      root.style.setProperty('--primary', accent);
      root.style.setProperty('--ring', accent);
      root.style.setProperty('--primary-foreground', readableOn(accent));
      applyAccentVars(root, accent);
    } else {
      root.style.removeProperty('--primary');
      root.style.removeProperty('--ring');
      root.style.removeProperty('--primary-foreground');
      clearAccentVars(root);
    }
  }, [accent]);

  useEffect(() => {
    const root = document.documentElement;
    if (wallpaper.url) root.dataset.wallpaper = 'on';
    else delete root.dataset.wallpaper;
  }, [wallpaper.url]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.glass = app.theme.ui?.glass === false ? 'off' : 'on';
  }, [app.theme.ui?.glass]);

  /**
   * Some in-app browsers (有的内置浏览器的“电脑模式”) swap in a desktop UA **and** force a
   * desktop-width layout viewport (~1280px) while the physical screen is only
   * ~400 CSS px wide; viewport meta is ignored in that mode, so the whole page
   * gets scaled down to a third. Detect it and offer a zoomed fallback.
   */
  const [viewScale, setViewScale] = useState(true);
  const [forcedViewport, setForcedViewport] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent || '';
    const looksDesktop = /Windows NT|Macintosh|X11|Linux x86_64|CrOS/.test(ua);
    const screenWidth = Math.round(window.screen?.width || window.innerWidth);
    const forced = looksDesktop && screenWidth > 0 && screenWidth <= 700 && window.innerWidth > screenWidth * 1.4;
    setForcedViewport(forced);
    // Default OFF: zooming the body re-lays out fixed layers and can cause
    // flicker / clipped content in in-app browsers, so only offer it as a toggle.
    setViewScale(false);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.viewscale = forcedViewport && viewScale ? 'on' : 'off';
  }, [forcedViewport, viewScale]);

  const toggleTheme = (event: React.MouseEvent<HTMLButtonElement>) => {
    const nextDark = !isDark;
    const apply = () => {
      document.documentElement.classList.toggle('dark', nextDark);
      document.documentElement.dataset.theme = nextDark ? 'dark' : 'light';
    };
    const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
    if (doc.startViewTransition) {
      document.documentElement.style.setProperty('--vt-x', `${event.clientX}px`);
      document.documentElement.style.setProperty('--vt-y', `${event.clientY}px`);
      doc.startViewTransition(apply);
    } else {
      apply();
    }
    void app
      .saveTheme({ ...app.theme, ui: { ...(app.theme.ui || {}), theme: nextDark ? 'dark' : 'light' } })
      .catch((error: unknown) => app.notify(error instanceof Error ? error.message : '主题保存失败', 'error'));
  };

  if (!app.ready) {
    return (
      <div className="grid min-h-dvh place-items-center text-sm text-muted-foreground">
        <span className="flex items-center gap-2">
          <RefreshCw className="size-4 animate-spin" /> 加载中…
        </span>
      </div>
    );
  }

  if (!app.authed) {
    return (
      <>
        <LoginPanel />
        <Toasts />
      </>
    );
  }

  const hidden = app.theme.nav?.hidden || [];

  const enabledCount = app.plugins.filter((p) => p.activated).length;

  const render = (): ReactNode => {
    switch (page) {
      case 'dashboard':
        return <OverviewPage onNavigate={(id) => setPage(id as PageId)} />;
      case 'plugins':
        return <PluginsPage />;
      case 'market':
        return <MarketPage />;
      case 'logs':
        return <LogsPage />;
      case 'config':
        return <ConfigEditorPage />;
      case 'conversations':
        return <ConversationsPage />;
      case 'appearance':
        return <AppearancePage />;
      case 'about':
        return <AboutPage />;
      case 'platforms':
        return <PlatformsPage />;
      case 'providers':
      case 'sources':
        return <ProvidersPage />;
      case 'personas':
        return <PersonasPage />;
      case 'knowledge':
        return <KnowledgePage />;
      case 'skills':
        return <SkillsPage />;
      case 'cron':
        return <CronPage />;
      case 'backups':
        return <BackupsPage />;
      case 'subagents':
        return <SubAgentsPage />;
      case 'rules':
        return <RulesPage />;
      case 'mcp':
        return <McpPage />;
      case 'handlers':
        return <HandlersPage />;
      case 'stats':
        return <StatsPage onNavigate={(id) => setPage(id as PageId)} />;
      case 'trace':
        return <TracePage onNavigate={(id) => setPage(id as PageId)} />;
      case 'updates':
        return <UpdatesPage onNavigate={(id) => setPage(id as PageId)} />;
      case 'settings':
        return <NekoSettingsPage onNavigate={(id) => setPage(id as PageId)} />;
      default:
        return <OverviewPage onNavigate={(id) => setPage(id as PageId)} />;
    }
  };

  const label = NAV.reduce<string>((acc, group) => {
    const hit = group.items.find((item) => item.id === page);
    return hit ? hit.label : acc;
  }, page);

  return (
    <div className="flex min-h-dvh w-full">
      {wallpaper.url ? (
        <div aria-hidden className="wallpaper-layer pointer-events-none fixed inset-0 z-0 overflow-hidden">
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{
              backgroundImage: `url(${wallpaper.url})`,
              // A blurred fixed layer bleeds transparent pixels at its edges
              // (looks like a broken/holey background), so cap the radius and
              // zoom slightly to keep the edges outside the viewport.
              filter: wallpaper.blur ? `blur(${Math.min(Number(wallpaper.blur) || 0, 18)}px)` : undefined,
              transform: wallpaper.blur ? 'scale(1.08)' : undefined,
              transformOrigin: 'center',
              willChange: 'filter',
              backfaceVisibility: 'hidden',
            }}
          />
          {wallpaper.dim ? (
            <div className="absolute inset-0" style={{ background: `rgba(0,0,0,${Number(wallpaper.dim) / 100})` }} />
          ) : null}
        </div>
      ) : null}
      {/* sidebar */}
      <aside className="sticky top-0 z-10 hidden h-dvh w-[232px] shrink-0 flex-col overflow-y-auto border-r border-sidebar-border bg-sidebar md:flex">
        <div className="flex h-13 shrink-0 items-center gap-2.5 border-b border-sidebar-border px-3.5" style={{ height: 52 }}>
          <span
            className="relative grid size-[30px] shrink-0 place-items-center"
            title={app.loading ? '正在连接…' : '已连接'}
          >
            <NekoMark size={30} />
            {/* connection state lives with the brand mark (top-left) instead of
                taking up room in the topbar */}
            <span className="absolute -bottom-0.5 -right-0.5 grid size-[13px] place-items-center rounded-full border border-sidebar-border bg-sidebar">
              <StatusDot tone={app.loading ? 'muted' : 'ok'} pulse={!app.loading} />
            </span>
          </span>
          <div className="min-w-0">
            <div className="truncate text-[13.5px] font-semibold leading-tight">{app.theme.brand?.title || 'AstrBot'}</div>
            <div className="truncate text-[11.5px] text-muted-foreground">{app.theme.brand?.subtitle || 'Neko Console'}</div>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 px-2.5 pb-5 pt-2">
          {NAV.map((group) => {
            const items = group.items.filter((item) => !hidden.includes(item.id));
            if (!items.length) return null;
            return (
              <div key={group.group}>
                <div className="px-2 pb-1.5 pt-3.5 text-[10.5px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
                  {group.group}
                </div>
                {items.map((item) => {
                  const Icon = item.icon;
                  const active = page === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setPage(item.id)}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-md border border-transparent px-2.5 py-2 text-left text-[13.5px] transition-colors',
                        active
                          ? 'border-border bg-card font-semibold text-foreground shadow-xs'
                          : 'text-muted-foreground hover:bg-accent/60 hover:text-accent-foreground',
                      )}
                    >
                      <Icon className={cn('size-4 shrink-0', active && 'text-primary')} />
                      <span className="truncate">{item.label}</span>
                      {item.id === 'plugins' && app.plugins.length ? (
                        <span className="ml-auto rounded-full neko-soft-bg px-1.5 py-px text-[11px] text-[var(--primary)]">
                          {enabledCount}/{app.plugins.length}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* topbar */}
        <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-border bg-background/88 px-4 backdrop-blur-md" style={{ height: 52 }}>
          <div className="text-[14.5px] font-semibold tracking-tight">{label}</div>
          <span className="inline-flex items-center gap-1.5 rounded-full border neko-chip-accent px-2 py-0.5 text-[11.5px] text-[var(--primary)] md:hidden">
            <StatusDot tone={app.loading ? 'muted' : 'ok'} pulse={!app.loading} />
            {app.loading ? '连接中' : '已连接'}
          </span>
          <div className="flex-1" />
          {forcedViewport ? (
            <button
              type="button"
              onClick={() => setViewScale((value) => !value)}
              className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2 text-[11px] text-muted-foreground transition-colors hover:bg-accent"
              title="检测到强制桌面视口时页面会被缩得很小，点此切换放大视图"
            >
              {viewScale ? '放大中' : '原始'}
            </button>
          ) : null}
          <button
            type="button"
            onClick={toggleTheme}
            className="grid size-9 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            aria-label="切换主题"
          >
            {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>
          <button
            type="button"
            onClick={() => void app.refresh()}
            className="grid size-9 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            aria-label="刷新"
          >
            <RefreshCw className={cn('size-4', app.loading && 'animate-spin')} />
          </button>
          <button
            type="button"
            onClick={() => void app.logout()}
            className="grid size-9 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            aria-label="退出登录"
          >
            <LogOut className="size-4" />
          </button>
        </header>

        <main className="relative z-10 mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-3.5 p-4 pb-24 md:pb-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={page}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col gap-3.5"
            >
              {page === 'dashboard' ? (
                <Suspense fallback={<PageFallback />}>{render()}</Suspense>
              ) : (
                <div className="page-shell">
                  <Suspense fallback={<PageFallback />}>{render()}</Suspense>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* mobile tabbar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex gap-0.5 border-t border-border bg-card/96 px-1.5 pb-[calc(6px+env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-md md:hidden">
        {TAB_IDS.map((id) => {
          const item = NAV.flatMap((g) => g.items).find((i) => i.id === id);
          if (!item || hidden.includes(item.id)) return null;
          const Icon = item.icon;
          const active = page === item.id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setPage(id)}
              className={cn(
                'flex flex-1 flex-col items-center justify-center gap-0.5 rounded-md px-2 py-1.5 text-[10.5px] transition-colors',
                active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground',
              )}
            >
              <Icon className="size-4" />
              {item.label}
            </button>
          );
        })}
      </nav>

      <Toasts />
    </div>
  );
}


export { StatusDot };
export type { PageId };