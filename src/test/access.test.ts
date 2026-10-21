import { describe, it, expect } from 'vitest';
import { resolveAccess, type AccessInput } from '@/lib/access';

const base: AccessInput = { mode: 'supabase', configured: true, loading: false, signedIn: true, passwordRecovery: false };
const decide = (over: Partial<AccessInput>) => resolveAccess({ ...base, ...over });

describe('authentication-protected routes (access rules)', () => {
  it('lets a signed-in user through', () => {
    expect(decide({})).toBe('allow');
  });
  it('sends signed-out visitors to the login page', () => {
    expect(decide({ signedIn: false })).toBe('login');
  });
  it('waits while the saved session is being restored instead of flashing the login page', () => {
    expect(decide({ loading: true, signedIn: false })).toBe('loading');
  });
  it('shows the setup screen, not a fake login, when Supabase is not configured', () => {
    expect(decide({ configured: false, signedIn: false })).toBe('setup');
    expect(decide({ configured: false, signedIn: true })).toBe('setup');
  });
  it('forces a new password after following a reset link', () => {
    expect(decide({ passwordRecovery: true })).toBe('recovery');
  });
  it('demo mode is allowed in without an account, even with no credentials', () => {
    expect(decide({ mode: 'demo', configured: false, signedIn: false })).toBe('allow');
  });
  it('an expired session (no user any more) goes back to login', () => {
    expect(decide({ signedIn: false, loading: false })).toBe('login');
  });
});
