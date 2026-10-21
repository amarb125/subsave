import { Droplets, Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, Card, EmptyState, ErrorState, Notice, PageHeader, PageSkeleton } from '@/components/ui';
import { useData } from '@/context/DataContext';
import { useToast } from '@/context/ToastContext';
import { useLeakFlags } from '@/context/useLeakFlags';
import { formatMoney, potentialSavings } from '@/lib/calc';
import { LEAK_LABELS, type Leak, type Severity } from '@/lib/leaks';

const SEVERITY: Record<Severity, { tone: 'danger' | 'warn' | 'neutral'; label: string }> = {
  high: { tone: 'danger', label: 'Needs attention' },
  medium: { tone: 'warn', label: 'Worth a look' },
  info: { tone: 'neutral', label: 'For your information' },
};

function LeakCard({
  leak,
  names,
  dismissed,
  onToggle,
}: {
  leak: Leak;
  names: { id: string; name: string }[];
  dismissed: boolean;
  onToggle: () => void;
}) {
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={SEVERITY[leak.severity].tone}>{SEVERITY[leak.severity].label}</Badge>
        <Badge tone="brand">{LEAK_LABELS[leak.type]}</Badge>
      </div>
      <h3 className="mt-2 text-base font-semibold text-ink">{leak.title}</h3>
      <p className="mt-1 text-sm text-ink-soft">{leak.explanation}</p>
      {leak.potentialAnnual !== undefined && leak.currency && (
        <p className="tabular mt-2 text-sm font-medium text-ink">
          Estimated saving if cancelled: {formatMoney(leak.potentialAnnual, leak.currency)} a year{' '}
          <span className="font-normal text-ink-soft">(an estimate, not money saved)</span>
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {names.map((n) => (
          <Link
            key={n.id}
            to={`/subscriptions/${n.id}`}
            className="inline-flex min-h-9 items-center rounded-xl border border-paper-line px-3 text-sm font-medium text-brand-700 hover:bg-brand-50"
          >
            Open {n.name}
          </Link>
        ))}
        <Button variant="ghost" size="sm" onClick={onToggle}>
          {dismissed ? <Eye className="h-4 w-4" aria-hidden /> : <EyeOff className="h-4 w-4" aria-hidden />}
          {dismissed ? 'Show again' : 'Dismiss'}
        </Button>
      </div>
    </Card>
  );
}

export default function Leaks() {
  const { subscriptions, primaryCurrency: cur, loading, loadError, reload, dismissLeak, restoreLeak } = useData();
  const toast = useToast();
  const flags = useLeakFlags();
  const [showDismissed, setShowDismissed] = useState(false);

  if (loading) return <PageSkeleton />;
  if (loadError) return <ErrorState message={loadError} onRetry={() => void reload()} />;

  const nameOf = (leak: Leak) =>
    leak.subscriptionIds.map((id) => ({ id, name: subscriptions.find((s) => s.id === id)?.name ?? 'subscription' }));
  const savings = potentialSavings(subscriptions, cur);

  return (
    <>
      <PageHeader
        title="Find My Leaks"
        subtitle="Things worth a second look. These are prompts, not verdicts: only you know what you actually use."
      />

      <Card className="mb-4 border-dashed p-4 sm:p-5">
        <p className="text-xs font-medium text-ink-soft">Potential annual savings (estimate)</p>
        <p className="tabular mt-1 text-2xl font-semibold text-ink">{formatMoney(savings.annual, cur)}</p>
        <p className="mt-1.5 text-sm text-ink-soft">
          Counts only subscriptions you marked as unused or plan to cancel, and only while they are still being charged. Nothing is
          saved until you cancel with the provider and confirm it. Past payments are never counted.
        </p>
      </Card>

      {flags.active.length === 0 ? (
        <EmptyState
          icon={<Droplets className="h-6 w-6" aria-hidden />}
          title={subscriptions.length === 0 ? 'Nothing to check yet' : 'No open flags'}
          description={
            subscriptions.length === 0
              ? 'Add some subscriptions and SubSave will look for forgotten trials, possible duplicates and more.'
              : 'Nothing looks off right now. New flags appear here as your subscriptions change.'
          }
        />
      ) : (
        <ul className="space-y-3" aria-label="Open flags">
          {flags.active.map((leak) => (
            <li key={leak.key}>
              <LeakCard
                leak={leak}
                names={nameOf(leak)}
                dismissed={false}
                onToggle={() => {
                  void dismissLeak(leak.key);
                  toast.info('Dismissed. You can bring it back below.');
                }}
              />
            </li>
          ))}
        </ul>
      )}

      {flags.dismissed.length > 0 && (
        <section className="mt-8" aria-label="Dismissed flags">
          <Button variant="ghost" size="sm" onClick={() => setShowDismissed((v) => !v)} aria-expanded={showDismissed}>
            {showDismissed ? 'Hide' : 'Show'} {flags.dismissed.length} dismissed {flags.dismissed.length === 1 ? 'flag' : 'flags'}
          </Button>
          {showDismissed && (
            <ul className="mt-3 space-y-3">
              {flags.dismissed.map((leak) => (
                <li key={leak.key}>
                  <LeakCard leak={leak} names={nameOf(leak)} dismissed onToggle={() => void restoreLeak(leak.key)} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <Notice className="mt-8" title="How these flags work">
        <ul className="mt-1 list-disc space-y-1 pl-5">
          <li>Duplicates are guesses based on similar names or the same provider and category. They are never confirmed.</li>
          <li>A high price is shown for information only. Expensive does not mean wasteful.</li>
          <li>Dismissing a flag hides it for good until you restore it. A flag comes back as new if the situation changes.</li>
        </ul>
      </Notice>
    </>
  );
}
