import type { SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_REMINDER_DAYS } from '../constants';
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
import { toRepoError, type Repo, type SubscriptionPatch } from './types';

interface PrefRow {
  subscription_id: string;
  enabled: boolean;
  days_before: number[] | null;
}

type Row = Record<string, unknown>;

function check<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw toRepoError(res.error);
  return res.data;
}

function toSubscription(row: Row, pref?: PrefRow): Subscription {
  return {
    ...(row as unknown as Subscription),
    amount: Number(row.amount),
    custom_interval_days: row.custom_interval_days === null ? null : Number(row.custom_interval_days),
    cancellation_checklist: Array.isArray(row.cancellation_checklist)
      ? (row.cancellation_checklist as Subscription['cancellation_checklist'])
      : [],
    reminders_enabled: pref ? pref.enabled : true,
    reminder_days: pref?.days_before ? pref.days_before.map(Number) : DEFAULT_REMINDER_DAYS,
  };
}

/** Splits a draft into the subscriptions row and its reminder preferences. */
function draftToRow(draft: SubscriptionDraft): Row {
  const { reminders_enabled: _e, reminder_days: _d, ...row } = draft;
  return row;
}

/**
 * Cloud storage for one signed-in user.
 *
 * Row Level Security in the database is the real protection. Every query here ALSO filters by
 * user_id as a second layer, so a mistake in one place cannot expose another user's rows.
 * Only the public anon key is ever used; this app has no privileged server key at all.
 */
export function createSupabaseRepo(client: SupabaseClient, userId: string): Repo {
  const savePrefs = async (subscriptionId: string, enabled: boolean, days: number[]) => {
    check(
      await client
        .from('reminder_preferences')
        .upsert(
          { user_id: userId, subscription_id: subscriptionId, enabled, days_before: days },
          { onConflict: 'subscription_id' },
        ),
    );
  };

  const getOne = async (id: string): Promise<Subscription> => {
    const row = check(await client.from('subscriptions').select('*').eq('id', id).eq('user_id', userId).single());
    const pref = check(
      await client
        .from('reminder_preferences')
        .select('subscription_id, enabled, days_before')
        .eq('subscription_id', id)
        .eq('user_id', userId)
        .maybeSingle(),
    );
    return toSubscription(row as Row, (pref ?? undefined) as PrefRow | undefined);
  };

  const defaultSettings = (): Row => ({ user_id: userId });

  return {
    kind: 'supabase',

    async listSubscriptions() {
      const [subsRes, prefsRes] = await Promise.all([
        client.from('subscriptions').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
        client.from('reminder_preferences').select('subscription_id, enabled, days_before').eq('user_id', userId),
      ]);
      const rows = (check(subsRes) ?? []) as Row[];
      const prefs = new Map(((check(prefsRes) ?? []) as PrefRow[]).map((p) => [p.subscription_id, p]));
      return rows.map((r) => toSubscription(r, prefs.get(r.id as string)));
    },

    async createSubscription(draft) {
      const row = check(
        await client
          .from('subscriptions')
          .insert({ ...draftToRow(draft), user_id: userId })
          .select('*')
          .single(),
      ) as Row;
      try {
        await savePrefs(row.id as string, draft.reminders_enabled, draft.reminder_days);
      } catch (err) {
        // Do not leave a half-saved subscription behind.
        await client.from('subscriptions').delete().eq('id', row.id as string).eq('user_id', userId);
        throw err;
      }
      return toSubscription(row, {
        subscription_id: row.id as string,
        enabled: draft.reminders_enabled,
        days_before: draft.reminder_days,
      });
    },

    async updateSubscription(id, draft) {
      const row = check(
        await client
          .from('subscriptions')
          .update(draftToRow(draft))
          .eq('id', id)
          .eq('user_id', userId)
          .select('*')
          .single(),
      ) as Row;
      await savePrefs(id, draft.reminders_enabled, draft.reminder_days);
      return toSubscription(row, { subscription_id: id, enabled: draft.reminders_enabled, days_before: draft.reminder_days });
    },

    async patchSubscription(id: string, patch: SubscriptionPatch) {
      check(await client.from('subscriptions').update(patch).eq('id', id).eq('user_id', userId));
      return getOne(id);
    },

    async changeStatus(id: string, status: Status) {
      // cancelled_at and the history entry are handled by database triggers.
      check(await client.from('subscriptions').update({ status }).eq('id', id).eq('user_id', userId));
      return getOne(id);
    },

    async deleteSubscription(id) {
      check(await client.from('subscriptions').delete().eq('id', id).eq('user_id', userId));
    },

    async listHistory(subscriptionId) {
      const rows = check(
        await client
          .from('subscription_status_history')
          .select('*')
          .eq('subscription_id', subscriptionId)
          .eq('user_id', userId)
          .order('changed_at', { ascending: false }),
      );
      return (rows ?? []) as StatusHistoryEntry[];
    },

    async listNotifications() {
      const rows = check(
        await client
          .from('notifications')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(100),
      );
      return (rows ?? []) as AppNotification[];
    },

    async createNotifications(drafts: NotificationDraft[]) {
      if (drafts.length === 0) return [];
      const rows = check(
        await client
          .from('notifications')
          .upsert(
            drafts.map((d) => ({ ...d, user_id: userId })),
            { onConflict: 'user_id,dedupe_key', ignoreDuplicates: true },
          )
          .select('*'),
      );
      return (rows ?? []) as AppNotification[];
    },

    async markNotificationsRead(ids) {
      const now = new Date().toISOString();
      let q = client.from('notifications').update({ read_at: now }).eq('user_id', userId).is('read_at', null);
      if (ids !== 'all') q = q.in('id', ids);
      check(await q);
    },

    async getSettings() {
      const existing = check(await client.from('user_settings').select('*').eq('user_id', userId).maybeSingle());
      if (existing) return existing as UserSettings;
      // Older accounts may predate the signup trigger: create the row on first use.
      return check(
        await client.from('user_settings').upsert(defaultSettings(), { onConflict: 'user_id' }).select('*').single(),
      ) as UserSettings;
    },

    async saveSettings(patch: SettingsPatch) {
      return check(
        await client
          .from('user_settings')
          .upsert({ user_id: userId, ...patch }, { onConflict: 'user_id' })
          .select('*')
          .single(),
      ) as UserSettings;
    },

    async deleteAllData() {
      // Deleting subscriptions cascades to reminder preferences, history and linked notifications.
      check(await client.from('subscriptions').delete().eq('user_id', userId));
      check(await client.from('notifications').delete().eq('user_id', userId));
      check(
        await client
          .from('user_settings')
          .upsert({ user_id: userId, onboarding_completed: false, dismissed_leak_flags: [] }, { onConflict: 'user_id' }),
      );
    },
  };
}
