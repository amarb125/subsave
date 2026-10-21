import { effectiveRenewal, formatMoney } from './calc';
import { diffDays, isValidISODate } from './dates';
import type { NotificationDraft, Subscription } from './types';

export interface DueReminder extends NotificationDraft {
  subscription_id: string;
  daysBefore: number;
  date: string;
}

function when(days: number): string {
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

/** The tightest chosen offset that has already been reached (e.g. offsets 7,1 and 5 days left → 7). */
function pickOffset(offsets: number[], daysLeft: number): number | null {
  const reached = offsets.filter((o) => o >= daysLeft);
  return reached.length ? Math.min(...reached) : null;
}

/**
 * Reminders that should exist *right now*. Called whenever the app opens, so reminders are
 * reliable while the app is used. Nothing here runs in the background: see the README for the
 * server-side architecture that would be needed for that.
 *
 * Each reminder has a dedupe key so opening the app ten times creates it once.
 */
export function computeDueReminders(subs: Subscription[], today: string): DueReminder[] {
  const out: DueReminder[] = [];
  for (const s of subs) {
    if (s.archived || !s.reminders_enabled || s.reminder_days.length === 0) continue;

    if (s.status === 'active' || s.status === 'cancellation_planned') {
      const date = effectiveRenewal(s, today);
      if (date) {
        const left = diffDays(today, date);
        const offset = pickOffset(s.reminder_days, left);
        if (left >= 0 && offset !== null) {
          out.push({
            dedupe_key: `${s.id}:renewal:${date}:${offset}`,
            subscription_id: s.id,
            kind: 'renewal',
            daysBefore: offset,
            date,
            title: `${s.name} renews ${when(left)}`,
            body:
              `${formatMoney(s.amount, s.currency)} is due ${when(left)} (${date}).` +
              (s.status === 'cancellation_planned'
                ? ' You planned to cancel. Cancel with the provider before this date.'
                : ''),
          });
        }
      }
    }

    if (s.status === 'trial' && isValidISODate(s.trial_end_date)) {
      const date = s.trial_end_date as string;
      const left = diffDays(today, date);
      const offset = pickOffset(s.reminder_days, left);
      if (left >= 0 && offset !== null) {
        out.push({
          dedupe_key: `${s.id}:trial_end:${date}:${offset}`,
          subscription_id: s.id,
          kind: 'trial_end',
          daysBefore: offset,
          date,
          title: `${s.name} trial ends ${when(left)}`,
          body: `Billing of ${formatMoney(s.amount, s.currency)} may start after ${date}. Cancel before then if you do not want to continue.`,
        });
      }
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
