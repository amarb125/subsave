import { Download, Printer } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CategoryBars, MonthlyBars } from '@/components/charts';
import { Button, Card, ErrorState, Notice, PageHeader, PageSkeleton } from '@/components/ui';
import { useData } from '@/context/DataContext';
import {
  categoryBreakdown,
  confirmedSavings,
  formatMoney,
  otherCurrencyCount,
  potentialSavings,
  projectedSpend,
  totalsFor,
} from '@/lib/calc';
import { downloadCSV, subscriptionsToCSV } from '@/lib/csv';
import { formatDate } from '@/lib/format';

type Period = 'monthly' | 'yearly';

export default function Reports() {
  const { subscriptions, today, primaryCurrency: cur, loading, loadError, reload } = useData();
  const [period, setPeriod] = useState<Period>('monthly');

  const r = useMemo(() => {
    const months = projectedSpend(subscriptions, cur, today, 12);
    return {
      totals: totalsFor(subscriptions, cur),
      categories: categoryBreakdown(subscriptions, cur),
      months,
      savings: potentialSavings(subscriptions, cur),
      confirmed: confirmedSavings(subscriptions, cur),
      otherCurrency: otherCurrencyCount(subscriptions, cur),
    };
  }, [subscriptions, today, cur]);

  if (loading) return <PageSkeleton />;
  if (loadError) return <ErrorState message={loadError} onRetry={() => void reload()} />;

  const shown = period === 'monthly' ? r.months.slice(0, 6) : r.months;
  const barData = shown.map((m) => ({ label: formatDate(`${m.month}-01`, period === 'monthly' ? 'MMM' : "MMM ''yy"), amount: m.amount }));
  const catData = r.categories.map((c) => ({ label: c.category, amount: period === 'monthly' ? c.monthly : c.annual }));
  const scheduledTotal = shown.reduce((sum, m) => sum + m.amount, 0);

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle={`Summary as of ${formatDate(today)}`}
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => downloadCSV(`subsave-all-subscriptions-${today}.csv`, subscriptionsToCSV(subscriptions))}
              disabled={subscriptions.length === 0}
            >
              <Download className="h-4 w-4" aria-hidden />
              Export CSV
            </Button>
            <Button variant="secondary" size="sm" onClick={() => window.print()}>
              <Printer className="h-4 w-4" aria-hidden />
              Print summary
            </Button>
          </>
        }
      />

      <div className="mb-4 inline-flex rounded-xl border border-paper-line bg-white p-1 print:hidden" role="group" aria-label="Report period">
        {(['monthly', 'yearly'] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPeriod(p)}
            aria-pressed={period === p}
            className={`min-h-9 rounded-lg px-4 text-sm font-medium capitalize ${
              period === p ? 'bg-brand-600 text-white' : 'text-ink-soft hover:bg-paper'
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      {r.otherCurrency > 0 && (
        <Notice className="mb-4" title="Other currencies">
          {r.otherCurrency} {r.otherCurrency === 1 ? 'subscription is' : 'subscriptions are'} not in {cur} and left out. SubSave never converts
          currencies.
        </Notice>
      )}

      <section aria-label="Totals" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs font-medium text-ink-soft">Recurring per month</p>
          <p className="tabular mt-1 text-xl font-semibold text-ink">{formatMoney(r.totals.monthly, cur)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium text-ink-soft">Recurring per year</p>
          <p className="tabular mt-1 text-xl font-semibold text-ink">{formatMoney(r.totals.annual, cur)}</p>
        </Card>
        <Card className="border-dashed p-4">
          <p className="text-xs font-medium text-ink-soft">Potential savings / year (estimate)</p>
          <p className="tabular mt-1 text-xl font-semibold text-ink">{formatMoney(r.savings.annual, cur)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium text-ink-soft">Confirmed cancelled / year</p>
          <p className="tabular mt-1 text-xl font-semibold text-ink">{formatMoney(r.confirmed.annual, cur)}</p>
        </Card>
      </section>

      <Card className="mt-4 p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-ink">
          Scheduled charges, next {period === 'monthly' ? '6 months' : '12 months'}
        </h2>
        <p className="mt-0.5 text-xs text-ink-soft">
          Total {formatMoney(scheduledTotal, cur)}. Uses actual renewal dates; the current month shows only what is still to come.
        </p>
        <div className="mt-3">
          <MonthlyBars
            data={barData}
            currency={cur}
            ariaLabel={`Scheduled charges by month: ${barData.map((m) => `${m.label} ${formatMoney(m.amount, cur)}`).join(', ')}`}
          />
        </div>
        <table className="mt-3 w-full text-sm">
          <caption className="sr-only">Scheduled charges by month</caption>
          <thead>
            <tr className="border-b border-paper-line text-left text-xs text-ink-soft">
              <th scope="col" className="py-1.5 font-medium">Month</th>
              <th scope="col" className="py-1.5 text-right font-medium">Charges</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((m) => (
              <tr key={m.month} className="border-b border-paper-line last:border-0">
                <th scope="row" className="py-1.5 text-left font-normal text-ink">{formatDate(`${m.month}-01`, 'MMMM yyyy')}</th>
                <td className="tabular py-1.5 text-right text-ink">{formatMoney(m.amount, cur)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="mt-4 p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-ink">Spending by category ({period === 'monthly' ? 'per month' : 'per year'})</h2>
        {r.categories.length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">No active subscriptions in {cur} yet.</p>
        ) : (
          <>
            <div className="mt-3">
              <CategoryBars
                data={catData}
                currency={cur}
                ariaLabel={`Spending by category: ${catData.map((c) => `${c.label} ${formatMoney(c.amount, cur)}`).join(', ')}`}
              />
            </div>
            <table className="mt-3 w-full text-sm">
              <caption className="sr-only">Spending by category</caption>
              <thead>
                <tr className="border-b border-paper-line text-left text-xs text-ink-soft">
                  <th scope="col" className="py-1.5 font-medium">Category</th>
                  <th scope="col" className="py-1.5 text-right font-medium">Items</th>
                  <th scope="col" className="py-1.5 text-right font-medium">Per month</th>
                  <th scope="col" className="py-1.5 text-right font-medium">Per year</th>
                </tr>
              </thead>
              <tbody>
                {r.categories.map((c) => (
                  <tr key={c.category} className="border-b border-paper-line last:border-0">
                    <th scope="row" className="py-1.5 text-left font-normal text-ink">{c.category}</th>
                    <td className="tabular py-1.5 text-right text-ink">{c.count}</td>
                    <td className="tabular py-1.5 text-right text-ink">{formatMoney(c.monthly, cur)}</td>
                    <td className="tabular py-1.5 text-right text-ink">{formatMoney(c.annual, cur)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Card>

      <p className="mt-4 text-xs text-ink-soft">
        Totals include Active and Cancellation-planned subscriptions, because those are still billing. Trials, paused, cancelled and
        archived items are excluded. Savings are estimates until you confirm a cancellation.
      </p>
    </>
  );
}
