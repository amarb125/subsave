import type { Subscription } from '@/lib/types';

let counter = 0;

/** Builds a valid subscription with sensible defaults; override what the test cares about. */
export function makeSub(overrides: Partial<Subscription> = {}): Subscription {
  counter += 1;
  return {
    id: overrides.id ?? `sub-${counter}`,
    user_id: 'user-1',
    name: `Service ${counter}`,
    provider: null,
    category: 'Other',
    amount: 100,
    currency: 'INR',
    frequency: 'monthly',
    custom_interval_days: null,
    start_date: '2026-01-01',
    next_renewal_date: '2026-11-01',
    payment_method: 'UPI',
    notes: null,
    trial_end_date: null,
    status: 'active',
    archived: false,
    unused: false,
    cancellation_url: null,
    cancellation_checklist: [],
    cancelled_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    reminders_enabled: true,
    reminder_days: [7, 1],
    ...overrides,
  };
}
