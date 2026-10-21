import clsx from 'clsx';
import { BarChart3, CalendarDays, CreditCard, Droplets, LayoutDashboard, LogOut, Plus, Settings, type LucideIcon } from 'lucide-react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useData } from '@/context/DataContext';
import { useLeakFlags } from '@/context/useLeakFlags';
import { ButtonLink } from './ButtonLink';
import { NotificationCentre } from './NotificationCentre';
import { Button, Notice } from './ui';

interface NavItem {
  to: string;
  label: string;
  short: string;
  icon: LucideIcon;
  end?: boolean;
}

const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', short: 'Home', icon: LayoutDashboard, end: true },
  { to: '/subscriptions', label: 'My Subscriptions', short: 'Subs', icon: CreditCard },
  { to: '/calendar', label: 'Renewal Calendar', short: 'Calendar', icon: CalendarDays },
  { to: '/leaks', label: 'Find My Leaks', short: 'Leaks', icon: Droplets },
  { to: '/reports', label: 'Reports', short: 'Reports', icon: BarChart3 },
  { to: '/settings', label: 'Settings', short: 'Settings', icon: Settings },
];

function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden>
        <rect width="32" height="32" rx="8" fill="#1a7c70" />
        <path
          d="M10 21c1.5 1.4 3.6 2 5.8 2 3 0 5.2-1.2 5.2-3.4 0-5-10.4-2.2-10.4-6.6 0-2 1.9-3.2 4.8-3.2 1.8 0 3.3.5 4.4 1.3"
          fill="none"
          stroke="#fff"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      </svg>
      <span className="text-lg font-semibold tracking-tight text-ink">SubSave</span>
    </span>
  );
}

export function AppLayout() {
  const auth = useAuth();
  const { mode, resetDemo } = useData();
  const leaks = useLeakFlags();
  const navigate = useNavigate();
  const leakCount = leaks.active.length;

  const leave = async () => {
    if (mode === 'demo') auth.exitDemo();
    else await auth.signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen md:flex">
      <a
        href="#main"
        className="sr-only z-[70] rounded-lg bg-white px-3 py-2 text-sm font-medium focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="hidden border-r border-paper-line bg-white md:fixed md:inset-y-0 md:flex md:w-64 md:flex-col print:hidden">
        <div className="px-5 py-5">
          <Logo />
        </div>
        <nav aria-label="Main" className="flex-1 space-y-1 px-3">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                clsx(
                  'flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors',
                  isActive ? 'bg-brand-50 text-brand-800' : 'text-ink-soft hover:bg-paper hover:text-ink',
                )
              }
            >
              <item.icon className="h-[18px] w-[18px]" aria-hidden />
              <span className="flex-1">{item.label}</span>
              {item.to === '/leaks' && leakCount > 0 && (
                <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                  <span className="sr-only">{leakCount} open flags</span>
                  <span aria-hidden>{leakCount}</span>
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-paper-line p-4">
          <p className="truncate text-xs text-ink-soft" title={auth.user?.email}>
            {auth.user?.email}
          </p>
          <Button variant="ghost" size="sm" className="mt-2 -ml-3" onClick={() => void leave()}>
            <LogOut className="h-4 w-4" aria-hidden />
            {mode === 'demo' ? 'Exit demo' : 'Sign out'}
          </Button>
        </div>
      </aside>

      <div className="min-w-0 flex-1 md:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-paper-line bg-paper/95 px-4 backdrop-blur print:hidden">
          <div className="md:hidden">
            <Logo />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <NotificationCentre />
            <ButtonLink to="/subscriptions/new" size="sm">
              <Plus className="h-4 w-4" aria-hidden />
              Add
              <span className="sr-only"> subscription</span>
            </ButtonLink>
          </div>
        </header>

        {mode === 'demo' && (
          <div className="mx-auto max-w-5xl px-4 pt-4 print:hidden">
            <Notice tone="warn" title="Demo mode">
              <p>
                You are looking at sample data stored only in this browser. It is not connected to any account and is never mixed
                with real records. Prices are illustrative.
              </p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={() => void resetDemo()}>
                  Reset sample data
                </Button>
                <Button variant="secondary" size="sm" onClick={() => void leave()}>
                  Exit demo
                </Button>
              </div>
            </Notice>
          </div>
        )}

        <main id="main" className="mx-auto max-w-5xl px-4 py-6 pb-28 md:pb-10">
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <nav
        aria-label="Main"
        className="safe-bottom fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t border-paper-line bg-white md:hidden print:hidden"
      >
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              clsx(
                'relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium',
                isActive ? 'text-brand-700' : 'text-ink-soft',
              )
            }
          >
            <item.icon className="h-5 w-5" aria-hidden />
            {item.short}
            {item.to === '/leaks' && leakCount > 0 && (
              <span className="absolute right-3 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-semibold text-white">
                <span className="sr-only">{leakCount} open flags</span>
                <span aria-hidden>{leakCount}</span>
              </span>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
