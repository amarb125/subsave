import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase, supabaseConfig } from '@/lib/supabase';
import { clearDemoData } from '@/lib/repo/demoRepo';

export type Mode = 'supabase' | 'demo';
const MODE_KEY = 'subsave:mode';

export interface AuthUser {
  id: string;
  email: string;
}

export interface AuthResult {
  error?: string;
}

export interface AuthState {
  loading: boolean;
  /** Are valid Supabase credentials present? */
  configured: boolean;
  /** Why not, if they are not. */
  configProblem?: string;
  mode: Mode;
  user: AuthUser | null;
  /** True after the session ended on its own (expired token), so the login page can explain. */
  sessionExpired: boolean;
  /** True while the user arrived via a password-reset link and must choose a new password. */
  passwordRecovery: boolean;
  signIn(email: string, password: string): Promise<AuthResult>;
  signUp(email: string, password: string): Promise<AuthResult & { needsVerification?: boolean }>;
  signOut(): Promise<void>;
  sendPasswordReset(email: string): Promise<AuthResult>;
  updatePassword(password: string): Promise<AuthResult>;
  enterDemo(): void;
  exitDemo(): void;
  /** Called by the data layer when the server says the session is no longer valid. */
  expireSession(): void;
}

/** Exported so tests (and only tests) can provide a fake auth state. */
export const AuthContext = createContext<AuthState | null>(null);

export const DEMO_USER: AuthUser = { id: 'demo-user', email: 'demo mode (not saved to any account)' };

/** Converts Supabase auth errors into plain, helpful text. */
export function friendlyAuthError(err: { message?: string; status?: number; name?: string } | null | undefined): string {
  const m = (err?.message ?? '').toLowerCase();
  if (!err) return 'Something went wrong. Please try again.';
  if (m.includes('invalid login credentials')) return 'That email and password do not match. Check them and try again.';
  if (m.includes('email not confirmed')) return 'Please verify your email first. We sent you a link when you signed up.';
  if (m.includes('user already registered')) return 'An account with this email already exists. Try signing in instead.';
  if (m.includes('password should be at least')) return 'Choose a longer password (at least 8 characters).';
  if (m.includes('rate limit') || err.status === 429) return 'Too many attempts. Please wait a minute and try again.';
  if (m.includes('failed to fetch') || m.includes('network') || err.name === 'AuthRetryableFetchError') {
    return "Can't reach the server. Check your internet connection and try again.";
  }
  if (m.includes('same password') || m.includes('different from the old')) return 'Choose a password you have not used before.';
  return 'Something went wrong. Please try again.';
}

function readStoredMode(): Mode {
  try {
    return window.localStorage.getItem(MODE_KEY) === 'demo' ? 'demo' : 'supabase';
  } catch {
    return 'supabase';
  }
}

function toUser(session: Session | null): AuthUser | null {
  return session?.user ? { id: session.user.id, email: session.user.email ?? '' } : null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>(() => readStoredMode());
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState<boolean>(isSupabaseConfigured);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    let active = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        setUser(toUser(data.session));
      })
      .catch(() => {
        /* offline at startup: treated as signed out; the login page shows connection errors */
      })
      .finally(() => active && setLoading(false));

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      setUser(toUser(session));
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
      if (event === 'SIGNED_IN') setSessionExpired(false);
      if (event === 'SIGNED_OUT') setPasswordRecovery(false);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const setStoredMode = useCallback((next: Mode) => {
    setMode(next);
    try {
      if (next === 'demo') window.localStorage.setItem(MODE_KEY, 'demo');
      else window.localStorage.removeItem(MODE_KEY);
    } catch {
      /* storage unavailable: mode lives in memory for this tab */
    }
  }, []);

  const signIn = useCallback<AuthState['signIn']>(
    async (email, password) => {
      if (!supabase) return { error: 'SubSave is not connected to a database yet.' };
      try {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) return { error: friendlyAuthError(error) };
        setStoredMode('supabase');
        return {};
      } catch (e) {
        return { error: friendlyAuthError(e as Error) };
      }
    },
    [setStoredMode],
  );

  const signUp = useCallback<AuthState['signUp']>(async (email, password) => {
    if (!supabase) return { error: 'SubSave is not connected to a database yet.' };
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) return { error: friendlyAuthError(error) };
      // With "Confirm email" enabled Supabase returns a user but no session until the link is clicked.
      // An empty identities list means the address is already registered (Supabase hides this on purpose).
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        return { error: 'An account with this email already exists. Try signing in instead.' };
      }
      return { needsVerification: !data.session };
    } catch (e) {
      return { error: friendlyAuthError(e as Error) };
    }
  }, []);

  const signOut = useCallback(async () => {
    if (mode === 'demo') {
      setStoredMode('supabase');
      return;
    }
    try {
      await supabase?.auth.signOut();
    } finally {
      setUser(null);
      setPasswordRecovery(false);
    }
  }, [mode, setStoredMode]);

  const sendPasswordReset = useCallback<AuthState['sendPasswordReset']>(async (email) => {
    if (!supabase) return { error: 'SubSave is not connected to a database yet.' };
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/update-password`,
      });
      return error ? { error: friendlyAuthError(error) } : {};
    } catch (e) {
      return { error: friendlyAuthError(e as Error) };
    }
  }, []);

  const updatePassword = useCallback<AuthState['updatePassword']>(async (password) => {
    if (!supabase) return { error: 'SubSave is not connected to a database yet.' };
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) return { error: friendlyAuthError(error) };
      setPasswordRecovery(false);
      return {};
    } catch (e) {
      return { error: friendlyAuthError(e as Error) };
    }
  }, []);

  const enterDemo = useCallback(() => setStoredMode('demo'), [setStoredMode]);
  const exitDemo = useCallback(() => {
    clearDemoData();
    setStoredMode('supabase');
  }, [setStoredMode]);

  const expireSession = useCallback(() => {
    setSessionExpired(true);
    setUser(null);
    void supabase?.auth.signOut({ scope: 'local' }).catch(() => undefined);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      loading,
      configured: isSupabaseConfigured,
      configProblem: supabaseConfig.problem,
      mode,
      user: mode === 'demo' ? DEMO_USER : user,
      sessionExpired,
      passwordRecovery,
      signIn,
      signUp,
      signOut,
      sendPasswordReset,
      updatePassword,
      enterDemo,
      exitDemo,
      expireSession,
    }),
    [loading, mode, user, sessionExpired, passwordRecovery, signIn, signUp, signOut, sendPasswordReset, updatePassword, enterDemo, exitDemo, expireSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
