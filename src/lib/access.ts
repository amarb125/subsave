/**
 * Decides what a visitor may see. Kept as a pure function so the rules can be unit tested
 * without rendering anything. <ProtectedRoute> is a thin wrapper around it.
 *
 * Demo mode is always allowed in: it is browser-only sample data and touches no account.
 * Everything else needs a configured database AND a signed-in user. Email verification is
 * enforced by Supabase itself: with "Confirm email" enabled it refuses to create a session
 * for an unverified address, so there is no half-signed-in state to handle here.
 */
export type AccessDecision = 'loading' | 'setup' | 'login' | 'recovery' | 'allow';

export interface AccessInput {
  mode: 'supabase' | 'demo';
  /** Valid Supabase credentials are present. */
  configured: boolean;
  /** The saved session is still being restored. */
  loading: boolean;
  signedIn: boolean;
  /** The user arrived through a password-reset link and has not chosen a new password yet. */
  passwordRecovery: boolean;
}

export function resolveAccess(input: AccessInput): AccessDecision {
  if (input.mode === 'demo') return 'allow';
  if (!input.configured) return 'setup';
  if (input.loading) return 'loading';
  if (!input.signedIn) return 'login';
  if (input.passwordRecovery) return 'recovery';
  return 'allow';
}
