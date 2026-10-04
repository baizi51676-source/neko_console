import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { api, getToken, getUsername, setUsername, toArray, unwrap, type PluginInfo } from './api';
import {
  backups as backupsApi,
  bots as botsApi,
  chat as chatApi,
  cron as cronApi,
  knowledge as kbApi,
  personas as personasApi,
  plugins as pluginsApi,
  providers as providersApi,
  skills as skillsApi,
  stats as statsApi,
} from './endpoints';
import { applyAccentVars, clearAccentVars } from './brand';

export type ToastTone = 'ok' | 'error';

export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

export interface ThemeUi {
  theme?: string;
  primary?: string;
  wallpaper?: { url?: string; blur?: number; dim?: number };
  glass?: boolean;
}

export interface Theme {
  brand?: { title?: string; subtitle?: string };
  ui?: ThemeUi;
  nav?: { hidden?: string[] };
}

export type ResourceKey =
  | 'providers'
  | 'platforms'
  | 'personas'
  | 'skills'
  | 'knowledge'
  | 'sessions'
  | 'cron'
  | 'backups'
  | 'sources';

interface AppValue {
  ready: boolean;
  authed: boolean;
  loading: boolean;
  version: string;
  account: Record<string, unknown> | null;
  plugins: PluginInfo[];
  resources: Partial<Record<ResourceKey, unknown[]>>;
  storageValue: Record<string, unknown> | null;
  providerTokens: unknown;
  theme: Theme;
  toasts: Toast[];
  notify: (message: string, tone?: ToastTone) => void;
  login: (username: string, password: string, code?: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  reloadPlugins: () => Promise<void>;
  reloadResource: (key: ResourceKey) => Promise<void>;
  saveTheme: (patch: Theme) => Promise<void>;
}

const AppContext = createContext<AppValue | null>(null);
/**
 * Uptime ticks once a second. Keeping it in its own context means only the few
 * widgets that display it re-render, instead of every consumer of useApp().
 */
const UptimeContext = createContext('—');

export function useUptime(): string {
  return useContext(UptimeContext);
}

export function useApp(): AppValue {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used inside <AppProvider>');
  return value;
}

const RESOURCE_PATHS: Record<ResourceKey, () => Promise<unknown>> = {
  providers: () => providersApi.list(),
  platforms: () => botsApi.list(),
  personas: () => personasApi.list(),
  skills: () => skillsApi.list(),
  knowledge: () => kbApi.list(),
  sessions: () => chatApi.sessionsList(),
  cron: () => cronApi.list(),
  backups: () => backupsApi.list(),
  sources: () => providersApi.sources.list(),
};

function humanDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days > 0) return `${days} 天 ${hours} 小时`;
  if (hours > 0) return `${hours} 小时 ${minutes} 分`;
  return `${minutes} 分 ${total % 60} 秒`;
}

function prefersDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

/** Resolve light/dark, honouring 'system' exactly like the shell does. */
function resolveMode(theme: Theme): 'dark' | 'light' {
  const mode = theme.ui?.theme;
  if (mode === 'system') return prefersDark() ? 'dark' : 'light';
  return mode === 'dark' ? 'dark' : 'light';
}

function applyThemeToDocument(theme: Theme): void {
  const root = document.documentElement;
  const mode = resolveMode(theme);
  root.classList.toggle('dark', mode === 'dark');
  root.dataset.theme = mode;
  try {
    localStorage.setItem('neko_ui_theme', mode);
  } catch {
    /* ignore */
  }
  const primary = theme.ui?.primary;
  if (primary) {
    root.style.setProperty('--primary', primary);
    root.style.setProperty('--ring', primary);
    applyAccentVars(root, primary);
  } else {
    root.style.removeProperty('--primary');
    clearAccentVars(root);
    root.style.removeProperty('--ring');
  }
  const title = theme.brand?.title || 'AstrBot';
  const subtitle = (theme.brand?.subtitle || 'Console').trim();
  document.title = subtitle ? `${title} · ${subtitle}` : title;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [version, setVersion] = useState('');
  const [uptime, setUptime] = useState('—');
  const [account, setAccount] = useState<Record<string, unknown> | null>(null);
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [resources, setResources] = useState<Partial<Record<ResourceKey, unknown[]>>>({});
  const [storageValue, setStorageValue] = useState<Record<string, unknown> | null>(null);
  const [providerTokens, setProviderTokens] = useState<unknown>(null);
  const [theme, setTheme] = useState<Theme>({});
  const [toasts, setToasts] = useState<Toast[]>([]);
  const startTimeRef = useRef<number | null>(null);
  const toastId = useRef(0);
  const toastTimers = useRef<number[]>([]);

  const lastToast = useRef<{ message: string; at: number }>({ message: '', at: 0 });

  const notify = useCallback((message: string, tone: ToastTone = 'ok') => {
    const now = Date.now();
    // Collapse repeated identical messages (sliders, rapid clicks) into one toast.
    if (lastToast.current.message === message && now - lastToast.current.at < 2500) {
      lastToast.current.at = now;
      return;
    }
    lastToast.current = { message, at: now };
    const id = ++toastId.current;
    setToasts((current) => [...current, { id, message, tone }].slice(-3));
    const timer = window.setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), 3600);
    toastTimers.current.push(timer);
  }, []);

  const loadVersion = useCallback(async () => {
    try {
      const payload = await statsApi.version();
      const value =
        typeof payload === 'string' ? payload : String(unwrap<{ version?: string }>(payload)?.version || '');
      setVersion(value);
      const start = await statsApi.startTime();
      const parsed =
        typeof start === 'number'
          ? start
          : typeof start === 'string'
            ? Date.parse(start)
            : Number((start as { start_time?: number })?.start_time || 0);
      startTimeRef.current = Number.isFinite(parsed) ? (parsed < 1e12 ? parsed * 1000 : parsed) : null;
    } catch {
      setVersion('');
    }
  }, []);

  const reloadResource = useCallback(async (key: ResourceKey) => {
    try {
      const payload = await RESOURCE_PATHS[key]();
      setResources((current) => ({ ...current, [key]: toArray(unwrap(payload)) }));
    } catch {
      setResources((current) => ({ ...current, [key]: [] }));
    }
  }, []);

  const reloadPlugins = useCallback(async () => {
    try {
      setPlugins(await pluginsApi.list());
    } catch (error) {
      notify(error instanceof Error ? error.message : '插件列表读取失败', 'error');
    }
  }, [notify]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      // Without a token the probe can only answer 401, which shows up as a
      // console error on the login screen; skip it entirely.
      const probe = getToken()
        ? await statsApi
            .version()
            .then(() => true)
            .catch(() => false)
        : false;
      setAuthed(probe);
      if (!probe) {
        setAccount(null);
        return;
      }
      const [storage, tokens] = await Promise.all([
        statsApi.storage().catch(() => null),
        statsApi.providerTokens().catch(() => null),
      ]);
      const username = getUsername();
      setAccount(username ? { username } : null);
      setStorageValue(storage);
      setProviderTokens(tokens);
      {
        await loadVersion();
        await reloadPlugins();
        await Promise.all((Object.keys(RESOURCE_PATHS) as ResourceKey[]).map((key) => reloadResource(key)));
      }
    } finally {
      setLoading(false);
    }
  }, [loadVersion, notify, reloadPlugins, reloadResource]);

  const login = useCallback(
    async (username: string, password: string, code?: string) => {
      await api.login(username, password, code);
      setAuthed(true);
      await refresh();
    },
    [refresh],
  );

  const logout = useCallback(async () => {
    await api.logout();
    setAuthed(false);
    setPlugins([]);
    setResources({});
    setAccount(null);
    setUsername(null);
  }, []);

  /**
   * Persist a theme patch.
   *
   * Errors propagate on purpose: the caller knows which action the user took
   * and shows a matching message. This hook used to notify('外观已保存') on its
   * own, which duplicated every caller toast, and it swallowed failures, which
   * made the callers' error branches dead code.
   */
  const saveTheme = useCallback(async (patch: Theme) => {
    const saved = await api.saveTheme<Theme>(patch);
    setTheme(saved);
    applyThemeToDocument(saved);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const loaded = await api.theme<Theme>();
        setTheme(loaded);
        applyThemeToDocument(loaded);
      } catch {
        applyThemeToDocument({});
      }
      await refresh();
      setReady(true);
    })();
  }, [refresh]);

  useEffect(
    () => () => {
      toastTimers.current.forEach((timer) => window.clearTimeout(timer));
    },
    [],
  );

  useEffect(() => {
    const timer = setInterval(() => {
      const started = startTimeRef.current;
      setUptime(started ? humanDuration((Date.now() - started) / 1000) : '—');
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const value = useMemo<AppValue>(
    () => ({
      ready,
      authed,
      loading,
      version,
      account,
      plugins,
      resources,
      storageValue,
      providerTokens,
      theme,
      toasts,
      notify,
      login,
      logout,
      refresh,
      reloadPlugins,
      reloadResource,
      saveTheme,
    }),
    [
      ready,
      authed,
      loading,
      version,
      account,
      plugins,
      resources,
      storageValue,
      providerTokens,
      theme,
      toasts,
      notify,
      login,
      logout,
      refresh,
      reloadPlugins,
      reloadResource,
      saveTheme,
    ],
  );

  return (
    <AppContext.Provider value={value}>
      <UptimeContext.Provider value={uptime}>{children}</UptimeContext.Provider>
    </AppContext.Provider>
  );
}