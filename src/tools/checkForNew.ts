import { z } from 'zod';
import { DISCLAIMER, SOURCE_NOTES } from '../config.js';
import { loadCards, loadRecalls, loadSettlements } from '../lib/data.js';
import { ISO_DATE, parseISODate, toISO, today } from '../lib/dates.js';
import type { CardsFile, RecallsFile, SettlementsFile } from '../types.js';
import { cardBenefits } from './cards.js';
import { matchRecalls, recallsWithTopup, toRecallResult } from './recalls.js';
import { isOpen, settlementIndex, toSettlementResult } from './settlements.js';

export const checkForNewShape = {
  since: z.string().regex(ISO_DATE).describe('Return things added or announced on or after this date (YYYY-MM-DD). Use the date of the last check.'),
  brands: z.array(z.string().min(1).max(80)).max(50).optional().describe('Brands and companies the person uses. When given, new settlements are filtered to these; otherwise all new settlements are listed.'),
  products: z.array(z.string().min(2).max(120)).max(50).optional().describe('Products the person owns. When given, new recalls are matched to these; otherwise only a count and the newest recalls are returned.'),
  cards: z.array(z.string().min(2).max(80)).max(20).optional().describe('Credit cards held. Perks whose current period ends soon are listed as reminders.'),
  state: z.string().length(2).optional().describe('Two-letter U.S. state for settlement filtering.'),
  horizon_days: z.number().int().min(1).max(60).optional().describe('How many days ahead to flag card credits that are about to reset (default 14).'),
  limit: z.number().int().min(1).max(50).optional().describe('Max items per section (default 15).')
};

export const CheckForNewSchema = z.object(checkForNewShape);
export type CheckForNewInput = z.infer<typeof CheckForNewSchema>;

export interface CheckForNewDeps {
  settlements: SettlementsFile;
  recalls: RecallsFile;
  cards: CardsFile;
}

export async function checkForNew(input: CheckForNewInput, deps?: Partial<CheckForNewDeps>, asOf: Date = today()) {
  const settlementsFile = deps?.settlements ?? loadSettlements();
  const recallsFile = deps?.recalls ?? loadRecalls();
  const cardsFile = deps?.cards ?? loadCards();
  const since = parseISODate(input.since);
  if (!since) throw new Error('since must be YYYY-MM-DD');
  const sinceISO = toISO(since);
  const limit = input.limit ?? 15;
  const state = input.state?.toUpperCase();

  // New settlements.
  const fresh = settlementsFile.settlements.filter((s) => {
    if (!isOpen(s, asOf)) return false;
    if ((s.added ?? s.first_seen) < sinceISO) return false;
    if (state && s.states.length > 0 && !s.states.includes(state)) return false;
    return true;
  });
  let newSettlements;
  if (input.brands && input.brands.length > 0) {
    const allowed = new Set(fresh);
    newSettlements = settlementIndex(settlementsFile)
      .search(input.brands, { minScore: 0.75 })
      .filter((h) => allowed.has(h.doc))
      .slice(0, limit)
      .map((h) => toSettlementResult(h.doc, asOf, h));
  } else {
    newSettlements = fresh
      .sort((a, b) => (b.added ?? b.first_seen).localeCompare(a.added ?? a.first_seen))
      .slice(0, limit)
      .map((s) => toSettlementResult(s, asOf));
  }

  // New recalls.
  let recallsSection;
  if (input.products && input.products.length > 0) {
    const r = await matchRecalls({ products: input.products, since: sinceISO, limit }, recallsFile, asOf);
    recallsSection = { mode: 'matched_to_products', total_new_recalls_since: r.recalls_searched, matched: r.matched, live_topup: r.live_topup, items: r.results };
  } else {
    const { recalls, live } = await recallsWithTopup(recallsFile, true);
    const newest = recalls.filter((r) => r.date >= sinceISO).sort((a, b) => b.date.localeCompare(a.date));
    recallsSection = {
      mode: 'all_new',
      total_new_recalls_since: newest.length,
      matched: null,
      live_topup: live,
      items: newest.slice(0, Math.min(limit, 10)).map((r) => toRecallResult(r, { score: 0, matched: [], terms: [] }))
    };
  }

  // Card credits about to reset.
  let cardReminders: unknown[] = [];
  let cardUnmatched: unknown[] = [];
  if (input.cards && input.cards.length > 0) {
    const cb = cardBenefits({ cards: input.cards, expiring_within_days: input.horizon_days ?? 14 }, cardsFile, asOf);
    cardReminders = cb.ending_soon;
    cardUnmatched = cb.unmatched;
  }

  return {
    as_of: toISO(asOf),
    since: sinceISO,
    summary: {
      new_settlements: newSettlements.length,
      new_settlements_total_since: fresh.length,
      new_recalls_total_since: recallsSection.total_new_recalls_since,
      card_credits_ending_soon: cardReminders.length
    },
    new_settlements: newSettlements,
    recalls: recallsSection,
    card_credits_ending_soon: cardReminders,
    card_unmatched: cardUnmatched,
    next_check_hint: `Call again with since=${toISO(asOf)} to see only what is new after today.`,
    sources: [SOURCE_NOTES.openclassactions, SOURCE_NOTES.classactionorg, SOURCE_NOTES.cpsc, SOURCE_NOTES.curated],
    disclaimer: DISCLAIMER
  };
}

export type CheckForNewResult = Awaited<ReturnType<typeof checkForNew>>;
