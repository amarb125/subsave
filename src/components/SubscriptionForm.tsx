import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { useData } from '@/context/DataContext';
import { FREQUENCY_LABELS, REMINDER_LABELS, STATUS_LABELS } from '@/lib/constants';
import { addDays, isValidISODate, nextOccurrence } from '@/lib/dates';
import { findPossibleDuplicatesOf } from '@/lib/leaks';
import { subscriptionFormSchema, type SubscriptionFormValues } from '@/lib/schema';
import { CATEGORIES, CURRENCIES, FREQUENCIES, PAYMENT_METHODS, REMINDER_OFFSETS, STATUSES, type Subscription } from '@/lib/types';
import { Button, Checkbox, Field, Input, Notice, Select, Textarea } from './ui';

interface Props {
  initial: SubscriptionFormValues;
  /** Present when editing: used to ignore the subscription itself in the duplicate warning. */
  base?: Subscription;
  submitLabel: string;
  onSubmit(values: SubscriptionFormValues): Promise<void>;
  onCancel(): void;
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <fieldset className="card p-4 sm:p-5">
      <legend className="px-1 text-sm font-semibold text-ink">{title}</legend>
      {description && <p className="mb-3 text-xs text-ink-soft">{description}</p>}
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

export function SubscriptionForm({ initial, base, submitLabel, onSubmit, onCancel }: Props) {
  const { subscriptions, today } = useData();
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting, dirtyFields },
  } = useForm<SubscriptionFormValues>({
    defaultValues: initial,
    resolver: zodResolver(subscriptionFormSchema),
    mode: 'onTouched',
  });

  const name = watch('name');
  const provider = watch('provider');
  const category = watch('category');
  const frequency = watch('frequency');
  const status = watch('status');
  const startDate = watch('start_date');
  const customDays = watch('custom_interval_days');
  const nextRenewal = watch('next_renewal_date');
  const remindersEnabled = watch('reminders_enabled');
  const reminderDays = watch('reminder_days');
  const renewalEdited = Boolean(dirtyFields.next_renewal_date);

  // When adding, suggest the next renewal from the start date until the user types their own.
  useEffect(() => {
    if (base || renewalEdited || !isValidISODate(startDate)) return;
    const earliest = addDays(startDate, 1);
    const from = earliest > today ? earliest : today;
    const suggestion = nextOccurrence(startDate, frequency, frequency === 'custom' ? customDays : null, from);
    if (suggestion) setValue('next_renewal_date', suggestion);
  }, [base, renewalEdited, startDate, frequency, customDays, today, setValue]);

  const similar = useMemo(
    () => findPossibleDuplicatesOf({ name, provider, category }, subscriptions, base?.id),
    [name, provider, category, subscriptions, base?.id],
  );

  const toggleReminder = (days: number) => {
    const next = reminderDays.includes(days) ? reminderDays.filter((d) => d !== days) : [...reminderDays, days];
    setValue(
      'reminder_days',
      next.sort((a, b) => b - a),
      { shouldDirty: true },
    );
  };

  const renewalInPast = isValidISODate(nextRenewal) && nextRenewal < today;

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <Section title="What are you paying for?">
        <Field label="Subscription name" error={errors.name?.message} className="sm:col-span-2">
          {({ id, describedBy, invalid }) => (
            <Input id={id} aria-describedby={describedBy} invalid={invalid} autoComplete="off" placeholder="e.g. Netflix" {...register('name')} />
          )}
        </Field>
        <Field label="Provider or brand" optional error={errors.provider?.message}>
          {({ id, describedBy, invalid }) => (
            <Input id={id} aria-describedby={describedBy} invalid={invalid} autoComplete="off" placeholder="e.g. Netflix, Inc." {...register('provider')} />
          )}
        </Field>
        <Field label="Category" error={errors.category?.message}>
          {({ id, describedBy, invalid }) => (
            <Select id={id} aria-describedby={describedBy} invalid={invalid} {...register('category')}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {similar.length > 0 && (
          <div className="sm:col-span-2">
            <Notice tone="warn" title="Possible duplicate">
              You already track {similar.map((s) => s.name).join(', ')}. This could be a different plan, so it is only a heads-up.
              You can still save.
            </Notice>
          </div>
        )}
      </Section>

      <Section title="Cost and billing">
        <Field label="Amount per payment" error={errors.amount?.message} hint="Use 0 for free plans.">
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              invalid={invalid}
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              placeholder="0.00"
              {...register('amount', { valueAsNumber: true })}
            />
          )}
        </Field>
        <Field label="Currency" error={errors.currency?.message}>
          {({ id, describedBy, invalid }) => (
            <Select id={id} aria-describedby={describedBy} invalid={invalid} {...register('currency')}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Billing frequency" error={errors.frequency?.message}>
          {({ id, describedBy, invalid }) => (
            <Select id={id} aria-describedby={describedBy} invalid={invalid} {...register('frequency')}>
              {FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {FREQUENCY_LABELS[f]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {frequency === 'custom' && (
          <Field label="Days between payments" error={errors.custom_interval_days?.message} hint="For example 28 or 45.">
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                invalid={invalid}
                type="number"
                inputMode="numeric"
                min="1"
                max="3650"
                step="1"
                {...register('custom_interval_days', { valueAsNumber: true })}
              />
            )}
          </Field>
        )}
        <Field label="Start date" error={errors.start_date?.message}>
          {({ id, describedBy, invalid }) => (
            <Input id={id} aria-describedby={describedBy} invalid={invalid} type="date" {...register('start_date')} />
          )}
        </Field>
        <Field
          label="Next renewal date"
          error={errors.next_renewal_date?.message}
          hint={
            renewalInPast
              ? 'This date has passed. SubSave will work out the next one for you.'
              : 'The next date you will be charged.'
          }
        >
          {({ id, describedBy, invalid }) => (
            <Input id={id} aria-describedby={describedBy} invalid={invalid} type="date" {...register('next_renewal_date')} />
          )}
        </Field>
        <Field label="Payment method" error={errors.payment_method?.message} hint="Only the type is saved. Never enter card numbers, CVVs or UPI PINs.">
          {({ id, describedBy, invalid }) => (
            <Select id={id} aria-describedby={describedBy} invalid={invalid} {...register('payment_method')}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </Section>

      <Section title="Status and trial">
        <Field label="Status" error={errors.status?.message}>
          {({ id, describedBy, invalid }) => (
            <Select id={id} aria-describedby={describedBy} invalid={invalid} {...register('status')}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field
          label="Trial end date"
          optional={status !== 'trial'}
          error={errors.trial_end_date?.message}
          hint={status === 'trial' ? 'Required for trials so we can warn you before billing starts.' : undefined}
        >
          {({ id, describedBy, invalid }) => (
            <Input id={id} aria-describedby={describedBy} invalid={invalid} type="date" {...register('trial_end_date')} />
          )}
        </Field>
        {status === 'cancelled' && (
          <div className="sm:col-span-2">
            <Notice>
              Only choose Cancelled once the provider has confirmed it. Cancelled subscriptions stop counting toward your spending.
            </Notice>
          </div>
        )}
      </Section>

      <Section
        title="Reminders"
        description="SubSave shows these in the app and in your notification centre whenever you open it. It cannot send alerts while the app is closed."
      >
        <div className="space-y-3 sm:col-span-2">
          {/* Controlled (not register()): the shared Checkbox does not forward refs. */}
          <Checkbox
            label="Remind me before this renews"
            checked={remindersEnabled}
            onChange={(e) => setValue('reminders_enabled', e.target.checked, { shouldDirty: true })}
          />
          <div className="grid gap-3 pl-8 sm:grid-cols-2" role="group" aria-label="Reminder timing">
            {REMINDER_OFFSETS.map((d) => (
              <Checkbox
                key={d}
                label={REMINDER_LABELS[d]}
                checked={reminderDays.includes(d)}
                disabled={!remindersEnabled}
                onChange={() => toggleReminder(d)}
              />
            ))}
          </div>
        </div>
      </Section>

      <Section title="Notes and cancellation link">
        <Field label="Cancellation page" optional error={errors.cancellation_url?.message} hint="Paste the provider's official page, if you know it." className="sm:col-span-2">
          {({ id, describedBy, invalid }) => (
            <Input id={id} aria-describedby={describedBy} invalid={invalid} type="url" inputMode="url" placeholder="https://" {...register('cancellation_url')} />
          )}
        </Field>
        <Field label="Notes" optional error={errors.notes?.message} className="sm:col-span-2">
          {({ id, describedBy, invalid }) => (
            <Textarea id={id} aria-describedby={describedBy} invalid={invalid} rows={3} {...register('notes')} />
          )}
        </Field>
      </Section>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" loading={isSubmitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
