import { describe, it, expect } from 'vitest';
import { subscriptionFormSchema } from '@/lib/schema';

describe('form validation', () => {
  const valid = {
    name: 'Netflix', provider: 'Netflix Inc', category: 'Entertainment' as const, amount: 649, currency: 'INR' as const,
    frequency: 'monthly' as const, custom_interval_days: null, start_date: '2026-01-01', next_renewal_date: '2026-11-01',
    payment_method: 'UPI' as const, notes: '', trial_end_date: '', status: 'active' as const, cancellation_url: '',
    reminders_enabled: true, reminder_days: [7, 1],
  };
  const messages = (v: object) => {
    const r = subscriptionFormSchema.safeParse(v);
    return r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
  };

  it('accepts a valid subscription', () => {
    expect(messages(valid)).toEqual([]);
  });
  it('rejects a blank name, negative amount and NaN amount', () => {
    expect(messages({ ...valid, name: '  ' }).join()).toContain('name');
    expect(messages({ ...valid, amount: -1 }).join()).toContain('cannot be negative');
    expect(messages({ ...valid, amount: NaN }).join()).toContain('amount');
  });
  it('allows a zero amount for free plans', () => {
    expect(messages({ ...valid, amount: 0 })).toEqual([]);
  });
  it('requires a valid custom interval only for custom billing', () => {
    expect(messages({ ...valid, frequency: 'custom', custom_interval_days: NaN }).join()).toContain('custom_interval_days');
    expect(messages({ ...valid, frequency: 'custom', custom_interval_days: 0 }).join()).toContain('custom_interval_days');
    expect(messages({ ...valid, frequency: 'custom', custom_interval_days: 28 })).toEqual([]);
  });
  it('rejects invalid dates and renewals before the start date', () => {
    expect(messages({ ...valid, next_renewal_date: '2026-02-30' }).join()).toContain('next_renewal_date');
    expect(messages({ ...valid, next_renewal_date: '2025-12-31' }).join()).toContain('cannot be before');
  });
  it('requires a trial end date for trials', () => {
    expect(messages({ ...valid, status: 'trial' }).join()).toContain('trial_end_date');
    expect(messages({ ...valid, status: 'trial', trial_end_date: '2026-11-01' })).toEqual([]);
  });
  it('only accepts http(s) cancellation links', () => {
    expect(messages({ ...valid, cancellation_url: 'javascript:alert(1)' }).join()).toContain('cancellation_url');
    expect(messages({ ...valid, cancellation_url: 'not a url' }).join()).toContain('cancellation_url');
    expect(messages({ ...valid, cancellation_url: 'https://netflix.com/cancel' })).toEqual([]);
  });
});
