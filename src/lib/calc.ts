import { nextOccurrence, occurrencesBetween, addDays, addMonths, startOfMonthISO, monthKey, diffDays } from './dates';
import type { Category, Frequency, Subscription } from './types';

/** Average length of a Gregorian year (accounts for leap years). Used for custom intervals. */
export const DAYS_PER_YEAR = 365.2425;

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

type CostFields = Pick<Subscription, 'amount' | 'frequency' | 'custom_interval_days'>;

/** Number of payments in a year; 0 when a custom interval is missing or invalid. */
export function paymentsPerYear(frequency: Frequency, customDays: number | null | undefined): number {
  switch (frequency) {
    case 'weekly':
      return 52;
    case 'monthly':
      return 12;
    case 'quarterly':
      return 4;
    case 'half_yearly':
      return 2;
    case 'yearly':
      return 1;
    case 'custom':
      return typeof customDays === 'number' && Number.isFinite(customDays) && customDays >= 1
        ? DAYS_PER_YEAR / customDays
        : 0;
    default:
      return 0;
  }
}

function safeAmount(amount: number): number {
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

/**
 * Monthly equivalent:
 * weekly = amount × 52 / 12, monthly = amount, quarterly = amount / 3,
 * half-yearly = amount / 6, yearly = amount / 12, custom = annual cost / 12.
 */
export function monthlyEquivalent(sub: CostFields): number {
  const amount = safeAmount(sub.amount);
  switch (sub.frequency) {
    case 'weekly':
      return (amount * 52) / 12;
    case 'monthly':
      return amount;
    case 'quarterly':
      return amount / 3;
    case 'half_yearly':
      return amount / 6;
    case 'yearly':
      return amount / 12;
    case 'custom':
      return (amount * paymentsPerYear('custom', sub.custom_interval_days)) / 12;
    default:
      return 0;
  }
}

/** Annualised cost = amount × payments per year (always monthly equivalent × 12). */
export function annualCost(sub: CostFields): number {
  return safeAmount(sub.amount) * paymentsPerYear(sub.frequency, sub.custom_interval_days);
}

// ---------------------------------------------------------------------------
// Money formatting
// ---------------------------------------------------------------------------

export function formatMoney(amount: number, currency = 'INR', locale = 'en-IN'): string {
  if (!Number.isFinite(amount)) return '—';
  const rounded = round2(amount);
  // Whole amounts show as ₹1,199; amounts with paise always show two decimals (₹1,199.50).
  const fraction = Number.isInteger(rounded) ? 0 : 2;
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: fraction,
      maximumFractionDigits: 2,
    }).format(rounded);
  } catch {
    return `${currency} ${round2(amount).toFixed(2)}`;
  }
}

// ---------------------------------------------------------------------------
// What counts as "actual" spend vs. "estimated" savings
// ---------------------------------------------------------------------------

/**
 * Money we expect to keep leaving the account: Active and Cancellation Planned
 * (still billing until the user confirms cancellation with the provider).
 * Trial, Paused, Cancelled and archived subscriptions are NOT counted.
 */
export function isSpendCounted(sub: Pick<Subscription, 'status' | 'archived'>): boolean {
  return !sub.archived && (sub.status === 'active' || sub.status === 'cancellation_planned');
}

/** Anything the user still has to think about: not cancelled, not archived. */
export function isLive(sub: Pick<Subscription, 'status' | 'archived'>): boolean {
  return !sub.archived && sub.status !== 'cancelled';
}

export interface Totals {
  monthly: number;
  annual: number;
  count: number;
}

export function totalsFor(subs: Subscription[], currency: string): Totals {
  let monthly = 0;
  let annual = 0;
  let count = 0;
  for (const s of subs) {
    if (!isSpendCounted(s) || s.currency !== currency) continue;
    monthly += monthlyEquivalent(s);
    annual += annualCost(s);
    count += 1;
  }
  return { monthly, annual, count };
}

/** Counted subscriptions in a currency other than `currency` (we never convert currencies). */
export function otherCurrencyCount(subs: Subscription[], currency: string): number {
  return subs.filter((s) => isSpendCounted(s) && s.currency !== currency).length;
}

export interface Savings {
  monthly: number;
  annual: number;
  ids: string[];
}

/**
 * ESTIMATED savings: subscriptions the user marked unused or planned to cancel that are
 * still billing. This is money the user *could* stop spending, never money already saved,
 * and past payments are never included. Each subscription is counted once.
 */
export function potentialSavings(subs: Subscription[], currency: string): Savings {
  let monthly = 0;
  let annual = 0;
  const ids: string[] = [];
  for (const s of subs) {
    if (!isSpendCounted(s) || s.currency !== currency) continue;
    if (!s.unused && s.status !== 'cancellation_planned') continue;
    monthly += monthlyEquivalent(s);
    annual += annualCost(s);
    ids.push(s.id);
  }
  return { monthly, annual, ids };
}

/**
 * CONFIRMED cancellations: only subscriptions the user explicitly set to Cancelled.
 * `annual` is the yearly cost that no longer recurs. It is a run-rate, not a refund:
 * past payments are never counted as recovered money.
 */
export function confirmedSavings(subs: Subscription[], currency: string): Savings {
  let monthly = 0;
  let annual = 0;
  const ids: string[] = [];
  for (const s of subs) {
    if (s.status !== 'cancelled' || s.currency !== currency) continue;
    monthly += monthlyEquivalent(s);
    annual += annualCost(s);
    ids.push(s.id);
  }
  return { monthly, annual, ids };
}

export interface CategorySpend {
  category: Category;
  monthly: number;
  annual: number;
  count: number;
}

export function categoryBreakdown(subs: Subscription[], currency: string): CategorySpend[] {
  const map = new Map<Category, CategorySpend>();
  for (const s of subs) {
    if (!isSpendCounted(s) || s.currency !== currency) continue;
    const row = map.get(s.category) ?? { category: s.category, monthly: 0, annual: 0, count: 0 };
    row.monthly += monthlyEquivalent(s);
    row.annual += annualCost(s);
    row.count += 1;
    map.set(s.category, row);
  }
  return [...map.values()].sort((a, b) => b.annual - a.annual);
}

export interface MonthSpend {
  /** yyyy-MM */
  month: string;
  amount: number;
}

/**
 * Charges expected to hit in each of the next `months` calendar months, starting today
 * (so the current month only shows what is still to come). Uses real renewal dates, so
 * a yearly plan shows up only in the month it is actually charged.
 */
export function projectedSpend(subs: Subscription[], currency: string, today: string, months = 6): MonthSpend[] {
  const firstMonth = startOfMonthISO(today);
  const buckets: MonthSpend[] = [];
  for (let i = 0; i < months; i += 1) buckets.push({ month: monthKey(addMonths(firstMonth, i)), amount: 0 });
  const end = addDays(addMonths(firstMonth, months), -1);
  const index = new Map(buckets.map((b, i) => [b.month, i]));
  for (const s of subs) {
    if (!isSpendCounted(s) || s.currency !== currency) continue;
    const dates = occurrencesBetween(s.next_renewal_date, s.frequency, s.custom_interval_days, today, end);
    for (const date of dates) {
      const i = index.get(monthKey(date));
      if (i !== undefined) buckets[i].amount += safeAmount(s.amount);
    }
  }
  return buckets;
}

// ---------------------------------------------------------------------------
// Renewal helpers
// ---------------------------------------------------------------------------

/** The next date this subscription will actually be charged (rolls forward past stale dates). */
export function effectiveRenewal(
  sub: Pick<Subscription, 'next_renewal_date' | 'frequency' | 'custom_interval_days'>,
  today: string,
): string | null {
  return nextOccurrence(sub.next_renewal_date, sub.frequency, sub.custom_interval_days, today);
}

export function daysUntil(today: string, date: string): number {
  return diffDays(today, date);
}

export interface UpcomingRenewal {
  sub: Subscription;
  date: string;
  inDays: number;
}

/** Renewals of subscriptions that will actually be charged, soonest first. */
export function upcomingRenewals(subs: Subscription[], today: string, withinDays: number): UpcomingRenewal[] {
  const out: UpcomingRenewal[] = [];
  for (const sub of subs) {
    if (!isSpendCounted(sub)) continue;
    const date = effectiveRenewal(sub, today);
    if (!date) continue;
    const inDays = daysUntil(today, date);
    if (inDays >= 0 && inDays <= withinDays) out.push({ sub, date, inDays });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.sub.name.localeCompare(b.sub.name));
}
