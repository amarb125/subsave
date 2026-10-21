import { CalendarDays } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ButtonLink } from '@/components/ButtonLink';
import { Badge, Card, EmptyState, ErrorState, PageHeader, PageSkeleton, Select } from '@/components/ui';
import { Field } from '@/components/ui';
import { useData } from '@/context/DataContext';
import { formatMoney, isSpendCounted } from '@/lib/calc';
import { addDays, compareISO, diffDays, isValidISODate, occurrencesBetween } from '@/lib/dates';
import { formatDate, relativeDays } from '@/lib/format';
import { cycleLabel } from '@/lib/labels';
import type { Subscription } from '@/lib/types';

interface Event {
  key: string;
  date: string;
  sub: Subscription;
  kind: 'renewal' | 'trial_end';
}

const WINDOWS = [
  { days: 30, label: 'Next 30 days' },
  { days: 60, label: 'Next 60 days' },
  { days: 90, label: 'Next 90 days' },
  { days: 365, label: 'Next 12 months' },
];

export default function Calendar() {
  const { subscriptions, today, loading, loadError, reload } = useData();
  const [windowDays, setWindowDays] = useState(30);

  const { events, overdueTrials } = useMemo(() => {
    const end = addDays(today, windowDays);
    const out: Event[] = [];
    const overdue: Subscription[] = [];
    for (const sub of subscriptions) {
      if (sub.archived) continue;
      if (isSpendCounted(sub)) {
        for (const date of occurrencesBetween(sub.next_renewal_date, sub.frequency, sub.custom_interval_days, today, end)) {
          out.push({ key: `${sub.id}:r:${date}`, date, sub, kind: 'renewal' });
        }
      }
      if (sub.status === 'trial' && isValidISODate(sub.trial_end_date)) {
        const d = sub.trial_end_date as string;
        if (compareISO(d, today) >= 0 && compareISO(d, end) <= 0) out.push({ key: `${sub.id}:t:${d}`, date: d, sub, kind: 'trial_end' });
        else if (compareISO(d, today) < 0) overdue.push(sub);
      }
    }
    out.sort((a, b) => a.date.localeCompare(b.date) || a.sub.name.localeCompare(b.sub.name));
    return { events: out, overdueTrials: overdue };
  }, [subscriptions, today, windowDays]);

  const grouped = useMemo(() => {
    const map = new Map<string, Event[]>();
    for (const e of events) map.set(e.date, [...(map.get(e.date) ?? []), e]);
    return [...map.entries()];
  }, [events]);

  if (loading) return <PageSkeleton />;
  if (loadError) return <ErrorState message={loadError} onRetry={() => void reload()} />;

  const totals = new Map<string, number>();
  for (const e of events) {
    if (e.kind === 'renewal') totals.set(e.sub.currency, (totals.get(e.sub.currency) ?? 0) + e.sub.amount);
  }

  return (
    <>
      <PageHeader
        title="Renewal Calendar"
        subtitle="Charges and trial endings in date order."
        actions={
          <Field label="Show">
            {({ id }) => (
              <Select id={id} value={windowDays} onChange={(e) => setWindowDays(Number(e.target.value))}>
                {WINDOWS.map((w) => (
                  <option key={w.days} value={w.days}>
                    {w.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        }
      />

      {overdueTrials.length > 0 && (
        <Card className="mb-4 border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-semibold">Trial end date has passed</p>
          <p className="mt-0.5">
            {overdueTrials.map((s) => s.name).join(', ')} {overdueTrials.length === 1 ? 'is' : 'are'} still marked as a trial. Check whether
            you are being charged and update the status.
          </p>
        </Card>
      )}

      {grouped.length === 0 ? (
        <EmptyState
          icon={<CalendarDays className="h-6 w-6" aria-hidden />}
          title="No renewals in this period"
          description={subscriptions.length === 0 ? 'Add a subscription to see when it renews.' : 'Try a longer period.'}
          action={subscriptions.length === 0 ? <ButtonLink to="/subscriptions/new">Add a subscription</ButtonLink> : undefined}
        />
      ) : (
        <>
          <p className="mb-3 text-sm text-ink-soft">
            {[...totals.entries()].map(([cur, amount]) => formatMoney(amount, cur)).join(' + ')} in charges over this period.
          </p>
          <ol className="space-y-4">
            {grouped.map(([date, items]) => {
              const gap = diffDays(today, date);
              return (
                <li key={date}>
                  <h2 className="mb-1.5 flex items-baseline gap-2 text-sm font-semibold text-ink">
                    {formatDate(date, 'EEE, d MMM yyyy')}
                    <span className="text-xs font-normal text-ink-soft">{relativeDays(gap)}</span>
                  </h2>
                  <ul className="space-y-2">
                    {items.map((e) => (
                      <li key={e.key}>
                        <Link
                          to={`/subscriptions/${e.sub.id}`}
                          className="card flex items-center justify-between gap-3 p-3.5 hover:border-brand-300"
                        >
                          <span className="min-w-0">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="truncate text-sm font-semibold text-ink">{e.sub.name}</span>
                              {e.kind === 'trial_end' ? <Badge tone="warn">Trial ends</Badge> : null}
                              {e.sub.status === 'cancellation_planned' && <Badge tone="warn">Cancellation planned</Badge>}
                            </span>
                            <span className="block text-xs text-ink-soft">
                              {e.kind === 'trial_end' ? `Billing may start after this date` : `${e.sub.payment_method} · ${cycleLabel(e.sub)}`}
                            </span>
                          </span>
                          {e.kind === 'renewal' && (
                            <span className="tabular shrink-0 text-sm font-semibold text-ink">{formatMoney(e.sub.amount, e.sub.currency)}</span>
                          )}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ol>
        </>
      )}

      <p className="mt-6 text-xs text-ink-soft">
        Reminders are shown in the app when you open it (see the bell). SubSave cannot alert you while it is closed.
      </p>
    </>
  );
}
