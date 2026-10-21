import clsx from 'clsx';
import { Bell } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '@/context/DataContext';
import { formatTimestamp } from '@/lib/format';
import { Button } from './ui';

/**
 * The in-app notification centre. Reminders are created whenever SubSave is opened (see
 * lib/reminders.ts), so this list is reliable. It is not a background service.
 */
export function NotificationCentre() {
  const { notifications, markNotificationsRead } = useData();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const unread = notifications.filter((n) => n.read_at === null).length;

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        className="relative inline-flex h-11 w-11 items-center justify-center rounded-xl text-ink-soft hover:bg-brand-50 hover:text-ink"
      >
        <Bell className="h-5 w-5" aria-hidden />
        {unread > 0 && (
          <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-semibold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          id={panelId}
          role="region"
          aria-label="Notifications"
          className="fixed inset-x-3 top-16 z-40 max-h-[70vh] overflow-y-auto rounded-2xl border border-paper-line bg-white shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-96"
        >
          <div className="flex items-center justify-between border-b border-paper-line px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">Notifications</h2>
            {unread > 0 && (
              <Button variant="ghost" size="sm" onClick={() => void markNotificationsRead('all')}>
                Mark all as read
              </Button>
            )}
          </div>
          {notifications.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-ink-soft">
              Nothing yet. Renewal and trial reminders appear here when SubSave is opened on or after the day they are due.
            </p>
          ) : (
            <ul className="divide-y divide-paper-line">
              {notifications.slice(0, 20).map((n) => {
                const body = (
                  <>
                    <p className={clsx('text-sm text-ink', n.read_at === null ? 'font-semibold' : 'font-medium')}>{n.title}</p>
                    <p className="mt-0.5 text-xs text-ink-soft">{n.body}</p>
                    <p className="mt-1 text-[11px] text-ink-faint">{formatTimestamp(n.created_at)}</p>
                  </>
                );
                const className = clsx('block px-4 py-3 hover:bg-brand-50/50', n.read_at === null && 'bg-brand-50/40');
                return (
                  <li key={n.id}>
                    {n.subscription_id ? (
                      <Link
                        to={`/subscriptions/${n.subscription_id}`}
                        className={className}
                        onClick={() => {
                          void markNotificationsRead([n.id]);
                          setOpen(false);
                        }}
                      >
                        {body}
                      </Link>
                    ) : (
                      <div className={className}>{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
