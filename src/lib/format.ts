import { format, parseISO } from 'date-fns';
import { isValidISODate } from './dates';

export function formatDate(iso: string | null | undefined, pattern = 'd MMM yyyy'): string {
  if (!iso || !isValidISODate(iso)) return '—';
  return format(parseISO(iso), pattern);
}

export function formatTimestamp(ts: string | null | undefined): string {
  if (!ts) return '—';
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? '—' : format(d, 'd MMM yyyy, h:mm a');
}

export function relativeDays(days: number): string {
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  if (days < 0) return `${Math.abs(days)} days ago`;
  return `In ${days} days`;
}
