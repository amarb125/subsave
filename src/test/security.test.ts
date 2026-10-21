import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '../..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
const migrations = fs
  .readdirSync(path.join(root, 'supabase/migrations'))
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => read(`supabase/migrations/${f}`))
  .join('\n');
const sql = migrations.replace(/--.*$/gm, '').toLowerCase();
// Same SQL with runs of whitespace collapsed, for checks that must not depend on column alignment.
const flat = sql.replace(/\s+/g, ' ');

const USER_TABLES = ['profiles', 'user_settings', 'subscriptions', 'reminder_preferences', 'notifications', 'subscription_status_history'];

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

describe('database security assumptions (static checks of the SQL migrations)', () => {
  it('every user-owned table exists and has Row Level Security enabled', () => {
    for (const t of USER_TABLES) {
      expect(sql).toContain(`create table public.${t}`);
      expect(flat).toContain(`alter table public.${t} enable row level security`);
    }
  });
  it('every table has at least one policy bound to the signed-in user', () => {
    for (const t of USER_TABLES) {
      const policies = [...sql.matchAll(new RegExp(`create policy \\w+ on public\\.${t}\\b[^;]*;`, 'g'))].map((m) => m[0]);
      expect(policies.length).toBeGreaterThan(0);
      for (const p of policies) expect(p).toContain('auth.uid()');
    }
  });
  it('no policy is open to everyone', () => {
    expect(sql).not.toMatch(/using\s*\(\s*true\s*\)/);
    expect(sql).not.toMatch(/with check\s*\(\s*true\s*\)/);
    expect(sql).not.toMatch(/to\s+(public|anon)\b[^;]*create policy/);
    expect(sql).not.toMatch(/create policy[^;]*\bto\s+(public|anon)\b/);
  });
  it('signed-out users are explicitly stripped of table privileges', () => {
    expect(sql).toContain('from anon');
    expect(sql).not.toMatch(/grant [^;]* to anon/);
  });
  it('status history is read-only for clients', () => {
    expect(flat).toMatch(/grant select on public\.subscription_status_history to authenticated/);
    expect(sql).not.toMatch(/create policy \w+ on public\.subscription_status_history\s+for (insert|update|delete)/);
  });
  it('child rows are tied to the same user as their subscription (composite foreign keys)', () => {
    expect(sql).toContain('foreign key (subscription_id, user_id) references public.subscriptions (id, user_id)');
  });
  it('security-definer functions pin their search_path', () => {
    const defs = [...sql.matchAll(/create function[^$]*?security definer[\s\S]*?\$\$/g)].map((m) => m[0]);
    expect(defs.length).toBeGreaterThan(0);
    for (const d of defs) expect(d).toContain("set search_path = ''");
  });
  it('cancellation_planned never sets cancelled_at in the database guard', () => {
    expect(sql).toContain("new.status = 'cancelled'");
  });
  it('stores payment method labels only: no column that could hold card or bank secrets', () => {
    const forbidden = ['card_number', 'cardnumber', 'cvv', 'cvc', 'upi_pin', 'pin', 'password', 'account_number', 'ifsc', 'expiry', 'card_token'];
    const columns = [...sql.matchAll(/^\s{2}(\w+)\s+(?:uuid|text|numeric|integer|boolean|date|jsonb|timestamptz|smallint\[\]|text\[\])/gm)].map((m) => m[1]);
    expect(columns.length).toBeGreaterThan(30);
    for (const f of forbidden) expect(columns.includes(f)).toBe(false);
    expect(sql).toContain("'upi', 'credit card', 'debit card', 'net banking', 'wallet', 'other'");
  });
});

describe('frontend secrets hygiene', () => {
  const sources = walk(path.join(root, 'src')).filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f));

  it('never references a service-role key in application code', () => {
    for (const file of sources) {
      const text = fs.readFileSync(file, 'utf8');
      // The config guard is the one place that mentions it, to refuse it.
      if (file.endsWith('supabaseConfig.ts')) continue;
      expect(/service[_-]?role|SERVICE_ROLE|sb_secret/.test(text)).toBe(false);
    }
  });
  it('only exposes the URL and anon key through VITE_ variables', () => {
    const env = read('.env.example');
    const keys = [...env.matchAll(/^([A-Z0-9_]+)=/gm)].map((m) => m[1]);
    expect(keys.sort()).toEqual(['VITE_SUPABASE_ANON_KEY', 'VITE_SUPABASE_URL']);
    expect(read('.env.example')).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/);
  });
  it('does not log payment or credential details', () => {
    for (const file of sources) {
      const text = fs.readFileSync(file, 'utf8');
      const logs = text.match(/console\.(log|info|debug)\([^)]*\)/g) ?? [];
      for (const l of logs) expect(/password|payment|token|key/i.test(l)).toBe(false);
    }
  });
  it('does not use dangerouslySetInnerHTML or eval', () => {
    for (const file of sources) {
      const text = fs.readFileSync(file, 'utf8');
      expect(text.includes('dangerouslySetInnerHTML')).toBe(false);
      expect(/\beval\(|new Function\(/.test(text)).toBe(false);
    }
  });
  it('the real .env files are git-ignored', () => {
    const ignore = read('.gitignore');
    expect(ignore).toContain('.env');
    expect(ignore).toContain('.env.local');
  });
});
