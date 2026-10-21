import { describe, it, expect } from 'vitest';
import {
  addDays, addMonths, diffDays, isLeapYear, isValidISODate, nextOccurrence, occurrencesBetween, parseISODate, todayISO,
} from '@/lib/dates';

describe('date validation', () => {
  it('rejects impossible and malformed dates', () => {
    for (const bad of ['2026-02-30', '2026-13-01', '2026-00-10', '2026-1-1', '', 'tomorrow', '2026-04-31', '1800-01-01']) {
      expect(isValidISODate(bad)).toBe(false);
    }
    expect(parseISODate(null)).toBeNull();
    expect(parseISODate(undefined)).toBeNull();
  });
  it('knows leap days', () => {
    expect(isValidISODate('2028-02-29')).toBe(true);
    expect(isValidISODate('2026-02-29')).toBe(false);
    expect(isValidISODate('2100-02-29')).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
  });
});

describe('date arithmetic', () => {
  it('adds days across month, year and leap boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('clamps month-end when adding months', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-11-30', 3)).toBe('2027-02-28');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
    expect(addMonths('2026-01-15', -2)).toBe('2025-11-15');
  });
  it('counts whole days between dates, including leap years', () => {
    expect(diffDays('2026-10-19', '2026-10-19')).toBe(0);
    expect(diffDays('2026-10-19', '2026-10-26')).toBe(7);
    expect(diffDays('2026-10-26', '2026-10-19')).toBe(-7);
    expect(diffDays('2027-02-28', '2027-03-01')).toBe(1);
    expect(diffDays('2028-02-28', '2028-03-01')).toBe(2);
    expect(diffDays('2026-01-01', '2027-01-01')).toBe(365);
    expect(diffDays('2028-01-01', '2029-01-01')).toBe(366);
  });
  it('throws on invalid input rather than guessing', () => {
    expect(() => addDays('2026-02-30', 1)).toThrow();
  });
  it('formats today from local date parts', () => {
    expect(todayISO(new Date(2026, 9, 19, 23, 59))).toBe('2026-10-19');
    expect(todayISO(new Date(2026, 0, 5, 0, 0))).toBe('2026-01-05');
  });
});

describe('renewal date calculations', () => {
  it('returns the anchor when it is not in the past', () => {
    expect(nextOccurrence('2026-11-01', 'monthly', null, '2026-10-19')).toBe('2026-11-01');
    expect(nextOccurrence('2026-10-19', 'monthly', null, '2026-10-19')).toBe('2026-10-19');
  });
  it('rolls monthly renewals forward', () => {
    expect(nextOccurrence('2026-08-15', 'monthly', null, '2026-10-19')).toBe('2026-11-15');
    expect(nextOccurrence('2026-08-19', 'monthly', null, '2026-10-19')).toBe('2026-10-19');
  });
  it('does not drift when the anchor is on the 31st', () => {
    expect(nextOccurrence('2026-01-31', 'monthly', null, '2026-02-01')).toBe('2026-02-28');
    expect(nextOccurrence('2026-01-31', 'monthly', null, '2026-03-01')).toBe('2026-03-31');
    expect(nextOccurrence('2026-01-31', 'monthly', null, '2026-04-01')).toBe('2026-04-30');
  });
  it('handles weekly, quarterly, half-yearly and yearly cycles', () => {
    expect(nextOccurrence('2026-10-01', 'weekly', null, '2026-10-19')).toBe('2026-10-22');
    expect(nextOccurrence('2026-01-10', 'quarterly', null, '2026-10-19')).toBe('2027-01-10');
    expect(nextOccurrence('2026-01-10', 'half_yearly', null, '2026-10-19')).toBe('2027-01-10');
    expect(nextOccurrence('2024-02-29', 'yearly', null, '2026-10-19')).toBe('2027-02-28');
    expect(nextOccurrence('2024-02-29', 'yearly', null, '2028-03-01')).toBe('2029-02-28');
    expect(nextOccurrence('2024-02-29', 'yearly', null, '2028-02-01')).toBe('2028-02-29');
  });
  it('handles custom intervals and rejects invalid ones', () => {
    expect(nextOccurrence('2026-10-01', 'custom', 10, '2026-10-19')).toBe('2026-10-21');
    expect(nextOccurrence('2026-10-01', 'custom', 45, '2026-10-19')).toBe('2026-11-15');
    expect(nextOccurrence('2026-10-01', 'custom', null, '2026-10-19')).toBeNull();
    expect(nextOccurrence('2026-10-01', 'custom', 0, '2026-10-19')).toBeNull();
    expect(nextOccurrence('2026-10-01', 'custom', 2.5, '2026-10-19')).toBeNull();
  });
  it('returns null for invalid dates', () => {
    expect(nextOccurrence('2026-02-30', 'monthly', null, '2026-10-19')).toBeNull();
    expect(nextOccurrence('2026-10-01', 'monthly', null, 'nope')).toBeNull();
  });
  it('lists every occurrence in a range', () => {
    expect(occurrencesBetween('2026-10-05', 'weekly', null, '2026-10-19', '2026-11-10')).toEqual([
      '2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09',
    ]);
    expect(occurrencesBetween('2026-01-31', 'monthly', null, '2026-02-01', '2026-04-30')).toEqual([
      '2026-02-28', '2026-03-31', '2026-04-30',
    ]);
    expect(occurrencesBetween('2026-10-05', 'custom', null, '2026-10-19', '2026-12-31')).toEqual([]);
  });
});
