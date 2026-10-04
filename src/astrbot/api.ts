/**
 * AstrBot REST client for the Neko Console webui.
 *
 * Everything goes through the sidecar proxy on the same origin:
 *   /api/**        -> proxied verbatim to AstrBot (:6185)
 *   /__neko/api/** -> sidecar's own endpoints (theme, wallpaper, plugin upload…)
 */

/**
 * Core client (raw/get/send/unwrap) plus the endpoints that ./endpoints.ts does
 * not cover yet: auth, plugins, the legacy resource getters used by state.tsx /
 * pages.tsx, and the sidecar's own theme & upload routes. New page work should
 * use the per-domain modules in ./endpoints.ts instead of adding to `api`.
 */
const TOKEN_KEY = 'neko_astrbot_token';
const USERNAME_KEY = 'neko_astrbot_username';
const NEKO = '/__neko/api';

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export interface Envelope<T> {
  status?: string;
  message?: string | null;
  data?: T;
}

export function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
    return (payload as Envelope<T>).data as T;
  }
  return payload as T;
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getUsername(): string {
  try {
    return localStorage.getItem(USERNAME_KEY) || '';
  } catch {
    return '';
  }
}

export function setUsername(name: string | null): void {
  try {
    if (name) localStorage.setItem(USERNAME_KEY, name);
    else localStorage.removeItem(USERNAME_KEY);
  } catch {
    /* ignore */
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

/** RequestInit minus `body`: a plain object here is JSON-encoded below. */
export interface RawInit extends Omit<RequestInit, 'body'> {
  body?: unknown;
}

export async function raw(path: string, init?: RawInit): Promise<{ res: Response; body: unknown; text: string }> {
  const headers: Record<string, string> = { ...((init?.headers as Record<string, string>) || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let body: unknown = init?.body;
  if (body && typeof body !== 'string' && !(body instanceof FormData)) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(body);
  }
  const res = await fetch(path, { credentials: 'include', ...init, headers, body: body as BodyInit | null | undefined });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  return { res, body: parsed, text };
}

export function errorOf(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object') {
    const rec = payload as Record<string, unknown>;
    const msg = rec.message ?? rec.error ?? rec.detail;
    if (typeof msg === 'string' && msg) return msg;
  }
  return fallback;
}

/** GET/POST helpers that throw ApiError on failure and unwrap `{status,message,data}`. */
export async function get<T>(path: string, init?: RequestInit): Promise<T> {
  const { res, body, text } = await raw(path, { method: 'GET', ...init });
  if (!res.ok) throw new ApiError(errorOf(body, `HTTP ${res.status} ${text.slice(0, 120)}`), res.status);
  if (body && typeof body === 'object' && (body as Envelope<unknown>).status === 'error') {
    throw new ApiError(errorOf(body, '请求失败'), res.status);
  }
  return unwrap<T>(body);
}

export async function send<T>(path: string, method: string, payload?: unknown): Promise<T> {
  const { res, body, text } = await raw(path, { method, body: payload });
  if (!res.ok) throw new ApiError(errorOf(body, `HTTP ${res.status} ${text.slice(0, 120)}`), res.status);
  if (body && typeof body === 'object' && (body as Envelope<unknown>).status === 'error') {
    throw new ApiError(errorOf(body, '操作失败'), res.status);
  }
  return unwrap<T>(body);
}

/* ---------------- shapes (loose on purpose: AstrBot evolves) ---------------- */

export interface PluginInfo {
  name: string;
  display_name?: string;
  version?: string;
  online_version?: string;
  desc?: string;
  author?: string;
  repo?: string;
  logo?: string;
  activated?: boolean;
  reserved?: boolean;
  marketplace_name?: string;
  install_source?: string;
  pages?: string[];
  installed_at?: number;
  root_dir_name?: string;
  support_platforms?: string[];
  updates_enabled?: boolean;
  update_disabled_reason?: string;
}

export interface PluginSchemaField {
  description?: string;
  hint?: string;
  type?: string;
  default?: unknown;
  options?: unknown[];
  slider?: { min?: number; max?: number; step?: number };
  editor_mode?: boolean;
  is_password?: boolean;
  invisible?: boolean;
  items?: Record<string, PluginSchemaField>;
}

export interface PluginSchemaNode {
  description?: string;
  type?: string;
  items?: Record<string, PluginSchemaField>;
}

export interface PluginConfigResponse {
  plugin_name?: string;
  log_level?: string | null;
  metadata?: Record<string, PluginSchemaNode> | null;
  config?: Record<string, unknown> | null;
}

export interface MarketEntry {
  key: string;
  display_name: string;
  desc: string;
  author: string;
  version?: string;
  repo?: string;
  category?: string;
  logo?: string;
  tags?: string[];
  support_platforms?: string[];
}

export interface LogsPayload {
  logs?: unknown;
  content?: unknown;
  lines?: unknown;
}

/* ---------------- endpoints ---------------- */

export const api = {
  async login(username: string, password: string, code?: string): Promise<void> {
    const out = await raw('/api/v1/auth/login', {
      method: 'POST',
      body: { username, password, code: code || null, trust_device_flag: true },
    });
    if (!out.res.ok || (out.body && typeof out.body === 'object' && (out.body as Envelope<unknown>).status === 'error')) {
      throw new ApiError(errorOf(out.body, `\u767b\u5f55\u5931\u8d25 (HTTP ${out.res.status})`), out.res.status);
    }
    const data = unwrap<Record<string, unknown>>(out.body) || {};
    const token = (data.token || data.jwt || data.access_token) as string | undefined;
    if (token) setToken(token);
    // /api/v1/auth/account does not exist on 4.28.x (it answers 404), so the
    // signed-in name is remembered from the login response instead.
    if (typeof data.username === 'string' && data.username) setUsername(data.username);
  },

  async logout(): Promise<void> {
    await raw('/api/v1/auth/logout', { method: 'POST' }).catch(() => undefined);
    setToken(null);
  },

  /* sidecar ------------------------------------------------------------- */

  /** Sidecar: paginated, message-stripped conversation list. */
  async conversations(page = 1, pageSize = 20, search = ''): Promise<{
    total: number;
    items: { cid: string; title?: string | null; platform?: string | null; user_id?: string | null; updated_at?: number | null; created_at?: number | null; message_count?: number | null; token_usage?: number | null; history_bytes?: number | null }[];
  }> {
    const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
    if (search) params.set('search', search);
    const { res, body } = await raw(`${NEKO}/conversations?${params.toString()}`, { method: 'GET' });
    if (!res.ok) throw new ApiError('\u5bf9\u8bdd\u5217\u8868\u8bfb\u53d6\u5931\u8d25', res.status);
    const payload = (body || {}) as { items?: unknown[]; total?: number };
    return {
      total: Number(payload.total || 0),
      items: Array.isArray(payload.items) ? (payload.items as never[]) : [],
    };
  },

  /** Sidecar: last messages of one conversation (light rows). */
  async conversationMessages(cid: string): Promise<{ total: number; truncated?: boolean; items: { role?: string; time?: string | number | null; content?: string }[] }> {
    const { res, body } = await raw(`${NEKO}/conversation-messages?cid=${encodeURIComponent(cid)}`, { method: 'GET' });
    if (!res.ok) throw new ApiError('\u6d88\u606f\u8bfb\u53d6\u5931\u8d25', res.status);
    const payload = (body || {}) as { items?: unknown[]; total?: number; truncated?: boolean };
    return {
      total: Number(payload.total || 0),
      truncated: Boolean(payload.truncated),
      items: Array.isArray(payload.items) ? (payload.items as never[]) : [],
    };
  },

  /** Sidecar: upload a plugin zip; forwarded as multipart to AstrBot. */
  async uploadPluginZip(filename: string, dataUrl: string): Promise<unknown> {
    return send<unknown>(`${NEKO}/plugin-upload`, 'POST', { filename, dataUrl });
  },

  /* sidecar theme ------------------------------------------------------- */

  async theme<T = Record<string, unknown>>(): Promise<T> {
    const out = await raw(`${NEKO}/theme`, { method: 'GET' });
    if (!out.res.ok) throw new ApiError('\u5916\u89c2\u8bfb\u53d6\u5931\u8d25', out.res.status);
    return ((out.body as Record<string, unknown>)?.theme as T) || ({} as T);
  },

  async saveTheme<T = Record<string, unknown>>(patch: T): Promise<T> {
    const out = await raw(`${NEKO}/theme`, { method: 'PUT', body: patch as Record<string, unknown> });
    if (!out.res.ok) throw new ApiError('\u5916\u89c2\u4fdd\u5b58\u5931\u8d25', out.res.status);
    return ((out.body as Record<string, unknown>)?.theme as T) || patch;
  },

  async uploadImage(dataUrl: string): Promise<{ url: string }> {
    const out = await raw(`${NEKO}/upload`, { method: 'POST', body: { dataUrl } });
    if (!out.res.ok) throw new ApiError(errorOf(out.body, '\u4e0a\u4f20\u5931\u8d25'), out.res.status);
    return out.body as { url: string };
  },
};

/** Pull an array out of whatever envelope AstrBot used. */
export function toArray<T = Record<string, unknown>>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === 'object') {
    const rec = value as Record<string, unknown>;
    for (const key of ['items', 'list', 'plugins', 'sessions', 'bots', 'providers', 'personas', 'skills', 'jobs', 'backups', 'market', 'provider_sources', 'knowledge_bases', 'results', 'data', 'records']) {
      if (Array.isArray(rec[key])) return rec[key] as T[];
    }
  }
  // Anything else is not a list. Treating an object-of-objects as a list used
  // to turn configuration maps into bogus rows.
  return [];
}

export function textOf(value: unknown, keys: string[]): string {
  if (!value || typeof value !== 'object') return '';
  const rec = value as Record<string, unknown>;
  for (const key of keys) {
    const v = rec[key];
    if (typeof v === 'string' && v) return v;
    if (typeof v === 'number') return String(v);
  }
  return '';
}
