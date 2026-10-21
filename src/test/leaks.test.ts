import { describe, it, expect } from 'vitest';
import { detectLeaks, filterDismissed, findPossibleDuplicates, nameSimilarity, normaliseName } from '@/lib/leaks';
import { computeDueReminders } from '@/lib/reminders';
import { makeSub } from './fixtures';

const today = '2026-10-19';

describe('trial expiry detection', () => {
  it('flags trials ending within the window with the right urgency', () => {
    const subs = [
      makeSub({ id: 't0', name: 'T0', status: 'trial', trial_end_date: '2026-10-19' }),
      makeSub({ id: 't2', name: 'T2', status: 'trial', trial_end_date: '2026-10-21' }),
      makeSub({ id: 't6', name: 'T6', status: 'trial', trial_end_date: '2026-10-25' }),
      makeSub({ id: 't30', name: 'T30', status: 'trial', trial_end_date: '2026-11-18' }),
    ];
    const leaks = detectLeaks(subs, today).filter((l) => l.type === 'trial_ending');
    const byId = Object.fromEntries(leaks.map((l) => [l.subscriptionIds[0], l.severity]));
    expect(byId).toEqual({ t0: 'high', t2: 'high', t6: 'medium' });
  });
  it('flags a trial whose end date has passed but is still marked as a trial', () => {
    const leaks = detectLeaks([makeSub({ status: 'trial', trial_end_date: '2026-10-10' })], today);
    const trial = leaks.find((l) => l.type === 'trial_ending');
    expect(trial?.title).toContain('has passed');
    expect(trial?.severity).toBe('high');
  });
  it('ignores trial dates on subscriptions that are no longer trials', () => {
    const leaks = detectLeaks([makeSub({ status: 'active', trial_end_date: '2026-10-20' })], today);
    expect(leaks.filter((l) => l.type === 'trial_ending')).toHaveLength(0);
  });
});

describe('possible duplicates', () => {
  it('normalises names', () => {
    expect(normaliseName('Netflix Premium Plan')).toBe('netflix');
    expect(normaliseName('  Disney+ Hotstar ')).toBe('disney hotstar');
  });
  it('scores similar names high and different names low', () => {
    expect(nameSimilarity('Netflix', 'Netflix Premium')).toBeGreaterThan(0.8);
    expect(nameSimilarity('Spotify', 'Spotfy')).toBeGreaterThan(0.8);
    expect(nameSimilarity('Netflix', 'Gym membership')).toBeLessThan(0.5);
  });
  it('warns about possible duplicates and labels them as possible, never confirmed', () => {
    const a = makeSub({ id: 'a', name: 'Spotify' });
    const b = makeSub({ id: 'b', name: 'Spotify Family' });
    const c = makeSub({ id: 'c', name: 'Gym' });
    expect(findPossibleDuplicates([a, b, c])).toHaveLength(1);
    const leak = detectLeaks([a, b, c], today).find((l) => l.type === 'possible_duplicate');
    expect(leak).toBeTruthy();
    expect(leak?.title.startsWith('Possible duplicate')).toBe(true);
    expect(leak?.explanation).toContain('not a confirmed duplicate');
    expect(leak?.subscriptionIds.sort()).toEqual(['a', 'b']);
  });
  it('flags the same provider within a category', () => {
    const a = makeSub({ id: 'a', name: 'Prime Video', provider: 'Amazon', category: 'Entertainment' });
    const b = makeSub({ id: 'b', name: 'Prime Shipping', provider: 'Amazon', category: 'Entertainment' });
    expect(findPossibleDuplicates([a, b])).toHaveLength(1);
  });
  it('ignores cancelled and archived subscriptions', () => {
    const a = makeSub({ name: 'Netflix' });
    expect(findPossibleDuplicates([a, makeSub({ name: 'Netflix', status: 'cancelled' })])).toHaveLength(0);
    expect(findPossibleDuplicates([a, makeSub({ name: 'Netflix', archived: true })])).toHaveLength(0);
  });
});

describe('other leak types', () => {
  it('flags unused subscriptions with an estimate, not a claim', () => {
    const leak = detectLeaks([makeSub({ id: 'u', name: 'Gym', amount: 500, unused: true })], today)[0];
    expect(leak.type).toBe('unused');
    expect(leak.potentialAnnual).toBe(6000);
    expect(leak.explanation).toContain('estimate');
  });
  it('flags cancellation-planned subscriptions that are still active, and says when they renew', () => {
    const leak = detectLeaks(
      [makeSub({ name: 'News', status: 'cancellation_planned', next_renewal_date: '2026-10-22' })],
      today,
    ).find((l) => l.type === 'cancellation_planned_active');
    expect(leak?.severity).toBe('high');
    expect(leak?.explanation).toContain('in 3 days');
  });
  it('does not call an expensive subscription wasteful, and needs enough data', () => {
    const subs = [
      makeSub({ id: 'big', name: 'Big', amount: 5000 }),
      makeSub({ amount: 100 }),
      makeSub({ amount: 120 }),
    ];
    const leak = detectLeaks(subs, today).find((l) => l.type === 'high_cost');
    expect(leak?.severity).toBe('info');
    expect(leak?.explanation).toContain('not automatically wasteful');
    expect(detectLeaks(subs.slice(0, 2), today).some((l) => l.type === 'high_cost')).toBe(false);
  });
  it('flags several subscriptions in one category but not "Other"', () => {
    const music = [makeSub({ name: 'Spotify', category: 'Music' }), makeSub({ name: 'Gaana', category: 'Music' })];
    expect(detectLeaks(music, today).some((l) => l.type === 'same_category')).toBe(true);
    const other = [makeSub({ name: 'One', category: 'Other' }), makeSub({ name: 'Two', category: 'Other' })];
    expect(detectLeaks(other, today).some((l) => l.type === 'same_category')).toBe(false);
  });
  it('lets users dismiss a flag by key', () => {
    const leaks = detectLeaks([makeSub({ id: 'u', name: 'Gym', unused: true })], today);
    expect(filterDismissed(leaks, [])).toHaveLength(leaks.length);
    expect(filterDismissed(leaks, ['unused:u'])).toHaveLength(0);
  });
  it('re-raises a category flag when a new subscription joins the group', () => {
    const a = makeSub({ id: 'a', name: 'Spotify', category: 'Music' });
    const b = makeSub({ id: 'b', name: 'Gaana', category: 'Music' });
    const first = detectLeaks([a, b], today).find((l) => l.type === 'same_category')!;
    const second = detectLeaks([a, b, makeSub({ id: 'c', name: 'Wynk', category: 'Music' })], today).find(
      (l) => l.type === 'same_category',
    )!;
    expect(first.key).not.toBe(second.key);
  });
  it('sorts high severity first', () => {
    const subs = [
      makeSub({ name: 'A Music', category: 'Music' }),
      makeSub({ name: 'B Music', category: 'Music' }),
      makeSub({ name: 'Trial', status: 'trial', trial_end_date: '2026-10-20' }),
    ];
    expect(detectLeaks(subs, today)[0].severity).toBe('high');
  });
});

describe('in-app reminders', () => {
  it('creates a reminder once the chosen offset is reached', () => {
    const sub = makeSub({ id: 's', name: 'Netflix', next_renewal_date: '2026-10-25', reminder_days: [7, 1] });
    const due = computeDueReminders([sub], today);
    expect(due).toHaveLength(1);
    expect(due[0].daysBefore).toBe(7);
    expect(due[0].dedupe_key).toBe('s:renewal:2026-10-25:7');
  });
  it('creates nothing before the earliest offset', () => {
    const sub = makeSub({ next_renewal_date: '2026-11-15', reminder_days: [7, 1] });
    expect(computeDueReminders([sub], today)).toHaveLength(0);
  });
  it('uses the tightest reached offset so late openers are not spammed', () => {
    const sub = makeSub({ next_renewal_date: '2026-10-20', reminder_days: [7, 3, 1, 0] });
    const due = computeDueReminders([sub], today);
    expect(due).toHaveLength(1);
    expect(due[0].daysBefore).toBe(1);
  });
  it('respects per-subscription settings and status', () => {
    const base = { next_renewal_date: '2026-10-20' };
    expect(computeDueReminders([makeSub({ ...base, reminders_enabled: false })], today)).toHaveLength(0);
    expect(computeDueReminders([makeSub({ ...base, reminder_days: [] })], today)).toHaveLength(0);
    expect(computeDueReminders([makeSub({ ...base, status: 'cancelled' })], today)).toHaveLength(0);
    expect(computeDueReminders([makeSub({ ...base, status: 'paused' })], today)).toHaveLength(0);
    expect(computeDueReminders([makeSub({ ...base, archived: true })], today)).toHaveLength(0);
  });
  it('still reminds about planned cancellations and warns the user', () => {
    const due = computeDueReminders(
      [makeSub({ next_renewal_date: '2026-10-20', status: 'cancellation_planned' })],
      today,
    );
    expect(due[0].body).toContain('Cancel with the provider');
  });
  it('reminds about trial endings', () => {
    const due = computeDueReminders(
      [makeSub({ status: 'trial', trial_end_date: '2026-10-21', reminder_days: [3] })],
      today,
    );
    expect(due).toHaveLength(1);
    expect(due[0].kind).toBe('trial_end');
  });
});
