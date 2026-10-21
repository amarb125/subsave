/**
 * Validates the two public Supabase settings before a client is created.
 * Pure and dependency-free so it can be unit tested.
 */

export interface SupabaseConfigResult {
  ok: boolean;
  /** Human-readable reason shown on the setup screen when ok is false. */
  problem?: string;
}

function decodeJwtRole(token: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('utf8');
    const payload = JSON.parse(json) as { role?: unknown };
    return typeof payload.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

/** True if the key is a service-role / secret key, which must never ship in a browser bundle. */
export function looksLikeSecretKey(key: string): boolean {
  if (key.startsWith('sb_secret_')) return true;
  return decodeJwtRole(key) === 'service_role';
}

export function checkSupabaseConfig(url: string | undefined, anonKey: string | undefined): SupabaseConfigResult {
  const u = (url ?? '').trim();
  const k = (anonKey ?? '').trim();
  if (!u && !k) return { ok: false, problem: 'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are not set.' };
  if (!u) return { ok: false, problem: 'VITE_SUPABASE_URL is not set.' };
  if (!k) return { ok: false, problem: 'VITE_SUPABASE_ANON_KEY is not set.' };
  try {
    const parsed = new URL(u);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('protocol');
  } catch {
    return { ok: false, problem: 'VITE_SUPABASE_URL is not a valid URL (it should look like https://xxxx.supabase.co).' };
  }
  if (looksLikeSecretKey(k)) {
    return {
      ok: false,
      problem:
        'VITE_SUPABASE_ANON_KEY contains a service-role / secret key. Never put that in frontend code. Use the anon (publishable) key instead.',
    };
  }
  return { ok: true };
}
