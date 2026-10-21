import { annualCost, effectiveRenewal, formatMoney, isLive, isSpendCounted, monthlyEquivalent, round2 } from './calc';
import { diffDays, isValidISODate } from './dates';
import type { Category, Subscription } from './types';

export type LeakType =
  | 'unused'
  | 'trial_ending'
  | 'possible_duplicate'
  | 'high_cost'
  | 'cancellation_planned_active'
  | 'same_category';

export type Severity = 'high' | 'medium' | 'info';

export interface Leak {
  /** Stable key used to remember that the user dismissed this flag. */
  key: string;
  type: LeakType;
  severity: Severity;
  title: string;
  /** Plain-language reason this was flagged. Never states wastefulness as a fact. */
  explanation: string;
  subscriptionIds: string[];
  /** Estimated (not realised) savings if the user acts. Only set for unused / planned-cancel flags. */
  potentialAnnual?: number;
  currency?: string;
}

export const LEAK_LABELS: Record<LeakType, string> = {
  unused: 'Marked as unused',
  trial_ending: 'Trial ending',
  possible_duplicate: 'Possible duplicate',
  high_cost: 'High cost relative to others',
  cancellation_planned_active: 'Cancellation planned, still active',
  same_category: 'Several in one category',
};

// ---------------------------------------------------------------------------
// Name similarity (for *possible* duplicates)
// ---------------------------------------------------------------------------

const STOP_TOKENS = new Set([
  'subscription', 'plan', 'premium', 'plus', 'pro', 'family', 'individual', 'student', 'duo',
  'monthly', 'yearly', 'annual', 'membership', 'the', 'app', 'india', 'and', 'standard', 'basic',
]);

export function normaliseName(raw: string): string {
  const base = raw
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  const tokens = base.split(' ').filter(Boolean);
  const kept = tokens.filter((t) => !STOP_TOKENS.has(t));
  return (kept.length > 0 ? kept : tokens).join(' ');
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const cur = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[b.length];
}

/** 0..1 similarity between two subscription names. */
export function nameSimilarity(a: string, b: string): number {
  const na = normaliseName(a);
  const nb = normaliseName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const shortest = na.length <= nb.length ? na : nb;
  const longest = na.length <= nb.length ? nb : na;
  if (shortest.length >= 4 && longest.includes(shortest)) return 0.9;
  const ta = new Set(na.split(' '));
  const tb = new Set(nb.split(' '));
  const shared = [...ta].filter((t) => tb.has(t)).length;
  const jaccard = shared / new Set([...ta, ...tb]).size;
  const lev = 1 - levenshtein(na, nb) / Math.max(na.length, nb.length);
  return Math.max(jaccard, lev);
}

export const DUPLICATE_THRESHOLD = 0.8;

export interface DuplicatePair {
  a: Subscription;
  b: Subscription;
  score: number;
  reason: string;
}

/** Pairs that *might* be the same service. Always a guess, never a confirmed duplicate. */
export function findPossibleDuplicates(subs: Subscription[]): DuplicatePair[] {
  const live = subs.filter(isLive);
  const pairs: DuplicatePair[] = [];
  for (let i = 0; i < live.length; i += 1) {
    for (let j = i + 1; j < live.length; j += 1) {
      const a = live[i];
      const b = live[j];
      const score = nameSimilarity(a.name, b.name);
      const providerA = a.provider ? normaliseName(a.provider) : '';
      const providerB = b.provider ? normaliseName(b.provider) : '';
      const sameProvider = providerA !== '' && providerA === providerB && a.category === b.category;
      if (score >= DUPLICATE_THRESHOLD) {
        pairs.push({ a, b, score, reason: 'The names are very similar.' });
      } else if (sameProvider) {
        pairs.push({ a, b, score: Math.max(score, 0.8), reason: 'Same provider and category.' });
      }
    }
  }
  return pairs;
}

// ---------------------------------------------------------------------------
// Leak detection
// ---------------------------------------------------------------------------

/**
 * Used by the add/edit form to warn, before saving, that something similar is already tracked.
 * It never blocks saving: two plans from one provider can be perfectly legitimate.
 */
export function findPossibleDuplicatesOf(
  candidate: { name: string; provider?: string | null; category: Category },
  subs: Subscription[],
  excludeId?: string,
): Subscription[] {
  const name = candidate.name.trim();
  if (name.length < 2) return [];
  const provider = candidate.provider ? normaliseName(candidate.provider) : '';
  return subs
    .filter(isLive)
    .filter((s) => s.id !== excludeId)
    .filter((s) => {
      if (nameSimilarity(name, s.name) >= DUPLICATE_THRESHOLD) return true;
      const other = s.provider ? normaliseName(s.provider) : '';
      return provider !== '' && provider === other && s.category === candidate.category;
    });
}

export interface LeakOptions {
  /** Currency used for the high-cost comparison. */
  currency?: string;
  trialWindowDays?: number;
}

const SEVERITY_RANK: Record<Severity, number> = { high: 0, medium: 1, info: 2 };

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function detectLeaks(subs: Subscription[], today: string, options: LeakOptions = {}): Leak[] {
  const currency = options.currency ?? 'INR';
  const trialWindow = options.trialWindowDays ?? 7;
  const leaks: Leak[] = [];
  const live = subs.filter(isLive);

  for (const s of live) {
    const money = (n: number) => formatMoney(n, s.currency);

    // 1. Marked unused by the user.
    if (s.unused && isSpendCounted(s)) {
      leaks.push({
        key: `unused:${s.id}`,
        type: 'unused',
        severity: 'medium',
        title: `${s.name} is marked as unused`,
        explanation: `You marked this as unused. If you cancel it, you could stop spending about ${money(
          round2(annualCost(s)),
        )} a year. This is an estimate, not money saved yet.`,
        subscriptionIds: [s.id],
        potentialAnnual: annualCost(s),
        currency: s.currency,
      });
    }

    // 2. Trial ending soon (or already past its end date but still marked as a trial).
    if (s.status === 'trial' && isValidISODate(s.trial_end_date)) {
      const days = diffDays(today, s.trial_end_date as string);
      if (days < 0) {
        leaks.push({
          key: `trial:${s.id}:${s.trial_end_date}`,
          type: 'trial_ending',
          severity: 'high',
          title: `${s.name}: trial end date has passed`,
          explanation: `The trial was due to end ${Math.abs(days)} ${plural(Math.abs(days), 'day', 'days')} ago but it is still marked as a trial. Check whether you are now being charged, then update its status.`,
          subscriptionIds: [s.id],
        });
      } else if (days <= trialWindow) {
        const when = days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;
        leaks.push({
          key: `trial:${s.id}:${s.trial_end_date}`,
          type: 'trial_ending',
          severity: days <= 3 ? 'high' : 'medium',
          title: `${s.name}: trial ends ${when}`,
          explanation: `Paid billing of ${money(s.amount)} may start after the trial ends. Decide now whether to keep it or cancel with the provider.`,
          subscriptionIds: [s.id],
        });
      }
    }

    // 5. Cancellation planned but still active (still billing until confirmed).
    if (s.status === 'cancellation_planned') {
      const renewal = effectiveRenewal(s, today);
      const days = renewal ? diffDays(today, renewal) : null;
      const soon = days !== null && days <= 7;
      leaks.push({
        key: `planned:${s.id}`,
        type: 'cancellation_planned_active',
        severity: soon ? 'high' : 'medium',
        title: `${s.name}: cancellation planned but not confirmed`,
        explanation:
          `You plan to cancel, but SubSave still counts it as active until you confirm the cancellation with the provider.` +
          (days !== null
            ? ` It next renews ${days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`} for ${money(s.amount)}.`
            : ''),
        subscriptionIds: [s.id],
        potentialAnnual: isSpendCounted(s) && !s.unused ? annualCost(s) : undefined,
        currency: s.currency,
      });
    }
  }

  // 3. Possible duplicates.
  for (const pair of findPossibleDuplicates(subs)) {
    const ids = [pair.a.id, pair.b.id].sort();
    leaks.push({
      key: `dup:${ids.join(':')}`,
      type: 'possible_duplicate',
      severity: 'medium',
      title: `Possible duplicate: ${pair.a.name} and ${pair.b.name}`,
      explanation: `${pair.reason} They may be the same service, or two different plans you chose on purpose. Only you can tell, so this is a prompt to check, not a confirmed duplicate.`,
      subscriptionIds: ids,
    });
  }

  // 4. High cost relative to the user's other subscriptions.
  const counted = live.filter((s) => isSpendCounted(s) && s.currency === currency);
  if (counted.length >= 3) {
    const monthlies = counted.map(monthlyEquivalent);
    const total = monthlies.reduce((a, b) => a + b, 0);
    const mid = median(monthlies);
    if (total > 0) {
      counted.forEach((s, i) => {
        const share = monthlies[i] / total;
        if (share >= 0.3 && mid > 0 && monthlies[i] >= 2 * mid) {
          leaks.push({
            key: `highcost:${s.id}`,
            type: 'high_cost',
            severity: 'info',
            title: `${s.name} is your biggest recurring cost`,
            explanation: `It makes up about ${Math.round(share * 100)}% of your monthly subscription spend (${formatMoney(
              round2(monthlies[i]),
              currency,
            )} a month). A high price is not automatically wasteful. Consider whether you still get enough value from it.`,
            subscriptionIds: [s.id],
          });
        }
      });
    }
  }

  // 6. Several subscriptions in the same category.
  const byCategory = new Map<string, Subscription[]>();
  for (const s of live) {
    if (s.category === 'Other') continue;
    byCategory.set(s.category, [...(byCategory.get(s.category) ?? []), s]);
  }
  for (const [category, group] of byCategory) {
    if (group.length < 2) continue;
    const ids = group.map((g) => g.id).sort();
    leaks.push({
      key: `category:${category}:${ids.join(':')}`,
      type: 'same_category',
      severity: 'info',
      title: `${group.length} ${category} subscriptions`,
      explanation: `You have ${group.length} subscriptions in ${category}: ${group
        .map((g) => g.name)
        .join(', ')}. Having several is fine if you use them all. It is just worth a look.`,
      subscriptionIds: ids,
    });
  }

  return leaks.sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.title.localeCompare(b.title),
  );
}

export function filterDismissed(leaks: Leak[], dismissedKeys: string[]): Leak[] {
  const dismissed = new Set(dismissedKeys);
  return leaks.filter((l) => !dismissed.has(l.key));
}
