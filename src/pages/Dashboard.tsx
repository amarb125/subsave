import { CreditCard, Plus } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ButtonLink } from '@/components/ButtonLink';
import { MonthlyBars } from '@/components/charts';
import { StatusBadge } from '@/components/StatusBadge';
import { Card, EmptyState, ErrorState, Notice, PageHeader, PageSkeleton } from '@/components/ui';
import { useData } from '@/context/DataContext';
import {
  annualCost,
  confirmedSavings,
  formatMoney,
  isSpendCounted,
  monthlyEquivalent,
  otherCurrencyCount,
  potentialSavings,
  projectedSpend,
  totalsFor,
  upcomingRenewals,
} from '@/lib/calc';
import { formatDate, relativeDays } from '@/lib/format';
import { cycleLabel } from '@/lib/labels';

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium text-ink-soft">{label}</p>
      <p className="tabular mt-1 text-2xl font-semibold tracking-tight text-ink">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-soft">{hint}</p>}
    </Card>
  );
}

function Panel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {action}
      </div>
      {children}
    </Card>
  );
}

export default function Dashboard() {
  const { subscriptions, today, primaryCurrency: cur, loading, loadError, reload, settings } = useData();

  const v = useMemo(() => {
    const live = subscriptions.filter((s) => !s.archived);
    const counted = live.filter((s) => isSpendCounted(s) && s.currency === cur);
    const soon = upcomingRenewals(subscriptions, today, 7);
    const savings = potentialSavings(subscriptions, cur);
    return {
      live,
      totals: totalsFor(subscriptions, cur),
      soon,
      soonTotal: soon.filter((r) => r.sub.currency === cur).reduce((sum, r) => sum + r.sub.amount, 0),
      savings,
      savingsSubs: subscriptions.filter((s) => savings.ids.includes(s.id)),
      confirmed: confirmedSavings(subscriptions, cur),
      upcoming: upcomingRenewals(subscriptions, today, 30).slice(0, 5),
      highest: [...counted].sort((a, b) => monthlyEquivalent(b) - monthlyEquivalent(a)).slice(0, 5),
      recent: [...live].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5),
      trials: live.filter((s) => s.status === 'trial').length,
      planned: live.filter((s) => s.status === 'cancellation_planned').length,
      otherCurrency: otherCurrencyCount(subscriptions, cur),
      months: projectedSpend(subscriptions, cur, today, 6),
    };
  }, [subscriptions, today, cur]);

  if (loading) return <PageSkeleton />;
  if (loadError) return <ErrorState message={loadError} onRetry={() => void reload()} />;

  // Brand-new accounts go through the quick start first.
  if (settings && !settings.onboarding_completed && subscriptions.length === 0) {
    return <Navigate to="/onboarding" replace />;
  }

  if (v.live.length === 0) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <EmptyState
          icon={<CreditCard className="h-6 w-6" aria-hidden />}
          title="No subscriptions yet"
          description="Add the things you pay for every week, month or year and SubSave will show what they really cost."
          action={
            <ButtonLink to="/subscriptions/new">
              <Plus className="h-4 w-4" aria-hidden />
              Add a subscription
            </ButtonLink>
          }
        />
      </>
    );
  }

  const monthlyData = v.months.map((m) => ({ label: formatDate(`${m.month}-01`, 'MMM'), amount: m.amount }));
  const topMonthly = v.highest.length > 0 ? monthlyEquivalent(v.highest[0]) : 0;

  return (
    <>
      <PageHeader title="Dashboard" subtitle={formatDate(today, 'EEEE, d MMMM yyyy')} />

      {v.otherCurrency > 0 && (
        <Notice className="mb-4" title="Other currencies">
          {v.otherCurrency} {v.otherCurrency === 1 ? 'subscription is' : 'subscriptions are'} not in {cur}, so{' '}
          {v.otherCurrency === 1 ? 'it is' : 'they are'} left out of the totals below. SubSave never converts currencies.
        </Notice>
      )}

      <section aria-label="Spending summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Monthly recurring spend"
          value={formatMoney(v.totals.monthly, cur)}
          hint="Active plus planned cancellations"
        />
        <Stat label="Annual recurring spend" value={formatMoney(v.totals.annual, cur)} hint="Monthly cost × 12" />
        <Stat
          label="Active subscriptions"
          value={String(v.totals.count)}
          hint={
            [v.trials > 0 && `${v.trials} on trial`, v.planned > 0 && `${v.planned} planning to cancel`]
              .filter(Boolean)
              .join(' · ') || 'Currently being charged'
          }
        />
        <Stat
          label="Renewing in 7 days"
          value={String(v.soon.length)}
          hint={v.soon.length > 0 ? `${formatMoney(v.soonTotal, cur)} due` : 'Nothing due this week'}
        />
      </section>

      <section aria-label="Savings" className="mt-4 grid gap-3 md:grid-cols-2">
        <Card className="border-dashed p-4 sm:p-5">
          <p className="text-xs font-medium text-ink-soft">Potential annual savings (estimate)</p>
          <p className="tabular mt-1 text-2xl font-semibold text-ink">{formatMoney(v.savings.annual, cur)}</p>
          {v.savingsSubs.length > 0 ? (
            <p className="mt-2 text-sm text-ink-soft">
              From {v.savingsSubs.map((s) => s.name).join(', ')}, which you marked unused or plan to cancel.
            </p>
          ) : (
            <p className="mt-2 text-sm text-ink-soft">Mark a subscription as unused or plan a cancellation to see an estimate.</p>
          )}
          <p className="mt-2 text-xs text-ink-soft">
            Nothing is saved until you cancel with the provider and confirm it in SubSave.{' '}
            <Link to="/leaks" className="font-medium text-brand-700 underline">
              Find My Leaks
            </Link>
          </p>
        </Card>
        <Card className="p-4 sm:p-5">
          <p className="text-xs font-medium text-ink-soft">Confirmed cancelled (per year)</p>
          <p className="tabular mt-1 text-2xl font-semibold text-ink">{formatMoney(v.confirmed.annual, cur)}</p>
          <p className="mt-2 text-sm text-ink-soft">
            {v.confirmed.ids.length === 0
              ? 'No cancellations confirmed yet.'
              : `${v.confirmed.ids.length} cancelled ${v.confirmed.ids.length === 1 ? 'subscription no longer recurs' : 'subscriptions no longer recur'}.`}
          </p>
          <p className="mt-2 text-xs text-ink-soft">
            This is the yearly cost that stopped recurring. Past payments are not counted as money recovered.
          </p>
        </Card>
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="lg:col-span-2">
          <Panel title="Charges coming up, next 6 months">
            <MonthlyBars
              data={monthlyData}
              currency={cur}
              ariaLabel={`Scheduled charges by month: ${monthlyData.map((m) => `${m.label} ${formatMoney(m.amount, cur)}`).join(', ')}`}
            />
            <p className="mt-2 text-xs text-ink-soft">
              Based on real renewal dates, so a yearly plan only appears in the month it is charged. The current month shows what is
              still to come.
            </p>
          </Panel>
        </div>

        <Panel
          title="Upcoming renewals"
          action={
            <Link to="/calendar" className="text-xs font-medium text-brand-700 underline">
              Calendar
            </Link>
          }
        >
          {v.upcoming.length === 0 ? (
            <p className="text-sm text-ink-soft">Nothing renews in the next 30 days.</p>
          ) : (
            <ul className="divide-y divide-paper-line">
              {v.upcoming.map((r) => (
                <li key={`${r.sub.id}-${r.date}`}>
                  <Link to={`/subscriptions/${r.sub.id}`} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-ink">{r.sub.name}</span>
                      <span className="block text-xs text-ink-soft">
                        {formatDate(r.date, 'd MMM')} · {relativeDays(r.inDays)}
                      </span>
                    </span>
                    <span className="tabular shrink-0 text-sm font-medium text-ink">{formatMoney(r.sub.amount, r.sub.currency)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Highest-cost subscriptions">
          {v.highest.length === 0 ? (
            <p className="text-sm text-ink-soft">No active subscriptions in {cur}.</p>
          ) : (
            <ul className="space-y-3">
              {v.highest.map((s) => {
                const monthly = monthlyEquivalent(s);
                return (
                  <li key={s.id}>
                    <Link to={`/subscriptions/${s.id}`} className="block">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="truncate text-sm font-medium text-ink">{s.name}</span>
                        <span className="tabular shrink-0 text-sm text-ink">{formatMoney(monthly, cur)}/mo</span>
                      </div>
                      <div className="mt-1.5 h-1.5 rounded-full bg-paper-line" aria-hidden>
                        <div
                          className="h-1.5 rounded-full bg-brand-600"
                          style={{ width: `${topMonthly > 0 ? Math.max(4, (monthly / topMonthly) * 100) : 0}%` }}
                        />
                      </div>
                      <p className="mt-1 text-xs text-ink-soft">
                        {formatMoney(annualCost(s), cur)} a year · {formatMoney(s.amount, s.currency)} {cycleLabel(s)}
                      </p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <div className="lg:col-span-2">
          <Panel
            title="Recently added"
            action={
              <Link to="/subscriptions" className="text-xs font-medium text-brand-700 underline">
                All subscriptions
              </Link>
            }
          >
            <ul className="divide-y divide-paper-line">
              {v.recent.map((s) => (
                <li key={s.id}>
                  <Link to={`/subscriptions/${s.id}`} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-sm font-medium text-ink">{s.name}</span>
                      <StatusBadge status={s.status} />
                    </span>
                    <span className="tabular shrink-0 text-sm text-ink">
                      {formatMoney(s.amount, s.currency)} <span className="text-xs text-ink-soft">{cycleLabel(s)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </>
  );
}
