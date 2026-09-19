import type { Cadence } from '../types.js';

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const MONTHS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4,
  jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8,
  oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11
};

export function utc(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m, d));
}

export function today(): Date {
  const n = new Date();
  return utc(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
}

export function todayISO(): string {
  return toISO(today());
}

export function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function parseISODate(s: string | null | undefined): Date | null {
  if (!s || !ISO_DATE.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  const dt = utc(y, m - 1, d);
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt;
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}

export function addMonths(d: Date, n: number): Date {
  return utc(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate());
}

export function addYears(d: Date, n: number): Date {
  return utc(d.getUTCFullYear() + n, d.getUTCMonth(), d.getUTCDate());
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

/** "10/15/26" or "10/15/2026" → "2026-10-15". */
export function parseUSShortDate(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!m) return null;
  let y = Number(m[3]);
  if (y < 100) y += 2000;
  const dt = utc(y, Number(m[1]) - 1, Number(m[2]));
  return isNaN(dt.getTime()) ? null : toISO(dt);
}

/** "September 19, 2026", "Sept. 19, 2026", "Sep 19 2026" → "2026-09-19". */
export function parseLongDate(s: string): string | null {
  const m = s.trim().match(/([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (!m) return null;
  const month = MONTHS[m[1].toLowerCase()];
  if (month === undefined) return null;
  const dt = utc(Number(m[3]), month, Number(m[2]));
  return isNaN(dt.getTime()) ? null : toISO(dt);
}

/** The next date a benefit with this cadence resets, or null when it depends on data we don't have. */
export function nextReset(cadence: Cadence, asOf: Date): Date | null {
  const y = asOf.getUTCFullYear();
  const m = asOf.getUTCMonth();
  switch (cadence) {
    case 'monthly':
      return utc(y, m + 1, 1);
    case 'quarterly':
      return utc(y, Math.floor(m / 3) * 3 + 3, 1);
    case 'semiannual':
      return m < 6 ? utc(y, 6, 1) : utc(y + 1, 0, 1);
    case 'annual_calendar':
      return utc(y + 1, 0, 1);
    default:
      return null;
  }
}

export const CADENCE_LABEL: Record<Cadence, string> = {
  monthly: 'Resets on the 1st of every month',
  quarterly: 'Resets each calendar quarter (Jan, Apr, Jul, Oct)',
  semiannual: 'Resets twice a year (Jan 1 and Jul 1)',
  annual_calendar: 'Resets every calendar year on Jan 1',
  cardmember_year: 'Resets on your account anniversary each year',
  every_4_years: 'Available once every 4 to 4.5 years',
  once: 'One-time',
  ongoing: 'Ongoing while you hold the card'
};

/** Accepts "MM-DD" or "YYYY-MM-DD"; returns the next occurrence on or after asOf. */
export function nextBirthday(mmdd: string, asOf: Date): Date | null {
  const m = mmdd.match(/^(?:\d{4}-)?(\d{2})-(\d{2})$/);
  if (!m) return null;
  const month = Number(m[1]) - 1;
  const day = Number(m[2]);
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;
  let candidate = utc(asOf.getUTCFullYear(), month, day);
  if (candidate.getUTCMonth() !== month) candidate = utc(asOf.getUTCFullYear(), month + 1, 0); // Feb 29 → Feb 28
  if (candidate < asOf) {
    candidate = utc(asOf.getUTCFullYear() + 1, month, day);
    if (candidate.getUTCMonth() !== month) candidate = utc(asOf.getUTCFullYear() + 1, month + 1, 0);
  }
  return candidate;
}
