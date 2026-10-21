import { DEFAULT_CHECKLIST_LABELS, DEFAULT_REMINDER_DAYS } from './constants';
import { addMonths, todayISO } from './dates';
import type { SubscriptionFormValues } from './schema';
import type { ChecklistItem, Subscription, SubscriptionDraft, UserSettings } from './types';

export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function defaultChecklist(): ChecklistItem[] {
  return DEFAULT_CHECKLIST_LABELS.map((label) => ({ id: newId(), label, done: false }));
}

export function emptyFormValues(
  settings?: Pick<UserSettings, 'default_currency' | 'default_reminder_days'>,
  today: string = todayISO(),
): SubscriptionFormValues {
  return {
    name: '',
    provider: '',
    category: 'Entertainment',
    amount: NaN,
    currency: (settings?.default_currency ?? 'INR') as SubscriptionFormValues['currency'],
    frequency: 'monthly',
    custom_interval_days: null,
    start_date: today,
    next_renewal_date: addMonths(today, 1),
    payment_method: 'UPI',
    notes: '',
    trial_end_date: '',
    status: 'active',
    cancellation_url: '',
    reminders_enabled: true,
    reminder_days: settings?.default_reminder_days ?? DEFAULT_REMINDER_DAYS,
  };
}

export function subscriptionToFormValues(sub: Subscription): SubscriptionFormValues {
  return {
    name: sub.name,
    provider: sub.provider ?? '',
    category: sub.category,
    amount: sub.amount,
    currency: sub.currency as SubscriptionFormValues['currency'],
    frequency: sub.frequency,
    custom_interval_days: sub.custom_interval_days,
    start_date: sub.start_date,
    next_renewal_date: sub.next_renewal_date,
    payment_method: sub.payment_method,
    notes: sub.notes ?? '',
    trial_end_date: sub.trial_end_date ?? '',
    status: sub.status,
    cancellation_url: sub.cancellation_url ?? '',
    reminders_enabled: sub.reminders_enabled,
    reminder_days: [...sub.reminder_days].sort((a, b) => b - a),
  };
}

/**
 * Converts validated form values into what gets stored. Empty optional fields become null and
 * the custom interval is dropped unless billing is custom. Fields the form does not edit
 * (unused flag, archive flag, checklist) are carried over from `base` when editing.
 */
export function formToDraft(values: SubscriptionFormValues, base?: Subscription): SubscriptionDraft {
  const blank = (s: string) => (s.trim() === '' ? null : s.trim());
  return {
    name: values.name.trim(),
    provider: blank(values.provider),
    category: values.category,
    amount: values.amount,
    currency: values.currency,
    frequency: values.frequency,
    custom_interval_days: values.frequency === 'custom' ? (values.custom_interval_days as number) : null,
    start_date: values.start_date,
    next_renewal_date: values.next_renewal_date,
    payment_method: values.payment_method,
    notes: blank(values.notes),
    trial_end_date: blank(values.trial_end_date),
    status: values.status,
    archived: base?.archived ?? false,
    unused: base?.unused ?? false,
    cancellation_url: blank(values.cancellation_url),
    cancellation_checklist: base?.cancellation_checklist ?? defaultChecklist(),
    reminders_enabled: values.reminders_enabled,
    reminder_days: [...values.reminder_days].sort((a, b) => b - a),
  };
}
