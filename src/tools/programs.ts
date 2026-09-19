import { z } from 'zod';
import { DISCLAIMER, SOURCE_NOTES } from '../config.js';
import { loadPrograms } from '../lib/data.js';
import { addMonths, daysBetween, ISO_DATE, parseISODate, toISO, today } from '../lib/dates.js';
import { normalize, tokenize } from '../lib/text.js';
import type { Program, ProgramsFile } from '../types.js';

export const pointsExpiryShape = {
  programs: z
    .array(z.string().min(2).max(80))
    .min(1)
    .max(30)
    .describe('Loyalty programs the person belongs to, e.g. ["American AAdvantage", "Marriott Bonvoy", "Hilton", "Starbucks"].'),
  last_activity: z
    .record(z.string(), z.string().regex(ISO_DATE))
    .optional()
    .describe('Optional map of program name → date of last earn or redeem (YYYY-MM-DD). When given, the tool computes the expiry date and days left.'),
  as_of: z.string().regex(ISO_DATE).optional().describe('Date to compute countdowns from. Default: today.')
};

export const PointsExpirySchema = z.object(pointsExpiryShape);
export type PointsExpiryInput = z.infer<typeof PointsExpirySchema>;

export function resolveProgram(name: string, programs: Program[]): Program | null {
  const n = normalize(name).trim();
  for (const p of programs) if (normalize(p.name) === n || normalize(p.operator) === n || p.aliases.some((a) => normalize(a) === n)) return p;
  for (const p of programs) if (p.aliases.some((a) => n.includes(normalize(a))) || n.includes(normalize(p.operator))) return p;
  const qt = new Set(tokenize(name));
  let best: { p: Program; o: number } | null = null;
  for (const p of programs) {
    const pt = new Set(tokenize(`${p.name} ${p.operator} ${p.aliases.join(' ')}`));
    let o = 0;
    for (const t of qt) if (pt.has(t)) o++;
    if (o > 0 && (!best || o > best.o)) best = { p, o };
  }
  return best ? best.p : null;
}

export function pointsExpiry(input: PointsExpiryInput, file: ProgramsFile = loadPrograms(), asOfOverride?: Date) {
  const asOf = parseISODate(input.as_of ?? null) ?? asOfOverride ?? today();
  const lastActivity = input.last_activity ?? {};
  const results = [];
  const unmatched: string[] = [];
  for (const name of input.programs) {
    const p = resolveProgram(name, file.programs);
    if (!p) {
      unmatched.push(name);
      continue;
    }
    const activityKey = Object.keys(lastActivity).find((k) => resolveProgram(k, file.programs)?.id === p.id);
    const last = activityKey ? parseISODate(lastActivity[activityKey]) : null;
    let expiresOn: string | null = null;
    let daysLeft: number | null = null;
    if (p.expiry.type === 'inactivity' && p.expiry.months && last) {
      const exp = addMonths(last, p.expiry.months);
      expiresOn = toISO(exp);
      daysLeft = daysBetween(asOf, exp);
    }
    results.push({
      input: name,
      program: p.name,
      operator: p.operator,
      kind: p.kind,
      expiry_policy: p.expiry.type,
      inactivity_months: p.expiry.months ?? null,
      detail: p.expiry.detail,
      last_activity: last ? toISO(last) : null,
      expires_on: expiresOn,
      days_left: daysLeft,
      at_risk: daysLeft !== null ? daysLeft <= 90 : p.expiry.type !== 'never' && !last,
      keeps_alive: p.keeps_alive,
      url: p.url,
      data_confidence: p.confidence
    });
  }
  return {
    as_of: toISO(asOf),
    catalog_last_reviewed: file.last_reviewed,
    programs: results,
    unmatched,
    sources: [SOURCE_NOTES.curated],
    disclaimer: DISCLAIMER
  };
}

export type PointsExpiryResult = ReturnType<typeof pointsExpiry>;
