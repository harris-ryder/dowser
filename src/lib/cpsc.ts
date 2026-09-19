import { USER_AGENT } from '../config.js';
import type { Recall } from '../types.js';
import { cleanWhitespace, truncate } from './text.js';

export const CPSC_ENDPOINT = 'https://www.saferproducts.gov/RestWebServices/Recall';

interface Named {
  Name?: string;
}

interface RawRecall {
  RecallID: number;
  RecallNumber: string;
  RecallDate: string;
  Description?: string;
  URL: string;
  Title: string;
  ConsumerContact?: string;
  Products?: { Name?: string; NumberOfUnits?: string }[];
  Hazards?: Named[];
  Remedies?: Named[];
  RemedyOptions?: { Option?: string }[];
  Manufacturers?: Named[];
  Importers?: Named[];
  Retailers?: Named[];
  SoldAtLabel?: string | null;
}

/** CPSC's feed occasionally ships URLs with a missing slash or literal spaces. */
export function fixUrl(u: string | undefined): string {
  let s = (u ?? '').trim().replace(/^(https?:)\/(?!\/)/i, '$1//');
  s = s.replace(/ /g, '%20');
  return s;
}

export function slimRecall(raw: RawRecall): Recall {
  const names = (xs?: Named[]) => (xs ?? []).map((x) => cleanWhitespace(x.Name ?? '')).filter(Boolean);
  return {
    id: raw.RecallID,
    number: raw.RecallNumber,
    date: (raw.RecallDate ?? '').slice(0, 10),
    title: cleanWhitespace(raw.Title ?? ''),
    url: fixUrl(raw.URL),
    description: truncate(cleanWhitespace(raw.Description ?? ''), 700),
    products: (raw.Products ?? []).map((p) => cleanWhitespace(p.Name ?? '')).filter(Boolean),
    remedy_options: (raw.RemedyOptions ?? []).map((o) => o.Option ?? '').filter(Boolean),
    remedy: truncate(cleanWhitespace(raw.Remedies?.[0]?.Name ?? ''), 700),
    hazard: truncate(names(raw.Hazards).join(' '), 400),
    manufacturers: names(raw.Manufacturers),
    importers: names(raw.Importers),
    retailers: truncate(names(raw.Retailers).join('; '), 400),
    sold_at: raw.SoldAtLabel ? cleanWhitespace(raw.SoldAtLabel) : null,
    units: raw.Products?.[0]?.NumberOfUnits ? cleanWhitespace(raw.Products[0].NumberOfUnits) : null,
    contact: truncate(cleanWhitespace(raw.ConsumerContact ?? ''), 400)
  };
}

export interface CpscQuery {
  start: string; // YYYY-MM-DD
  end?: string;
  productName?: string;
  timeoutMs?: number;
}

export async function fetchCpscRecalls(q: CpscQuery): Promise<Recall[]> {
  const url = new URL(CPSC_ENDPOINT);
  url.searchParams.set('format', 'json');
  url.searchParams.set('RecallDateStart', q.start);
  if (q.end) url.searchParams.set('RecallDateEnd', q.end);
  if (q.productName) url.searchParams.set('ProductName', q.productName);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), q.timeoutMs ?? 20_000);
  try {
    const res = await fetch(url, { headers: { 'user-agent': USER_AGENT, accept: 'application/json' }, signal: controller.signal });
    if (!res.ok) throw new Error(`CPSC API ${res.status}`);
    const data = (await res.json()) as RawRecall[];
    if (!Array.isArray(data)) throw new Error('CPSC API returned a non-array payload');
    return data.map(slimRecall).filter((r) => r.title && r.date);
  } finally {
    clearTimeout(timer);
  }
}
