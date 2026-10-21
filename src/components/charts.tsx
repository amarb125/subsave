import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatMoney } from '@/lib/calc';

const ACCENT = '#1a7c70';
const GRID = '#e4e8e6';
const AXIS = '#4a5a58';

export interface BarDatum {
  label: string;
  amount: number;
}

function compact(n: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(n);
  } catch {
    return String(Math.round(n));
  }
}

/**
 * Simple column chart. Always pair it with a table of the same numbers (the pages do), so the
 * information is available to screen readers and in print. The chart itself is described by ariaLabel.
 */
export function MonthlyBars({ data, currency, ariaLabel }: { data: BarDatum[]; currency: string; ariaLabel: string }) {
  return (
    <div role="img" aria-label={ariaLabel} className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: AXIS, fontSize: 12 }} />
          <YAxis
            width={58}
            tickLine={false}
            axisLine={false}
            tick={{ fill: AXIS, fontSize: 12 }}
            tickFormatter={(v: number) => compact(v, currency)}
          />
          <Tooltip cursor={{ fill: '#effaf7' }} formatter={(v) => formatMoney(Number(v), currency)} />
          <Bar dataKey="amount" name="Charges" fill={ACCENT} radius={[6, 6, 0, 0]} maxBarSize={44} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Horizontal bars, one per category. */
export function CategoryBars({ data, currency, ariaLabel }: { data: BarDatum[]; currency: string; ariaLabel: string }) {
  const height = Math.max(150, data.length * 38 + 24);
  return (
    <div role="img" aria-label={ariaLabel} className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid horizontal={false} stroke={GRID} />
          <XAxis
            type="number"
            tickLine={false}
            axisLine={false}
            tick={{ fill: AXIS, fontSize: 12 }}
            tickFormatter={(v: number) => compact(v, currency)}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={104}
            tickLine={false}
            axisLine={false}
            tick={{ fill: AXIS, fontSize: 12 }}
          />
          <Tooltip cursor={{ fill: '#effaf7' }} formatter={(v) => formatMoney(Number(v), currency)} />
          <Bar dataKey="amount" name="Cost" fill={ACCENT} radius={[0, 6, 6, 0]} maxBarSize={24} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
