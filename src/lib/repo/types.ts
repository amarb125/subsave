import type {
  AppNotification,
  NotificationDraft,
  SettingsPatch,
  Status,
  StatusHistoryEntry,
  Subscription,
  SubscriptionDraft,
  UserSettings,
} from '../types';

/** Fields that can be changed without going through the full edit form. */
export type SubscriptionPatch = Partial<
  Pick<Subscription, 'unused' | 'archived' | 'cancellation_checklist' | 'cancellation_url' | 'notes'>
>;

/**
 * Everything the UI needs from storage. There are exactly two implementations:
 *  - SupabaseRepo: the real cloud database, scoped to one signed-in user.
 *  - DemoRepo: browser-only sample data, kept under its own storage key and never synced.
 * They never share data.
 */
export interface Repo {
  readonly kind: 'supabase' | 'demo';
  listSubscriptions(): Promise<Subscription[]>;
  createSubscription(draft: SubscriptionDraft): Promise<Subscription>;
  updateSubscription(id: string, draft: SubscriptionDraft): Promise<Subscription>;
  patchSubscription(id: string, patch: SubscriptionPatch): Promise<Subscription>;
  changeStatus(id: string, status: Status): Promise<Subscription>;
  deleteSubscription(id: string): Promise<void>;
  listHistory(subscriptionId: string): Promise<StatusHistoryEntry[]>;
  listNotifications(): Promise<AppNotification[]>;
  /** Creates reminders that do not exist yet (by dedupe_key) and returns only the new ones. */
  createNotifications(drafts: NotificationDraft[]): Promise<AppNotification[]>;
  markNotificationsRead(ids: string[] | 'all'): Promise<void>;
  getSettings(): Promise<UserSettings>;
  saveSettings(patch: SettingsPatch): Promise<UserSettings>;
  /** Removes every subscription, reminder, notification and history entry for this user. */
  deleteAllData(): Promise<void>;
}

export class RepoError extends Error {
  /** True when the session is no longer valid and the user must sign in again. */
  readonly authExpired: boolean;
  /** True for connectivity problems (offline, DNS, timeout). */
  readonly network: boolean;

  constructor(message: string, opts: { authExpired?: boolean; network?: boolean } = {}) {
    super(message);
    this.name = 'RepoError';
    this.authExpired = opts.authExpired ?? false;
    this.network = opts.network ?? false;
  }
}

interface ErrorLike {
  message?: string;
  code?: string;
  status?: number;
  name?: string;
}

/** Turns whatever Supabase threw into a RepoError with a message safe to show to the user. */
export function toRepoError(err: unknown): RepoError {
  if (err instanceof RepoError) return err;
  const e = (err ?? {}) as ErrorLike;
  const message = String(e.message ?? '');
  const authExpired =
    e.status === 401 ||
    e.code === 'PGRST301' ||
    e.code === 'PGRST303' ||
    /jwt expired|invalid jwt|not authenticated|refresh token/i.test(message);
  const network =
    /failed to fetch|networkerror|network request failed|fetch failed|load failed|timeout/i.test(message) ||
    e.name === 'AuthRetryableFetchError';
  if (authExpired) return new RepoError('Your session has expired. Please sign in again.', { authExpired: true });
  if (network) return new RepoError("Can't reach the server. Check your internet connection and try again.", { network: true });
  if (e.code === '42501' || /row-level security/i.test(message)) {
    return new RepoError("You don't have permission to do that.");
  }
  if (e.code === '23514' || /check constraint/i.test(message)) {
    return new RepoError('Some of the details were not accepted. Please check the form and try again.');
  }
  if (e.code === '23505') return new RepoError('That already exists.');
  return new RepoError('Something went wrong while saving. Please try again.');
}
