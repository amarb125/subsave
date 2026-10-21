export const CATEGORIES = [
  'Entertainment',
  'Music',
  'Software',
  'Education',
  'Fitness',
  'Shopping',
  'Cloud Storage',
  'News',
  'Utilities',
  'Other',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const FREQUENCIES = ['weekly', 'monthly', 'quarterly', 'half_yearly', 'yearly', 'custom'] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export const PAYMENT_METHODS = ['UPI', 'Credit Card', 'Debit Card', 'Net Banking', 'Wallet', 'Other'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const STATUSES = ['active', 'trial', 'paused', 'cancellation_planned', 'cancelled'] as const;
export type Status = (typeof STATUSES)[number];

export const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP'] as const;
export type Currency = (typeof CURRENCIES)[number];

export const REMINDER_OFFSETS = [7, 3, 1, 0] as const;

export interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
}

/** A subscription as stored (plus reminder preferences merged in on the client). */
export interface Subscription {
  id: string;
  user_id: string;
  name: string;
  provider: string | null;
  category: Category;
  /** Amount charged per billing cycle, in `currency`. Zero is allowed (free plans). */
  amount: number;
  currency: string;
  frequency: Frequency;
  /** Only used when frequency === 'custom'. */
  custom_interval_days: number | null;
  /** ISO calendar dates: yyyy-MM-dd (no time zone). */
  start_date: string;
  next_renewal_date: string;
  /** Label only. We never store card numbers, CVVs, bank credentials or UPI PINs. */
  payment_method: PaymentMethod;
  notes: string | null;
  trial_end_date: string | null;
  status: Status;
  archived: boolean;
  /** User-declared: "I don't really use this". Never inferred automatically. */
  unused: boolean;
  /** Optional, user-entered http(s) URL. */
  cancellation_url: string | null;
  cancellation_checklist: ChecklistItem[];
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
  // Merged from reminder_preferences:
  reminders_enabled: boolean;
  reminder_days: number[];
}

/** What the form / repositories accept when creating or editing. */
export type SubscriptionDraft = Omit<
  Subscription,
  'id' | 'user_id' | 'created_at' | 'updated_at' | 'cancelled_at'
>;

export interface StatusHistoryEntry {
  id: string;
  user_id: string;
  subscription_id: string;
  from_status: Status | null;
  to_status: Status;
  changed_at: string;
}

export type NotificationKind = 'renewal' | 'trial_end' | 'system';

export interface AppNotification {
  id: string;
  user_id: string;
  subscription_id: string | null;
  kind: NotificationKind;
  title: string;
  body: string;
  /** Prevents the same reminder being created twice. */
  dedupe_key: string;
  read_at: string | null;
  created_at: string;
}

export type NotificationDraft = Pick<
  AppNotification,
  'subscription_id' | 'kind' | 'title' | 'body' | 'dedupe_key'
>;

export interface UserSettings {
  user_id: string;
  default_currency: string;
  default_reminder_days: number[];
  browser_notifications: boolean;
  onboarding_completed: boolean;
  /** Keys of leak flags the user dismissed (see lib/leaks.ts). */
  dismissed_leak_flags: string[];
  updated_at: string;
}

export type SettingsPatch = Partial<
  Pick<
    UserSettings,
    'default_currency' | 'default_reminder_days' | 'browser_notifications' | 'onboarding_completed' | 'dismissed_leak_flags'
  >
>;
