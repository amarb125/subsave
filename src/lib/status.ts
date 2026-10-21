import type { Status, StatusHistoryEntry, Subscription } from './types';

export interface StatusChangeResult {
  subscription: Subscription;
  /** null when the status did not actually change. */
  history: Omit<StatusHistoryEntry, 'id'> | null;
}

/**
 * Pure status transition used by demo mode. In Supabase the same rules are enforced by
 * database triggers (see supabase/migrations).
 *
 * - "Cancellation planned" does NOT cancel anything: it keeps counting as spend.
 * - Only an explicit change to "cancelled" (the user confirming the provider cancelled it)
 *   sets cancelled_at and removes it from spend totals.
 */
export function applyStatusChange(sub: Subscription, to: Status, nowISO: string): StatusChangeResult {
  if (sub.status === to) return { subscription: sub, history: null };
  return {
    subscription: {
      ...sub,
      status: to,
      cancelled_at: to === 'cancelled' ? nowISO : null,
      updated_at: nowISO,
    },
    history: {
      user_id: sub.user_id,
      subscription_id: sub.id,
      from_status: sub.status,
      to_status: to,
      changed_at: nowISO,
    },
  };
}

export function isCancelled(sub: Pick<Subscription, 'status'>): boolean {
  return sub.status === 'cancelled';
}
