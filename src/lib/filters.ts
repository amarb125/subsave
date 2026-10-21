import { annualCost, effectiveRenewal, monthlyEquivalent } from './calc';
import type { Category, PaymentMethod, Status, Subscription } from './types';

export type SortKey = 'renewal' | 'amount' | 'name';

export interface SubscriptionFilters {
  search: string;
  category: Category | 'all';
  payment: PaymentMethod | 'all';
  status: Status | 'all' | 'archived';
  sort: SortKey;
}

export const DEFAULT_FILTERS: SubscriptionFilters = {
  search: '',
  category: 'all',
  payment: 'all',
  status: 'all',
  sort: 'renewal',
};

export function filterAndSort(subs: Subscription[], f: SubscriptionFilters, today: string): Subscription[] {
  const q = f.search.trim().toLowerCase();
  const filtered = subs.filter((s) => {
    // Archived items are hidden unless the user explicitly asks for them.
    if (f.status === 'archived') {
      if (!s.archived) return false;
    } else if (s.archived) {
      return false;
    }
    if (q && !s.name.toLowerCase().includes(q) && !(s.provider ?? '').toLowerCase().includes(q)) return false;
    if (f.category !== 'all' && s.category !== f.category) return false;
    if (f.payment !== 'all' && s.payment_method !== f.payment) return false;
    if (f.status !== 'all' && f.status !== 'archived' && s.status !== f.status) return false;
    return true;
  });

  const renewalKey = (s: Subscription) => effectiveRenewal(s, today) ?? '9999-12-31';
  return [...filtered].sort((a, b) => {
    switch (f.sort) {
      case 'amount':
        return monthlyEquivalent(b) - monthlyEquivalent(a) || a.name.localeCompare(b.name);
      case 'name':
        return a.name.localeCompare(b.name);
      default: {
        // Cancelled / paused go last when sorting by renewal.
        const dead = (s: Subscription) => (s.status === 'cancelled' || s.status === 'paused' ? 1 : 0);
        return dead(a) - dead(b) || renewalKey(a).localeCompare(renewalKey(b)) || a.name.localeCompare(b.name);
      }
    }
  });
}

export { annualCost };
