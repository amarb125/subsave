import { describe, it, expect } from 'vitest';
import { checkSupabaseConfig, looksLikeSecretKey } from '@/lib/supabaseConfig';

const jwt = (role: string) => {
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${enc({ alg: 'HS256', typ: 'JWT' })}.${enc({ role })}.signature`;
};

describe('Supabase configuration guard', () => {
  it('reports missing values instead of silently running', () => {
    expect(checkSupabaseConfig(undefined, undefined).ok).toBe(false);
    expect(checkSupabaseConfig('', 'k').problem).toContain('VITE_SUPABASE_URL');
    expect(checkSupabaseConfig('https://x.supabase.co', '').problem).toContain('VITE_SUPABASE_ANON_KEY');
  });
  it('rejects malformed URLs', () => {
    expect(checkSupabaseConfig('not a url', jwt('anon')).ok).toBe(false);
    expect(checkSupabaseConfig('ftp://x.supabase.co', jwt('anon')).ok).toBe(false);
  });
  it('accepts an anon key and a project URL', () => {
    expect(checkSupabaseConfig('https://abc.supabase.co', jwt('anon')).ok).toBe(true);
    expect(checkSupabaseConfig('https://abc.supabase.co', 'sb_publishable_abc123').ok).toBe(true);
  });
  it('refuses to run with a service-role key in the frontend', () => {
    expect(looksLikeSecretKey(jwt('service_role'))).toBe(true);
    expect(looksLikeSecretKey('sb_secret_abc')).toBe(true);
    expect(looksLikeSecretKey(jwt('anon'))).toBe(false);
    const r = checkSupabaseConfig('https://abc.supabase.co', jwt('service_role'));
    expect(r.ok).toBe(false);
    expect(r.problem).toContain('service-role');
  });
});
