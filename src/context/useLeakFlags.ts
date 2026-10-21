import { useMemo } from 'react';
import { detectLeaks, filterDismissed, type Leak } from '@/lib/leaks';
import { useData } from './DataContext';

export interface LeakFlags {
  /** Everything detected right now. */
  all: Leak[];
  /** Detected and not dismissed by the user. */
  active: Leak[];
  /** Detected but dismissed. They can be restored from the Find My Leaks page. */
  dismissed: Leak[];
}

export function useLeakFlags(): LeakFlags {
  const { subscriptions, today, primaryCurrency, settings } = useData();
  const dismissedKeys = settings?.dismissed_leak_flags;
  return useMemo(() => {
    const all = detectLeaks(subscriptions, today, { currency: primaryCurrency });
    const keys = dismissedKeys ?? [];
    const active = filterDismissed(all, keys);
    const hidden = new Set(keys);
    return { all, active, dismissed: all.filter((l) => hidden.has(l.key)) };
  }, [subscriptions, today, primaryCurrency, dismissedKeys]);
}
