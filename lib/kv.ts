// Safe KV wrapper: avoids build failures if @vercel/kv is not installed or configured.
let _kv: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  _kv = require("@vercel/kv").kv;
} catch (err) {
  console.warn("[KV] @vercel/kv not available:", (err && err.message) || err);
}

export const kv = _kv;

export async function kvGet<T = unknown>(key: string): Promise<T | null> {
  if (!_kv) return null;
  return _kv.get(key);
}

export async function kvSet(key: string, value: any, ttlSeconds?: number) {
  if (!_kv) return null;
  if (ttlSeconds && Number.isFinite(ttlSeconds)) {
    return _kv.set(key, value, { ex: Math.max(1, Math.floor(ttlSeconds)) });
  }
  return _kv.set(key, value);
}
