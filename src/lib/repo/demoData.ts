import { addDays, addMonths } from '../dates';
import { DEFAULT_REMINDER_DAYS } from '../constants';
import { defaultChecklist } from '../forms';
import type { Subscription } from '../types';

export const DEMO_USER_ID = 'demo-user';

type Seed = Partial<Subscription> & Pick<Subscription, 'name' | 'amount' | 'category'>;

/**
 * Sample data for demo mode only. Dates are relative to today so the demo always looks current.
 * Prices are illustrative, not quotes from any provider.
 */
export function buildSampleSubscriptions(today: string, nowISO: string): Subscription[] {
  const seeds: Seed[] = [
    { name: 'Netflix', provider: 'Netflix', category: 'Entertainment', amount: 649, renewIn: 4, payment_method: 'Credit Card' } as Seed & { renewIn: number },
    { name: 'Spotify', provider: 'Spotify', category: 'Music', amount: 119, renewIn: 11 } as Seed & { renewIn: number },
    { name: 'YouTube Premium', provider: 'Google', category: 'Entertainment', amount: 189, renewIn: 17, payment_method: 'Credit Card' } as Seed & { renewIn: number },
    { name: 'YouTube Music', provider: 'Google', category: 'Music', amount: 129, renewIn: 17, payment_method: 'Credit Card', unused: true } as Seed & { renewIn: number },
    { name: 'Amazon Prime', provider: 'Amazon', category: 'Shopping', amount: 1499, frequency: 'yearly', renewIn: 120, payment_method: 'Credit Card' } as Seed & { renewIn: number },
    { name: 'Cult.fit membership', provider: 'Cult.fit', category: 'Fitness', amount: 3000, frequency: 'quarterly', renewIn: 26, unused: true, payment_method: 'Debit Card' } as Seed & { renewIn: number },
    { name: 'Google One 200 GB', provider: 'Google', category: 'Cloud Storage', amount: 130, renewIn: 9 } as Seed & { renewIn: number },
    { name: 'The Hindu digital', provider: 'The Hindu', category: 'News', amount: 299, frequency: 'quarterly', renewIn: 6, status: 'cancellation_planned', payment_method: 'Net Banking' } as Seed & { renewIn: number },
    { name: 'Coursera Plus', provider: 'Coursera', category: 'Education', amount: 4999, renewIn: 2, status: 'trial', trialIn: 2, payment_method: 'Credit Card' } as Seed & { renewIn: number; trialIn: number },
    { name: 'Jio Fiber', provider: 'Jio', category: 'Utilities', amount: 699, renewIn: 13, payment_method: 'UPI' } as Seed & { renewIn: number },
    { name: 'Notion', provider: 'Notion Labs', category: 'Software', amount: 8, currency: 'USD', renewIn: 21, payment_method: 'Credit Card' } as Seed & { renewIn: number },
  ];

  return seeds.map((raw, i) => {
    const seed = raw as Seed & { renewIn: number; trialIn?: number };
    const frequency = seed.frequency ?? 'monthly';
    const renewal = addDays(today, seed.renewIn);
    const months = frequency === 'yearly' ? 12 : frequency === 'quarterly' ? 3 : 1;
    return {
      id: `demo-sub-${i + 1}`,
      user_id: DEMO_USER_ID,
      name: seed.name,
      provider: seed.provider ?? null,
      category: seed.category,
      amount: seed.amount,
      currency: seed.currency ?? 'INR',
      frequency,
      custom_interval_days: null,
      start_date: addMonths(renewal, -months * 3),
      next_renewal_date: renewal,
      payment_method: seed.payment_method ?? 'UPI',
      notes: null,
      trial_end_date: seed.trialIn !== undefined ? addDays(today, seed.trialIn) : null,
      status: seed.status ?? 'active',
      archived: false,
      unused: seed.unused ?? false,
      cancellation_url: null,
      cancellation_checklist: defaultChecklist(),
      cancelled_at: null,
      created_at: new Date(Date.parse(nowISO) - (seeds.length - i) * 3_600_000 * 7).toISOString(),
      updated_at: nowISO,
      reminders_enabled: true,
      reminder_days: DEFAULT_REMINDER_DAYS,
    } satisfies Subscription;
  });
}
