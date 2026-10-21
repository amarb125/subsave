import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { resolveAccess } from '@/lib/access';
import { Spinner } from './ui';

/** Wraps every page that shows user data. Anyone who is not allowed in is redirected. */
export function ProtectedRoute() {
  const auth = useAuth();
  const location = useLocation();

  const access = resolveAccess({
    mode: auth.mode,
    configured: auth.configured,
    loading: auth.loading,
    signedIn: auth.user !== null,
    passwordRecovery: auth.passwordRecovery,
  });

  switch (access) {
    case 'loading':
      return (
        <div className="mx-auto max-w-md pt-24">
          <Spinner label="Checking your session" />
        </div>
      );
    case 'setup':
      return <Navigate to="/setup" replace />;
    case 'recovery':
      return <Navigate to="/update-password" replace />;
    case 'login':
      return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
    default:
      return <Outlet />;
  }
}
