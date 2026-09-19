import { z } from 'zod';
import { DISCLAIMER, SOURCE_NOTES } from '../config.js';
import { fetchCpscRecalls } from '../lib/cpsc.js';
import { loadRecalls } from '../lib/data.js';
import { addDays, ISO_DATE, parseISODate, toISO, today } from '../lib/dates.js';
import { SearchIndex } from '../lib/text.js';
import type { Recall, RecallsFile } from '../types.js';

export const matchRecallsShape = {
  products: z
    .array(z.string().min(2).max(120))
    .min(1)
    .max(50)
    .describe(
      'Products the person owns, as brand plus product, e.g. ["Peloton Tread+", "Fisher-Price Rock n Play", "Cosori air fryer", "Ninja Foodi pressure cooker"]. Pull these from order emails and receipts.'
    ),
  since: z.string().regex(ISO_DATE).optional().describe('Only recalls announced on or after this date (YYYY-MM-DD). Default: the whole three-year window.'),
  live: z.boolean().optional().describe('Also query the CPSC API for recalls newer than the bundled snapshot (default true).'),
  limit: z.number().int().min(1).max(50).optional().describe('Max results (default 20).')
};

export const MatchRecallsSchema = z.object(matchRecallsShape);
export type MatchRecallsInput = z.infer<typeof MatchRecallsSchema>;

export interface RecallResult {
  recall_number: string;
  date: string;
  title: string;
  url: string;
  products: string[];
  remedy_options: string[];
  remedy: string;
  has_refund: boolean;
  hazard: string;
  sold_at: string;
  manufacturers: string[];
  contact: string;
  matched_products: string[];
  matched_terms: string[];
  match_score: number;
  match_quality: 'full' | 'partial' | null;
}

const TOPUP_TTL_MS = 6 * 60 * 60 * 1000;
let topup: { fetchedAt: number; recalls: Recall[]; error: string | null } | null = null;
let indexCache: { source: Recall[]; index: SearchIndex<Recall> } | null = null;

function recallIndex(recalls: Recall[]): SearchIndex<Recall> {
  if (indexCache && indexCache.source === recalls) return indexCache.index;
  const index = new SearchIndex(recalls, (r) => [
    { text: r.title, weight: 3 },
    { text: r.products.join(' '), weight: 3 },
    { text: [...r.manufacturers, ...r.importers].join(' '), weight: 2 },
    { text: r.description, weight: 1 }
  ]);
  indexCache = { source: recalls, index };
  return index;
}

/** Bundled snapshot plus (optionally) anything CPSC published since the snapshot was built. */
export async function recallsWithTopup(file: RecallsFile, live: boolean): Promise<{ recalls: Recall[]; live: boolean; live_error: string | null }> {
  if (!live) return { recalls: file.recalls, live: false, live_error: null };
  const now = Date.now();
  if (!topup || now - topup.fetchedAt > TOPUP_TTL_MS) {
    const snapshotDate = parseISODate(file.generated_at.slice(0, 10)) ?? today();
    const start = toISO(addDays(snapshotDate, -1));
    try {
      const fresh = await fetchCpscRecalls({ start, timeoutMs: 8000 });
      topup = { fetchedAt: now, recalls: fresh, error: null };
    } catch (err) {
      topup = { fetchedAt: now, recalls: [], error: err instanceof Error ? err.message : String(err) };
    }
  }
  if (topup.recalls.length === 0) return { recalls: file.recalls, live: topup.error === null, live_error: topup.error };
  const known = new Set(file.recalls.map((r) => r.number));
  const merged = [...topup.recalls.filter((r) => !known.has(r.number)), ...file.recalls];
  return { recalls: merged, live: true, live_error: null };
}

export function toRecallResult(r: Recall, match: { score: number; matched: string[]; terms: string[]; quality?: 'full' | 'partial' }): RecallResult {
  return {
    recall_number: r.number,
    date: r.date,
    title: r.title,
    url: r.url,
    products: r.products,
    remedy_options: r.remedy_options,
    remedy: r.remedy,
    has_refund: r.remedy_options.some((o) => /refund/i.test(o)) || /refund/i.test(r.remedy),
    hazard: r.hazard,
    sold_at: r.retailers || r.sold_at || '',
    manufacturers: [...r.manufacturers, ...r.importers],
    contact: r.contact,
    matched_products: match.matched,
    matched_terms: match.terms,
    match_score: match.score,
    match_quality: match.matched.length > 0 ? (match.quality ?? 'full') : null
  };
}

export async function matchRecalls(input: MatchRecallsInput, file: RecallsFile = loadRecalls(), asOf: Date = today()) {
  const limit = input.limit ?? 20;
  const { recalls, live, live_error } = await recallsWithTopup(file, input.live ?? true);
  const since = input.since ?? null;
  const pool = since ? recalls.filter((r) => r.date >= since) : recalls;
  const hits = recallIndex(pool).search(input.products, { minScore: 1.2 });
  const results = hits.slice(0, limit).map((h) => toRecallResult(h.doc, h));
  return {
    as_of: toISO(asOf),
    snapshot_generated_at: file.generated_at,
    snapshot_range_start: file.range_start,
    recalls_searched: pool.length,
    live_topup: live,
    live_error,
    matched: hits.length,
    returned: results.length,
    inputs: { products: input.products, since },
    unmatched_products: input.products.filter((p) => !hits.some((h) => h.matched.includes(p))),
    results,
    sources: [SOURCE_NOTES.cpsc],
    disclaimer: DISCLAIMER
  };
}

export type MatchRecallsResult = Awaited<ReturnType<typeof matchRecalls>>;
