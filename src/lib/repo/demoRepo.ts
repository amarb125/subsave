import { newId } from '../forms';
import { applyStatusChange } from '../status';
import { todayISO } from '../dates';
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
import { buildSampleSubscriptions, DEMO_USER_ID } from './demoData';
import { RepoError, type Repo, type SubscriptionPatch } from './types';

/** Demo data lives under its own key and is never mixed with, or uploaded to, a real account. */
export const DEMO_STORAGE_KEY = 'subsave:demo:v1';

interface DemoStore {
  version: 1;
  subscriptions: Subscription[];
  history: StatusHistoryEntry[];
  notifications: AppNotification[];
  settings: UserSettings;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function freshStore(now: Date): DemoStore {
  const nowISO = now.toISOString();
  const subscriptions = buildSampleSubscriptions(todayISO(now), nowISO);
  return {
    version: 1,
    subscriptions,
    history: subscriptions.map((s) => ({
      id: newId(),
      user_id: DEMO_USER_ID,
      subscription_id: s.id,
      from_status: null,
      to_status: s.status,
      changed_at: s.created_at,
    })),
    notifications: [],
    settings: {
      user_id: DEMO_USER_ID,
      default_currency: 'INR',
      default_reminder_days: [7, 1],
      browser_notifications: false,
      onboarding_completed: true,
      dismissed_leak_flags: [],
      updated_at: nowISO,
    },
  };
}

export function clearDemoData(storage: StorageLike = window.localStorage, key = DEMO_STORAGE_KEY): void {
  try {
    storage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function createDemoRepo(
  storage: StorageLike = window.localStorage,
  options: { key?: string; now?: () => Date } = {},
): Repo & { reset(): void } {
  const key = options.key ?? DEMO_STORAGE_KEY;
  const now = options.now ?? (() => new Date());
  let memory: DemoStore | null = null;

  const load = (): DemoStore => {
    if (memory) return memory;
    try {
      const raw = storage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as DemoStore;
        if (parsed && parsed.version === 1 && Array.isArray(parsed.subscriptions)) {
          memory = parsed;
          return parsed;
        }
      }
    } catch {
      /* corrupted data: start over with fresh sample data */
    }
    memory = freshStore(now());
    persist();
    return memory;
  };

  const persist = () => {
    if (!memory) return;
    try {
      storage.setItem(key, JSON.stringify(memory));
    } catch {
      // Storage full or blocked (e.g. private mode): the demo keeps working in memory for this tab.
    }
  };

  const find = (store: DemoStore, id: string): Subscription => {
    const sub = store.subscriptions.find((s) => s.id === id);
    if (!sub) throw new RepoError('That subscription no longer exists.');
    return sub;
  };

  const replace = (store: DemoStore, updated: Subscription) => {
    store.subscriptions = store.subscriptions.map((s) => (s.id === updated.id ? updated : s));
  };

  return {
    kind: 'demo',

    reset() {
      memory = freshStore(now());
      persist();
    },

    async listSubscriptions() {
      return structuredCloneSafe(load().subscriptions);
    },

    async createSubscription(draft: SubscriptionDraft) {
      const store = load();
      const nowISO = now().toISOString();
      const sub: Subscription = {
        ...draft,
        id: newId(),
        user_id: DEMO_USER_ID,
        cancelled_at: draft.status === 'cancelled' ? nowISO : null,
        created_at: nowISO,
        updated_at: nowISO,
      };
      store.subscriptions = [sub, ...store.subscriptions];
      store.history.push({
        id: newId(),
        user_id: DEMO_USER_ID,
        subscription_id: sub.id,
        from_status: null,
        to_status: sub.status,
        changed_at: nowISO,
      });
      persist();
      return { ...sub };
    },

    async updateSubscription(id, draft) {
      const store = load();
      const current = find(store, id);
      const nowISO = now().toISOString();
      const merged: Subscription = { ...current, ...draft, id, user_id: current.user_id, updated_at: nowISO };
      const result = applyStatusChange({ ...merged, status: current.status, cancelled_at: current.cancelled_at }, draft.status, nowISO);
      replace(store, result.subscription);
      if (result.history) store.history.push({ id: newId(), ...result.history });
      persist();
      return { ...result.subscription };
    },

    async patchSubscription(id, patch: SubscriptionPatch) {
      const store = load();
      const updated: Subscription = { ...find(store, id), ...patch, updated_at: now().toISOString() };
      replace(store, updated);
      persist();
      return { ...updated };
    },

    async changeStatus(id, status: Status) {
      const store = load();
      const result = applyStatusChange(find(store, id), status, now().toISOString());
      replace(store, result.subscription);
      if (result.history) store.history.push({ id: newId(), ...result.history });
      persist();
      return { ...result.subscription };
    },

    async deleteSubscription(id) {
      const store = load();
      find(store, id);
      store.subscriptions = store.subscriptions.filter((s) => s.id !== id);
      store.history = store.history.filter((h) => h.subscription_id !== id);
      store.notifications = store.notifications.filter((n) => n.subscription_id !== id);
      persist();
    },

    async listHistory(subscriptionId) {
      return load()
        .history.filter((h) => h.subscription_id === subscriptionId)
        .sort((a, b) => b.changed_at.localeCompare(a.changed_at));
    },

    async listNotifications() {
      return [...load().notifications].sort((a, b) => b.created_at.localeCompare(a.created_at));
    },

    async createNotifications(drafts: NotificationDraft[]) {
      const store = load();
      const existing = new Set(store.notifications.map((n) => n.dedupe_key));
      const created: AppNotification[] = [];
      for (const d of drafts) {
        if (existing.has(d.dedupe_key)) continue;
        existing.add(d.dedupe_key);
        created.push({
          ...d,
          id: newId(),
          user_id: DEMO_USER_ID,
          read_at: null,
          created_at: now().toISOString(),
        });
      }
      if (created.length) {
        store.notifications = [...created, ...store.notifications];
        persist();
      }
      return created;
    },

    async markNotificationsRead(ids) {
      const store = load();
      const stamp = now().toISOString();
      store.notifications = store.notifications.map((n) =>
        n.read_at === null && (ids === 'all' || ids.includes(n.id)) ? { ...n, read_at: stamp } : n,
      );
      persist();
    },

    async getSettings() {
      return { ...load().settings };
    },

    async saveSettings(patch: SettingsPatch) {
      const store = load();
      store.settings = { ...store.settings, ...patch, updated_at: now().toISOString() };
      persist();
      return { ...store.settings };
    },

    async deleteAllData() {
      const store = load();
      store.subscriptions = [];
      store.history = [];
      store.notifications = [];
      store.settings = { ...store.settings, onboarding_completed: false, dismissed_leak_flags: [] };
      persist();
    },
  };
}

function structuredCloneSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
