/**
 * Secret redaction helpers for read-only config previews.
 *
 * AstrBot configs happily contain tokens (ws_reverse_token, provider `key`
 * arrays, api keys, passwords). Mask them by default and let the user
 * explicitly reveal the raw values.
 */

/** Keys that merely mention tokens but hold numbers/limits, never credentials. */
const NOT_SECRET = /(max_context_tokens|max_input_tokens|max_output_tokens|max_tokens|min_tokens|token_usage|total_tokens|context_tokens|tokens_limit|token_limit|tokenizer)/i;

/** Field names that hold credentials. */
const SECRET_KEY = /(^key$|^keys$|^apikey$|token|passwd|password|secret|api[_-]?key|credential|private[_-]?key|access[_-]?key|auth[_-]?key|bearer|authorization)/i;

/** Values that look like credentials even under an innocent field name. */
const SECRET_VALUE = /^(sk-[\w-]{8,}|xai-[\w-]{10,}|eyJ[\w-]{10,}\.[\w-]+\.?[\w-]*|gh[pousr]_[\w]{10,}|AKIA[0-9A-Z]{12,}|Bearer\s+\S+)/i;

export const MASK = '••••••••';

const isSecretKey = (key: string) => !NOT_SECRET.test(key) && SECRET_KEY.test(key);
const isSecretValue = (value: unknown) => typeof value === 'string' && SECRET_VALUE.test(value);

/**
 * Values that look like flags/counters rather than credentials. AstrBot stores
 * e.g. password_change_required as the string "true", and masking that hides the
 * configuration state without protecting anything.
 */
const NON_SECRET_VALUE = /^(true|false|null|undefined|-?\d+(\.\d+)?)$/i;

export function maskSecret(value: string): string {
  if (!value) return value;
  if (NON_SECRET_VALUE.test(value.trim())) return value;
  if (value.length <= 4) return MASK;
  return `${value.slice(0, 2)}${MASK}${value.slice(-2)}`;
}

function maskAny(value: unknown): unknown {
  if (typeof value === 'string') return maskSecret(value);
  // Booleans and numbers under a secret-looking key (password_change_required,
  // token limits, ...) are flags, not credentials; masking them only hides the
  // configuration state from the admin.
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((item) => maskAny(item));
  return MASK;
}

/** Deep-clone `input`, masking anything that looks like a credential. */
export function redactSecrets<T>(input: T, depth = 0): T {
  if (depth > 8) return input;
  if (typeof input === 'string') {
    return (isSecretValue(input) ? maskSecret(input) : input) as unknown as T;
  }
  if (Array.isArray(input)) {
    return input.map((item) => redactSecrets(item, depth + 1)) as unknown as T;
  }
  if (input && typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      out[key] = isSecretKey(key) ? maskAny(value) : redactSecrets(value, depth + 1);
    }
    return out as T;
  }
  return input;
}

/** Convenience: pretty-printed redacted JSON. */
export function redactedJson(value: unknown, reveal = false): string {
  return JSON.stringify(reveal ? value : redactSecrets(value), null, 2);
}
