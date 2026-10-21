import { Archive, ArchiveRestore, ExternalLink, Pause, Pencil, Play, Trash2 } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ButtonLink } from '@/components/ButtonLink';
import { StatusBadge } from '@/components/StatusBadge';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Notice,
  PageHeader,
  PageSkeleton,
} from '@/components/ui';
import { useData } from '@/context/DataContext';
import { useToast } from '@/context/ToastContext';
import {
  annualCost,
  daysUntil,
  effectiveRenewal,
  formatMoney,
  isSpendCounted,
  monthlyEquivalent,
} from '@/lib/calc';
import { FREQUENCY_LABELS, REMINDER_LABELS, STATUS_LABELS } from '@/lib/constants';
import { diffDays, isValidISODate } from '@/lib/dates';
import { formatDate, formatTimestamp, relativeDays } from '@/lib/format';
import { cycleLabel } from '@/lib/labels';
import { isSafeHttpUrl } from '@/lib/schema';
import type { Status, StatusHistoryEntry } from '@/lib/types';

type Pending = null | 'cancelled' | 'cancellation_planned' | 'delete';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 text-sm">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="text-right font-medium text-ink">{children}</dd>
    </div>
  );
}

export default function SubscriptionDetails() {
  const { id } = useParams();
  const { subscriptions, today, loading, loadError, reload, setStatus, patchSubscription, removeSubscription, getHistory } = useData();
  const toast = useToast();
  const navigate = useNavigate();
  const sub = subscriptions.find((s) => s.id === id);

  const [history, setHistory] = useState<StatusHistoryEntry[] | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);
  const statusKey = sub?.status;

  useEffect(() => {
    let active = true;
    if (!id) return;
    void getHistory(id).then((h) => active && setHistory(h));
    return () => {
      active = false;
    };
    // Reload the history whenever the status changes.
  }, [id, statusKey, getHistory]);

  if (loading) return <PageSkeleton />;
  if (loadError) return <ErrorState message={loadError} onRetry={() => void reload()} />;
  if (!sub) {
    return (
      <EmptyState
        title="Subscription not found"
        description="It may have been deleted."
        action={<ButtonLink to="/subscriptions">Back to subscriptions</ButtonLink>}
      />
    );
  }

  const renewal = effectiveRenewal(sub, today);
  const renewalGap = renewal ? daysUntil(today, renewal) : null;
  const counted = isSpendCounted(sub);
  const checklistDone = sub.cancellation_checklist.filter((c) => c.done).length;
  const safeUrl = sub.cancellation_url && isSafeHttpUrl(sub.cancellation_url) ? sub.cancellation_url : null;
  const trialDays = sub.status === 'trial' && isValidISODate(sub.trial_end_date) ? diffDays(today, sub.trial_end_date as string) : null;

  const change = async (status: Status, message: string) => {
    setBusy(true);
    const result = await setStatus(sub.id, status);
    setBusy(false);
    setPending(null);
    if (result) toast.success(message);
  };

  const toggleChecklist = (itemId: string) =>
    void patchSubscription(sub.id, {
      cancellation_checklist: sub.cancellation_checklist.map((c) => (c.id === itemId ? { ...c, done: !c.done } : c)),
    });

  const toggleFlag = async (patch: { unused?: boolean; archived?: boolean }, message: string) => {
    const result = await patchSubscription(sub.id, patch);
    if (result) toast.success(message);
  };

  const remove = async () => {
    setBusy(true);
    const ok = await removeSubscription(sub.id);
    setBusy(false);
    setPending(null);
    if (ok) {
      toast.success(`${sub.name} deleted`);
      navigate('/subscriptions', { replace: true });
    }
  };

  return (
    <>
      <PageHeader
        title={sub.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={sub.status} />
            {sub.unused && <Badge tone="warn">Marked unused</Badge>}
            {sub.archived && <Badge tone="muted">Archived</Badge>}
            {[sub.provider, sub.category].filter(Boolean).join(' · ')}
          </span>
        }
        actions={
          <ButtonLink to={`/subscriptions/${sub.id}/edit`} variant="secondary" size="sm">
            <Pencil className="h-4 w-4" aria-hidden />
            Edit
          </ButtonLink>
        }
      />

      {sub.status === 'cancellation_planned' && (
        <Notice tone="warn" title="Cancellation planned, not confirmed" className="mb-4">
          SubSave cannot cancel anything for you. Cancel with {sub.provider ?? 'the provider'}, then press “Confirm it is cancelled”
          below. Until then it still counts as spending.
        </Notice>
      )}
      {trialDays !== null && (
        <Notice tone="warn" title={trialDays < 0 ? 'Trial end date has passed' : `Trial ends ${relativeDays(trialDays).toLowerCase()}`} className="mb-4">
          {trialDays < 0
            ? 'Check whether you are being charged, then update the status.'
            : `Billing of ${formatMoney(sub.amount, sub.currency)} may start after ${formatDate(sub.trial_end_date)}.`}
        </Notice>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-ink">Cost and schedule</h2>
          <dl className="mt-1 divide-y divide-paper-line">
            <Row label="Each payment">
              {formatMoney(sub.amount, sub.currency)} <span className="font-normal text-ink-soft">{cycleLabel(sub)}</span>
            </Row>
            <Row label="Billing">{FREQUENCY_LABELS[sub.frequency]}</Row>
            <Row label="Monthly equivalent">{formatMoney(monthlyEquivalent(sub), sub.currency)}</Row>
            <Row label="Annualised cost">{formatMoney(annualCost(sub), sub.currency)}</Row>
            <Row label="Started">{formatDate(sub.start_date)}</Row>
            <Row label="Next renewal">
              {sub.status === 'cancelled' || sub.status === 'paused' ? (
                <span className="font-normal text-ink-soft">{sub.status === 'paused' ? 'Paused' : 'Cancelled'}</span>
              ) : renewal ? (
                <>
                  {formatDate(renewal)}
                  {renewalGap !== null && <span className="block text-xs font-normal text-ink-soft">{relativeDays(renewalGap)}</span>}
                </>
              ) : (
                '—'
              )}
            </Row>
            {sub.trial_end_date && <Row label="Trial ends">{formatDate(sub.trial_end_date)}</Row>}
            <Row label="Payment method">{sub.payment_method}</Row>
            <Row label="Counts toward spending">{counted ? 'Yes' : 'No'}</Row>
          </dl>
        </Card>

        <Card className="p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-ink">Reminders</h2>
          {sub.reminders_enabled && sub.reminder_days.length > 0 ? (
            <ul className="mt-2 list-inside list-disc text-sm text-ink">
              {[...sub.reminder_days]
                .sort((a, b) => b - a)
                .map((d) => (
                  <li key={d}>{REMINDER_LABELS[d] ?? `${d} days before`}</li>
                ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-ink-soft">Reminders are off for this subscription.</p>
          )}
          <p className="mt-3 text-xs text-ink-soft">Reminders appear in the app when you open it. Change them with Edit.</p>

          <h2 className="mt-5 text-sm font-semibold text-ink">Notes</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-ink-soft">{sub.notes ?? 'No notes.'}</p>
        </Card>

        <Card className="p-4 sm:p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold text-ink">What would you like to do?</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {sub.status === 'paused' ? (
              <Button variant="secondary" size="sm" disabled={busy} onClick={() => void change('active', 'Marked as active')}>
                <Play className="h-4 w-4" aria-hidden />
                Resume
              </Button>
            ) : sub.status !== 'cancelled' ? (
              <Button variant="secondary" size="sm" disabled={busy} onClick={() => void change('paused', 'Paused')}>
                <Pause className="h-4 w-4" aria-hidden />
                Pause
              </Button>
            ) : null}

            {sub.status !== 'cancelled' && sub.status !== 'cancellation_planned' && (
              <Button variant="secondary" size="sm" disabled={busy} onClick={() => setPending('cancellation_planned')}>
                Plan to cancel
              </Button>
            )}
            {sub.status === 'cancellation_planned' && (
              <Button variant="secondary" size="sm" disabled={busy} onClick={() => void change('active', 'Cancellation plan removed')}>
                Keep it (undo plan)
              </Button>
            )}
            {sub.status !== 'cancelled' && (
              <Button size="sm" disabled={busy} onClick={() => setPending('cancelled')}>
                Confirm it is cancelled
              </Button>
            )}
            {sub.status === 'cancelled' && (
              <Button variant="secondary" size="sm" disabled={busy} onClick={() => void change('active', 'Marked as active again')}>
                Re-activate
              </Button>
            )}

            {sub.status !== 'cancelled' && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void toggleFlag({ unused: !sub.unused }, sub.unused ? 'Unused flag removed' : 'Marked as unused')}
              >
                {sub.unused ? 'I do use it' : 'Mark as unused'}
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void toggleFlag({ archived: !sub.archived }, sub.archived ? 'Restored from archive' : 'Archived')}
            >
              {sub.archived ? <ArchiveRestore className="h-4 w-4" aria-hidden /> : <Archive className="h-4 w-4" aria-hidden />}
              {sub.archived ? 'Restore' : 'Archive'}
            </Button>
            <Button variant="ghost" size="sm" className="text-red-700 hover:bg-red-50 hover:text-red-800" onClick={() => setPending('delete')}>
              <Trash2 className="h-4 w-4" aria-hidden />
              Delete
            </Button>
          </div>
          <p className="mt-3 text-xs text-ink-soft">
            Archiving hides it from your lists and stops reminders and spending totals, but keeps the record. Marking something
            unused only creates an estimate of what you could save.
          </p>
        </Card>

        <Card className="p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-ink">Cancellation checklist</h2>
          <p className="mt-1 text-xs text-ink-soft">
            SubSave does not cancel subscriptions. Cancel through {sub.provider ?? 'the provider'} and tick these off as you go.
            {sub.cancellation_checklist.length > 0 && ` ${checklistDone} of ${sub.cancellation_checklist.length} done.`}
          </p>
          {safeUrl ? (
            <a
              href={safeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-paper-line px-3 text-sm font-medium text-brand-700 hover:bg-brand-50"
            >
              <ExternalLink className="h-4 w-4" aria-hidden />
              Open the cancellation page you saved
            </a>
          ) : (
            <p className="mt-3 text-xs text-ink-soft">
              No cancellation link saved. <Link to={`/subscriptions/${sub.id}/edit`} className="font-medium text-brand-700 underline">Add one</Link> from the
              provider's official site.
            </p>
          )}
          <ul className="mt-3 space-y-3">
            {sub.cancellation_checklist.map((item) => (
              <li key={item.id}>
                <Checkbox label={item.label} checked={item.done} onChange={() => toggleChecklist(item.id)} />
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-ink">Status history</h2>
          {history === null ? (
            <p className="mt-2 text-sm text-ink-soft">Loading…</p>
          ) : history.length === 0 ? (
            <p className="mt-2 text-sm text-ink-soft">No changes recorded yet.</p>
          ) : (
            <ol className="mt-3 space-y-3 border-l border-paper-line pl-4">
              {history.map((h) => (
                <li key={h.id} className="text-sm">
                  <p className="font-medium text-ink">
                    {h.from_status ? `${STATUS_LABELS[h.from_status]} → ${STATUS_LABELS[h.to_status]}` : `Added as ${STATUS_LABELS[h.to_status]}`}
                  </p>
                  <p className="text-xs text-ink-soft">{formatTimestamp(h.changed_at)}</p>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      <ConfirmDialog
        open={pending === 'cancelled'}
        title="Confirm cancellation?"
        description={`Only continue if ${sub.provider ?? 'the provider'} has confirmed that ${sub.name} is cancelled. It will stop counting toward your spending.`}
        confirmLabel="Yes, it is cancelled"
        loading={busy}
        onConfirm={() => void change('cancelled', `${sub.name} marked as cancelled`)}
        onCancel={() => setPending(null)}
      />
      <ConfirmDialog
        open={pending === 'cancellation_planned'}
        title="Plan to cancel?"
        description="This only records your intention and adds it to your estimated savings. It keeps counting as spending until you confirm the cancellation."
        confirmLabel="Plan to cancel"
        loading={busy}
        onConfirm={() => void change('cancellation_planned', 'Cancellation planned')}
        onCancel={() => setPending(null)}
      />
      <ConfirmDialog
        open={pending === 'delete'}
        danger
        title={`Delete ${sub.name}?`}
        description="This permanently removes the subscription, its history and its reminders. Archiving keeps the record instead."
        confirmLabel="Delete permanently"
        loading={busy}
        onConfirm={() => void remove()}
        onCancel={() => setPending(null)}
      />
    </>
  );
}
