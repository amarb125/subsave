import type { Frequency, Status } from './types';

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  half_yearly: 'Half-yearly',
  yearly: 'Yearly',
  custom: 'Custom',
};

export const STATUS_LABELS: Record<Status, string> = {
  active: 'Active',
  trial: 'Trial',
  paused: 'Paused',
  cancellation_planned: 'Cancellation planned',
  cancelled: 'Cancelled',
};

export const REMINDER_LABELS: Record<number, string> = {
  7: '7 days before',
  3: '3 days before',
  1: '1 day before',
  0: 'On the renewal date',
};

export const DEFAULT_REMINDER_DAYS = [7, 1];

export const DEFAULT_CHECKLIST_LABELS = [
  "Log in to the provider's website or app",
  'Open the billing / subscription settings',
  'Cancel the plan and save the confirmation',
  'Look for a confirmation email or message',
  'Remove any UPI AutoPay mandate or card standing instruction, if one exists',
  'Mark the subscription as Cancelled in SubSave once the provider confirms',
];
