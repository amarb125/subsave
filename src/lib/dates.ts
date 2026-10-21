/**
 * Calendar-date helpers working on ISO `yyyy-MM-dd` strings.
 *
 * Subscriptions renew on calendar dates, not instants, so all arithmetic here is done
 * in UTC on whole days. That makes results independent of the viewer's time zone and
 * of daylight-saving changes. date-fns is used in the UI layer for display formatting.
 */
import type { Frequency } from './types';

export interface YMD {
  y: number;
  m: number;
  d: number;
}

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;
const MIN_YEAR = 1900;
const MAX_YEAR = 2200;

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInMonth(y: number, m: number): number {
  if (m === 2) return isLeapYear(y) ? 29 : 28;
  return [4, 6, 9, 11].includes(m) ? 30 : 31;
}

/** Returns null for anything that is not a real calendar date (e.g. 2025-02-30). */
export function parseISODate(s: string | null | undefined): YMD | null {
  if (!s) return null;
  const match = ISO_RE.exec(s);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (y < MIN_YEAR || y > MAX_YEAR) return null;
  if (m < 1 || m > 12) return null;
  if (d < 1 || d > daysInMonth(y, m)) return null;
  return { y, m, d };
}

export function isValidISODate(s: string | null | undefined): boolean {
  return parseISODate(s) !== null;
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

export function toISODate({ y, m, d }: YMD): string {
  return `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}`;
}

function mustParse(iso: string): YMD {
  const parsed = parseISODate(iso);
  if (!parsed) throw new Error(`Invalid ISO date: ${iso}`);
  return parsed;
}

function toEpochDay(ymd: YMD): number {
  return Math.round(Date.UTC(ymd.y, ymd.m - 1, ymd.d) / MS_PER_DAY);
}

function fromEpochDay(n: number): YMD {
  const dt = new Date(n * MS_PER_DAY);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

/** Today's calendar date in the *local* time zone of `now`. */
export function todayISO(now: Date = new Date()): string {
  return toISODate({ y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() });
}

export function addDays(iso: string, n: number): string {
  return toISODate(fromEpochDay(toEpochDay(mustParse(iso)) + n));
}

/** Adds calendar months, clamping the day (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(iso: string, n: number): string {
  const { y, m, d } = mustParse(iso);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return toISODate({ y: ny, m: nm, d: Math.min(d, daysInMonth(ny, nm)) });
}

/** Whole days from `fromISO` to `toISO` (negative if `toISO` is earlier). */
export function diffDays(fromISO: string, toISO: string): number {
  return toEpochDay(mustParse(toISO)) - toEpochDay(mustParse(fromISO));
}

export function compareISO(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function startOfMonthISO(iso: string): string {
  const { y, m } = mustParse(iso);
  return toISODate({ y, m, d: 1 });
}

// ---------------------------------------------------------------------------
// Billing cycles
// ---------------------------------------------------------------------------

export interface Step {
  unit: 'days' | 'months';
  n: number;
}

/** The length of one billing cycle, or null when it cannot be determined (bad custom interval). */
export function stepFor(frequency: Frequency, customDays: number | null | undefined): Step | null {
  switch (frequency) {
    case 'weekly':
      return { unit: 'days', n: 7 };
    case 'monthly':
      return { unit: 'months', n: 1 };
    case 'quarterly':
      return { unit: 'months', n: 3 };
    case 'half_yearly':
      return { unit: 'months', n: 6 };
    case 'yearly':
      return { unit: 'months', n: 12 };
    case 'custom':
      if (typeof customDays === 'number' && Number.isInteger(customDays) && customDays >= 1 && customDays <= 3650) {
        return { unit: 'days', n: customDays };
      }
      return null;
    default:
      return null;
  }
}

function occurrenceAt(anchor: string, step: Step, k: number): string {
  return step.unit === 'days' ? addDays(anchor, k * step.n) : addMonths(anchor, k * step.n);
}

/**
 * The first billing date that is on or after `from`, counting cycles from `anchor`
 * (normally the stored next renewal date). Each occurrence is computed from the anchor,
 * not from the previous occurrence, so month-end clamping never drifts
 * (anchor 31 Jan → 28 Feb → 31 Mar).
 */
export function nextOccurrence(
  anchor: string,
  frequency: Frequency,
  customDays: number | null | undefined,
  from: string,
): string | null {
  const step = stepFor(frequency, customDays);
  if (!step || !isValidISODate(anchor) || !isValidISODate(from)) return null;
  if (compareISO(anchor, from) >= 0) return anchor;

  let k: number;
  if (step.unit === 'days') {
    k = Math.ceil(diffDays(anchor, from) / step.n);
  } else {
    const a = mustParse(anchor);
    const f = mustParse(from);
    const monthsApart = (f.y - a.y) * 12 + (f.m - a.m);
    k = Math.max(0, Math.floor(monthsApart / step.n));
  }
  while (compareISO(occurrenceAt(anchor, step, k), from) < 0) k += 1;
  return occurrenceAt(anchor, step, k);
}

/** All billing dates in [from, to] inclusive, counting cycles from `anchor`. */
export function occurrencesBetween(
  anchor: string,
  frequency: Frequency,
  customDays: number | null | undefined,
  from: string,
  to: string,
): string[] {
  const step = stepFor(frequency, customDays);
  if (!step) return [];
  const first = nextOccurrence(anchor, frequency, customDays, from);
  if (!first) return [];
  // Recover k for `first`, then walk forward.
  let k = 0;
  if (step.unit === 'days') {
    k = Math.round(diffDays(anchor, first) / step.n);
  } else {
    const a = mustParse(anchor);
    const f = mustParse(first);
    k = Math.round(((f.y - a.y) * 12 + (f.m - a.m)) / step.n);
  }
  k = Math.max(0, k);
  const out: string[] = [];
  for (let i = 0; i < 2000; i += 1) {
    const date = occurrenceAt(anchor, step, k + i);
    if (compareISO(date, to) > 0) break;
    if (compareISO(date, from) >= 0) out.push(date);
  }
  return out;
}
