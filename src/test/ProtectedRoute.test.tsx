import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AuthContext, type AuthState } from '@/context/AuthContext';

const noop = async () => ({});

function fakeAuth(over: Partial<AuthState> = {}): AuthState {
  return {
    loading: false,
    configured: true,
    mode: 'supabase',
    user: { id: 'u1', email: 'a@b.co' },
    sessionExpired: false,
    passwordRecovery: false,
    signIn: noop,
    signUp: noop,
    signOut: async () => undefined,
    sendPasswordReset: noop,
    updatePassword: noop,
    enterDemo: () => undefined,
    exitDemo: () => undefined,
    expireSession: () => undefined,
    ...over,
  };
}

function renderAt(auth: AuthState) {
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={['/private']}>
        <Routes>
          <Route path="/login" element={<p>login page</p>} />
          <Route path="/setup" element={<p>setup page</p>} />
          <Route path="/update-password" element={<p>new password page</p>} />
          <Route element={<ProtectedRoute />}>
            <Route path="/private" element={<p>secret data</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('<ProtectedRoute>', () => {
  it('shows the page to a signed-in user', () => {
    renderAt(fakeAuth());
    expect(screen.getByText('secret data')).toBeInTheDocument();
  });
  it('redirects a signed-out visitor to login and never renders the page', () => {
    renderAt(fakeAuth({ user: null }));
    expect(screen.getByText('login page')).toBeInTheDocument();
    expect(screen.queryByText('secret data')).not.toBeInTheDocument();
  });
  it('shows a loading state, not the page, while the session is restored', () => {
    renderAt(fakeAuth({ user: null, loading: true }));
    expect(screen.queryByText('secret data')).not.toBeInTheDocument();
    expect(screen.queryByText('login page')).not.toBeInTheDocument();
  });
  it('redirects to setup when Supabase is not configured', () => {
    renderAt(fakeAuth({ configured: false, user: null }));
    expect(screen.getByText('setup page')).toBeInTheDocument();
  });
  it('redirects to the new-password page during password recovery', () => {
    renderAt(fakeAuth({ passwordRecovery: true }));
    expect(screen.getByText('new password page')).toBeInTheDocument();
  });
  it('lets demo mode in without an account', () => {
    renderAt(fakeAuth({ mode: 'demo', user: null, configured: false }));
    expect(screen.getByText('secret data')).toBeInTheDocument();
  });
});
