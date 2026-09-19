import { z } from 'zod';
import { DISCLAIMER, SOURCE_NOTES } from '../config.js';
import { loadFreebies } from '../lib/data.js';
import { addDays, daysBetween, ISO_DATE, nextBirthday, parseISODate, toISO, today } from '../lib/dates.js';
import type { Freebie, FreebiesFile } from '../types.js';

export const birthdayFreebiesShape = {
  state: z.string().length(2).optional().describe('Two-letter U.S. state. Filters out regional chains that have no locations there. National chains are always included.'),
  birthday: z
    .string()
    .regex(/^(?:\d{4}-)?\d{2}-\d{2}$/)
    .optional()
    .describe('Birthday as MM-DD or YYYY-MM-DD. When given, the tool computes days until the birthday and the latest date to join each program.'),
  categories: z
    .array(z.enum(['coffee', 'dessert', 'fast food', 'casual dining', 'entertainment', 'beauty', 'retail', 'kids']))
    .optional()
    .describe('Limit to these categories.'),
  as_of: z.string().regex(ISO_DATE).optional().describe('Date to compute countdowns from. Default: today.'),
  limit: z.number().int().min(1).max(200).optional().describe('Max results (default 100).')
};

export const BirthdayFreebiesSchema = z.object(birthdayFreebiesShape);
export type BirthdayFreebiesInput = z.infer<typeof BirthdayFreebiesSchema>;

export function freebieAvailableIn(f: Freebie, state: string | undefined): boolean {
  if (!state || f.regions === 'national') return true;
  return f.regions.includes(state.toUpperCase());
}

export function birthdayFreebies(input: BirthdayFreebiesInput, file: FreebiesFile = loadFreebies(), asOfOverride?: Date) {
  const asOf = parseISODate(input.as_of ?? null) ?? asOfOverride ?? today();
  const limit = input.limit ?? 100;
  const bday = input.birthday ? nextBirthday(input.birthday, asOf) : null;
  const daysUntil = bday ? daysBetween(asOf, bday) : null;
  const cats = input.categories ? new Set<string>(input.categories) : null;

  const list = file.freebies
    .filter((f) => freebieAvailableIn(f, input.state))
    .filter((f) => !cats || cats.has(f.category))
    .map((f) => {
      const joinBy = bday && f.advance_days_required ? addDays(bday, -f.advance_days_required) : bday;
      const joinDaysLeft = joinBy ? daysBetween(asOf, joinBy) : null;
      return {
        brand: f.brand,
        category: f.category,
        reward: f.reward,
        program: f.program,
        how: f.how,
        window: f.window,
        purchase_required: f.purchase_required,
        advance_days_required: f.advance_days_required,
        join_by: joinBy ? toISO(joinBy) : null,
        join_days_left: joinDaysLeft,
        join_now: joinDaysLeft !== null && joinDaysLeft <= 30,
        regions: f.regions,
        notes: f.notes ?? null,
        url: f.url,
        data_confidence: f.confidence
      };
    })
    .sort((a, b) => a.category.localeCompare(b.category) || a.brand.localeCompare(b.brand));

  return {
    as_of: toISO(asOf),
    catalog_last_reviewed: file.last_reviewed,
    birthday_next: bday ? toISO(bday) : null,
    days_until_birthday: daysUntil,
    state: input.state?.toUpperCase() ?? null,
    total: list.length,
    returned: Math.min(list.length, limit),
    tip: 'Most rewards need a free loyalty account with the birthday saved in the profile. Join at least a week or two ahead; Starbucks needs seven days and Medieval Times fourteen.',
    freebies: list.slice(0, limit),
    sources: [SOURCE_NOTES.curated],
    disclaimer: DISCLAIMER
  };
}

export type BirthdayFreebiesResult = ReturnType<typeof birthdayFreebies>;
