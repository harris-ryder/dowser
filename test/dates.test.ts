import { describe, expect, it } from 'vitest';
import { daysBetween, nextBirthday, nextReset, parseISODate, parseLongDate, parseUSShortDate, toISO, utc } from '../src/lib/dates.js';

describe('date parsing', () => {
  it('parses ISO strictly', () => {
    expect(toISO(parseISODate('2026-09-19')!)).toBe('2026-09-19');
    expect(parseISODate('2026-02-30')).toBeNull();
    expect(parseISODate('9/19/26')).toBeNull();
  });
  it('parses US short dates', () => {
    expect(parseUSShortDate('10/15/26')).toBe('2026-10-15');
    expect(parseUSShortDate('1/5/2027')).toBe('2027-01-05');
    expect(parseUSShortDate('Varies')).toBeNull();
  });
  it('parses long dates', () => {
    expect(parseLongDate('September 19, 2026')).toBe('2026-09-19');
    expect(parseLongDate('Deadline: Sept. 1, 2026 (Opt-Out)')).toBe('2026-09-01');
    expect(parseLongDate('No Claim Form (Automatic Payment)')).toBeNull();
  });
});

describe('nextReset', () => {
  const asOf = utc(2026, 8, 19); // 2026-09-19
  it('computes the next period boundary', () => {
    expect(toISO(nextReset('monthly', asOf)!)).toBe('2026-10-01');
    expect(toISO(nextReset('quarterly', asOf)!)).toBe('2026-10-01');
    expect(toISO(nextReset('semiannual', asOf)!)).toBe('2027-01-01');
    expect(toISO(nextReset('annual_calendar', asOf)!)).toBe('2027-01-01');
    expect(nextReset('cardmember_year', asOf)).toBeNull();
  });
  it('handles a mid-quarter date', () => {
    expect(toISO(nextReset('quarterly', utc(2026, 1, 3))!)).toBe('2026-04-01');
    expect(toISO(nextReset('semiannual', utc(2026, 1, 3))!)).toBe('2026-07-01');
  });
});

describe('nextBirthday', () => {
  const asOf = utc(2026, 8, 19);
  it('rolls to next year when the birthday has passed', () => {
    expect(toISO(nextBirthday('03-14', asOf)!)).toBe('2027-03-14');
    expect(toISO(nextBirthday('1990-12-25', asOf)!)).toBe('2026-12-25');
    expect(toISO(nextBirthday('09-19', asOf)!)).toBe('2026-09-19');
  });
  it('handles Feb 29 in non-leap years', () => {
    expect(toISO(nextBirthday('02-29', utc(2026, 0, 1))!)).toBe('2026-02-28');
  });
  it('rejects garbage', () => {
    expect(nextBirthday('13-40', asOf)).toBeNull();
  });
});

describe('daysBetween', () => {
  it('counts whole days', () => {
    expect(daysBetween(utc(2026, 8, 19), utc(2026, 9, 1))).toBe(12);
    expect(daysBetween(utc(2026, 9, 1), utc(2026, 8, 19))).toBe(-12);
  });
});
