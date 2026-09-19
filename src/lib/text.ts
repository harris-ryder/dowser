// Tokenising and a tiny TF-IDF style index used for matching brands and products
// against settlement and recall records. No external dependencies on purpose.

const STOPWORDS = new Set<string>([
  'a', 'an', 'the', 'and', 'or', 'of', 'for', 'to', 'in', 'on', 'at', 'by', 'with', 'from', 'vs', 'v',
  'inc', 'llc', 'ltd', 'corp', 'co', 'company', 'companies', 'group', 'holding',
  'class', 'action', 'settlement', 'lawsuit', 'litigation', 'claim', 'open',
  'up', 'per', 'your', 'you', 'my', 'me', 'is', 'are', 'was', 'were', 'be', 'it', 'its', 'this', 'that',
  'new', 'recall', 'recalled', 'due', 'risk', 'hazard', 'sold', 'exclusively',
  'product', 'us', 'u', 's', 'usa', 'serious', 'injury', 'death', 'violate',
  'fund', 'cash', 'payment', 'automatic', 'form', 'no', 'not', 'only', 'other', 'all', 'any',
  'over', 'about', 'after', 'before', 'through', 'between', 'who', 'what', 'which', 'as', 'if', 'than'
]);

export function normalize(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’‘`]/g, "'")
    .toLowerCase();
}

/** Very light stemming: plural nouns only. "fryers" → "fryer", "batteries" → "battery". */
export function stem(t: string): string {
  if (t.length <= 3 || /\d/.test(t)) return t;
  if (t.endsWith('ies')) return t.slice(0, -3) + 'y';
  if (t.endsWith('sses') || t.endsWith('ss')) return t;
  if (t.endsWith('ches') || t.endsWith('shes') || t.endsWith('xes')) return t.slice(0, -2);
  if (t.endsWith('s') && !t.endsWith('us') && !t.endsWith('is')) return t.slice(0, -1);
  return t;
}

export function tokenize(s: string, opts: { keepStop?: boolean } = {}): string[] {
  const out: string[] = [];
  // Join hyphenated compounds so "T-Mobile" and "Fisher-Price" stay single brand tokens.
  const joined = normalize(s).replace(/(?<=[a-z0-9])-(?=[a-z0-9])/g, '');
  for (const raw of joined.split(/[^a-z0-9+&]+/)) {
    const t = raw.replace(/^[+&]+|[+&]+$/g, '');
    if (!t) continue;
    if (t.length < 2 && !/\d/.test(t)) continue;
    const st = stem(t);
    if (!opts.keepStop && (STOPWORDS.has(t) || STOPWORDS.has(st))) continue;
    out.push(st);
  }
  return out;
}

export function uniq<T>(xs: Iterable<T>): T[] {
  return Array.from(new Set(xs));
}

export function jaccard(a: Iterable<string>, b: Iterable<string>): number {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter++;
  return inter / (sa.size + sb.size - inter);
}

export interface Field {
  text: string;
  weight: number;
}

export type MatchQuality = 'full' | 'partial';

export interface Hit<T> {
  doc: T;
  score: number;
  matched: string[]; // query strings that matched (full or partial)
  full: string[]; // query strings where every token (or the exact phrase) was found
  terms: string[]; // individual tokens that matched
  quality: MatchQuality;
}

/**
 * Small inverted index. Each document contributes weighted fields. A query is a list of
 * strings (brands, product names); each is tokenised, scored with idf weighting and a
 * phrase bonus when the whole string appears verbatim in the document text.
 *
 * Multi-token queries only count as a match when every token is present (or the phrase
 * appears), or when the leading token, which is almost always the brand, is present. A
 * leading-token-only match is a "partial" and is scored down sharply, so "Bank of America"
 * finds Bank of America and not "Dairy Farmers of America".
 */
export class SearchIndex<T> {
  private readonly docs: T[];
  private readonly docTokens: Map<string, number>[] = [];
  private readonly docText: string[] = [];
  private readonly df = new Map<string, number>();

  constructor(docs: T[], fields: (d: T) => Field[]) {
    this.docs = docs;
    for (const d of docs) {
      const weights = new Map<string, number>();
      const parts: string[] = [];
      for (const f of fields(d)) {
        if (!f.text) continue;
        parts.push(normalize(f.text));
        for (const t of tokenize(f.text)) {
          weights.set(t, Math.max(weights.get(t) ?? 0, f.weight));
        }
      }
      this.docTokens.push(weights);
      this.docText.push(parts.join(' \n '));
      for (const t of weights.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
    }
  }

  get size(): number {
    return this.docs.length;
  }

  idf(token: string): number {
    const n = this.docs.length;
    const df = this.df.get(token) ?? 0;
    return Math.log(1 + n / (1 + df));
  }

  search(queries: string[], opts: { minScore?: number; limit?: number; allowPartial?: boolean } = {}): Hit<T>[] {
    const minScore = opts.minScore ?? 0;
    const allowPartial = opts.allowPartial ?? true;
    const prepared = queries
      .map((q) => ({ raw: q, norm: normalize(q).trim().replace(/\s+/g, ' '), tokens: uniq(tokenize(q)) }))
      .filter((q) => q.tokens.length > 0);
    if (prepared.length === 0) return [];

    const hits: Hit<T>[] = [];
    for (let i = 0; i < this.docs.length; i++) {
      const weights = this.docTokens[i];
      let score = 0;
      const matched: string[] = [];
      const full: string[] = [];
      const terms = new Set<string>();
      for (const q of prepared) {
        let qScore = 0;
        let qMatched = 0;
        let idfSum = 0;
        let leadMatched = false;
        const qTerms: string[] = [];
        for (let k = 0; k < q.tokens.length; k++) {
          const t = q.tokens[k];
          const w = weights.get(t);
          const idf = this.idf(t);
          idfSum += idf;
          if (w !== undefined) {
            qScore += idf * w;
            qMatched++;
            qTerms.push(t);
            if (k === 0) leadMatched = true;
          }
        }
        if (qMatched === 0) continue;
        const phrase = q.tokens.length >= 2 && this.docText[i].includes(q.norm);
        const complete = qMatched === q.tokens.length || phrase;
        if (!complete) {
          if (!allowPartial || !leadMatched) continue;
          const coverage = qMatched / q.tokens.length;
          qScore *= coverage * coverage;
        } else if (phrase) {
          qScore += (idfSum / q.tokens.length) * 1.5;
        }
        score += qScore;
        matched.push(q.raw);
        if (complete) full.push(q.raw);
        for (const t of qTerms) terms.add(t);
      }
      if (score > minScore && matched.length > 0) {
        hits.push({ doc: this.docs[i], score: round(score), matched, full, terms: Array.from(terms), quality: full.length > 0 ? 'full' : 'partial' });
      }
    }
    hits.sort((a, b) => b.score - a.score);
    return opts.limit ? hits.slice(0, opts.limit) : hits;
  }
}

export function round(n: number, places = 2): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

export function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + '…';
}

export function cleanWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}
