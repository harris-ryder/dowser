// Validates the hand-curated catalogues (and the generated files) against strict schemas.
//   npm run validate:data
// Fails with a readable list of problems. Run before committing catalogue edits.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

const DATA = path.resolve(process.cwd(), 'data');
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const URL_RE = /^https?:\/\/[^\s]+$/;
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const US_STATES = new Set(
  'AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC PR'.split(' ')
);

const confidence = z.enum(['high', 'medium', 'low']);
const lowercase = z.string().min(1).refine((s) => s === s.toLowerCase(), 'aliases must be lowercase');

const Perk = z.object({
  name: z.string().min(2),
  type: z.enum(['credit', 'membership', 'access', 'activation', 'award', 'other']),
  value_usd: z.number().nonnegative().nullable(),
  cadence: z.enum(['monthly', 'quarterly', 'semiannual', 'annual_calendar', 'cardmember_year', 'every_4_years', 'once', 'ongoing']),
  enrollment_required: z.boolean(),
  how_to_use: z.string().min(10),
  notes: z.string().optional(),
  ends: z.string().regex(ISO).optional()
}).strict();

const Card = z.object({
  id: z.string().regex(KEBAB),
  issuer: z.string().min(2),
  name: z.string().min(3),
  aliases: z.array(lowercase).min(1),
  annual_fee_usd: z.number().nonnegative(),
  benefits_url: z.string().regex(URL_RE),
  confidence,
  status: z.string().optional(),
  perks: z.array(Perk).min(1)
}).strict();

const CardsFile = z.object({ last_reviewed: z.string().regex(ISO), notes: z.string(), cards: z.array(Card).min(1) }).strict();

const Program = z.object({
  id: z.string().regex(KEBAB),
  name: z.string().min(2),
  operator: z.string().min(2),
  kind: z.enum(['airline', 'hotel', 'bank', 'retail']),
  aliases: z.array(lowercase).min(1),
  expiry: z.object({
    type: z.enum(['never', 'inactivity', 'fixed']),
    months: z.number().int().positive().optional(),
    detail: z.string().min(10)
  }).strict().refine((e) => e.type === 'never' || e.months !== undefined, 'inactivity/fixed expiry needs months'),
  keeps_alive: z.array(z.string()),
  url: z.string().regex(URL_RE),
  confidence
}).strict();

const ProgramsFile = z.object({ last_reviewed: z.string().regex(ISO), notes: z.string(), programs: z.array(Program).min(1) }).strict();

const Freebie = z.object({
  id: z.string().regex(KEBAB),
  brand: z.string().min(2),
  category: z.enum(['coffee', 'dessert', 'fast food', 'casual dining', 'entertainment', 'beauty', 'retail', 'kids']),
  reward: z.string().min(3),
  program: z.string().min(2),
  how: z.string().min(10),
  window: z.enum(['birthday_day', 'birthday_week', 'birthday_month', 'varies']),
  advance_days_required: z.number().int().nonnegative().nullable(),
  regions: z.union([z.literal('national'), z.array(z.string().refine((s) => US_STATES.has(s), 'unknown state code')).min(1)]),
  purchase_required: z.boolean(),
  notes: z.string().optional(),
  url: z.string().regex(URL_RE),
  confidence
}).strict();

const FreebiesFile = z.object({ last_reviewed: z.string().regex(ISO), notes: z.string(), freebies: z.array(Freebie).min(1) }).strict();

const SettlementsFile = z.object({
  generated_at: z.string(),
  sources: z.array(z.string()),
  count: z.number().int(),
  settlements: z.array(z.object({ id: z.string(), title: z.string().min(3), info_url: z.string().regex(URL_RE), deadline: z.string().regex(ISO).nullable() }).loose())
}).loose();

const RecallsFile = z.object({
  generated_at: z.string(),
  range_start: z.string().regex(ISO),
  count: z.number().int(),
  recalls: z.array(z.object({ number: z.string(), title: z.string().min(3), url: z.string().regex(URL_RE), date: z.string().regex(ISO) }).loose())
}).loose();

function load(name: string): unknown {
  return JSON.parse(readFileSync(path.join(DATA, name), 'utf8'));
}

function uniqueIds(items: { id: string }[], label: string, problems: string[]) {
  const seen = new Set<string>();
  for (const it of items) {
    if (seen.has(it.id)) problems.push(`${label}: duplicate id "${it.id}"`);
    seen.add(it.id);
  }
}

function check<T>(name: string, schema: z.ZodType<T>, problems: string[]): T | null {
  let raw: unknown;
  try {
    raw = load(name);
  } catch (err) {
    problems.push(`${name}: cannot read or parse (${err instanceof Error ? err.message : err})`);
    return null;
  }
  const r = schema.safeParse(raw);
  if (!r.success) {
    for (const issue of r.error.issues.slice(0, 40)) problems.push(`${name}: ${issue.path.join('.')} → ${issue.message}`);
    if (r.error.issues.length > 40) problems.push(`${name}: …and ${r.error.issues.length - 40} more issues`);
    return null;
  }
  return r.data;
}

const problems: string[] = [];
const cards = check('cards.json', CardsFile, problems);
const programs = check('programs.json', ProgramsFile, problems);
const freebies = check('freebies.json', FreebiesFile, problems);
const settlements = check('settlements.json', SettlementsFile, problems);
const recalls = check('recalls.json', RecallsFile, problems);

if (cards) {
  uniqueIds(cards.cards, 'cards.json', problems);
  if (cards.cards.length !== new Set(cards.cards.map((c) => c.name.toLowerCase())).size) problems.push('cards.json: duplicate card names');
}
if (programs) uniqueIds(programs.programs, 'programs.json', problems);
if (freebies) uniqueIds(freebies.freebies, 'freebies.json', problems);
if (settlements && settlements.count !== settlements.settlements.length) problems.push('settlements.json: count does not match array length');
if (recalls && recalls.count !== recalls.recalls.length) problems.push('recalls.json: count does not match array length');

const summary = {
  cards: cards?.cards.length ?? 'invalid',
  perks: cards ? cards.cards.reduce((n, c) => n + c.perks.length, 0) : 'invalid',
  programs: programs?.programs.length ?? 'invalid',
  freebies: freebies?.freebies.length ?? 'invalid',
  settlements: settlements?.count ?? 'invalid',
  recalls: recalls?.count ?? 'invalid',
  low_confidence: {
    cards: cards?.cards.filter((c) => c.confidence === 'low').map((c) => c.id) ?? [],
    programs: programs?.programs.filter((p) => p.confidence === 'low').map((p) => p.id) ?? [],
    freebies: freebies?.freebies.filter((f) => f.confidence === 'low').map((f) => f.id) ?? []
  }
};
console.log(JSON.stringify(summary, null, 2));

if (problems.length) {
  console.error(`\n${problems.length} problem(s):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log('\nAll data files valid.');
