import type { Subscription } from './types';

/** Short, human description of how often a subscription bills: "per month", "every 45 days". */
export function cycleLabel(sub: Pick<Subscription, 'frequency' | 'custom_interval_days'>): string {
  switch (sub.frequency) {
    case 'weekly':
      return 'per week';
    case 'monthly':
      return 'per month';
    case 'quarterly':
      return 'every 3 months';
    case 'half_yearly':
      return 'every 6 months';
    case 'yearly':
      return 'per year';
    case 'custom':
      return sub.custom_interval_days ? `every ${sub.custom_interval_days} days` : 'custom cycle';
    default:
      return '';
  }
}
