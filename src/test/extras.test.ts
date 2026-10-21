import { describe, it, expect } from 'vitest';
import { confirmedSavings, potentialSavings } from '@/lib/calc';
import { cycleLabel } from '@/lib/labels';
import { findPossibleDuplicatesOf } from '@/lib/leaks';
import { makeSub } from './fixtures';

describe('confirmed savings vs. potential savings', () => {
  it('counts only subscriptions the user set to Cancelled as confirmed', () => {
    const subs = [
      makeSub({ amount: 100, status: 'cancelled' }),
      makeSub({ amount: 200, status: 'cancellation_planned' }),
      makeSub({ amount: 300, unused: true }),
    ];
    const confirmed = confirmedSavings(subs, 'INR');
    expect(confirmed.ids).toHaveLength(1);
    expect(confirmed.monthly).toBe(100);
    expect(confirmed.annual).toBe(1200);
    // Planned and unused items are only estimates:
    expect(potentialSavings(subs, 'INR').annual).toBe(200 * 12 + 300 * 12);
  });
  it('does not mix currencies', () => {
    const subs = [makeSub({ amount: 10, currency: 'USD', status: 'cancelled' })];
    expect(confirmedSavings(subs, 'INR').annual).toBe(0);
    expect(confirmedSavings(subs, 'USD').annual).toBe(120);
  });
});

describe('duplicate warning while adding', () => {
  const existing = [
    makeSub({ id: 'a', name: 'Spotify', provider: 'Spotify', category: 'Music' }),
    makeSub({ id: 'b', name: 'Netflix', category: 'Entertainment' }),
    makeSub({ id: 'c', name: 'Old gym', category: 'Fitness', status: 'cancelled' }),
  ];
  it('warns about a similar name', () => {
    expect(findPossibleDuplicatesOf({ name: 'Spotify Premium', category: 'Music' }, existing).map((s) => s.id)).toEqual(['a']);
  });
  it('warns about the same provider and category', () => {
    expect(findPossibleDuplicatesOf({ name: 'Podcast plan', provider: 'spotify', category: 'Music' }, existing).map((s) => s.id)).toEqual(['a']);
  });
  it('stays quiet for different services, short input, cancelled items, and itself', () => {
    expect(findPossibleDuplicatesOf({ name: 'Coursera', category: 'Education' }, existing)).toHaveLength(0);
    expect(findPossibleDuplicatesOf({ name: 'S', category: 'Music' }, existing)).toHaveLength(0);
    expect(findPossibleDuplicatesOf({ name: 'Old gym', category: 'Fitness' }, existing)).toHaveLength(0);
    expect(findPossibleDuplicatesOf({ name: 'Spotify', category: 'Music' }, existing, 'a')).toHaveLength(0);
  });
});

describe('cycle labels', () => {
  it('describes each billing cycle', () => {
    expect(cycleLabel({ frequency: 'monthly', custom_interval_days: null })).toBe('per month');
    expect(cycleLabel({ frequency: 'quarterly', custom_interval_days: null })).toBe('every 3 months');
    expect(cycleLabel({ frequency: 'custom', custom_interval_days: 45 })).toBe('every 45 days');
    expect(cycleLabel({ frequency: 'custom', custom_interval_days: null })).toBe('custom cycle');
  });
});
