import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { daysUntil, effectiveRenewal, formatMoney, isSpendCounted, monthlyEquivalent } from '@/lib/calc';
import { formatDate, relativeDays } from '@/lib/format';
import { cycleLabel } from '@/lib/labels';
import type { Subscription } from '@/lib/types';
import { StatusBadge } from './StatusBadge';
import { Badge } from './ui';

function renewalText(sub: Subscription, today: string): string {
  if (sub.status === 'cancelled') return `Cancelled${sub.cancelled_at ? ` on ${formatDate(sub.cancelled_at.slice(0, 10))}` : ''}`;
  if (sub.status === 'paused') return 'Paused: not being charged';
  const date = effectiveRenewal(sub, today);
  if (!date) return 'Check the billing details';
  const label = sub.status === 'trial' ? 'First charge' : 'Renews';
  return `${label} ${formatDate(date)} · ${relativeDays(daysUntil(today, date))}`;
}

/** One row in a list of subscriptions. The whole row is a link to the details page. */
export function SubscriptionItem({ sub, today }: { sub: Subscription; today: string }) {
  const showMonthly = sub.frequency !== 'monthly' && isSpendCounted(sub);
  return (
    <li>
      <Link
        to={`/subscriptions/${sub.id}`}
        className="card flex items-center gap-3 p-4 transition-colors hover:border-brand-300 hover:bg-brand-50/40"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate text-base font-semibold text-ink">{sub.name}</span>
            <StatusBadge status={sub.status} />
            {sub.unused && <Badge tone="warn">Marked unused</Badge>}
            {sub.archived && <Badge tone="muted">Archived</Badge>}
          </div>
          <p className="mt-0.5 truncate text-sm text-ink-soft">
            {[sub.provider, sub.category, sub.payment_method].filter(Boolean).join(' · ')}
          </p>
          <p className="mt-1 text-xs text-ink-soft">{renewalText(sub, today)}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="tabular text-base font-semibold text-ink">{formatMoney(sub.amount, sub.currency)}</p>
          <p className="text-xs text-ink-soft">{cycleLabel(sub)}</p>
          {showMonthly && (
            <p className="tabular text-xs text-ink-faint">≈ {formatMoney(monthlyEquivalent(sub), sub.currency)}/mo</p>
          )}
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
      </Link>
    </li>
  );
}
