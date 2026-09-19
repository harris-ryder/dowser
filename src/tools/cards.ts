import { z } from 'zod';
import { DISCLAIMER, SOURCE_NOTES } from '../config.js';
import { loadCards } from '../lib/data.js';
import { CADENCE_LABEL, daysBetween, ISO_DATE, nextReset, parseISODate, toISO, today } from '../lib/dates.js';
import { normalize, tokenize } from '../lib/text.js';
import type { Card, CardsFile, Perk } from '../types.js';

export const cardBenefitsShape = {
  cards: z
    .array(z.string().min(2).max(80))
    .min(1)
    .max(20)
    .describe('Card names as the person would say them, e.g. ["Amex Platinum", "Chase Sapphire Reserve", "Venture X"]. Pull from statements or Plaid account names.'),
  as_of: z.string().regex(ISO_DATE).optional().describe('Date to compute reset countdowns from (YYYY-MM-DD). Default: today.'),
  expiring_within_days: z.number().int().min(1).max(365).optional().describe('Flag perks whose current period ends within this many days (default 14).')
};

export const CardBenefitsSchema = z.object(cardBenefitsShape);
export type CardBenefitsInput = z.infer<typeof CardBenefitsSchema>;

export interface ResolvedCard {
  card: Card;
  confidence: 'exact' | 'alias' | 'fuzzy';
  alternatives: string[];
}

const PERIODS_PER_YEAR: Record<Perk['cadence'], number> = {
  monthly: 12,
  quarterly: 4,
  semiannual: 2,
  annual_calendar: 1,
  cardmember_year: 1,
  every_4_years: 0.25,
  once: 0,
  ongoing: 0
};

export function resolveCard(name: string, cards: Card[]): ResolvedCard | null {
  const n = normalize(name).trim().replace(/\s+/g, ' ');
  if (!n) return null;
  for (const c of cards) {
    if (normalize(c.name) === n || c.aliases.some((a) => normalize(a) === n)) return { card: c, confidence: 'exact', alternatives: [] };
  }
  for (const c of cards) {
    if (c.aliases.some((a) => n.includes(normalize(a)))) return { card: c, confidence: 'alias', alternatives: [] };
  }
  const qt = new Set(tokenize(name));
  if (qt.size === 0) return null;
  const scored = cards
    .map((c) => {
      const ct = new Set(tokenize(`${c.issuer} ${c.name} ${c.aliases.join(' ')}`));
      let overlap = 0;
      for (const t of qt) if (ct.has(t)) overlap++;
      return { c, overlap };
    })
    .filter((x) => x.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap);
  if (scored.length === 0) return null;
  const best = scored[0];
  if (best.overlap < Math.min(2, qt.size)) return null;
  const ties = scored.filter((x) => x.overlap === best.overlap);
  return { card: best.c, confidence: 'fuzzy', alternatives: ties.slice(1, 4).map((x) => x.c.name) };
}

export function perkView(p: Perk, asOf: Date, horizonDays: number) {
  const reset = nextReset(p.cadence, asOf);
  const daysUntilReset = reset ? daysBetween(asOf, reset) : null;
  const ends = parseISODate(p.ends ?? null);
  const useItOrLoseIt = ['monthly', 'quarterly', 'semiannual', 'annual_calendar', 'cardmember_year'].includes(p.cadence) && p.type !== 'access';
  return {
    name: p.name,
    type: p.type,
    value_usd: p.value_usd,
    cadence: p.cadence,
    cadence_label: CADENCE_LABEL[p.cadence],
    current_period_ends: reset ? toISO(reset) : null,
    days_until_reset: daysUntilReset,
    use_it_or_lose_it: useItOrLoseIt,
    ending_soon: daysUntilReset !== null && daysUntilReset <= horizonDays,
    enrollment_required: p.enrollment_required,
    how_to_use: p.how_to_use,
    notes: p.notes ?? null,
    perk_ends: p.ends ?? null,
    perk_ended: ends ? ends < asOf : false
  };
}

export function estimatedAnnualValue(card: Card): number {
  let total = 0;
  for (const p of card.perks) {
    if (p.value_usd === null) continue;
    if (!['credit', 'membership', 'activation', 'award'].includes(p.type)) continue;
    total += p.value_usd * PERIODS_PER_YEAR[p.cadence];
  }
  // Uber Cash style December bonuses and similar are ignored; this is a floor, not a promise.
  return Math.round(total);
}

export function cardBenefits(input: CardBenefitsInput, file: CardsFile = loadCards(), asOfOverride?: Date) {
  const asOf = parseISODate(input.as_of ?? null) ?? asOfOverride ?? today();
  const horizon = input.expiring_within_days ?? 14;
  const matched: ReturnType<typeof cardView>[] = [];
  const unmatched: { input: string; suggestions: string[] }[] = [];

  for (const name of input.cards) {
    const r = resolveCard(name, file.cards);
    if (!r) {
      const qt = new Set(tokenize(name));
      const suggestions = file.cards
        .map((c) => ({ c, o: tokenize(`${c.issuer} ${c.name}`).filter((t) => qt.has(t)).length }))
        .filter((x) => x.o > 0)
        .sort((a, b) => b.o - a.o)
        .slice(0, 3)
        .map((x) => x.c.name);
      unmatched.push({ input: name, suggestions });
      continue;
    }
    matched.push(cardView(name, r, asOf, horizon));
  }

  const endingSoon = matched.flatMap((c) => c.perks.filter((p) => p.ending_soon && p.use_it_or_lose_it && !p.perk_ended).map((p) => ({ card: c.card, perk: p.name, value_usd: p.value_usd, current_period_ends: p.current_period_ends, days_until_reset: p.days_until_reset })));

  return {
    as_of: toISO(asOf),
    catalog_last_reviewed: file.last_reviewed,
    catalog_size: file.cards.length,
    cards: matched,
    unmatched,
    ending_soon: endingSoon,
    sources: [SOURCE_NOTES.curated],
    disclaimer: DISCLAIMER
  };
}

function cardView(inputName: string, r: ResolvedCard, asOf: Date, horizon: number) {
  const c = r.card;
  return {
    input: inputName,
    card: c.name,
    card_id: c.id,
    issuer: c.issuer,
    match_confidence: r.confidence,
    alternatives: r.alternatives,
    annual_fee_usd: c.annual_fee_usd,
    estimated_annual_credit_value_usd: estimatedAnnualValue(c),
    data_confidence: c.confidence,
    status: c.status ?? null,
    benefits_url: c.benefits_url,
    perks: c.perks.map((p) => perkView(p, asOf, horizon))
  };
}

export type CardBenefitsResult = ReturnType<typeof cardBenefits>;
