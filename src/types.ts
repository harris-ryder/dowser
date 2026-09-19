// Shared data shapes for the bundled JSON files and tool results.

export type ProofLevel = 'none' | 'id_required' | 'documentation' | 'automatic' | 'unknown';
export type DeadlineType = 'claim' | 'opt_out' | 'automatic' | 'none' | 'unknown';
export type SettlementSource = 'openclassactions' | 'classaction.org';

export interface Settlement {
  id: string;
  title: string;
  summary: string;
  category: string | null;
  states: string[]; // empty = nationwide / not limited
  deadline: string | null; // YYYY-MM-DD
  deadline_type: DeadlineType;
  proof: ProofLevel;
  proof_label: string;
  payout: string | null;
  claim_url: string | null; // official settlement site when known
  info_url: string; // directory page describing the settlement
  source: SettlementSource;
  also_listed_at: string[];
  added: string | null; // date the directory added it
  first_seen: string; // date Dowser first saw it
  keywords: string[];
}

export interface SettlementsFile {
  generated_at: string;
  sources: string[];
  count: number;
  settlements: Settlement[];
}

export interface Recall {
  id: number;
  number: string;
  date: string; // YYYY-MM-DD
  title: string;
  url: string;
  description: string;
  products: string[];
  remedy_options: string[];
  remedy: string;
  hazard: string;
  manufacturers: string[];
  importers: string[];
  retailers: string;
  sold_at: string | null;
  units: string | null;
  contact: string;
}

export interface RecallsFile {
  generated_at: string;
  range_start: string;
  count: number;
  recalls: Recall[];
}

export type Cadence =
  | 'monthly'
  | 'quarterly'
  | 'semiannual'
  | 'annual_calendar'
  | 'cardmember_year'
  | 'every_4_years'
  | 'once'
  | 'ongoing';

export type PerkType = 'credit' | 'membership' | 'access' | 'activation' | 'award' | 'other';

export interface Perk {
  name: string;
  type: PerkType;
  value_usd: number | null;
  cadence: Cadence;
  enrollment_required: boolean;
  how_to_use: string;
  notes?: string;
  ends?: string; // YYYY-MM-DD when a promotional perk is scheduled to end
}

export interface Card {
  id: string;
  issuer: string;
  name: string;
  aliases: string[];
  annual_fee_usd: number;
  benefits_url: string;
  confidence: 'high' | 'medium' | 'low';
  status?: string;
  perks: Perk[];
}

export interface CardsFile {
  last_reviewed: string;
  notes: string;
  cards: Card[];
}

export interface Program {
  id: string;
  name: string;
  operator: string;
  kind: 'airline' | 'hotel' | 'bank' | 'retail';
  aliases: string[];
  expiry: { type: 'never' | 'inactivity' | 'fixed'; months?: number; detail: string };
  keeps_alive: string[];
  url: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface ProgramsFile {
  last_reviewed: string;
  notes: string;
  programs: Program[];
}

export type FreebieWindow = 'birthday_day' | 'birthday_week' | 'birthday_month' | 'varies';

export interface Freebie {
  id: string;
  brand: string;
  category: string;
  reward: string;
  program: string;
  how: string;
  window: FreebieWindow;
  advance_days_required: number | null;
  regions: 'national' | string[];
  purchase_required: boolean;
  notes?: string;
  url: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface FreebiesFile {
  last_reviewed: string;
  notes: string;
  freebies: Freebie[];
}
