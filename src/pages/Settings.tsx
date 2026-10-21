import { useState } from 'react';
import { Button, Card, Checkbox, ConfirmDialog, ErrorState, Field, Notice, PageHeader, PageSkeleton, Select } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useData } from '@/context/DataContext';
import { useToast } from '@/context/ToastContext';
import {
  browserNotificationPermission,
  browserNotificationsSupported,
  requestBrowserNotificationPermission,
  showBrowserNotification,
} from '@/lib/browserNotify';
import { REMINDER_LABELS } from '@/lib/constants';
import { CURRENCIES, REMINDER_OFFSETS } from '@/lib/types';

export default function Settings() {
  const { settings, loading, loadError, reload, saveSettings, deleteAllData, mode, resetDemo } = useData();
  const auth = useAuth();
  const toast = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [permission, setPermission] = useState(browserNotificationPermission());

  if (loading || (!settings && !loadError)) return <PageSkeleton />;
  if (loadError || !settings) return <ErrorState message={loadError ?? 'Settings could not be loaded.'} onRetry={() => void reload()} />;

  const toggleDefaultReminder = async (d: number) => {
    const current = settings.default_reminder_days;
    const next = current.includes(d) ? current.filter((x) => x !== d) : [...current, d];
    const saved = await saveSettings({ default_reminder_days: next.sort((a, b) => b - a) });
    if (saved) toast.success('Default reminders saved');
  };

  const toggleBrowserNotifications = async (on: boolean) => {
    if (on) {
      const result = await requestBrowserNotificationPermission();
      setPermission(result);
      if (result !== 'granted') {
        toast.error(
          result === 'unsupported'
            ? 'This browser does not support notifications. In-app reminders still work.'
            : 'Notifications are blocked. Allow them in your browser settings, then try again.',
        );
        return;
      }
      showBrowserNotification('SubSave notifications are on', 'You will see these while SubSave is open in a browser tab.', 'subsave-test');
    }
    const saved = await saveSettings({ browser_notifications: on });
    if (saved) toast.success(on ? 'Browser notifications on' : 'Browser notifications off');
  };

  const wipe = async () => {
    setBusy(true);
    const ok = await deleteAllData();
    setBusy(false);
    setConfirmDelete(false);
    if (ok) toast.success('All your subscription data was deleted');
  };

  return (
    <>
      <PageHeader title="Settings" />

      <div className="space-y-4">
        <Card className="p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-ink">Account</h2>
          <p className="mt-1 text-sm text-ink-soft">{mode === 'demo' ? 'Demo mode: sample data stored only in this browser.' : auth.user?.email}</p>
        </Card>

        <Card className="p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-ink">Currency</h2>
          <Field label="Main currency" className="mt-3 max-w-xs" hint="Dashboard totals use this currency. SubSave never converts between currencies.">
            {({ id, describedBy }) => (
              <Select
                id={id}
                aria-describedby={describedBy}
                value={settings.default_currency}
                onChange={async (e) => {
                  const saved = await saveSettings({ default_currency: e.target.value });
                  if (saved) toast.success('Currency saved');
                }}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </Card>

        <Card className="p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-ink">Default reminders</h2>
          <p className="mt-1 text-xs text-ink-soft">Used for new subscriptions. You can change them for each subscription.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2" role="group" aria-label="Default reminder timing">
            {REMINDER_OFFSETS.map((d) => (
              <Checkbox
                key={d}
                label={REMINDER_LABELS[d]}
                checked={settings.default_reminder_days.includes(d)}
                onChange={() => void toggleDefaultReminder(d)}
              />
            ))}
          </div>
        </Card>

        <Card className="p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-ink">Browser notifications</h2>
          <Notice className="mt-3" title="What this does and does not do">
            Reminders always appear in the notification centre when you open SubSave. If you turn this on, your browser can also show a
            pop-up at that moment. Neither works while the browser is closed: that would need a server that sends scheduled push messages,
            which this version does not include.
          </Notice>
          <div className="mt-3">
            {browserNotificationsSupported() ? (
              <Checkbox
                label="Show a browser pop-up for new reminders"
                description={permission === 'denied' ? 'Blocked in your browser settings.' : undefined}
                checked={settings.browser_notifications && permission === 'granted'}
                disabled={permission === 'denied'}
                onChange={(e) => void toggleBrowserNotifications(e.target.checked)}
              />
            ) : (
              <p className="text-sm text-ink-soft">This browser does not support notifications. In-app reminders still work.</p>
            )}
          </div>
        </Card>

        <Card className="p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-ink">Your data</h2>
          <p className="mt-1 text-sm text-ink-soft">
            SubSave stores subscription names, amounts, dates and payment-method labels only. It never asks for card numbers, CVVs, bank
            logins or UPI PINs.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {mode === 'demo' && (
              <Button variant="secondary" size="sm" onClick={() => void resetDemo()}>
                Reset sample data
              </Button>
            )}
            <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)}>
              Delete all my subscription data
            </Button>
          </div>
        </Card>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        danger
        title="Delete all subscription data?"
        description="This permanently removes every subscription, reminder, notification and history entry. Your account itself stays. This cannot be undone."
        confirmLabel="Delete everything"
        loading={busy}
        onConfirm={() => void wipe()}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}
