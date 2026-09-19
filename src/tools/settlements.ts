import { z } from 'zod';
import { DISCLAIMER, SOURCE_NOTES } from '../config.js';
import { loadSettlements } from '../lib/data.js';
import { daysBetween, ISO_DATE, parseISODate, toISO, today } from '../lib/dates.js';
import { SearchIndex } from '../lib/text.js';
import type { Settlement, SettlementsFile } from '../types.js';

export const searchSettlementsShape = {
  brands: z
    .array(z.string().min(1).max(80))
    .max(50)
    .optional()
    .describe(
      'Companies, brands, products or services the person has used or bought, e.g. ["Apple", "Ticketmaster", "AT&T", "Peloton"]. Each is matched separately and results say which ones matched. Pull these from purchase emails, bank transactions and subscriptions.'
    ),
  query: z.string().min(1).max(200).optional().describe('Free-text search, e.g. "data breach", "overdraft fees", "Siri privacy".'),
  category: z
    .string()
    .min(1)
    .max(60)
    .optional()
    .describe('Keyword filter on category or title, e.g. "Privacy", "Data Breach", "Consumer", "Securities", "Employment", "Auto".'),
  state: z
    .string()
    .length(2)
    .optional()
    .describe('Two-letter U.S. state. Keeps nationwide settlements plus ones limited to that state.'),
  no_proof_only: z.boolean().optional().describe('Only settlements whose claim form needs no receipt, records or notice ID.'),
  include_automatic: z
    .boolean()
    .optional()
    .describe('Include automatic-payment settlements that have no claim form (default true). These pay class members without any action.'),
  deadline_within_days: z.number().int().min(1).max(3650).optional().describe('Only settlements whose claim deadline falls within this many days.'),
  sort: z.enum(['relevance', 'deadline', 'added']).optional().describe('Default: relevance when brands or query given, otherwise soonest deadline first.'),
  limit: z.number().int().min(1).max(50).optional().describe('Max results (default 20).')
};

export const SearchSettlementsSchema = z.object(searchSettlementsShape);
export type SearchSettlementsInput = z.infer<typeof SearchSettlementsSchema>;

export interface SettlementResult {
  id: string;
  title: string;
  summary: string;
  payout: string | null;
  deadline: string | null;
  deadline_type: Settlement['deadline_type'];
  days_left: number | null;
  proof: Settlement['proof'];
  proof_label: string;
  category: string | null;
  states: string[];
  claim_url: string | null;
  info_url: string;
  also_listed_at: string[];
  source: Settlement['source'];
  added: string | null;
  match_score: number;
  match_quality: 'full' | 'partial' | null;
  matched_inputs: string[];
  matched_terms: string[];
  next_step: string;
}

let indexCache: { file: SettlementsFile; index: SearchIndex<Settlement> } | null = null;

export function settlementIndex(file: SettlementsFile): SearchIndex<Settlement> {
  if (indexCache && indexCache.file === file) return indexCache.index;
  const index = new SearchIndex(file.settlements, (s) => [
    { text: s.title, weight: 3 },
    { text: s.keywords.join(' '), weight: 2 },
    { text: s.category ?? '', weight: 1 },
    { text: s.summary, weight: 1 }
  ]);
  indexCache = { file, index };
  return index;
}

export function nextStepFor(s: Settlement): string {
  switch (s.proof) {
    case 'automatic':
      return 'No claim form. Payment is automatic for class members; watch mail and email for a notice and make sure the administrator has a current address.';
    case 'id_required':
      return 'The claim form asks for a Claim ID or notice code. Search email and mail for the case name to find the notice, then file on the official site.';
    case 'documentation':
      return 'Gather proof of purchase or account records (order emails, receipts, statements) before filing on the official site.';
    case 'none':
      return 'File the claim form on the official settlement site. No receipts or notice ID are required.';
    default:
      return 'Open the official settlement site to check eligibility and what the claim form asks for.';
  }
}

export function isOpen(s: Settlement, asOf: Date): boolean {
  const dl = parseISODate(s.deadline);
  return !(dl && dl < asOf);
}

export interface MatchInfo {
  score: number;
  matched: string[];
  terms: string[];
  quality?: 'full' | 'partial';
}

export function toSettlementResult(s: Settlement, asOf: Date, match: MatchInfo = { score: 0, matched: [], terms: [] }): SettlementResult {
  const dl = parseISODate(s.deadline);
  return {
    id: s.id,
    title: s.title,
    summary: s.summary,
    payout: s.payout,
    deadline: s.deadline,
    deadline_type: s.deadline_type,
    days_left: dl ? daysBetween(asOf, dl) : null,
    proof: s.proof,
    proof_label: s.proof_label,
    category: s.category,
    states: s.states,
    claim_url: s.claim_url,
    info_url: s.info_url,
    also_listed_at: s.also_listed_at,
    source: s.source,
    added: s.added,
    match_score: match.score,
    match_quality: match.matched.length > 0 ? (match.quality ?? 'full') : null,
    matched_inputs: match.matched,
    matched_terms: match.terms,
    next_step: nextStepFor(s)
  };
}

export function searchSettlements(input: SearchSettlementsInput, file: SettlementsFile = loadSettlements(), asOf: Date = today()) {
  const limit = input.limit ?? 20;
  const includeAutomatic = input.include_automatic ?? true;
  const queries = [...(input.brands ?? []), ...(input.query ? [input.query] : [])].map((s) => s.trim()).filter(Boolean);
  const state = input.state?.toUpperCase();
  const category = input.category?.toLowerCase();

  const candidates = file.settlements.filter((s) => {
    if (!isOpen(s, asOf)) return false;
    if (!includeAutomatic && s.proof === 'automatic') return false;
    if (input.no_proof_only && s.proof !== 'none') return false;
    if (state && s.states.length > 0 && !s.states.includes(state)) return false;
    if (category && !`${s.category ?? ''} ${s.title}`.toLowerCase().includes(category)) return false;
    if (input.deadline_within_days !== undefined) {
      const dl = parseISODate(s.deadline);
      if (!dl || daysBetween(asOf, dl) > input.deadline_within_days) return false;
    }
    return true;
  });

  type Scored = { s: Settlement; score: number; matched: string[]; terms: string[]; quality?: 'full' | 'partial' };
  let scored: Scored[];
  if (queries.length > 0) {
    const allowed = new Set(candidates);
    scored = settlementIndex(file)
      .search(queries, { minScore: 0.75 })
      .filter((h) => allowed.has(h.doc))
      .map((h) => ({ s: h.doc, score: h.score, matched: h.matched, terms: h.terms, quality: h.quality }));
  } else {
    scored = candidates.map((s) => ({ s, score: 0, matched: [], terms: [] }));
  }

  const sort = input.sort ?? (queries.length > 0 ? 'relevance' : 'deadline');
  const byDeadline = (a: Scored, b: Scored) => (a.s.deadline ?? '9999-12-31').localeCompare(b.s.deadline ?? '9999-12-31');
  if (sort === 'relevance') scored.sort((a, b) => b.score - a.score || byDeadline(a, b));
  else if (sort === 'deadline') scored.sort(byDeadline);
  else scored.sort((a, b) => (b.s.added ?? b.s.first_seen).localeCompare(a.s.added ?? a.s.first_seen));

  const results = scored.slice(0, limit).map((x) => toSettlementResult(x.s, asOf, x));

  return {
    as_of: toISO(asOf),
    data_generated_at: file.generated_at,
    total_open: candidates.length,
    matched: scored.length,
    returned: results.length,
    inputs: { brands: input.brands ?? [], query: input.query ?? null, state: state ?? null },
    unmatched_inputs: queries.filter((q) => !scored.some((x) => x.matched.includes(q))),
    results,
    sources: [SOURCE_NOTES.openclassactions, SOURCE_NOTES.classactionorg],
    disclaimer: DISCLAIMER
  };
}

export type SearchSettlementsResult = ReturnType<typeof searchSettlements>;

export { ISO_DATE };
