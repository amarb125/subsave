import { Download, Plus, Printer, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ButtonLink } from '@/components/ButtonLink';
import { SubscriptionItem } from '@/components/SubscriptionItem';
import { Button, EmptyState, ErrorState, Field, Input, PageHeader, PageSkeleton, Select } from '@/components/ui';
import { useData } from '@/context/DataContext';
import { STATUS_LABELS } from '@/lib/constants';
import { downloadCSV, subscriptionsToCSV } from '@/lib/csv';
import { DEFAULT_FILTERS, filterAndSort, type SortKey, type SubscriptionFilters } from '@/lib/filters';
import { CATEGORIES, PAYMENT_METHODS, STATUSES } from '@/lib/types';

const SORT_LABELS: Record<SortKey, string> = {
  renewal: 'Next renewal',
  amount: 'Amount (highest first)',
  name: 'Name (A to Z)',
};

export default function Subscriptions() {
  const { subscriptions, today, loading, loadError, reload } = useData();
  const [filters, setFilters] = useState<SubscriptionFilters>(DEFAULT_FILTERS);

  const results = useMemo(() => filterAndSort(subscriptions, filters, today), [subscriptions, filters, today]);
  const filtering =
    filters.search.trim() !== '' || filters.category !== 'all' || filters.payment !== 'all' || filters.status !== 'all';

  const set = <K extends keyof SubscriptionFilters>(key: K, value: SubscriptionFilters[K]) =>
    setFilters((f) => ({ ...f, [key]: value }));

  const exportCsv = () => downloadCSV(`subsave-subscriptions-${today}.csv`, subscriptionsToCSV(results));

  if (loading) return <PageSkeleton />;
  if (loadError) return <ErrorState message={loadError} onRetry={() => void reload()} />;

  return (
    <>
      <PageHeader
        title="My Subscriptions"
        subtitle={`${results.length} ${results.length === 1 ? 'subscription' : 'subscriptions'}${filtering ? ' match your filters' : ''}`}
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={exportCsv} disabled={results.length === 0}>
              <Download className="h-4 w-4" aria-hidden />
              Export CSV
            </Button>
            <Button variant="secondary" size="sm" onClick={() => window.print()} disabled={results.length === 0}>
              <Printer className="h-4 w-4" aria-hidden />
              Print
            </Button>
            <ButtonLink to="/subscriptions/new" size="sm">
              <Plus className="h-4 w-4" aria-hidden />
              Add subscription
            </ButtonLink>
          </>
        }
      />

      <form
        role="search"
        aria-label="Search and filter subscriptions"
        className="card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5 print:hidden"
        onSubmit={(e) => e.preventDefault()}
      >
        <div className="relative sm:col-span-2 lg:col-span-5">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" aria-hidden />
          <label htmlFor="sub-search" className="sr-only">
            Search by name
          </label>
          <Input
            id="sub-search"
            type="search"
            placeholder="Search by name or provider"
            className="pl-9"
            value={filters.search}
            onChange={(e) => set('search', e.target.value)}
          />
        </div>
        <Field label="Category">
          {({ id }) => (
            <Select id={id} value={filters.category} onChange={(e) => set('category', e.target.value as SubscriptionFilters['category'])}>
              <option value="all">All categories</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Payment method">
          {({ id }) => (
            <Select id={id} value={filters.payment} onChange={(e) => set('payment', e.target.value as SubscriptionFilters['payment'])}>
              <option value="all">All methods</option>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Status">
          {({ id }) => (
            <Select id={id} value={filters.status} onChange={(e) => set('status', e.target.value as SubscriptionFilters['status'])}>
              <option value="all">All (not archived)</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
              <option value="archived">Archived</option>
            </Select>
          )}
        </Field>
        <Field label="Sort by">
          {({ id }) => (
            <Select id={id} value={filters.sort} onChange={(e) => set('sort', e.target.value as SortKey)}>
              {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                <option key={k} value={k}>
                  {SORT_LABELS[k]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="flex items-end">
          <Button variant="ghost" onClick={() => setFilters(DEFAULT_FILTERS)} disabled={!filtering && filters.sort === 'renewal'}>
            Clear filters
          </Button>
        </div>
      </form>

      {results.length === 0 ? (
        subscriptions.length === 0 ? (
          <EmptyState
            title="No subscriptions yet"
            description="Add your first one to start tracking what you pay."
            action={<ButtonLink to="/subscriptions/new">Add a subscription</ButtonLink>}
          />
        ) : (
          <EmptyState
            title="Nothing matches"
            description="Try a different search or clear the filters."
            action={
              <Button variant="secondary" onClick={() => setFilters(DEFAULT_FILTERS)}>
                Clear filters
              </Button>
            }
          />
        )
      ) : (
        <ul className="space-y-2.5" aria-label="Subscriptions">
          {results.map((s) => (
            <SubscriptionItem key={s.id} sub={s} today={today} />
          ))}
        </ul>
      )}
    </>
  );
}
