import { describe, it, expect } from 'vitest';
import { createDemoRepo, DEMO_STORAGE_KEY, type StorageLike } from '@/lib/repo/demoRepo';
import { formToDraft } from '@/lib/forms';
import { makeSub } from './fixtures';

function memoryStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const fixedNow = () => new Date(2026, 9, 19, 10, 0, 0);

describe('demo mode', () => {
  it('starts with clearly separate sample data and stores it only under the demo key', async () => {
    const storage = memoryStorage();
    const repo = createDemoRepo(storage, { now: fixedNow });
    const subs = await repo.listSubscriptions();
    expect(repo.kind).toBe('demo');
    expect(subs.length).toBeGreaterThan(5);
    expect(subs.every((s) => s.user_id === 'demo-user')).toBe(true);
    expect([...storage.data.keys()]).toEqual([DEMO_STORAGE_KEY]);
  });

  it('never touches data stored by anything else (no mixing with real records)', async () => {
    const storage = memoryStorage();
    storage.setItem('sb-project-auth-token', 'real-session');
    storage.setItem('subsave:real-cache', 'real-data');
    const repo = createDemoRepo(storage, { now: fixedNow });
    await repo.createSubscription(formToDraft({ ...base(), name: 'Demo only' }));
    await repo.deleteAllData();
    expect(storage.getItem('sb-project-auth-token')).toBe('real-session');
    expect(storage.getItem('subsave:real-cache')).toBe('real-data');
  });

  it('two demo repos with different keys do not share records', async () => {
    const storage = memoryStorage();
    const a = createDemoRepo(storage, { key: 'k:a', now: fixedNow });
    const b = createDemoRepo(storage, { key: 'k:b', now: fixedNow });
    await a.deleteAllData();
    expect((await a.listSubscriptions()).length).toBe(0);
    expect((await b.listSubscriptions()).length).toBeGreaterThan(5);
  });

  it('persists changes across repo instances (page reloads)', async () => {
    const storage = memoryStorage();
    const first = createDemoRepo(storage, { now: fixedNow });
    const created = await first.createSubscription(formToDraft({ ...base(), name: 'Persist me' }));
    const second = createDemoRepo(storage, { now: fixedNow });
    expect((await second.listSubscriptions()).some((s) => s.id === created.id)).toBe(true);
  });

  it('recovers from corrupted storage', async () => {
    const storage = memoryStorage();
    storage.setItem(DEMO_STORAGE_KEY, '{not json');
    const repo = createDemoRepo(storage, { now: fixedNow });
    expect((await repo.listSubscriptions()).length).toBeGreaterThan(5);
  });

  it('cancellation flow: planned stays active, confirmed becomes cancelled, history is recorded', async () => {
    const repo = createDemoRepo(memoryStorage(), { now: fixedNow });
    const created = await repo.createSubscription(formToDraft({ ...base(), name: 'Flow' }));
    const planned = await repo.changeStatus(created.id, 'cancellation_planned');
    expect(planned.status).toBe('cancellation_planned');
    expect(planned.cancelled_at).toBeNull();
    const cancelled = await repo.changeStatus(created.id, 'cancelled');
    expect(cancelled.cancelled_at).toBeTruthy();
    const history = await repo.listHistory(created.id);
    expect(history.map((h) => h.to_status).sort()).toEqual(['active', 'cancellation_planned', 'cancelled']);
  });

  it('editing through the full form records a status change too', async () => {
    const repo = createDemoRepo(memoryStorage(), { now: fixedNow });
    const created = await repo.createSubscription(formToDraft({ ...base(), name: 'Edit' }));
    const updated = await repo.updateSubscription(created.id, formToDraft({ ...base(), name: 'Edit', status: 'paused' }, created));
    expect(updated.status).toBe('paused');
    expect((await repo.listHistory(created.id)).length).toBe(2);
  });

  it('archive and unused flags are saved without changing status', async () => {
    const repo = createDemoRepo(memoryStorage(), { now: fixedNow });
    const created = await repo.createSubscription(formToDraft({ ...base(), name: 'Flags' }));
    const patched = await repo.patchSubscription(created.id, { archived: true, unused: true });
    expect(patched.archived).toBe(true);
    expect(patched.unused).toBe(true);
    expect(patched.status).toBe('active');
  });

  it('deleting a subscription removes its history and notifications', async () => {
    const repo = createDemoRepo(memoryStorage(), { now: fixedNow });
    const created = await repo.createSubscription(formToDraft({ ...base(), name: 'Gone' }));
    await repo.createNotifications([{ subscription_id: created.id, kind: 'renewal', title: 't', body: 'b', dedupe_key: 'x' }]);
    await repo.deleteSubscription(created.id);
    expect((await repo.listHistory(created.id)).length).toBe(0);
    expect((await repo.listNotifications()).some((n) => n.subscription_id === created.id)).toBe(false);
  });

  it('creates each reminder only once', async () => {
    const repo = createDemoRepo(memoryStorage(), { now: fixedNow });
    const draft = { subscription_id: null, kind: 'system' as const, title: 'Hi', body: '', dedupe_key: 'once' };
    expect((await repo.createNotifications([draft])).length).toBe(1);
    expect((await repo.createNotifications([draft])).length).toBe(0);
    expect((await repo.listNotifications()).length).toBe(1);
  });

  it('marks notifications read', async () => {
    const repo = createDemoRepo(memoryStorage(), { now: fixedNow });
    await repo.createNotifications([
      { subscription_id: null, kind: 'system', title: 'A', body: '', dedupe_key: 'a' },
      { subscription_id: null, kind: 'system', title: 'B', body: '', dedupe_key: 'b' },
    ]);
    const [first] = await repo.listNotifications();
    await repo.markNotificationsRead([first.id]);
    expect((await repo.listNotifications()).filter((n) => n.read_at === null)).toHaveLength(1);
    await repo.markNotificationsRead('all');
    expect((await repo.listNotifications()).filter((n) => n.read_at === null)).toHaveLength(0);
  });

  it('saves settings and resets everything on deleteAllData / reset', async () => {
    const repo = createDemoRepo(memoryStorage(), { now: fixedNow });
    await repo.saveSettings({ dismissed_leak_flags: ['unused:1'], default_reminder_days: [3] });
    expect((await repo.getSettings()).dismissed_leak_flags).toEqual(['unused:1']);
    await repo.deleteAllData();
    expect((await repo.listSubscriptions()).length).toBe(0);
    expect((await repo.getSettings()).dismissed_leak_flags).toEqual([]);
    repo.reset();
    expect((await repo.listSubscriptions()).length).toBeGreaterThan(5);
  });

  it('rejects operations on unknown ids with a friendly error', async () => {
    const repo = createDemoRepo(memoryStorage(), { now: fixedNow });
    let message = '';
    try { await repo.changeStatus('nope', 'paused'); } catch (e) { message = (e as Error).message; }
    expect(message).toContain('no longer exists');
  });

  it('sample data produces every kind of leak so the demo is meaningful', async () => {
    const { detectLeaks } = await import('@/lib/leaks');
    const repo = createDemoRepo(memoryStorage(), { now: fixedNow });
    const types = new Set(detectLeaks(await repo.listSubscriptions(), '2026-10-19').map((l) => l.type));
    for (const t of ['unused', 'trial_ending', 'possible_duplicate', 'cancellation_planned_active', 'same_category']) {
      expect(types.has(t as never)).toBe(true);
    }
  });
});

function base() {
  const sub = makeSub();
  return {
    name: sub.name, provider: '', category: sub.category, amount: 100, currency: 'INR' as const, frequency: 'monthly' as const,
    custom_interval_days: null, start_date: '2026-01-01', next_renewal_date: '2026-11-01', payment_method: 'UPI' as const,
    notes: '', trial_end_date: '', status: 'active' as const, cancellation_url: '', reminders_enabled: true, reminder_days: [7, 1],
  };
}
