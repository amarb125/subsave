import { annualCost, monthlyEquivalent, round2 } from './calc';
import { FREQUENCY_LABELS, STATUS_LABELS } from './constants';
import type { Subscription } from './types';

/**
 * Escapes one CSV cell. Cells starting with = + - @ (or tab/CR) are prefixed with an
 * apostrophe so spreadsheet apps do not execute them as formulas (CSV injection).
 */
export function escapeCsvCell(value: string | number | boolean | null | undefined, isText = true): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (isText && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[",\r\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

export const CSV_HEADERS = [
  'Name',
  'Provider',
  'Category',
  'Status',
  'Amount',
  'Currency',
  'Billing frequency',
  'Custom interval (days)',
  'Monthly equivalent',
  'Annual cost',
  'Start date',
  'Next renewal',
  'Trial end',
  'Payment method',
  'Marked unused',
  'Archived',
  'Notes',
] as const;

export function subscriptionsToCSV(subs: Subscription[]): string {
  const rows: string[] = [CSV_HEADERS.join(',')];
  for (const s of subs) {
    rows.push(
      [
        escapeCsvCell(s.name),
        escapeCsvCell(s.provider),
        escapeCsvCell(s.category),
        escapeCsvCell(STATUS_LABELS[s.status]),
        escapeCsvCell(round2(s.amount), false),
        escapeCsvCell(s.currency),
        escapeCsvCell(FREQUENCY_LABELS[s.frequency]),
        escapeCsvCell(s.frequency === 'custom' ? s.custom_interval_days : null, false),
        escapeCsvCell(round2(monthlyEquivalent(s)), false),
        escapeCsvCell(round2(annualCost(s)), false),
        escapeCsvCell(s.start_date),
        escapeCsvCell(s.next_renewal_date),
        escapeCsvCell(s.trial_end_date),
        escapeCsvCell(s.payment_method),
        escapeCsvCell(s.unused ? 'Yes' : 'No'),
        escapeCsvCell(s.archived ? 'Yes' : 'No'),
        escapeCsvCell(s.notes),
      ].join(','),
    );
  }
  return rows.join('\r\n') + '\r\n';
}

/** Triggers a browser download. A UTF-8 BOM makes Excel read ₹ and other symbols correctly. */
export function downloadCSV(filename: string, csv: string): void {
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
