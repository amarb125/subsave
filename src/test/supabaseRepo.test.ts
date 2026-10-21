import { describe, it, expect } from 'vitest';
import { createSupabaseRepo } from '@/lib/repo/supabaseRepo';
import { toRepoError } from '@/lib/repo/types';
import { formToDraft } from '@/lib/forms';

type Op = [string, ...unknown[]];
interface Call { table: string; ops: Op[] }

const ROW = {
  id: 's1', user_id: 'user-A', name: 'Netflix', provider: null, category: 'Entertainment', amount: '649.00', currency: 'INR',
  frequency: 'monthly', custom_interval_days: null, start_date: '2026-01-01', next_renewal_date: '2026-11-01',
  payment_method: 'UPI', notes: null, trial_end_date: null, status: 'active', archived: false, unused: false,
  cancellation_url: null, cancellation_checklist: [], cancelled_at: null, created_at: 'x', updated_at: 'x',
};

/** A fake Supabase client that records every query so we can check how each one is scoped. */
function fakeClient(dataFor: (table: string, ops: Op[]) => unknown = () => []) {
  const calls: Call[] = [];
  const client = {
    from(table: string) {
      const call: Call = { table, ops: [] };
      calls.push(call);
      const proxy: any = new Proxy(function () {}, {
        get(_t, prop) {
          if (prop === 'then') return (resolve: (v: unknown) => void) => resolve({ data: dataFor(table, call.ops), error: null });
          return (...args: unknown[]) => { call.ops.push([String(prop), ...args]); return proxy; };
        },
      });
      return proxy;
    },
  };
  return { client: client as any, calls };
}

const scopedTo = (call: Call, uid: string) => call.ops.some((o) => o[0] === 'eq' && o[1] === 'user_id' && o[2] === uid);
const op = (call: Call, name: string) => call.ops.some((o) => o[0] === name);

const draft = formToDraft({
  name: 'Netflix', provider: '', category: 'Entertainment', amount: 649, currency: 'INR', frequency: 'monthly',
  custom_interval_days: null, start_date: '2026-01-01', next_renewal_date: '2026-11-01', payment_method: 'UPI', notes: '',
  trial_end_date: '', status: 'active', cancellation_url: '', reminders_enabled: true, reminder_days: [7, 1],
});

/** Rows for queries ending in .single()/.maybeSingle(), arrays for everything else. */
const respond = (table: string, ops: Op[]): unknown => {
  const one = ops.some((o) => o[0] === 'single' || o[0] === 'maybeSingle');
  if (table === 'subscriptions') return one ? ROW : [ROW];
  if (table === 'user_settings') return one ? { user_id: 'user-A' } : [];
  return one ? null : [];
};

describe('Supabase repository scoping (defence in depth on top of RLS)', () => {
  it('every read, update and delete is filtered by the signed-in user id', async () => {
    const { client, calls } = fakeClient(respond);
    const repo = createSupabaseRepo(client, 'user-A');
    await repo.listSubscriptions();
    await repo.updateSubscription('s1', draft);
    await repo.patchSubscription('s1', { unused: true });
    await repo.changeStatus('s1', 'paused');
    await repo.deleteSubscription('s1');
    await repo.listHistory('s1');
    await repo.listNotifications();
    await repo.markNotificationsRead('all');
    await repo.getSettings();
    await repo.deleteAllData();
    const scoped = calls.filter((c) => op(c, 'select') || op(c, 'update') || op(c, 'delete') || op(c, 'upsert') && !op(c, 'insert'));
    expect(scoped.length).toBeGreaterThan(10);
    const unscoped = scoped.filter((c) => {
      if (op(c, 'upsert')) return !c.ops.some((o) => o[0] === 'upsert' && JSON.stringify(o[1]).includes('user-A'));
      return !scopedTo(c, 'user-A');
    });
    expect(unscoped.map((c) => c.table + ':' + c.ops.map((o) => o[0]).join('.'))).toEqual([]);
  });

  it('writes always stamp the signed-in user and never trust a user_id from the draft', async () => {
    const { client, calls } = fakeClient(respond);
    const repo = createSupabaseRepo(client, 'user-A');
    await repo.createSubscription({ ...draft, user_id: 'user-EVIL' } as any);
    const insert = calls.find((c) => c.table === 'subscriptions' && op(c, 'insert'))!;
    const payload = insert.ops.find((o) => o[0] === 'insert')![1] as Record<string, unknown>;
    expect(payload.user_id).toBe('user-A');
    const prefs = calls.find((c) => c.table === 'reminder_preferences' && op(c, 'upsert'))!;
    expect((prefs.ops.find((o) => o[0] === 'upsert')![1] as Record<string, unknown>).user_id).toBe('user-A');
  });

  it('never sends reminder fields to the subscriptions table', async () => {
    const { client, calls } = fakeClient(respond);
    await createSupabaseRepo(client, 'user-A').createSubscription(draft);
    const insert = calls.find((c) => c.table === 'subscriptions' && op(c, 'insert'))!;
    const payload = insert.ops.find((o) => o[0] === 'insert')![1] as Record<string, unknown>;
    expect('reminder_days' in payload).toBe(false);
    expect('reminders_enabled' in payload).toBe(false);
  });

  it('merges reminder preferences into subscriptions and converts numeric strings', async () => {
    const { client } = fakeClient((t) =>
      t === 'subscriptions' ? [ROW] : [{ subscription_id: 's1', enabled: false, days_before: [3, 0] }],
    );
    const [sub] = await createSupabaseRepo(client, 'user-A').listSubscriptions();
    expect(sub.amount).toBe(649);
    expect(sub.reminders_enabled).toBe(false);
    expect(sub.reminder_days).toEqual([3, 0]);
  });
});

describe('error mapping', () => {
  it('detects expired sessions', () => {
    expect(toRepoError({ status: 401, message: 'x' }).authExpired).toBe(true);
    expect(toRepoError({ message: 'JWT expired' }).authExpired).toBe(true);
    expect(toRepoError({ code: 'PGRST301', message: 'x' }).authExpired).toBe(true);
  });
  it('detects network failures and hides raw internals', () => {
    const e = toRepoError(new TypeError('Failed to fetch'));
    expect(e.network).toBe(true);
    expect(e.message).toContain('internet');
    expect(toRepoError({ code: '99999', message: 'relation "x" does not exist at /db/secret' }).message).not.toContain('secret');
  });
  it('maps permission and validation errors to friendly text', () => {
    expect(toRepoError({ code: '42501', message: 'new row violates row-level security policy' }).message).toContain('permission');
    expect(toRepoError({ code: '23514', message: 'violates check constraint' }).message).toContain('check the form');
  });
});
