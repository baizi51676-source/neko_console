#!/usr/bin/env node
/**
 * Neko WebUI sidecar for AstrBot.
 *
 * A standalone reverse proxy + static host that serves a custom dashboard UI
 * while forwarding every AstrBot API call to the untouched upstream instance.
 * No AstrBot file is modified.
 */
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 6186);
const HOST = process.env.HOST || '0.0.0.0';
const UPSTREAM = new URL(process.env.ASTRBOT_BASE || 'http://astrbot:6185');
const PUBLIC_DIR = process.env.PUBLIC_DIR || path.join(__dirname, 'public');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const THEME_FILE = path.join(DATA_DIR, 'theme.json');
const ACCESS_PASSWORD = process.env.NEKO_PASSWORD || '';
const VERBOSE = process.env.NEKO_VERBOSE !== '0';
const STRIP_COOKIE_SECURE = process.env.NEKO_STRIP_COOKIE_SECURE !== '0';
const MAX_PROXY_BYTES = Number(process.env.NEKO_MAX_PROXY_MB || 6) * 1024 * 1024;
const AUTH_COOKIE = 'neko_sidecar_auth';
const MAX_UPLOAD = 8 * 1024 * 1024;
const ALLOWED_IMAGE = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

const DEFAULT_THEME = {
  brand: { title: 'AstrBot', subtitle: 'Neko Console' },
  ui: { theme: 'light', primary: '#0ea5e9', wallpaper: { url: '', blur: 0, dim: 0 } },
  nav: { hidden: [] },
};

function deepMerge(base, patch) {
  if (Array.isArray(base) || Array.isArray(patch)) return patch === undefined ? base : patch;
  if (typeof base !== 'object' || base === null) return patch === undefined ? base : patch;
  if (typeof patch !== 'object' || patch === null) return base;
  const out = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    out[k] = k in base ? deepMerge(base[k], v) : v;
  }
  return out;
}

async function ensureDirs() {
  await fsp.mkdir(UPLOAD_DIR, { recursive: true });
}

async function readTheme() {
  try {
    const raw = await fsp.readFile(THEME_FILE, 'utf8');
    return deepMerge(DEFAULT_THEME, JSON.parse(raw));
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT_THEME));
  }
}

async function writeTheme(patch) {
  const current = await readTheme();
  const next = deepMerge(current, patch || {});
  await fsp.mkdir(DATA_DIR, { recursive: true });
  await fsp.writeFile(THEME_FILE, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

function sendJson(res, code, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  res.end(body);
}

function readBody(req, limit = MAX_UPLOAD + 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('payload too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

async function serveStatic(req, res, urlPath) {
  const rel = decodeURIComponent(urlPath.replace(/^\/+/, ''));
  const safe = path.normalize(rel).replace(/^(\.\.[/\\])+/, '');
  let filePath = path.join(PUBLIC_DIR, safe);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendJson(res, 403, { ok: false, error: 'forbidden' });
    return true;
  }
  let stat = null;
  try {
    stat = await fsp.stat(filePath);
  } catch {
    stat = null;
  }
  if (stat && stat.isDirectory()) {
    filePath = path.join(filePath, 'index.html');
    try {
      stat = await fsp.stat(filePath);
    } catch {
      stat = null;
    }
  }
  if (!stat || !stat.isFile()) return false;
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    'content-type': MIME[ext] || 'application/octet-stream',
    'content-length': stat.size,
    'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=300',
  });
  fs.createReadStream(filePath).pipe(res);
  return true;
}

function isAuthed(req) {
  if (!ACCESS_PASSWORD) return true;
  const cookie = req.headers.cookie || '';
  const m = cookie.match(new RegExp(`${AUTH_COOKIE}=([^;]+)`));
  if (!m) return false;
  return safeEqual(m[1], authToken());
}

/** Constant-time comparison that tolerates length differences. */
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/** In-memory brute-force guard for the sidecar password. */
const loginFails = new Map();
const LOGIN_MAX_FAILS = 5;
const LOGIN_WINDOW_MS = 5 * 60 * 1000;

function loginBlocked(ip) {
  const rec = loginFails.get(ip);
  if (!rec) return false;
  if (Date.now() - rec.at > LOGIN_WINDOW_MS) {
    loginFails.delete(ip);
    return false;
  }
  return rec.count >= LOGIN_MAX_FAILS;
}

function noteLoginFail(ip) {
  const rec = loginFails.get(ip);
  if (rec && Date.now() - rec.at <= LOGIN_WINDOW_MS) rec.count += 1;
  else loginFails.set(ip, { count: 1, at: Date.now() });
}

function authToken() {
  return crypto.createHash('sha256').update(`neko:${ACCESS_PASSWORD}`).digest('hex').slice(0, 32);
}

/**
 * AstrBot marks the dashboard JWT cookie "Secure" by default. When the sidecar
 * is served over plain HTTP the browser would silently drop such a cookie, so
 * the login appears to succeed and then immediately looks unauthenticated.
 * We terminate HTTP here, therefore relax the attribute (and SameSite) so the
 * cookie is actually stored by the browser.
 */
function stripCookieSecure(cookie) {
  if (!STRIP_COOKIE_SECURE) return String(cookie);
  return String(cookie)
    .replace(/;\s*Secure\b/gi, '')
    .replace(/;\s*SameSite=Strict\b/gi, '; SameSite=Lax');
}

/**
 * Refuse to stream a huge JSON payload to the browser. AstrBot has endpoints
 * that answer with the full dataset (e.g. /api/v1/conversations returns ~180MB),
 * which would freeze a phone browser. Binary/download responses are untouched.
 */
function guardOversizedJson(upRes, outHeaders, res) {
  if (!(MAX_PROXY_BYTES > 0)) return false;
  const contentType = String(outHeaders['content-type'] || '');
  if (!contentType.includes('json')) return false;
  const declared = Number(outHeaders['content-length'] || 0);
  if (!Number.isFinite(declared) || declared <= MAX_PROXY_BYTES) return false;
  upRes.destroy();
  const body = JSON.stringify({
    status: 'error',
    message:
      '响应过大（' + (declared / 1048576).toFixed(1) + ' MB），已被侧车截断保护拦截（上限 ' +
      (MAX_PROXY_BYTES / 1048576).toFixed(1) + ' MB）',
    data: null,
    _neko_truncated: declared,
  });
  res.writeHead(200, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  res.end(body);
  return true;
}

function proxyUpstream(req, res) {
  const headers = { ...req.headers };
  headers.host = UPSTREAM.host;
  headers['x-forwarded-host'] = req.headers.host || '';
  headers['x-forwarded-proto'] = 'http';
  headers['x-forwarded-for'] = req.socket.remoteAddress || '';
  const client = UPSTREAM.protocol === 'https:' ? https : http;
  const upstreamReq = client.request(
    {
      protocol: UPSTREAM.protocol,
      hostname: UPSTREAM.hostname,
      port: UPSTREAM.port || (UPSTREAM.protocol === 'https:' ? 443 : 80),
      method: req.method,
      path: req.url,
      headers,
    },
    (upRes) => {
      const outHeaders = { ...upRes.headers };
      if (guardOversizedJson(upRes, outHeaders, res)) return;
      const rawCookies = outHeaders['set-cookie'];
      if (Array.isArray(rawCookies) && rawCookies.length) {
        outHeaders['set-cookie'] = rawCookies.map(stripCookieSecure);
      }
      if (VERBOSE) {
        console.log('[neko-webui] proxy', req.method, req.url, '->', upRes.statusCode);
      }
      if (outHeaders['location'] && typeof outHeaders['location'] === 'string') {
        outHeaders['location'] = outHeaders['location'].replace(UPSTREAM.origin, '');
      }
      res.writeHead(upRes.statusCode || 502, outHeaders);
      upRes.pipe(res);
    },
  );
  upstreamReq.setTimeout(0);
  upstreamReq.on('error', (err) => {
    if (!res.headersSent) {
      sendJson(res, 502, { ok: false, error: `upstream unreachable: ${err.message}` });
    } else {
      res.end();
    }
  });
  req.pipe(upstreamReq);
}

const MAX_HISTORY_PARSE = 2 * 1024 * 1024;
const TAIL_TEXT_BYTES = 2000000;

/** Decode `\uXXXX` / `\n` escapes that AstrBot leaves inside history blobs. */
function decodeMaybeEscaped(text) {
  const value = String(text ?? '');
  if (!value) return '';
  if (!/\\u[0-9a-fA-F]{4}|\\n|\\"/.test(value)) return value;
  try {
    return JSON.parse('"' + value.replace(/"/g, '\\"') + '"');
  } catch {
    return value
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"');
  }
}

/** A message `content` can be a string, a component array, or a serialised array. */
function textFromContent(content) {
  if (content && typeof content === 'object') {
    if (Array.isArray(content)) {
      const parts = content
        .map((item) => (item && typeof item === 'object' ? item.text ?? item.content ?? '' : item))
        .filter(Boolean);
      if (parts.length) return parts.join('');
    }
    if (typeof content.text === 'string') return content.text;
    if (typeof content.content === 'string') return content.content;
    try {
      return JSON.stringify(content);
    } catch {
      return String(content);
    }
  }
  const str = String(content ?? '');
  if (str.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(str);
      if (Array.isArray(parsed)) {
        const parts = parsed
          .map((item) => (item && typeof item === 'object' ? item.text ?? item.content ?? '' : item))
          .filter(Boolean);
        if (parts.length) return parts.join('');
      }
    } catch {
      /* fall through to escape decoding */
    }
  }
  return decodeMaybeEscaped(str);
}

/** Extract readable messages from a conversation `history` blob (JSON or plain text). */
function extractMessages(history) {
  if (typeof history !== 'string' || !history) {
    return { messages: [], truncated: false, total: 0 };
  }
  const total = history.length;
  // AstrBot stores component arrays; for huge blobs (or anything that does not
  // look like a JSON array) pull the `"text":"…"` fragments out directly.
  if (total > MAX_HISTORY_PARSE || !history.trim().startsWith('[')) {
    const rawSlice = total > MAX_HISTORY_PARSE ? history.slice(-TAIL_TEXT_BYTES) : history;
    // Slicing by UTF-16 units can cut a surrogate pair in half → drop orphans.
    const source = rawSlice.replace(/^[\uDC00-\uDFFF]/, '').replace(/[\uD800-\uDBFF]$/, '');
    const fragments = [...source.matchAll(/"text"\s*:\s*"((?:[^"\\]|\\.)*)"/g)];
    if (fragments.length) {
      return {
        messages: fragments.slice(-200).map((match) => ({
          role: '',
          time: null,
          content: decodeMaybeEscaped(match[1]).slice(0, 2000),
        })),
        truncated: total > MAX_HISTORY_PARSE,
        total: fragments.length,
      };
    }
  }
  if (total > MAX_HISTORY_PARSE) {
    const tail = history.slice(-TAIL_TEXT_BYTES);
    const lines = tail
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    return {
      messages: lines.map((line) => ({ role: '', time: null, content: line.slice(0, 2000) })),
      truncated: true,
      total,
    };
  }
  try {
    const parsed = JSON.parse(history);
    const list = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object' && Array.isArray(parsed.messages)
        ? parsed.messages
        : [];
    const messages = list.map((message) => {
      const row = message && typeof message === 'object' ? message : {};
      let content = row.content ?? row.text ?? row.message ?? '';
      if (content && typeof content === 'object') {
        try {
          content = JSON.stringify(content);
        } catch {
          content = String(content);
        }
      }
      return {
        role: row.role || row.sender || row.type || '',
        time: row.created_at || row.timestamp || row.time || null,
        content: textFromContent(content).slice(0, 2000),
      };
    });
    return { messages, truncated: false, total };
  } catch {
    // Not clean JSON (AstrBot stores a serialised component array): pull out
    // every `"text":"…"` fragment so the dialog still shows readable messages.
    const fragments = [...history.matchAll(/"text"\s*:\s*"((?:[^"\\]|\\.)*)"/g)];
    if (fragments.length) {
      return {
        messages: fragments.slice(-200).map((match) => ({
          role: '',
          time: null,
          content: decodeMaybeEscaped(match[1]).slice(0, 2000),
        })),
        truncated: false,
        total: fragments.length,
      };
    }
    const lines = history
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    return {
      messages: lines.map((line) => ({ role: '', time: null, content: line.slice(0, 2000) })),
      truncated: false,
      total: lines.length,
    };
  }
}

let convCache = { ts: 0, items: null };
let convInflight = null;

/**
 * AstrBot's /api/v1/conversations embeds every message of every conversation
 * (~172 MB for three conversations on this host), which no browser can take.
 * We pull it once on the server, strip the heavy message bodies, cache the
 * light rows for a minute and paginate locally.
 */
async function loadConversations(req) {
  if (convCache.items && Date.now() - convCache.ts < 60000) return convCache.items;
  if (convInflight) return convInflight;
  const headers = {};
  if (req.headers.cookie) headers.cookie = req.headers.cookie;
  if (req.headers.authorization) headers.authorization = req.headers.authorization;
  convInflight = (async () => {
    const started = Date.now();
    const upstream = await fetch(new URL('/api/v1/conversations', UPSTREAM), { headers });
    const text = await upstream.text();
    if (!upstream.ok) throw new Error(`upstream ${upstream.status}`);
    let payload = null;
    try {
      payload = JSON.parse(text);
    } catch (err) {
      throw new Error(`conversations payload not JSON (${text.length} bytes)`);
    }
    const data = payload && typeof payload === 'object' && 'data' in payload ? payload.data : payload;
    const list = Array.isArray(data)
      ? data
      : data && Array.isArray(data.conversations)
        ? data.conversations
        : [];
    const items = list.map((entry) => {
      const rec = entry && typeof entry === 'object' ? entry : {};
      const messages = Array.isArray(rec.messages) ? rec.messages : null;
      return {
        cid: rec.cid || rec.id || rec.conversation_id || '',
        title: rec.title || null,
        platform: rec.platform_id || rec.platform || null,
        user_id: rec.user_id || null,
        persona_id: rec.persona_id || null,
        created_at: rec.created_at || null,
        updated_at: rec.updated_at || null,
        token_usage: rec.token_usage || null,
        message_count: messages ? messages.length : rec.message_count ?? null,
        _history: typeof rec.history === 'string' ? rec.history : null,
      };
    });
    convCache = { ts: Date.now(), items };
    console.log(
      `[neko-webui] conversations: ${items.length} rows parsed from ${(text.length / 1048576).toFixed(1)} MB in ${Date.now() - started} ms`,
    );
    return items;
  })();
  try {
    return await convInflight;
  } finally {
    convInflight = null;
  }
}

async function handleNekoApi(req, res, url) {
  const route = url.pathname.replace(/^\/__neko\/api/, '') || '/';

  if (route === '/health') {
    sendJson(res, 200, {
      ok: true,
      upstream: UPSTREAM.origin,
      protected: Boolean(ACCESS_PASSWORD),
      now: new Date().toISOString(),
    });
    return true;
  }

  if (route === '/login' && req.method === 'POST') {
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown')
      .split(',')[0]
      .trim();
    if (loginBlocked(ip)) {
      sendJson(res, 429, { ok: false, error: '尝试次数过多，请 5 分钟后再试' });
      return true;
    }
    const body = await readBody(req, 64 * 1024);
    let payload = {};
    try {
      payload = JSON.parse(body.toString('utf8') || '{}');
    } catch {
      payload = {};
    }
    if (!ACCESS_PASSWORD || safeEqual(payload.password || '', ACCESS_PASSWORD)) {
      loginFails.delete(ip);
      const maxAge = 60 * 60 * 24 * 14;
      res.setHeader(
        'set-cookie',
        `${AUTH_COOKIE}=${authToken()}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax`,
      );
      sendJson(res, 200, { ok: true });
    } else {
      noteLoginFail(ip);
      sendJson(res, 401, { ok: false, error: '口令不正确' });
    }
    return true;
  }

  if (route === '/logout' && req.method === 'POST') {
    res.setHeader('set-cookie', `${AUTH_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
    sendJson(res, 200, { ok: true });
    return true;
  }

  if (route === '/session') {
    sendJson(res, 200, { ok: true, authed: isAuthed(req), protected: Boolean(ACCESS_PASSWORD) });
    return true;
  }

  if (!isAuthed(req)) {
    sendJson(res, 401, { ok: false, error: 'unauthorized' });
    return true;
  }

  if (route === '/theme' && req.method === 'GET') {
    sendJson(res, 200, { ok: true, theme: await readTheme() });
    return true;
  }

  if (route === '/theme' && (req.method === 'PUT' || req.method === 'POST')) {
    const body = await readBody(req, 512 * 1024);
    let patch = {};
    try {
      patch = JSON.parse(body.toString('utf8') || '{}');
    } catch {
      sendJson(res, 400, { ok: false, error: 'invalid json' });
      return true;
    }
    const theme = await writeTheme(patch);
    sendJson(res, 200, { ok: true, theme });
    return true;
  }

  if (route === '/theme/reset' && req.method === 'POST') {
    await fsp.mkdir(DATA_DIR, { recursive: true });
    await fsp.writeFile(THEME_FILE, JSON.stringify(DEFAULT_THEME, null, 2), 'utf8');
    sendJson(res, 200, { ok: true, theme: JSON.parse(JSON.stringify(DEFAULT_THEME)) });
    return true;
  }

  if (route === '/uploads' && req.method === 'GET') {
    await ensureDirs();
    const files = await fsp.readdir(UPLOAD_DIR).catch(() => []);
    const items = [];
    for (const f of files) {
      const st = await fsp.stat(path.join(UPLOAD_DIR, f)).catch(() => null);
      if (st && st.isFile()) {
        items.push({ name: f, url: `/__neko/api/uploads/${encodeURIComponent(f)}`, size: st.size, mtime: st.mtimeMs });
      }
    }
    items.sort((a, b) => b.mtime - a.mtime);
    sendJson(res, 200, { ok: true, items });
    return true;
  }

  if (route.startsWith('/uploads/') && req.method === 'GET') {
    const name = path.basename(decodeURIComponent(route.replace('/uploads/', '')));
    const filePath = path.join(UPLOAD_DIR, name);
    const st = await fsp.stat(filePath).catch(() => null);
    if (!st || !st.isFile()) {
      sendJson(res, 404, { ok: false, error: 'not found' });
      return true;
    }
    const ext = path.extname(name).toLowerCase();
    res.writeHead(200, {
      'content-type': MIME[ext] || 'application/octet-stream',
      'content-length': st.size,
      'cache-control': 'public, max-age=600',
    });
    fs.createReadStream(filePath).pipe(res);
    return true;
  }

  if (route.startsWith('/uploads/') && req.method === 'DELETE') {
    const name = path.basename(decodeURIComponent(route.replace('/uploads/', '')));
    const filePath = path.join(UPLOAD_DIR, name);
    const st = await fsp.stat(filePath).catch(() => null);
    if (!st || !st.isFile()) {
      sendJson(res, 404, { ok: false, error: '文件不存在' });
      return true;
    }
    try {
      await fsp.unlink(filePath);
    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        error: '删除失败：' + (error && error.message ? error.message : 'unknown'),
      });
      return true;
    }
    sendJson(res, 200, { ok: true });
    return true;
  }

  if (route === '/upload' && req.method === 'POST') {
    const body = await readBody(req);
    let payload = {};
    try {
      payload = JSON.parse(body.toString('utf8') || '{}');
    } catch {
      sendJson(res, 400, { ok: false, error: 'invalid json' });
      return true;
    }
    const dataUrl = String(payload.dataUrl || '');
    const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!m) {
      sendJson(res, 400, { ok: false, error: '需要 dataUrl 格式的图片' });
      return true;
    }
    const mime = m[1].toLowerCase();
    const ext = ALLOWED_IMAGE[mime];
    if (!ext) {
      sendJson(res, 400, { ok: false, error: `不支持的图片类型: ${mime}` });
      return true;
    }
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > MAX_UPLOAD) {
      sendJson(res, 413, { ok: false, error: '图片过大（上限 8MB）' });
      return true;
    }
    await ensureDirs();
    const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
    const rand = crypto.randomBytes(3).toString('hex');
    const name = `bg-${stamp}-${rand}.${ext}`;
    await fsp.writeFile(path.join(UPLOAD_DIR, name), buf);
    sendJson(res, 200, { ok: true, name, url: `/__neko/api/uploads/${name}`, size: buf.length });
    return true;
  }

  if (route === '/conversations' && req.method === 'GET') {
    try {
      const items = await loadConversations(req);
      const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
      const size = Math.min(100, Math.max(1, parseInt(url.searchParams.get('page_size') || '20', 10) || 20));
      const q = (url.searchParams.get('search') || '').trim().toLowerCase();
      const filtered = q
        ? items.filter((item) =>
            [item.title, item.user_id, item.cid, item.platform]
              .filter(Boolean)
              .join(' ')
              .toLowerCase()
              .includes(q),
          )
        : items;
      const start = (page - 1) * size;
      const pageItems = filtered.slice(start, start + size).map((row) => ({
        cid: row.cid,
        title: row.title,
        platform: row.platform,
        user_id: row.user_id,
        persona_id: row.persona_id,
        created_at: row.created_at,
        updated_at: row.updated_at,
        token_usage: row.token_usage,
        message_count: row.message_count,
        history_bytes: row._history ? row._history.length : 0,
      }));
      sendJson(res, 200, {
        ok: true,
        total: filtered.length,
        page,
        page_size: size,
        items: pageItems,
      });
    } catch (err) {
      sendJson(res, 502, { ok: false, error: String(err && err.message) });
    }
    return true;
  }

  if (route === '/conversation-messages' && req.method === 'GET') {
    const cid = url.searchParams.get('cid') || '';
    if (!cid) {
      sendJson(res, 400, { ok: false, error: 'cid required' });
      return true;
    }
    try {
      const cached = await loadConversations(req);
      const target = cached.find((row) => row.cid === cid);
      if (target) {
        const extracted = extractMessages(target._history);
        sendJson(res, 200, {
          ok: true,
          cid,
          total: extracted.total,
          truncated: extracted.truncated,
          items: extracted.messages.slice(-200),
        });
        return true;
      }
    } catch {
      /* fall through to the direct fetch below */
    }
    const headers = {};
    if (req.headers.cookie) headers.cookie = req.headers.cookie;
    if (req.headers.authorization) headers.authorization = req.headers.authorization;
    try {
      const upstream = await fetch(new URL(`/api/v1/conversations/${encodeURIComponent(cid)}`, UPSTREAM), { headers });
      const text = await upstream.text();
      if (!upstream.ok) throw new Error(`upstream ${upstream.status}`);
      let payload = null;
      try {
        payload = JSON.parse(text);
      } catch {
        throw new Error('payload not JSON');
      }
      const data = payload && typeof payload === 'object' && 'data' in payload ? payload.data : payload;
      const rec = data && typeof data === 'object' ? data : {};
      const messages = Array.isArray(rec.messages) ? rec.messages : [];
      const light = messages.slice(-200).map((message) => {
        const row = message && typeof message === 'object' ? message : {};
        let content = row.content;
        if (content && typeof content === 'object') {
          try {
            content = JSON.stringify(content);
          } catch {
            content = String(content);
          }
        }
        return {
          role: row.role || row.sender || row.type || '',
          time: row.created_at || row.timestamp || row.time || null,
          content: typeof content === 'string' ? content.slice(0, 2000) : String(content ?? ''),
        };
      });
      sendJson(res, 200, { ok: true, cid, total: messages.length, items: light });
    } catch (err) {
      sendJson(res, 502, { ok: false, error: String(err && err.message) });
    }
    return true;
  }

  if (route === '/plugin-upload' && req.method === 'POST') {
    const body = await readBody(req, MAX_UPLOAD + 1024 * 1024);
    let payload = {};
    try {
      payload = JSON.parse(body.toString('utf8') || '{}');
    } catch {
      sendJson(res, 400, { ok: false, error: 'invalid json' });
      return true;
    }
    const dataUrl = String(payload.dataUrl || '');
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      sendJson(res, 400, { ok: false, error: '需要 dataUrl 格式的文件' });
      return true;
    }
    const buf = Buffer.from(match[2], 'base64');
    if (buf.length > MAX_UPLOAD) {
      sendJson(res, 413, { ok: false, error: '文件过大（上限 8MB）' });
      return true;
    }
    const filename = String(payload.filename || 'plugin.zip').replace(/[^\w.-]/g, '_');
    const form = new FormData();
    form.append(
      'file',
      new Blob([buf], { type: match[1] || 'application/zip' }),
      filename,
    );
    const forwardHeaders = {};
    if (req.headers.cookie) forwardHeaders.cookie = req.headers.cookie;
    if (req.headers.authorization) forwardHeaders.authorization = req.headers.authorization;
    try {
      const upstream = await fetch(new URL('/api/v1/plugins/install/upload', UPSTREAM), {
        method: 'POST',
        headers: forwardHeaders,
        body: form,
      });
      const text = await upstream.text();
      res.writeHead(upstream.status, {
        'content-type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      });
      res.end(text);
    } catch (err) {
      sendJson(res, 502, { ok: false, error: '转发失败: ' + String(err && err.message) });
    }
    return true;
  }

  sendJson(res, 404, { ok: false, error: 'unknown sidecar route' });
  return true;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    if (pathname.startsWith('/__neko/api')) {
      const publicRoute = ['/health', '/login', '/logout', '/session'].includes(
        pathname.replace(/^\/__neko\/api/, '') || '/',
      );
      if (!publicRoute && !isAuthed(req)) {
        sendJson(res, 401, { ok: false, error: 'unauthorized' });
        return;
      }
      await handleNekoApi(req, res, url);
      return;
    }

    if (pathname === '/api' || pathname.startsWith('/api/')) {
      if (!isAuthed(req)) {
        sendJson(res, 401, { ok: false, error: 'unauthorized' });
        return;
      }
      proxyUpstream(req, res);
      return;
    }

    if (!isAuthed(req)) {
      if (pathname === '/' || pathname === '/index.html') {
        res.writeHead(302, { location: '/login.html' });
        res.end();
        return;
      }
      const served = await serveStatic(req, res, pathname);
      if (served) return;
      res.writeHead(302, { location: '/login.html' });
      res.end();
      return;
    }

    if (await serveStatic(req, res, pathname)) return;

    if (req.method === 'GET' && !pathname.includes('.')) {
      const served = await serveStatic(req, res, '/index.html');
      if (served) return;
    }

    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('404');
  } catch (err) {
    if (!res.headersSent) sendJson(res, 500, { ok: false, error: String(err && err.message) });
    else res.end();
  }
});

await ensureDirs();
if (!fs.existsSync(THEME_FILE)) {
  await fsp.writeFile(THEME_FILE, JSON.stringify(DEFAULT_THEME, null, 2), 'utf8');
}
server.listen(PORT, HOST, () => {
  console.log(`[neko-webui] listening on http://${HOST}:${PORT}`);
  console.log(`[neko-webui] upstream: ${UPSTREAM.origin}`);
  console.log(`[neko-webui] static: ${PUBLIC_DIR}`);
  console.log(`[neko-webui] access password: ${ACCESS_PASSWORD ? 'enabled' : 'disabled'}`);
});
