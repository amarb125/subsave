import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { showBrowserNotification } from '@/lib/browserNotify';
import { todayISO } from '@/lib/dates';
import { computeDueReminders } from '@/lib/reminders';
import { createDemoRepo } from '@/lib/repo/demoRepo';
import { createSupabaseRepo } from '@/lib/repo/supabaseRepo';
import { RepoError, toRepoError, type Repo, type SubscriptionPatch } from '@/lib/repo/types';
import { supabase } from '@/lib/supabase';
import type {
  AppNotification,
  SettingsPatch,
  Status,
  StatusHistoryEntry,
  Subscription,
  SubscriptionDraft,
  UserSettings,
} from '@/lib/types';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';

export interface DataState {
  mode: 'supabase' | 'demo';
  loading: boolean;
  /** Set when the first load failed; the UI offers a retry. */
  loadError: string | null;
  subscriptions: Subscription[];
  notifications: AppNotification[];
  settings: UserSettings | null;
  /** Today's calendar date (local), refreshed when the tab becomes visible again. */
  today: string;
  primaryCurrency: string;
  reload(): Promise<void>;
  addSubscription(draft: SubscriptionDraft): Promise<Subscription | null>;
  editSubscription(id: string, draft: SubscriptionDraft): Promise<Subscription | null>;
  patchSubscription(id: string, patch: SubscriptionPatch): Promise<Subscription | null>;
  setStatus(id: string, status: Status): Promise<Subscription | null>;
  removeSubscription(id: string): Promise<boolean>;
  getHistory(id: string): Promise<StatusHistoryEntry[]>;
  saveSettings(patch: SettingsPatch): Promise<UserSettings | null>;
  dismissLeak(key: string): Promise<void>;
  restoreLeak(key: string): Promise<void>;
  markNotificationsRead(ids: string[] | 'all'): Promise<void>;
  deleteAllData(): Promise<boolean>;
  resetDemo(): Promise<void>;
}

const DataContext = createContext<DataState | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const toast = useToast();
  const { mode, user, expireSession } = auth;

  const demoRepo = useRef<ReturnType<typeof createDemoRepo> | null>(null);

  const repo = useMemo<Repo | null>(() => {
    if (mode === 'demo') {
      demoRepo.current = demoRepo.current ?? createDemoRepo();
      return demoRepo.current;
    }
    demoRepo.current = null;
    if (supabase && user) return createSupabaseRepo(supabase, user.id);
    return null;
  }, [mode, user]);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [today, setToday] = useState(() => todayISO());
  const settingsRef = useRef<UserSettings | null>(null);
  settingsRef.current = settings;

  const handleError = useCallback(
    (err: unknown): RepoError => {
      const e = toRepoError(err);
      if (e.authExpired) expireSession();
      else toast.error(e.message);
      return e;
    },
    [expireSession, toast],
  );

  /** Creates in-app reminders that are due today. Safe to call repeatedly: reminders are de-duplicated. */
  const runReminders = useCallback(
    async (subs: Subscription[], day: string) => {
      if (!repo) return;
      try {
        const due = computeDueReminders(subs, day);
        if (due.length === 0) return;
        const created = await repo.createNotifications(
          due.map(({ subscription_id, kind, title, body, dedupe_key }) => ({ subscription_id, kind, title, body, dedupe_key })),
        );
        if (created.length === 0) return;
        setNotifications((prev) => [...created, ...prev]);
        if (settingsRef.current?.browser_notifications) {
          created.slice(0, 3).forEach((n) => showBrowserNotification(n.title, n.body, n.dedupe_key));
        }
      } catch {
        // Reminders are best-effort and must never break the app. They are retried next time the app opens.
      }
    },
    [repo],
  );

  const load = useCallback(async () => {
    if (!repo) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [subs, notes, userSettings] = await Promise.all([
        repo.listSubscriptions(),
        repo.listNotifications(),
        repo.getSettings(),
      ]);
      const day = todayISO();
      setSubscriptions(subs);
      setNotifications(notes);
      setSettings(userSettings);
      settingsRef.current = userSettings;
      setToday(day);
      void runReminders(subs, day);
    } catch (err) {
      const e = toRepoError(err);
      if (e.authExpired) expireSession();
      else setLoadError(e.message);
    } finally {
      setLoading(false);
    }
  }, [repo, runReminders, expireSession]);

  useEffect(() => {
    setSubscriptions([]);
    setNotifications([]);
    setSettings(null);
    if (repo) void load();
    else setLoading(false);
  }, [repo, load]);

  // When the tab is reopened on a new day, refresh "today" and look for newly due reminders.
  const subsRef = useRef(subscriptions);
  subsRef.current = subscriptions;
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const day = todayISO();
      setToday((prev) => {
        if (prev !== day) void runReminders(subsRef.current, day);
        return day;
      });
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [runReminders]);

  const replaceSub = useCallback((updated: Subscription) => {
    setSubscriptions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  }, []);

  const addSubscription = useCallback<DataState['addSubscription']>(
    async (draft) => {
      if (!repo) return null;
      try {
        const created = await repo.createSubscription(draft);
        const next = [created, ...subsRef.current];
        setSubscriptions(next);
        void runReminders(next, todayISO());
        return created;
      } catch (err) {
        handleError(err);
        return null;
      }
    },
    [repo, handleError, runReminders],
  );

  const editSubscription = useCallback<DataState['editSubscription']>(
    async (id, draft) => {
      if (!repo) return null;
      try {
        const updated = await repo.updateSubscription(id, draft);
        replaceSub(updated);
        void runReminders(subsRef.current.map((s) => (s.id === id ? updated : s)), todayISO());
        return updated;
      } catch (err) {
        handleError(err);
        return null;
      }
    },
    [repo, handleError, replaceSub, runReminders],
  );

  const patchSubscription = useCallback<DataState['patchSubscription']>(
    async (id, patch) => {
      if (!repo) return null;
      try {
        const updated = await repo.patchSubscription(id, patch);
        replaceSub(updated);
        return updated;
      } catch (err) {
        handleError(err);
        return null;
      }
    },
    [repo, handleError, replaceSub],
  );

  const setStatus = useCallback<DataState['setStatus']>(
    async (id, status) => {
      if (!repo) return null;
      try {
        const updated = await repo.changeStatus(id, status);
        replaceSub(updated);
        return updated;
      } catch (err) {
        handleError(err);
        return null;
      }
    },
    [repo, handleError, replaceSub],
  );

  const removeSubscription = useCallback<DataState['removeSubscription']>(
    async (id) => {
      if (!repo) return false;
      try {
        await repo.deleteSubscription(id);
        setSubscriptions((prev) => prev.filter((s) => s.id !== id));
        setNotifications((prev) => prev.filter((n) => n.subscription_id !== id));
        return true;
      } catch (err) {
        handleError(err);
        return false;
      }
    },
    [repo, handleError],
  );

  const getHistory = useCallback<DataState['getHistory']>(
    async (id) => {
      if (!repo) return [];
      try {
        return await repo.listHistory(id);
      } catch (err) {
        handleError(err);
        return [];
      }
    },
    [repo, handleError],
  );

  const saveSettings = useCallback<DataState['saveSettings']>(
    async (patch) => {
      if (!repo) return null;
      try {
        const saved = await repo.saveSettings(patch);
        setSettings(saved);
        return saved;
      } catch (err) {
        handleError(err);
        return null;
      }
    },
    [repo, handleError],
  );

  const dismissLeak = useCallback<DataState['dismissLeak']>(
    async (key) => {
      const current = settingsRef.current?.dismissed_leak_flags ?? [];
      if (current.includes(key)) return;
      await saveSettings({ dismissed_leak_flags: [...current, key] });
    },
    [saveSettings],
  );

  const restoreLeak = useCallback<DataState['restoreLeak']>(
    async (key) => {
      const current = settingsRef.current?.dismissed_leak_flags ?? [];
      if (!current.includes(key)) return;
      await saveSettings({ dismissed_leak_flags: current.filter((k) => k !== key) });
    },
    [saveSettings],
  );

  const markNotificationsRead = useCallback<DataState['markNotificationsRead']>(
    async (ids) => {
      if (!repo) return;
      try {
        await repo.markNotificationsRead(ids);
        const stamp = new Date().toISOString();
        setNotifications((prev) =>
          prev.map((n) => (n.read_at === null && (ids === 'all' || ids.includes(n.id)) ? { ...n, read_at: stamp } : n)),
        );
      } catch (err) {
        handleError(err);
      }
    },
    [repo, handleError],
  );

  const deleteAllData = useCallback<DataState['deleteAllData']>(async () => {
    if (!repo) return false;
    try {
      await repo.deleteAllData();
      await load();
      return true;
    } catch (err) {
      handleError(err);
      return false;
    }
  }, [repo, handleError, load]);

  const resetDemo = useCallback(async () => {
    demoRepo.current?.reset();
    await load();
  }, [load]);

  const value = useMemo<DataState>(
    () => ({
      mode,
      loading,
      loadError,
      subscriptions,
      notifications,
      settings,
      today,
      primaryCurrency: settings?.default_currency ?? 'INR',
      reload: load,
      addSubscription,
      editSubscription,
      patchSubscription,
      setStatus,
      removeSubscription,
      getHistory,
      saveSettings,
      dismissLeak,
      restoreLeak,
      markNotificationsRead,
      deleteAllData,
      resetDemo,
    }),
    [
      mode, loading, loadError, subscriptions, notifications, settings, today, load, addSubscription, editSubscription,
      patchSubscription, setStatus, removeSubscription, getHistory, saveSettings, dismissLeak, restoreLeak, markNotificationsRead,
      deleteAllData, resetDemo,
    ],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataState {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside <DataProvider>');
  return ctx;
}
