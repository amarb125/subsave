import { describe, it, expect } from 'vitest';
import { CSV_HEADERS, escapeCsvCell, subscriptionsToCSV } from '@/lib/csv';
import { filterAndSort, DEFAULT_FILTERS } from '@/lib/filters';
import { makeSub } from './fixtures';

describe('CSV export', () => {
  it('writes a header and one row per subscription', () => {
    const csv = subscriptionsToCSV([makeSub({ name: 'Netflix', amount: 649 }), makeSub({ name: 'Gym', amount: 3000, frequency: 'quarterly' })]);
    const lines = csv.trimEnd().split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe(CSV_HEADERS.join(','));
    expect(lines[1]).toContain('Netflix,');
    expect(lines[2]).toContain(',1000,12000,');
  });
  it('quotes commas, quotes and newlines', () => {
    expect(escapeCsvCell('a,b')).toBe('"a,b"');
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvCell('line1\nline2')).toBe('"line1\nline2"');
    expect(escapeCsvCell(null)).toBe('');
  });
  it('neutralises spreadsheet formulas', () => {
    expect(escapeCsvCell('=HYPERLINK("http://evil")')).toBe(`"'=HYPERLINK(""http://evil"")"`);
    expect(escapeCsvCell('+91 99999')).toBe("'+91 99999");
    expect(escapeCsvCell('@cmd')).toBe("'@cmd");
  });
  it('keeps numbers numeric and includes custom intervals only for custom billing', () => {
    const csv = subscriptionsToCSV([makeSub({ name: 'X', amount: 100, frequency: 'custom', custom_interval_days: 30 })]);
    const row = csv.trimEnd().split('\r\n')[1];
    expect(row).toContain(',Custom,30,');
    expect(row).toContain(',100,INR,');
  });
  it('exports an empty list as just the header', () => {
    expect(subscriptionsToCSV([]).trimEnd().split('\r\n')).toHaveLength(1);
  });
});

describe('search, filter and sort', () => {
  const today = '2026-10-19';
  const subs = [
    makeSub({ id: '1', name: 'Netflix', category: 'Entertainment', payment_method: 'Credit Card', amount: 649, next_renewal_date: '2026-11-10' }),
    makeSub({ id: '2', name: 'Spotify', category: 'Music', payment_method: 'UPI', amount: 119, next_renewal_date: '2026-10-22' }),
    makeSub({ id: '3', name: 'Cult.fit', category: 'Fitness', payment_method: 'UPI', amount: 6000, frequency: 'yearly', next_renewal_date: '2027-01-01' }),
    makeSub({ id: '4', name: 'Old', status: 'cancelled', next_renewal_date: '2026-10-20' }),
    makeSub({ id: '5', name: 'Hidden', archived: true }),
  ];
  const ids = (f: Partial<typeof DEFAULT_FILTERS>) => filterAndSort(subs, { ...DEFAULT_FILTERS, ...f }, today).map((s) => s.id);

  it('hides archived by default and sorts by next renewal with cancelled last', () => {
    expect(ids({})).toEqual(['2', '1', '3', '4']);
  });
  it('searches by name case-insensitively', () => {
    expect(ids({ search: 'SPOT' })).toEqual(['2']);
  });
  it('filters by category, payment method and status', () => {
    expect(ids({ category: 'Fitness' })).toEqual(['3']);
    expect(ids({ payment: 'UPI' })).toEqual(['2', '3', '4']);
    expect(ids({ payment: 'Credit Card' })).toEqual(['1']);
    expect(ids({ status: 'cancelled' })).toEqual(['4']);
    expect(ids({ status: 'archived' })).toEqual(['5']);
  });
  it('sorts by amount (monthly equivalent) and by name', () => {
    expect(ids({ sort: 'amount' })[0]).toBe('1');
    expect(ids({ sort: 'name' })).toEqual(['3', '1', '4', '2']);
  });
});
