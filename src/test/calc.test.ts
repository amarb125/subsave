import { describe, it, expect } from 'vitest';
import {
  annualCost, categoryBreakdown, DAYS_PER_YEAR, formatMoney, monthlyEquivalent, otherCurrencyCount,
  potentialSavings, projectedSpend, totalsFor, upcomingRenewals,
} from '@/lib/calc';
import { makeSub } from './fixtures';

describe('monthly and annual cost', () => {
  it('normalises each billing frequency', () => {
    expect(monthlyEquivalent({ amount: 100, frequency: 'weekly', custom_interval_days: null })).toBeCloseTo((100 * 52) / 12, 6);
    expect(monthlyEquivalent({ amount: 100, frequency: 'monthly', custom_interval_days: null })).toBe(100);
    expect(monthlyEquivalent({ amount: 300, frequency: 'quarterly', custom_interval_days: null })).toBe(100);
    expect(monthlyEquivalent({ amount: 600, frequency: 'half_yearly', custom_interval_days: null })).toBe(100);
    expect(monthlyEquivalent({ amount: 1200, frequency: 'yearly', custom_interval_days: null })).toBe(100);
  });

  it('annual cost uses the right multiplier', () => {
    expect(annualCost({ amount: 100, frequency: 'weekly', custom_interval_days: null })).toBe(5200);
    expect(annualCost({ amount: 100, frequency: 'monthly', custom_interval_days: null })).toBe(1200);
    expect(annualCost({ amount: 300, frequency: 'quarterly', custom_interval_days: null })).toBe(1200);
    expect(annualCost({ amount: 600, frequency: 'half_yearly', custom_interval_days: null })).toBe(1200);
    expect(annualCost({ amount: 1200, frequency: 'yearly', custom_interval_days: null })).toBe(1200);
  });

  it('annual cost is always 12x the monthly equivalent', () => {
    for (const frequency of ['weekly', 'monthly', 'quarterly', 'half_yearly', 'yearly'] as const) {
      const c = { amount: 249.5, frequency, custom_interval_days: null };
      expect(annualCost(c)).toBeCloseTo(monthlyEquivalent(c) * 12, 6);
    }
  });

  it('handles custom billing intervals using the average year length (leap years included)', () => {
    const c = { amount: 100, frequency: 'custom' as const, custom_interval_days: 30 };
    expect(annualCost(c)).toBeCloseTo((100 * DAYS_PER_YEAR) / 30, 6);
    expect(monthlyEquivalent(c)).toBeCloseTo(annualCost(c) / 12, 6);
    // A 365-day custom interval is roughly one payment a year, a little under due to leap years.
    const yearlyish = { amount: 1000, frequency: 'custom' as const, custom_interval_days: 365 };
    expect(annualCost(yearlyish)).toBeCloseTo(1000 * (DAYS_PER_YEAR / 365), 6);
  });

  it('treats a missing or invalid custom interval as zero rather than NaN or Infinity', () => {
    for (const days of [null, 0, -5, NaN]) {
      const c = { amount: 100, frequency: 'custom' as const, custom_interval_days: days as number | null };
      expect(annualCost(c)).toBe(0);
      expect(monthlyEquivalent(c)).toBe(0);
    }
  });

  it('handles zero, negative and non-finite amounts', () => {
    expect(monthlyEquivalent({ amount: 0, frequency: 'monthly', custom_interval_days: null })).toBe(0);
    expect(annualCost({ amount: 0, frequency: 'yearly', custom_interval_days: null })).toBe(0);
    expect(annualCost({ amount: -50, frequency: 'monthly', custom_interval_days: null })).toBe(0);
    expect(annualCost({ amount: NaN, frequency: 'monthly', custom_interval_days: null })).toBe(0);
  });
});

describe('formatMoney', () => {
  it('formats INR with Indian digit grouping', () => {
    expect(formatMoney(1199)).toBe('₹1,199');
    expect(formatMoney(123456.5)).toBe('₹1,23,456.50');
    expect(formatMoney(0)).toBe('₹0');
  });
  it('rounds to paise', () => {
    expect(formatMoney(99.999)).toBe('₹100');
  });
  it('returns a dash for non-finite values and falls back for unknown currencies', () => {
    expect(formatMoney(NaN)).toBe('—');
    expect(formatMoney(10, 'NOTACURRENCY')).toContain('10.00');
  });
});

describe('totals and savings', () => {
  const netflix = makeSub({ id: 'n', name: 'Netflix', amount: 649 });
  const gym = makeSub({ id: 'g', name: 'Gym', amount: 3000, frequency: 'quarterly', unused: true });
  const planned = makeSub({ id: 'p', name: 'News', amount: 200, status: 'cancellation_planned' });
  const unusedAndPlanned = makeSub({ id: 'up', name: 'Both', amount: 100, status: 'cancellation_planned', unused: true });
  const trial = makeSub({ id: 't', name: 'Trial', amount: 999, status: 'trial', trial_end_date: '2026-11-05' });
  const paused = makeSub({ id: 'pa', name: 'Paused', amount: 500, status: 'paused' });
  const cancelled = makeSub({ id: 'c', name: 'Cancelled', amount: 800, status: 'cancelled' });
  const archived = makeSub({ id: 'a', name: 'Archived', amount: 700, archived: true });
  const usd = makeSub({ id: 'u', name: 'Dollar', amount: 10, currency: 'USD' });
  const all = [netflix, gym, planned, unusedAndPlanned, trial, paused, cancelled, archived, usd];

  it('counts only active and cancellation-planned subscriptions as spend', () => {
    const t = totalsFor(all, 'INR');
    expect(t.count).toBe(4);
    expect(t.monthly).toBeCloseTo(649 + 1000 + 200 + 100, 6);
    expect(t.annual).toBeCloseTo(t.monthly * 12, 6);
  });

  it('never counts a planned cancellation as cancelled until the status is cancelled', () => {
    const before = totalsFor([planned], 'INR');
    expect(before.monthly).toBe(200);
    const after = totalsFor([{ ...planned, status: 'cancelled' }], 'INR');
    expect(after.monthly).toBe(0);
  });

  it('does not mix currencies', () => {
    expect(totalsFor(all, 'USD').monthly).toBe(10);
    expect(otherCurrencyCount(all, 'INR')).toBe(1);
  });

  it('potential savings is an estimate that counts each subscription once', () => {
    const s = potentialSavings(all, 'INR');
    expect(s.ids.sort()).toEqual(['g', 'p', 'up'].sort());
    expect(s.monthly).toBeCloseTo(1000 + 200 + 100, 6);
    expect(s.annual).toBeCloseTo(s.monthly * 12, 6);
  });

  it('excludes cancelled, paused, trial and archived items from potential savings', () => {
    const s = potentialSavings(
      [
        { ...cancelled, unused: true },
        { ...paused, unused: true },
        { ...trial, unused: true },
        { ...archived, unused: true },
      ],
      'INR',
    );
    expect(s.ids).toHaveLength(0);
    expect(s.annual).toBe(0);
  });

  it('breaks spend down by category, largest first', () => {
    const rows = categoryBreakdown(
      [
        makeSub({ category: 'Music', amount: 100 }),
        makeSub({ category: 'Fitness', amount: 500 }),
        makeSub({ category: 'Music', amount: 50 }),
      ],
      'INR',
    );
    expect(rows[0].category).toBe('Fitness');
    expect(rows[1].category).toBe('Music');
    expect(rows[1].monthly).toBe(150);
    expect(rows[1].count).toBe(2);
  });
});

describe('upcoming renewals and projection', () => {
  const today = '2026-10-19';

  it('lists renewals within the window, soonest first, and skips cancelled or paused', () => {
    const subs = [
      makeSub({ id: 'later', name: 'Later', next_renewal_date: '2026-10-26' }),
      makeSub({ id: 'soon', name: 'Soon', next_renewal_date: '2026-10-20' }),
      makeSub({ id: 'far', name: 'Far', next_renewal_date: '2026-12-01' }),
      makeSub({ id: 'dead', name: 'Dead', next_renewal_date: '2026-10-21', status: 'cancelled' }),
      makeSub({ id: 'pause', name: 'Paused', next_renewal_date: '2026-10-21', status: 'paused' }),
    ];
    const ids = upcomingRenewals(subs, today, 7).map((r) => r.sub.id);
    expect(ids).toEqual(['soon', 'later']);
  });

  it('rolls a stale renewal date forward instead of showing a past date', () => {
    const sub = makeSub({ next_renewal_date: '2026-08-15' });
    const [r] = upcomingRenewals([sub], today, 60);
    expect(r.date).toBe('2026-11-15');
  });

  it('projects real charges by month: a yearly plan appears only in its month', () => {
    const subs = [
      makeSub({ amount: 100, next_renewal_date: '2026-10-25' }),
      makeSub({ amount: 1200, frequency: 'yearly', next_renewal_date: '2027-01-10' }),
    ];
    const months = projectedSpend(subs, 'INR', today, 6);
    expect(months.map((m) => m.month)).toEqual(['2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03']);
    expect(months.map((m) => m.amount)).toEqual([100, 100, 100, 1300, 100, 100]);
  });

  it('does not project charges that already happened earlier this month', () => {
    const months = projectedSpend([makeSub({ amount: 100, next_renewal_date: '2026-10-05' })], 'INR', today, 2);
    expect(months[0].amount).toBe(0);
    expect(months[1].amount).toBe(100);
  });
});
