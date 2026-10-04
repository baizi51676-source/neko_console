/**
 * AstrBot API surface, grouped by domain.
 *
 * Split out of api.ts so every console section can grow its own endpoints
 * without touching the shared client. All helpers unwrap
 * `{status, message, data}` and throw ApiError on failure.
 */
import { get, raw, send, type PluginConfigResponse, type PluginInfo } from './api';

export type Json = Record<string, unknown>;

const V1 = '/api/v1';
const q = (value: string | number | boolean | null | undefined) => encodeURIComponent(String(value ?? ''));

/* --------------------------------- plugins -------------------------------- */
export const plugins = {
  list: () => get<PluginInfo[]>(`${V1}/plugins`),
  failed: () => get<Json>(`${V1}/plugins/failed`),
  config: (id: string) => get<PluginConfigResponse>(`${V1}/plugins/${q(id)}/config`),
  schema: (id: string) => get<PluginConfigResponse>(`${V1}/plugins/${q(id)}/config/schema`),
  saveConfig: (id: string, config: Json) => send<Json>(`${V1}/plugins/${q(id)}/config`, 'PUT', { config }),
  setEnabled: (id: string, enabled: boolean) => send<Json>(`${V1}/plugins/${q(id)}/enabled`, 'PATCH', { enabled }),
  reload: (id: string) => send<Json>(`${V1}/plugins/${q(id)}/reload`, 'POST', {}),
  update: (id: string) => send<Json>(`${V1}/plugins/${q(id)}/update`, 'POST', {}),
  uninstall: (id: string, deleteConfig: boolean, deleteData: boolean) =>
    send<Json>(`${V1}/plugins/${q(id)}`, 'DELETE', { delete_config: deleteConfig, delete_data: deleteData }),
  readme: (id: string) => get<{ content?: string } | string>(`${V1}/plugins/${q(id)}/readme`),
  changelog: (id: string) => get<{ content?: string } | string>(`${V1}/plugins/${q(id)}/changelog`),
  setLogLevel: (id: string, level: string | null) =>
    send<Json>(`${V1}/plugins/${q(id)}/log-level`, 'PUT', { level }),
  market: () => get<Json>(`${V1}/plugins/market`),
  marketCategories: () => get<{ categories?: unknown[] }>(`${V1}/plugins/market/categories`),
  pages: (id: string) => get<Json>(`${V1}/plugins/${q(id)}/pages`),
  /** Plugin detail: includes `components` (its commands / llm tools / listeners). */
  detail: (id: string) => get<Json>(`${V1}/plugins/${q(id)}`),
  /** Page entry config: yields content_path + asset token for the iframe. */
  pageEntry: (id: string, pageName: string) =>
    raw(`${V1}/plugins/${q(id)}/pages/${q(pageName)}`).then((out) => out.body),
  pageUrl: (id: string, pageName: string) => `${V1}/plugins/${q(id)}/pages/${q(pageName)}`,
  installGithub: (repository: string) =>
    send<Json>(`${V1}/plugins/install/url`, 'POST', { url: `https://github.com/${repository}` }),
  installUrl: (url: string) => send<Json>(`${V1}/plugins/install/url`, 'POST', { url }),
};

/* ---------------------------------- bots ---------------------------------- */

export interface BotTypeInfo {
  type?: string;
  id?: string;
  description?: string;
  display_name?: string;
  schema?: Record<string, unknown> | null;
  default_config?: Record<string, unknown> | null;
  support_streaming_message?: boolean;
  support_proactive_message?: boolean;
}

export const bots = {
  types: () => get<{ bot_types?: BotTypeInfo[] } | BotTypeInfo[]>(`${V1}/bot-types`),
  registration: (type: string) => send<Json>(`${V1}/bot-types/${q(type)}/registration`, 'POST', {}),
  list: () => get<Json>(`${V1}/bots`),
  stats: () => get<Json>(`${V1}/bots/stats`),
  get: (botId: string) => get<Json>(`${V1}/bots/by-id?bot_id=${q(botId)}`),
  create: (payload: Json) => send<Json>(`${V1}/bots`, 'POST', payload),
  update: (payload: Json) => send<Json>(`${V1}/bots/by-id`, 'PUT', payload),
  remove: (botId: string) => send<Json>(`${V1}/bots/by-id?bot_id=${q(botId)}`, 'DELETE'),
  setEnabled: (botId: string, enabled: boolean) => send<Json>(`${V1}/bots/enabled`, 'PATCH', { bot_id: botId, enabled }),
  test: (botId: string) => send<Json>(`${V1}/bots/test`, 'POST', { bot_id: botId }),
};

/* -------------------------------- providers ------------------------------- */

export const providers = {
  schema: () => get<Json>(`${V1}/providers/schema`),
  list: () => get<Json>(`${V1}/providers`),
  get: (id: string) => get<Json>(`${V1}/providers/by-id?provider_id=${q(id)}`),
  create: (payload: Json) => send<Json>(`${V1}/providers`, 'POST', payload),
  update: (payload: Json) => send<Json>(`${V1}/providers/by-id`, 'PUT', payload),
  remove: (id: string) => send<Json>(`${V1}/providers/by-id?provider_id=${q(id)}`, 'DELETE'),
  setEnabled: (id: string, enabled: boolean) => send<Json>(`${V1}/providers/enabled`, 'PATCH', { provider_id: id, enabled }),
  test: (id: string) => send<Json>(`${V1}/providers/test`, 'POST', { provider_id: id }),
  embeddingDimension: (providerId: string) => send<Json>(`${V1}/providers/embedding-dimension`, 'POST', { provider_id: providerId }),

  sources: {
    list: () => get<Json>(`${V1}/provider-sources`),
    get: (id: string) => get<Json>(`${V1}/provider-sources/by-id?source_id=${q(id)}`),
    create: (payload: Json) => send<Json>(`${V1}/provider-sources`, 'POST', payload),
    update: (payload: Json) => send<Json>(`${V1}/provider-sources/by-id`, 'PUT', payload),
    remove: (id: string) => send<Json>(`${V1}/provider-sources/by-id?source_id=${q(id)}`, 'DELETE'),
    models: (sourceId?: string) =>
      sourceId ? get<Json>(`${V1}/provider-sources/${q(sourceId)}/models`) : get<Json>(`${V1}/provider-sources/models`),
    providers: (sourceId?: string) =>
      sourceId ? get<Json>(`${V1}/provider-sources/${q(sourceId)}/providers`) : get<Json>(`${V1}/provider-sources/providers`),
    addProvider: (payload: Json, sourceId?: string) =>
      sourceId
        ? send<Json>(`${V1}/provider-sources/${q(sourceId)}/providers`, 'POST', payload)
        : send<Json>(`${V1}/provider-sources/providers`, 'POST', payload),
  },
};

/* --------------------------------- personas -------------------------------- */

export const personas = {
  list: () => get<Json>(`${V1}/personas`),
  tree: () => get<Json>(`${V1}/personas/tree`),
  get: (id: string) => get<Json>(`${V1}/personas/by-id?id=${q(id)}`),
  create: (payload: Json) => send<Json>(`${V1}/personas`, 'POST', payload),
  update: (payload: Json) => send<Json>(`${V1}/personas/by-id`, 'PUT', payload),
  remove: (id: string) => send<Json>(`${V1}/personas/by-id?id=${q(id)}`, 'DELETE'),
  move: (payload: Json) => send<Json>(`${V1}/personas/move`, 'POST', payload),
  reorder: (payload: Json) => send<Json>(`${V1}/personas/reorder`, 'POST', payload),
  folders: {
    list: () => get<Json>(`${V1}/persona-folders`),
    create: (payload: Json) => send<Json>(`${V1}/persona-folders`, 'POST', payload),
    update: (id: string, payload: Json) => send<Json>(`${V1}/persona-folders/${q(id)}`, 'PUT', payload),
    remove: (id: string) => send<Json>(`${V1}/persona-folders/${q(id)}`, 'DELETE'),
  },
};

/* ------------------------------- knowledge base ---------------------------- */

export const knowledge = {
  list: () => get<Json>(`${V1}/knowledge-bases`),
  create: (payload: Json) => send<Json>(`${V1}/knowledge-bases`, 'POST', payload),
  get: (kbId: string) => get<Json>(`${V1}/knowledge-bases/${q(kbId)}`),
  update: (kbId: string, payload: Json) => send<Json>(`${V1}/knowledge-bases/${q(kbId)}`, 'PUT', payload),
  remove: (kbId: string) => send<Json>(`${V1}/knowledge-bases/${q(kbId)}`, 'DELETE'),
  stats: (kbId: string) => get<Json>(`${V1}/knowledge-bases/${q(kbId)}/stats`),
  task: (taskId: string) => get<Json>(`${V1}/knowledge-bases/tasks/${q(taskId)}`),
  documents: (kbId: string) => get<Json>(`${V1}/knowledge-bases/${q(kbId)}/documents`),
  addDocument: (kbId: string, payload: Json) => send<Json>(`${V1}/knowledge-bases/${q(kbId)}/documents`, 'POST', payload),
  importFile: (kbId: string, payload: Json) => send<Json>(`${V1}/knowledge-bases/${q(kbId)}/documents/import`, 'POST', payload),
  importUrl: (kbId: string, payload: Json) => send<Json>(`${V1}/knowledge-bases/${q(kbId)}/documents/import-url`, 'POST', payload),
  document: (kbId: string, docId: string) => get<Json>(`${V1}/knowledge-bases/${q(kbId)}/documents/${q(docId)}`),
  removeDocument: (kbId: string, docId: string) => send<Json>(`${V1}/knowledge-bases/${q(kbId)}/documents/${q(docId)}`, 'DELETE'),
  chunks: (kbId: string, query?: string) =>
    get<Json>(`${V1}/knowledge-bases/${q(kbId)}/chunks${query ? `?query=${q(query)}` : ''}`),
  removeChunk: (kbId: string, chunkId: string) =>
    send<Json>(`${V1}/knowledge-bases/${q(kbId)}/chunks/${q(chunkId)}`, 'DELETE'),
  retrieve: (kbId: string, payload: Json) => send<Json>(`${V1}/knowledge-bases/${q(kbId)}/retrieve`, 'POST', payload),
};

/* ---------------------------------- skills --------------------------------- */

export const skills = {
  list: () => get<Json>(`${V1}/skills`),
  create: (payload: Json) => send<Json>(`${V1}/skills`, 'POST', payload),
  batch: (payload: Json) => send<Json>(`${V1}/skills/batch`, 'POST', payload),
  setEnabled: (name: string, enabled: boolean) => send<Json>(`${V1}/skills/by-name`, 'PATCH', { skill_name: name, enabled }),
  saveFileContent: (name: string, path: string, content: string) =>
    send<Json>(`${V1}/skills/file`, 'PUT', { skill_name: name, path, content }),
  setActive: (name: string, active: boolean) => send<Json>(`${V1}/skills/by-name`, 'PATCH', { skill_name: name, active }),
  skillFile: (name: string, path: string) => get<Json>(`${V1}/skills/file?skill_name=${q(name)}&path=${q(path)}`),
  remove: (name: string) => send<Json>(`${V1}/skills/by-name?skill_name=${q(name)}`, 'DELETE'),
  archive: (name: string) => get<Json>(`${V1}/skills/${q(name)}/archive`),
  files: (name: string) => get<Json>(`${V1}/skills/${q(name)}/files`),
  filesAt: (name: string, dirPath: string) =>
    get<Json>(`${V1}/skills/${q(name)}/files/${dirPath.split('/').map(q).join('/')}`),
  file: (name: string, filePath: string) =>
    get<Json>(`${V1}/skills/${q(name)}/files/${filePath.split('/').map(q).join('/')}`),
  saveFile: (name: string, filePath: string, payload: Json) =>
    send<Json>(`${V1}/skills/${q(name)}/files/${filePath.split('/').map(q).join('/')}`, 'PUT', payload),
  neo: {
    candidates: () => get<Json>(`${V1}/skills/neo/candidates`),
    releases: () => get<Json>(`${V1}/skills/neo/releases`),
    sync: () => send<Json>(`${V1}/skills/neo/sync`, 'POST', {}),
    evaluate: (payload: Json) => send<Json>(`${V1}/skills/neo/evaluate`, 'POST', payload),
    promote: (payload: Json) => send<Json>(`${V1}/skills/neo/promote`, 'POST', payload),
    rollback: (payload: Json) => send<Json>(`${V1}/skills/neo/rollback`, 'POST', payload),
  },
};

/* ----------------------------------- cron ---------------------------------- */

export const cron = {
  list: () => get<Json>(`${V1}/cron/jobs`),
  create: (payload: Json) => send<Json>(`${V1}/cron/jobs`, 'POST', payload),
  update: (jobId: string, payload: Json) => send<Json>(`${V1}/cron/jobs/${q(jobId)}`, 'PATCH', payload),
  remove: (jobId: string) => send<Json>(`${V1}/cron/jobs/${q(jobId)}`, 'DELETE'),
  run: (jobId: string) => send<Json>(`${V1}/cron/jobs/${q(jobId)}/run`, 'POST', {}),
};

/* --------------------------------- subagents -------------------------------- */

export const subagents = {
  config: () => get<Json>(`${V1}/subagents/config`),
  save: (payload: Json) => send<Json>(`${V1}/subagents/config`, 'PUT', payload),
  availableTools: () => get<Json>(`${V1}/subagents/available-tools`),
};

/* -------------------------- sessions (custom rules) ------------------------- */

export const rules = {
  list: (query?: string) => get<Json>(`${V1}/sessions/rules${query ? `?query=${q(query)}` : ''}`),
  activeUmos: () => get<Json>(`${V1}/sessions/active-umos`),
  sessions: () => get<Json>(`${V1}/sessions`),
  save: (payload: Json) => send<Json>(`${V1}/sessions/rules`, 'POST', payload),
  remove: (payload: Json) => send<Json>(`${V1}/sessions/rules/delete`, 'POST', payload),
  setProvider: (payload: Json) => send<Json>(`${V1}/sessions/provider`, 'PATCH', payload),
  setService: (payload: Json) => send<Json>(`${V1}/sessions/service`, 'PATCH', payload),
  groups: {
    list: () => get<Json>(`${V1}/session-groups`),
    create: (payload: Json) => send<Json>(`${V1}/session-groups`, 'POST', payload),
    update: (id: string, payload: Json) => send<Json>(`${V1}/session-groups/${q(id)}`, 'PUT', payload),
    remove: (id: string) => send<Json>(`${V1}/session-groups/${q(id)}`, 'DELETE'),
  },
};

/* ------------------------------- conversations ------------------------------ */

export const conversations = {
  list: (params: { page?: number; page_size?: number; platform?: string; type?: string; search?: string } = {}) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
    }
    const suffix = search.toString() ? `?${search.toString()}` : '';
    return get<Json>(`${V1}/conversations${suffix}`);
  },
  filterOptions: () => get<Json>(`${V1}/conversations/filter-options`),
  get: (cid: string) => get<Json>(`${V1}/conversations/${cid.split('/').map(q).join('/')}`),
  messages: (cid: string) => get<Json>(`${V1}/conversations/${cid.split('/').map(q).join('/')}/messages`),
  saveMessages: (cid: string, payload: Json) =>
    send<Json>(`${V1}/conversations/${cid.split('/').map(q).join('/')}/messages`, 'PUT', payload),
  rename: (cid: string, payload: Json) =>
    send<Json>(`${V1}/conversations/${cid.split('/').map(q).join('/')}`, 'PATCH', payload),
  remove: (cid: string) => send<Json>(`${V1}/conversations/${cid.split('/').map(q).join('/')}`, 'DELETE'),
  batchDelete: (refs: { user_id: string; cid: string }[]) => send<Json>(`${V1}/conversations/batch-delete`, 'POST', { conversations: refs }),
  renameByRef: (ref: { user_id: string; cid: string }, title: string) =>
    send<Json>(`${V1}/conversations/${ref.cid.split('/').map(q).join('/')}`, 'PATCH', { user_id: ref.user_id, title }),
  replaceMessagesByRef: (ref: { user_id: string; cid: string }, messages: unknown[]) =>
    send<Json>(`${V1}/conversations/${ref.cid.split('/').map(q).join('/')}/messages`, 'PUT', { user_id: ref.user_id, messages }),
  exportByRef: (refs: { user_id: string; cid: string }[]) => send<Json>(`${V1}/conversations/export`, 'POST', { conversations: refs }),
  removeByRef: (ref: { user_id: string; cid: string }) =>
    send<Json>(`${V1}/conversations/${ref.cid.split('/').map(q).join('/')}?user_id=${q(ref.user_id)}`, 'DELETE'),
  export: (cids: string[]) => send<Json>(`${V1}/conversations/export`, 'POST', { conversations: cids }),
};

/* ----------------------------------- stats --------------------------------- */

export const stats = {
  overview: () => get<Json>(`${V1}/stats`),
  providerTokens: (days = 1) => get<Json>(`${V1}/stats/provider-tokens?days=${days}`),
  version: () => get<Json>(`${V1}/stats/version`),
  versions: () => get<Json>(`${V1}/stats/versions`),
  startTime: () => get<Json>(`${V1}/stats/start-time`),
  storage: () => get<Json>(`${V1}/stats/storage`),
  cleanup: (payload: Json) => send<Json>(`${V1}/stats/storage/cleanup`, 'POST', payload),
  changelogs: () => get<Json>(`${V1}/changelogs`),
  changelog: (version: string) => get<Json>(`${V1}/changelogs/${q(version)}`),
  restart: () => send<Json>(`${V1}/system/restart`, 'POST', {}),
};

/* ------------------------------- tools and mcp ------------------------------ */

export const tools = {
  list: () => get<Json>(`${V1}/tools`),
  setEnabled: (toolId: string, enabled: boolean) =>
    send<Json>(`${V1}/tools/${toolId.split('/').map(q).join('/')}/enabled`, 'PATCH', { enabled }),
  setPermission: (toolId: string, payload: Json) =>
    send<Json>(`${V1}/tools/${toolId.split('/').map(q).join('/')}/permission`, 'PATCH', payload),
  mcp: {
    list: () => get<Json>(`${V1}/mcp/servers`),
    create: (payload: Json) => send<Json>(`${V1}/mcp/servers`, 'POST', payload),
    updateByName: (serverName: string, payload: Json) =>
      send<Json>(`${V1}/mcp/servers/by-name`, 'PUT', { server_name: serverName, ...payload }),
    removeByName: (serverName: string) => send<Json>(`${V1}/mcp/servers/by-name?server_name=${q(serverName)}`, 'DELETE'),
    setEnabledByName: (serverName: string, enabled: boolean) =>
      send<Json>(`${V1}/mcp/servers/enabled`, 'PATCH', { server_name: serverName, enabled }),
    testByName: (serverName: string) => send<Json>(`${V1}/mcp/servers/test`, 'POST', { server_name: serverName }),
    syncModelScope: () => send<Json>(`${V1}/mcp/providers/modelscope/sync`, 'POST', {}),
  },
};

/* ------------------------------- logs / trace ------------------------------- */

export const logs = {
  history: () => get<Json>(`${V1}/logs/history`),
  live: () => get<Json>(`${V1}/logs/live`),
  traceSettings: () => get<Json>(`${V1}/trace/settings`),
  saveTraceSettings: (payload: Json) => send<Json>(`${V1}/trace/settings`, 'PUT', payload),
  pipInstall: (payload: Json) => send<Json>(`${V1}/pip/install`, 'POST', payload),
};

/* --------------------------------- backups --------------------------------- */

export const backups = {
  list: (page = 1, pageSize = 20) => get<Json>(`${V1}/backups?page=${page}&page_size=${pageSize}`),
  create: (payload: Json) => send<Json>(`${V1}/backups`, 'POST', payload),
  task: (taskId: string) => get<Json>(`${V1}/backups/tasks/${q(taskId)}`),
  rename: (filename: string, newName: string) =>
    send<Json>(`${V1}/backups/${filename.split('/').map(q).join('/')}`, 'PATCH', { new_name: newName }),
  remove: (filename: string) => send<Json>(`${V1}/backups/${filename.split('/').map(q).join('/')}`, 'DELETE'),
  check: (filename: string) =>
    send<Json>(`${V1}/backups/${filename.split('/').map(q).join('/')}/check`, 'POST', {}),
  import: (filename: string) =>
    send<Json>(`${V1}/backups/${filename.split('/').map(q).join('/')}/import`, 'POST', { confirmed: true }),
  uploadChunk: (payload: Json) => send<Json>(`${V1}/backups/upload/chunk`, 'POST', payload),
  uploadInit: (payload: Json) => send<Json>(`${V1}/backups/upload/init`, 'POST', payload),
  uploadComplete: (payload: Json) => send<Json>(`${V1}/backups/upload/complete`, 'POST', payload),
  upload: (payload: Json) => send<Json>(`${V1}/backups/upload`, 'POST', payload),
};

/* --------------------------------- api keys -------------------------------- */

export const apiKeys = {
  list: () => get<Json>(`${V1}/api-keys`),
  create: (payload: Json) => send<Json>(`${V1}/api-keys`, 'POST', payload),
  revoke: (keyId: string) => send<Json>(`${V1}/api-keys/${q(keyId)}/revoke`, 'POST', {}),
  remove: (keyId: string) => send<Json>(`${V1}/api-keys/${q(keyId)}`, 'DELETE'),
};

/* --------------------------------- updates --------------------------------- */

export const updates = {
  check: () => get<Json>(`${V1}/updates/check`),
  releases: () => get<Json>(`${V1}/updates/releases`),
  progress: (taskId: string) => get<Json>(`${V1}/updates/progress/${q(taskId)}`),
  core: (payload: Json) => send<Json>(`${V1}/updates/core`, 'POST', payload),
  dashboard: (payload: Json) => send<Json>(`${V1}/updates/dashboard`, 'POST', payload),
};

/* ------------------------------ chat (ChatUI) ------------------------------- */

export const chat = {
  /** Chat-box sessions of the WebUI itself (usually empty). */
  sessionsList: () => get<Json>(`${V1}/chat/sessions`),
  newSession: () => get<Json>(`${V1}/chat/sessions/new`),
  session: (sessionId: string) => get<Json>(`${V1}/chat/sessions/${q(sessionId)}`),
  rename: (sessionId: string, displayName: string) =>
    send<Json>(`${V1}/chat/sessions/${q(sessionId)}`, 'PATCH', { display_name: displayName }),
  messages: (sessionId: string) => get<Json>(`${V1}/chat/sessions/${q(sessionId)}`),
  remove: (sessionId: string) => send<Json>(`${V1}/chat/sessions/${q(sessionId)}`, 'DELETE'),
  batchDelete: (ids: string[]) => send<Json>(`${V1}/chat/sessions/batch-delete`, 'POST', { session_ids: ids }),
  stop: (sessionId: string) => send<Json>(`${V1}/chat/sessions/${q(sessionId)}/stop`, 'POST', {}),
  editMessage: (sessionId: string, messageId: string, content: Json) =>
    send<Json>(`${V1}/chat/sessions/${q(sessionId)}/messages/${q(messageId)}`, 'PATCH', { content }),
  regenerateAsk: (sessionId: string, messageId: string, payload: Json = {}) =>
    send<Json>(`${V1}/chat/sessions/${q(sessionId)}/messages/${q(messageId)}/regenerate`, 'POST', payload),
  regenerate: (sessionId: string, messageId: string) =>
    send<Json>(`${V1}/chat/sessions/${q(sessionId)}/messages/${q(messageId)}/regenerate`, 'POST', {}),
  stream: (runId: string) => `${V1}/chat/runs/${q(runId)}/stream`,
  configs: () => get<Json>(`${V1}/chat/configs`),
  threads: {
    create: (payload: Json) => send<Json>(`${V1}/chat/threads`, 'POST', payload),
    get: (threadId: string) => get<Json>(`${V1}/chat/threads/${q(threadId)}`),
    remove: (threadId: string) => send<Json>(`${V1}/chat/threads/${q(threadId)}`, 'DELETE'),
    post: (threadId: string, payload: Json) => send<Json>(`${V1}/chat/threads/${q(threadId)}/messages`, 'POST', payload),
  },
  projects: {
    list: () => get<Json>(`${V1}/chat/projects`),
    create: (payload: Json) => send<Json>(`${V1}/chat/projects`, 'POST', payload),
    get: (projectId: string) => get<Json>(`${V1}/chat/projects/${q(projectId)}`),
    update: (projectId: string, payload: Json) => send<Json>(`${V1}/chat/projects/${q(projectId)}`, 'PATCH', payload),
    remove: (projectId: string) => send<Json>(`${V1}/chat/projects/${q(projectId)}`, 'DELETE'),
    sessions: (projectId: string) => get<Json>(`${V1}/chat/projects/${q(projectId)}/sessions`),
    files: (projectId: string) => get<Json>(`${V1}/chat/projects/${q(projectId)}/workspace/files`),
    file: (projectId: string, path: string) =>
      get<Json>(`${V1}/chat/projects/${q(projectId)}/workspace/file?path=${q(path)}`),
    fileUrl: (projectId: string, path: string) =>
      `${V1}/chat/projects/${q(projectId)}/workspace/file/download?path=${q(path)}`,
    attach: (projectId: string, sessionId: string) =>
      send<Json>(`${V1}/chat/projects/${q(projectId)}/sessions/${q(sessionId)}`, 'POST', {}),
    detach: (sessionId: string) => send<Json>(`${V1}/chat/projects/sessions/${q(sessionId)}`, 'DELETE'),
  },
};

/* -------------------------- commands / config profiles ---------------------- */

export const commands = {
  list: () => get<Json>(`${V1}/commands`),
  conflicts: () => get<Json>(`${V1}/commands/conflicts`),
  update: (commandId: string, payload: Json) =>
    send<Json>(`${V1}/commands/${commandId.split('/').map(q).join('/')}`, 'PATCH', payload),
};

export const configProfiles = {
  schema: () => get<Json>(`${V1}/config-profiles/schema`),
  list: () => get<Json>(`${V1}/config-profiles`),
  get: (configId: string) => get<Json>(`${V1}/config-profiles/${q(configId)}`),
  /* PUT saves the whole config body; PATCH only renames the profile. */
  /* PUT expects the config object itself as the body (no {config: ...} wrapper). */
  update: (configId: string, config: Json) => send<Json>(`${V1}/config-profiles/${q(configId)}`, 'PUT', config),
  rename: (configId: string, name: string) =>
    send<Json>(`${V1}/config-profiles/${q(configId)}`, 'PATCH', { name }),
  create: (payload: Json) => send<Json>('/api/config/abconf/new', 'POST', payload),
  remove: (configId: string) => send<Json>(`${V1}/config-profiles/${q(configId)}`, 'DELETE'),
  systemSchema: () => get<Json>(`${V1}/system-config/schema`),
  system: () => get<Json>(`${V1}/system-config`),
  runtime: () => get<Json>(`${V1}/system-config/runtime`),
  routes: () => get<Json>(`${V1}/config-routes`),
  saveRoutes: (payload: Json) => send<Json>(`${V1}/config-routes`, 'PUT', payload),
  setRoute: (umo: string, configId: string) => send<Json>(`${V1}/config-routes/${q(umo)}`, 'PUT', { config_id: configId }),
  upsertRoute: (umo: string, configId: string) => send<Json>(`${V1}/config-routes/${q(umo)}`, 'PUT', { config_id: configId }),
  replaceRoutes: (routes: Json) => send<Json>(`${V1}/config-routes`, 'PUT', routes),
  removeRoute: (umo: string) => send<Json>(`${V1}/config-routes/${q(umo)}`, 'DELETE'),
};

/** Everything a page needs, in one namespace. */
export const endpoints = {
  bots,
  providers,
  personas,
  knowledge,
  skills,
  cron,
  subagents,
  rules,
  conversations,
  stats,
  tools,
  logs,
  backups,
  apiKeys,
  updates,
  chat,
  commands,
  configProfiles,
};
