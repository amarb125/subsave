import { z } from 'zod';
import { isValidISODate } from './dates';
import { CATEGORIES, CURRENCIES, FREQUENCIES, PAYMENT_METHODS, STATUSES } from './types';

const isoDate = (label: string) =>
  z.string().refine((v) => isValidISODate(v), { message: `Enter a valid ${label}` });

const optionalIsoDate = (label: string) =>
  z
    .string()
    .refine((v) => v === '' || isValidISODate(v), { message: `Enter a valid ${label}` });

/** Only http(s) links are accepted, which rules out javascript: and data: URLs. */
export function isSafeHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

export const subscriptionFormSchema = z
  .object({
    name: z.string().trim().min(1, 'Enter a name').max(80, 'Keep the name under 80 characters'),
    provider: z.string().trim().max(80, 'Keep the provider under 80 characters'),
    category: z.enum(CATEGORIES, { errorMap: () => ({ message: 'Choose a category' }) }),
    amount: z
      .number({ invalid_type_error: 'Enter an amount', required_error: 'Enter an amount' })
      .refine((n) => Number.isFinite(n), 'Enter a valid amount')
      .refine((n) => n >= 0, 'Amount cannot be negative')
      .refine((n) => n <= 10_000_000, 'Amount is too large'),
    currency: z.enum(CURRENCIES, { errorMap: () => ({ message: 'Choose a currency' }) }),
    frequency: z.enum(FREQUENCIES),
    custom_interval_days: z.union([z.number(), z.nan(), z.null()]).optional(),
    start_date: isoDate('start date'),
    next_renewal_date: isoDate('next renewal date'),
    payment_method: z.enum(PAYMENT_METHODS),
    notes: z.string().max(1000, 'Keep notes under 1000 characters'),
    trial_end_date: optionalIsoDate('trial end date'),
    status: z.enum(STATUSES),
    cancellation_url: z
      .string()
      .trim()
      .max(500, 'URL is too long')
      .refine((v) => v === '' || isSafeHttpUrl(v), 'Enter a full link starting with https://'),
    reminders_enabled: z.boolean(),
    reminder_days: z.array(z.number().int().refine((n) => [0, 1, 3, 7].includes(n))),
  })
  .superRefine((v, ctx) => {
    if (v.frequency === 'custom') {
      const n = v.custom_interval_days;
      if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > 3650) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['custom_interval_days'],
          message: 'Enter the number of days between payments (1–3650)',
        });
      }
    }
    if (isValidISODate(v.start_date) && isValidISODate(v.next_renewal_date) && v.next_renewal_date < v.start_date) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['next_renewal_date'],
        message: 'The next renewal cannot be before the start date',
      });
    }
    if (v.status === 'trial' && v.trial_end_date === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['trial_end_date'],
        message: 'Add the date the trial ends',
      });
    }
  });

export type SubscriptionFormValues = z.infer<typeof subscriptionFormSchema>;
