import { CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Field, Input, Notice, Select } from '@/components/ui';
import { useData } from '@/context/DataContext';
import { useToast } from '@/context/ToastContext';
import { FREQUENCY_LABELS } from '@/lib/constants';
import { addMonths } from '@/lib/dates';
import { emptyFormValues, formToDraft } from '@/lib/forms';
import { subscriptionFormSchema } from '@/lib/schema';
import { CATEGORIES, FREQUENCIES, type Category, type Frequency } from '@/lib/types';

const PRESETS: { name: string; category: Category }[] = [
  { name: 'Netflix', category: 'Entertainment' },
  { name: 'Amazon Prime', category: 'Shopping' },
  { name: 'Spotify', category: 'Music' },
  { name: 'YouTube Premium', category: 'Entertainment' },
  { name: 'Google One', category: 'Cloud Storage' },
  { name: 'Jio / Airtel plan', category: 'Utilities' },
];

const TARGET = 3;

/** A quick way to enter the first three subscriptions. Each one is validated like the full form. */
export default function Onboarding() {
  const { settings, today, addSubscription, saveSettings } = useData();
  const navigate = useNavigate();
  const toast = useToast();

  const [added, setAdded] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<Category>('Entertainment');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<Frequency>('monthly');
  const [renewal, setRenewal] = useState(addMonths(today, 1));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const finish = async () => {
    await saveSettings({ onboarding_completed: true });
    navigate('/', { replace: true });
  };

  const add = async () => {
    setError(null);
    const base = emptyFormValues(settings ?? undefined, today);
    const parsed = subscriptionFormSchema.safeParse({
      ...base,
      name,
      category,
      amount: amount.trim() === '' ? NaN : Number(amount),
      frequency,
      custom_interval_days: null,
      next_renewal_date: renewal,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Please check the details.');
      return;
    }
    setBusy(true);
    const created = await addSubscription(formToDraft(parsed.data));
    setBusy(false);
    if (!created) return;
    const next = [...added, created.name];
    setAdded(next);
    setName('');
    setAmount('');
    toast.success(`${created.name} added`);
    if (next.length >= TARGET) await finish();
  };

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Let's find your first three</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Think of the things that charge you automatically: streaming, music, phone or broadband, cloud storage. You can add the rest later.
      </p>

      <ol className="mt-5 flex gap-2" aria-label="Progress">
        {Array.from({ length: TARGET }, (_, i) => (
          <li
            key={i}
            className={`flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl border text-xs font-medium ${
              i < added.length ? 'border-brand-200 bg-brand-50 text-brand-800' : 'border-paper-line bg-white text-ink-faint'
            }`}
          >
            {i < added.length ? (
              <>
                <CheckCircle2 className="h-4 w-4" aria-hidden />
                <span className="truncate">{added[i]}</span>
              </>
            ) : (
              `#${i + 1}`
            )}
          </li>
        ))}
      </ol>

      <div className="card mt-4 p-4 sm:p-5">
        <p className="text-xs font-medium text-ink-soft">Quick picks</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.name}
              type="button"
              onClick={() => {
                setName(p.name);
                setCategory(p.category);
              }}
              className="min-h-9 rounded-full border border-paper-line bg-white px-3 text-sm text-ink hover:border-brand-300 hover:bg-brand-50"
            >
              {p.name}
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Name" className="sm:col-span-2">
            {({ id }) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" placeholder="e.g. Netflix" />}
          </Field>
          <Field label="Category">
            {({ id }) => (
              <Select id={id} value={category} onChange={(e) => setCategory(e.target.value as Category)}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={`Amount (${settings?.default_currency ?? 'INR'})`}>
            {({ id }) => (
              <Input id={id} type="number" inputMode="decimal" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            )}
          </Field>
          <Field label="Billed">
            {({ id }) => (
              <Select id={id} value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)}>
                {FREQUENCIES.filter((f) => f !== 'custom').map((f) => (
                  <option key={f} value={f}>
                    {FREQUENCY_LABELS[f]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Next renewal">
            {({ id }) => <Input id={id} type="date" value={renewal} onChange={(e) => setRenewal(e.target.value)} />}
          </Field>
        </div>

        {error && (
          <Notice tone="danger" className="mt-4">
            {error}
          </Notice>
        )}

        <Button className="mt-4 w-full" onClick={() => void add()} loading={busy}>
          Add subscription {added.length + 1} of {TARGET}
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap justify-between gap-2">
        <Button variant="ghost" onClick={() => void finish()}>
          {added.length > 0 ? 'Done for now' : 'Skip for now'}
        </Button>
        <p className="self-center text-xs text-ink-soft">Only labels are stored. Never enter card numbers or PINs.</p>
      </div>
    </div>
  );
}
