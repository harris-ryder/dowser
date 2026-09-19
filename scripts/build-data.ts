// Builds data/settlements.json and data/recalls.json.
//
//   npm run build:data                 # everything
//   npm run build:data -- --skip-recalls
//   npm run build:data -- --skip-settlements
//
// Settlements come from two independent public directories and are merged; recalls come
// from the CPSC public API (three-year window). Run daily via .github/workflows/refresh-data.yml.

import * as cheerio from 'cheerio';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { USER_AGENT } from '../src/config.js';
import { fetchCpscRecalls } from '../src/lib/cpsc.js';
import { addYears, parseLongDate, parseUSShortDate, toISO, today } from '../src/lib/dates.js';
import { cleanWhitespace, jaccard, tokenize, truncate, uniq } from '../src/lib/text.js';
import type { DeadlineType, ProofLevel, Recall, RecallsFile, Settlement, SettlementsFile } from '../src/types.js';

const OCA_LLMS = 'https://openclassactions.com/llms.txt';
const OCA_DIR = 'https://openclassactions.com/settlements.php';
const CA_DIR = 'https://www.classaction.org/settlements';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const args = new Set(process.argv.slice(2));

const US_STATES = new Set(
  'AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC PR'.split(' ')
);

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'user-agent': USER_AGENT, accept: 'text/html,text/plain;q=0.9,*/*;q=0.8' },
    signal: AbortSignal.timeout(45_000)
  });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return await res.text();
}

function slugFromUrl(url: string): string {
  const m = url.replace(/\/+$/, '').match(/\/([^/]+?)(?:\.php)?$/);
  return (m?.[1] ?? url).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function proofFromText(text: string): ProofLevel {
  const t = text.toLowerCase();
  if (/automatic/.test(t)) return 'automatic';
  if (/no proof/.test(t)) return 'none';
  if (/id\/code|claim id|notice id|unique id|pin\b|code from notice|from notice/.test(t)) return 'id_required';
  if (/documentation|proof of purchase|receipt|records required|proof required|proof \/ id/.test(t)) return 'documentation';
  return 'unknown';
}

const PROOF_LABEL: Record<ProofLevel, string> = {
  none: 'No proof required',
  id_required: 'Claim ID or notice code required',
  documentation: 'Documentation or proof of purchase required',
  automatic: 'Automatic payment, no claim form',
  unknown: 'Proof requirement not verified'
};

const RESIDENT_WORDS = /\b(residents?|searchers?|patients?|users?|customers?|employees?|drivers?|members?|workers?|consumers?|purchasers?|buyers?|tenants?|students?|only)\b/i;

function statesFromText(segment: string): string[] {
  if (!RESIDENT_WORDS.test(segment)) return [];
  return Array.from(segment.matchAll(/\b([A-Z]{2})\b/g))
    .map((m) => m[1])
    .filter((s) => US_STATES.has(s));
}

const PAYOUT_HINT = /\b(per|flat|up to|each|cash|voucher|credit|payment|award|estimated|approximately|about|refund|share|between|from \$)\b/i;

function payoutFrom(title: string, details: string): string | null {
  // Split on sentence ends and separators, but never inside a decimal like $0.30.
  const clauses = details.split(/(?<=[.!?])\s+(?=[A-Z$])|\s·\s|;\s*/).map(cleanWhitespace).filter(Boolean);
  const withMoney = clauses.filter((c) => /\$\d/.test(c));
  const best = withMoney.find((c) => PAYOUT_HINT.test(c)) ?? withMoney[0];
  if (best) return truncate(best, 160);
  const individual = title.match(/(?:up to|flat|from)\s\$\d[\d,.]*(?:\s?(?:k|m|b))?(?:\s(?:a|per)\s[a-z]+)?(?:\s(?:cash|voucher|payment|credit|each|for [^—–-]+))?/i);
  if (individual) return cleanWhitespace(individual[0]);
  const fund = title.match(/\$\d[\d,.]*\s?(?:k|m|b|million|billion)\b/i);
  return fund ? `${cleanWhitespace(fund[0])} settlement fund (individual payout not stated)` : null;
}

/** Directory pages that are not open settlements: investigations, complaint-stage lawsuits, mass torts. */
function isSettlementPage(url: string): boolean {
  return !/\/(investigations|lawsuits|mass-torts|class-action-investigations)\//i.test(url);
}

interface Partial {
  url: string;
  title: string;
  summary: string;
  category: string | null;
  states: string[];
  deadline: string | null;
  deadline_type: DeadlineType;
  proof: ProofLevel;
  payout: string | null;
  claim_url: string | null;
  added: string | null;
  source: Settlement['source'];
  extra_keywords: string[];
}

// ---------- OpenClassActions ----------

function parseOcaLlms(text: string): Map<string, Partial> {
  const out = new Map<string, Partial>();
  let inSection = false;
  for (const line of text.split('\n')) {
    if (line.startsWith('## ')) {
      inSection = /open settlements/i.test(line);
      continue;
    }
    if (!inSection) continue;
    const m = line.match(/^- \[(.+?)\]\((https?:\/\/[^)\s]+)\):\s*(.*)$/);
    if (!m) continue;
    const [, rawTitle, url, rest] = m;
    const segs = rest.split('·').map((s) => s.trim()).filter(Boolean);
    const deadlineSeg = segs.find((s) => /^deadline:/i.test(s)) ?? '';
    const dText = deadlineSeg.replace(/^deadline:\s*/i, '');
    const deadline = parseLongDate(dText);
    let deadlineType: DeadlineType = deadline ? 'claim' : 'unknown';
    if (/opt[- ]?out/i.test(dText)) deadlineType = 'opt_out';
    if (/no claim form|automatic/i.test(dText)) deadlineType = 'automatic';
    const others = segs.filter((s) => s !== deadlineSeg);
    const proofSeg = others.find((s) => /proof|documentation|id\/code|notice|automatic|required/i.test(s)) ?? '';
    let proof = proofFromText(`${proofSeg} ${dText}`);
    if (deadlineType === 'opt_out' && proof === 'unknown') proof = 'automatic';
    const states = uniq(others.flatMap(statesFromText));
    const title = cleanWhitespace(rawTitle);
    out.set(url, {
      url,
      title,
      summary: '',
      category: null,
      states,
      deadline,
      deadline_type: deadlineType,
      proof,
      payout: null,
      claim_url: null,
      added: null,
      source: 'openclassactions',
      extra_keywords: []
    });
  }
  return out;
}

function parseOcaDirectory(html: string, seen: Set<string>): Map<string, Partial> {
  const $ = cheerio.load(html);
  const out = new Map<string, Partial>();
  $('a.dir-row').each((_, el) => {
    const $el = $(el);
    const url = $el.attr('href');
    if (!url) return;
    const proofAttr = ($el.attr('data-proof') ?? '').toLowerCase();
    const badge = cleanWhitespace($el.find('.dir-proof').text());
    seen.add(`${proofAttr}|${badge}`);
    let proof: ProofLevel = 'unknown';
    if (proofAttr === 'none' || /no proof/i.test(badge)) proof = 'none';
    else if (/auto/.test(proofAttr) || /automatic/i.test(badge)) proof = 'automatic';
    else if (proofAttr === 'required') proof = /\bid\b/i.test(badge) ? 'id_required' : 'documentation';
    const region = $el.attr('data-region') ?? '';
    const states = Array.from(region.matchAll(/US-([A-Z]{2})/g))
      .map((m) => m[1])
      .filter((s) => US_STATES.has(s));
    const title = cleanWhitespace($el.find('.dir-name').text());
    const summary = cleanWhitespace($el.find('.dir-details').text());
    const deadline = ($el.attr('data-deadline') ?? '').match(/^\d{4}-\d{2}-\d{2}$/) ? ($el.attr('data-deadline') as string) : null;
    out.set(url, {
      url,
      title,
      summary,
      category: cleanWhitespace($el.attr('data-category') ?? '') || null,
      states,
      deadline,
      deadline_type: deadline ? 'claim' : 'unknown',
      proof,
      payout: payoutFrom(title, summary),
      claim_url: null,
      added: ($el.attr('data-added') ?? '').match(/^\d{4}-\d{2}-\d{2}$/) ? ($el.attr('data-added') as string) : null,
      source: 'openclassactions',
      extra_keywords: []
    });
  });
  return out;
}

async function scrapeOpenClassActions(): Promise<Partial[]> {
  const [llmsText, dirHtml] = await Promise.all([fetchText(OCA_LLMS), fetchText(OCA_DIR)]);
  const llms = parseOcaLlms(llmsText);
  const seenProof = new Set<string>();
  const dir = parseOcaDirectory(dirHtml, seenProof);
  console.log(`  OCA llms.txt entries: ${llms.size}; directory rows: ${dir.size}`);
  console.log(`  OCA proof attr|badge values: ${Array.from(seenProof).join(', ')}`);

  const merged = new Map<string, Partial>();
  for (const [url, d] of dir) merged.set(url, d);
  for (const [url, l] of llms) {
    const d = merged.get(url);
    if (!d) {
      merged.set(url, l);
      continue;
    }
    // Directory has richer summary/category/added; llms has the better deadline semantics and proof wording.
    d.deadline = l.deadline ?? d.deadline;
    d.deadline_type = l.deadline_type !== 'unknown' ? l.deadline_type : d.deadline_type;
    if (l.proof !== 'unknown') d.proof = l.proof;
    if (d.states.length === 0) d.states = l.states;
    if (!d.title) d.title = l.title;
  }
  for (const p of merged.values()) {
    if (p.deadline_type === 'automatic' || p.proof === 'automatic') {
      p.proof = 'automatic';
      if (!p.deadline) p.deadline_type = 'automatic';
    }
    if (!p.payout) p.payout = payoutFrom(p.title, p.summary);
  }
  const all = Array.from(merged.values());
  const kept = all.filter((p) => isSettlementPage(p.url));
  if (kept.length !== all.length) console.log(`  dropped ${all.length - kept.length} OCA investigation/lawsuit pages`);
  return kept;
}

// ---------- ClassAction.org ----------

async function scrapeClassActionOrg(): Promise<Partial[]> {
  const html = await fetchText(CA_DIR);
  const $ = cheerio.load(html);
  const out: Partial[] = [];
  $('.settlement-card').each((_, el) => {
    const $el = $(el);
    const link = $el.find('a.js-settlement-link').first();
    const claimUrl = link.attr('href') ?? null;
    const slug = link.attr('data-slug') ?? $el.attr('id') ?? '';
    const shortName = cleanWhitespace(link.attr('data-name') ?? '');
    const title = cleanWhitespace(link.text());
    if (!title) return;
    const summary = cleanWhitespace($el.find('p').first().text());
    let payout: string | null = null;
    let deadline: string | null = null;
    let proofText = '';
    $el.find('div').each((__, d) => {
      const spans = $(d).children('span');
      if (spans.length !== 2) return;
      const label = cleanWhitespace($(spans[0]).text()).toLowerCase();
      const value = cleanWhitespace($(spans[1]).text());
      if (label.includes('payout')) payout = value;
      else if (label.includes('deadline')) deadline = parseUSShortDate(value);
      else if (label.includes('proof')) proofText = value;
    });
    const proof: ProofLevel = /^no/i.test(proofText) ? 'none' : /^yes/i.test(proofText) ? 'documentation' : 'unknown';
    const category = shortName.includes(' - ') ? shortName.split(' - ').slice(1).join(' - ').trim() : null;
    out.push({
      url: `https://www.classaction.org/settlements#${slug}`,
      title,
      summary,
      category,
      states: [],
      deadline,
      deadline_type: deadline ? 'claim' : 'unknown',
      proof,
      payout: payout && !/varies/i.test(payout) ? payout : payout,
      claim_url: claimUrl,
      added: null,
      source: 'classaction.org',
      extra_keywords: tokenize(shortName.split(' - ')[0] ?? '')
    });
  });
  console.log(`  ClassAction.org cards: ${out.length}`);
  return out;
}

// ---------- Merge ----------

function titleTokens(p: Partial): string[] {
  return uniq([...tokenize(p.title), ...p.extra_keywords]);
}

function mergeSources(oca: Partial[], ca: Partial[]): { merged: Partial[]; alsoListed: Map<string, string[]> } {
  const alsoListed = new Map<string, string[]>();
  const ocaTokens = oca.map(titleTokens);
  const leftovers: Partial[] = [];
  for (const c of ca) {
    const ct = titleTokens(c);
    const brand = new Set(c.extra_keywords);
    let bestIdx = -1;
    let bestSim = 0;
    for (let i = 0; i < oca.length; i++) {
      const o = oca[i];
      const sim = jaccard(ct, ocaTokens[i]);
      const sameDeadline = c.deadline && o.deadline && c.deadline === o.deadline;
      const sharesBrand = ocaTokens[i].some((t) => brand.has(t));
      const score = sim + (sameDeadline && sharesBrand ? 0.5 : 0);
      if (score > bestSim) {
        bestSim = score;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0 && bestSim >= 0.45) {
      const o = oca[bestIdx];
      o.claim_url = o.claim_url ?? c.claim_url;
      o.payout = o.payout ?? c.payout;
      o.extra_keywords = uniq([...o.extra_keywords, ...c.extra_keywords]);
      if (!o.category && c.category) o.category = c.category;
      alsoListed.set(o.url, [...(alsoListed.get(o.url) ?? []), c.url]);
    } else {
      leftovers.push(c);
    }
  }
  console.log(`  merged ${ca.length - leftovers.length} ClassAction.org cards into OCA records; ${leftovers.length} kept as separate records`);
  return { merged: [...oca, ...leftovers], alsoListed };
}

function loadPrevious(): Map<string, Settlement> {
  const file = path.join(DATA_DIR, 'settlements.json');
  if (!existsSync(file)) return new Map();
  try {
    const prev = JSON.parse(readFileSync(file, 'utf8')) as SettlementsFile;
    return new Map(prev.settlements.map((s) => [s.id, s]));
  } catch {
    return new Map();
  }
}

async function buildSettlements(): Promise<SettlementsFile> {
  console.log('Settlements:');
  const results = await Promise.allSettled([scrapeOpenClassActions(), scrapeClassActionOrg()]);
  const oca = results[0].status === 'fulfilled' ? results[0].value : [];
  const ca = results[1].status === 'fulfilled' ? results[1].value : [];
  if (results[0].status === 'rejected') console.warn('  OpenClassActions failed:', results[0].reason);
  if (results[1].status === 'rejected') console.warn('  ClassAction.org failed:', results[1].reason);
  if (oca.length === 0 && ca.length === 0) throw new Error('No settlement source succeeded; keeping previous data file.');

  const { merged, alsoListed } = mergeSources(oca, ca);
  const previous = loadPrevious();
  const todayISO = toISO(today());
  const settlements: Settlement[] = merged.map((p) => {
    const id = `${p.source === 'openclassactions' ? 'oca' : 'ca'}-${slugFromUrl(p.url)}`;
    const prev = previous.get(id);
    return {
      id,
      title: p.title,
      summary: p.summary,
      category: p.category,
      states: p.states,
      deadline: p.deadline,
      deadline_type: p.deadline_type,
      proof: p.proof,
      proof_label: PROOF_LABEL[p.proof],
      payout: p.payout,
      claim_url: p.claim_url,
      info_url: p.url,
      source: p.source,
      also_listed_at: alsoListed.get(p.url) ?? [],
      added: p.added ?? prev?.added ?? null,
      first_seen: prev?.first_seen ?? p.added ?? todayISO,
      keywords: titleTokens(p)
    };
  });
  settlements.sort((a, b) => (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999') || a.title.localeCompare(b.title));

  const byProof = settlements.reduce<Record<string, number>>((acc, s) => ((acc[s.proof] = (acc[s.proof] ?? 0) + 1), acc), {});
  console.log(`  total ${settlements.length}; by proof: ${JSON.stringify(byProof)}; new today: ${settlements.filter((s) => s.first_seen === todayISO && !previous.size).length || settlements.filter((s) => !previous.has(s.id)).length}`);
  return { generated_at: new Date().toISOString(), sources: [OCA_DIR, OCA_LLMS, CA_DIR], count: settlements.length, settlements };
}

// ---------- Recalls ----------

async function buildRecalls(): Promise<RecallsFile> {
  console.log('Recalls:');
  const start = toISO(addYears(today(), -3));
  let recalls: Recall[];
  try {
    recalls = await fetchCpscRecalls({ start, timeoutMs: 120_000 });
  } catch (err) {
    console.warn('  single window failed, chunking by year:', err instanceof Error ? err.message : err);
    recalls = [];
    for (let y = 0; y < 3; y++) {
      const s = toISO(addYears(today(), -(y + 1)));
      const e = toISO(addYears(today(), -y));
      recalls.push(...(await fetchCpscRecalls({ start: s, end: e, timeoutMs: 120_000 })));
    }
  }
  const byNumber = new Map<string, Recall>();
  for (const r of recalls) byNumber.set(r.number, r);
  const list = Array.from(byNumber.values()).sort((a, b) => b.date.localeCompare(a.date));
  console.log(`  ${list.length} recalls since ${start}`);
  return { generated_at: new Date().toISOString(), range_start: start, count: list.length, recalls: list };
}

// ---------- Main ----------

async function main() {
  mkdirSync(DATA_DIR, { recursive: true });
  let failed = false;
  if (!args.has('--skip-settlements')) {
    try {
      const s = await buildSettlements();
      writeFileSync(path.join(DATA_DIR, 'settlements.json'), JSON.stringify(s, null, 1));
      console.log(`  wrote data/settlements.json (${s.count})`);
    } catch (err) {
      failed = true;
      console.error('Settlements build failed:', err);
    }
  }
  if (!args.has('--skip-recalls')) {
    try {
      const r = await buildRecalls();
      writeFileSync(path.join(DATA_DIR, 'recalls.json'), JSON.stringify(r, null, 0));
      console.log(`  wrote data/recalls.json (${r.count})`);
    } catch (err) {
      failed = true;
      console.error('Recalls build failed:', err);
    }
  }
  if (failed) process.exit(1);
}

await main();
