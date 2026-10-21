import { describe, it, expect } from 'vitest';
import { applyStatusChange } from '@/lib/status';
import { makeSub } from './fixtures';

const now = '2026-10-19T05:00:00.000Z';

describe('status changes', () => {
  it('planning a cancellation does not cancel the subscription', () => {
    const { subscription, history } = applyStatusChange(makeSub({ id: 's' }), 'cancellation_planned', now);
    expect(subscription.status).toBe('cancellation_planned');
    expect(subscription.cancelled_at).toBeNull();
    expect(history?.from_status).toBe('active');
    expect(history?.to_status).toBe('cancellation_planned');
  });
  it('confirming a cancellation records the time and history', () => {
    const { subscription, history } = applyStatusChange(makeSub({ status: 'cancellation_planned' }), 'cancelled', now);
    expect(subscription.status).toBe('cancelled');
    expect(subscription.cancelled_at).toBe(now);
    expect(history?.to_status).toBe('cancelled');
  });
  it('reactivating clears the cancelled timestamp', () => {
    const { subscription } = applyStatusChange(makeSub({ status: 'cancelled', cancelled_at: now }), 'active', now);
    expect(subscription.cancelled_at).toBeNull();
  });
  it('is a no-op (no history entry) when the status is unchanged', () => {
    const sub = makeSub();
    const result = applyStatusChange(sub, 'active', now);
    expect(result.history).toBeNull();
    expect(result.subscription).toBe(sub);
  });
  it('pausing works and keeps the record', () => {
    expect(applyStatusChange(makeSub(), 'paused', now).subscription.status).toBe('paused');
  });
});
