import { describe, expect, it } from 'vitest';
import { utc } from '../src/lib/dates.js';
import { birthdayFreebies } from '../src/tools/freebies.js';
import { cardBenefits, resolveCard } from '../src/tools/cards.js';
import { checkForNew } from '../src/tools/checkForNew.js';
import { matchRecalls } from '../src/tools/recalls.js';
import { pointsExpiry } from '../src/tools/programs.js';
import { searchSettlements } from '../src/tools/settlements.js';
import { loadCards, loadFreebies, loadPrograms } from '../src/lib/data.js';
import type { Recall, RecallsFile, Settlement, SettlementsFile } from '../src/types.js';

const ASOF = utc(2026, 8, 19);

function settlement(over: Partial<Settlement> & { id: string; title: string }): Settlement {
  return {
    summary: '',
    category: null,
    states: [],
    deadline: '2026-12-31',
    deadline_type: 'claim',
    proof: 'none',
    proof_label: 'No proof required',
    payout: null,
    claim_url: null,
    info_url: `https://example.org/${over.id}`,
    source: 'openclassactions',
    also_listed_at: [],
    added: '2026-09-01',
    first_seen: '2026-09-01',
    keywords: over.title.toLowerCase().split(/\s+/),
    ...over
  };
}

const settlementsFile: SettlementsFile = {
  generated_at: '2026-09-19T00:00:00Z',
  sources: [],
  count: 5,
  settlements: [
    settlement({ id: 'apple', title: 'Apple Siri Privacy Settlement', summary: 'Owners of Siri-enabled Apple devices', proof: 'none', deadline: '2026-10-01', category: 'Privacy' }),
    settlement({ id: 'equifax', title: 'Equifax Data Breach Settlement', proof: 'id_required', deadline: '2026-11-15', category: 'Data Breach' }),
    settlement({ id: 'expired', title: 'Apple Butterfly Keyboard Settlement', deadline: '2026-01-01' }),
    settlement({ id: 'indiana', title: 'Columbus Regional Health Pixel Settlement', states: ['IN'], proof: 'id_required', deadline: '2026-09-30', added: '2026-09-16', first_seen: '2026-09-16' }),
    settlement({ id: 'auto', title: 'Country Bank Overdraft Fee Settlement', proof: 'automatic', deadline: null, deadline_type: 'automatic', payout: 'pro rata share of $495,000' })
  ]
};

describe('searchSettlements', () => {
  it('matches brands, drops expired settlements and reports unmatched inputs', () => {
    const r = searchSettlements({ brands: ['Apple', 'Peloton'] }, settlementsFile, ASOF);
    expect(r.results.map((x) => x.id)).toEqual(['apple']);
    expect(r.results[0].matched_inputs).toEqual(['Apple']);
    expect(r.results[0].days_left).toBe(12);
    expect(r.unmatched_inputs).toEqual(['Peloton']);
  });
  it('filters by state, proof and automatic payments', () => {
    expect(searchSettlements({ state: 'CA' }, settlementsFile, ASOF).results.map((x) => x.id)).not.toContain('indiana');
    expect(searchSettlements({ state: 'IN' }, settlementsFile, ASOF).results.map((x) => x.id)).toContain('indiana');
    expect(searchSettlements({ no_proof_only: true }, settlementsFile, ASOF).results.map((x) => x.id)).toEqual(['apple']);
    expect(searchSettlements({ include_automatic: false }, settlementsFile, ASOF).results.map((x) => x.id)).not.toContain('auto');
  });
  it('sorts by deadline with automatic (no deadline) last when no query is given', () => {
    const ids = searchSettlements({}, settlementsFile, ASOF).results.map((x) => x.id);
    expect(ids).toEqual(['indiana', 'apple', 'equifax', 'auto']);
  });
  it('respects deadline_within_days', () => {
    expect(searchSettlements({ deadline_within_days: 15 }, settlementsFile, ASOF).results.map((x) => x.id)).toEqual(['indiana', 'apple']);
  });
});

function recall(over: Partial<Recall> & { number: string; title: string }): Recall {
  return {
    id: Number(over.number),
    date: '2026-06-01',
    url: `https://www.cpsc.gov/Recalls/${over.number}`,
    description: '',
    products: [],
    remedy_options: ['Refund'],
    remedy: 'Contact the firm for a full refund.',
    hazard: '',
    manufacturers: [],
    importers: [],
    retailers: '',
    sold_at: null,
    units: null,
    contact: '',
    ...over
  };
}

const recallsFile: RecallsFile = {
  generated_at: '2026-09-19T00:00:00Z',
  range_start: '2023-09-19',
  count: 3,
  recalls: [
    recall({ number: '1', title: 'Peloton Recalls Tread+ Treadmills Due to Injury Hazard', products: ['Tread+ Treadmill'], manufacturers: ['Peloton Interactive'] }),
    recall({ number: '2', title: 'Cosori Recalls Air Fryers Due to Fire Hazard', products: ['Air Fryers'], date: '2026-08-15' }),
    recall({ number: '3', title: 'Joolz Recalls Stroller Car Seat Adapters', products: ['Aer2 Car Seat Adapters'], remedy_options: ['Repair'], remedy: 'Free repair kit' })
  ]
};

describe('matchRecalls', () => {
  it('matches products and flags refunds', async () => {
    const r = await matchRecalls({ products: ['Peloton Tread+', 'Cosori air fryer', 'Dyson vacuum'], live: false }, recallsFile, ASOF);
    expect(r.results.map((x) => x.recall_number).sort()).toEqual(['1', '2']);
    expect(r.results.find((x) => x.recall_number === '1')!.has_refund).toBe(true);
    expect(r.unmatched_products).toEqual(['Dyson vacuum']);
    expect(r.live_topup).toBe(false);
  });
  it('respects since', async () => {
    const r = await matchRecalls({ products: ['Peloton Tread+', 'Cosori air fryer'], since: '2026-08-01', live: false }, recallsFile, ASOF);
    expect(r.results.map((x) => x.recall_number)).toEqual(['2']);
  });
});

describe('cardBenefits (bundled catalogue)', () => {
  const cards = loadCards();
  it('resolves common spellings', () => {
    expect(resolveCard('amex plat', cards.cards)?.card.id).toBe('amex-platinum');
    expect(resolveCard('CSR', cards.cards)?.card.id).toBe('chase-sapphire-reserve');
    expect(resolveCard('Capital One Venture X card', cards.cards)?.card.id).toBe('capital-one-venture-x');
    expect(resolveCard('Some Regional Credit Union Visa', cards.cards)).toBeNull();
  });
  it('computes reset dates and flags month-end credits', () => {
    const r = cardBenefits({ cards: ['Amex Gold'], as_of: '2026-09-25', expiring_within_days: 10 }, cards, ASOF);
    expect(r.cards).toHaveLength(1);
    const uber = r.cards[0].perks.find((p) => p.name === 'Uber Cash')!;
    expect(uber.current_period_ends).toBe('2026-10-01');
    expect(uber.days_until_reset).toBe(6);
    expect(uber.ending_soon).toBe(true);
    expect(r.ending_soon.length).toBeGreaterThan(0);
    expect(r.cards[0].estimated_annual_credit_value_usd).toBeGreaterThan(300);
  });
  it('lists unmatched cards with suggestions', () => {
    const r = cardBenefits({ cards: ['Platinum something from Delta'] }, cards, ASOF);
    expect(r.cards.length + r.unmatched.length).toBe(1);
  });
});

describe('pointsExpiry (bundled catalogue)', () => {
  it('computes expiry from last activity', () => {
    const r = pointsExpiry({ programs: ['American Airlines', 'Delta'], last_activity: { 'AAdvantage': '2024-11-01' }, as_of: '2026-09-19' }, loadPrograms(), ASOF);
    const aa = r.programs.find((p) => p.program === 'AAdvantage')!;
    expect(aa.expires_on).toBe('2026-11-01');
    expect(aa.days_left).toBe(43);
    expect(aa.at_risk).toBe(true);
    const delta = r.programs.find((p) => p.program === 'SkyMiles')!;
    expect(delta.expiry_policy).toBe('never');
    expect(delta.at_risk).toBe(false);
  });
});

describe('birthdayFreebies (bundled catalogue)', () => {
  const file = loadFreebies();
  it('filters regional chains by state and computes join-by dates', () => {
    const tx = birthdayFreebies({ state: 'TX', birthday: '03-14', as_of: '2026-09-19' }, file, ASOF);
    const me = birthdayFreebies({ state: 'ME', birthday: '03-14', as_of: '2026-09-19' }, file, ASOF);
    expect(tx.total).toBeGreaterThan(me.total);
    expect(tx.birthday_next).toBe('2027-03-14');
    const starbucks = tx.freebies.find((f) => f.brand === 'Starbucks')!;
    expect(starbucks.join_by).toBe('2027-03-07');
    expect(tx.freebies.every((f) => f.regions === 'national' || f.regions.includes('TX'))).toBe(true);
  });
  it('filters by category', () => {
    const r = birthdayFreebies({ categories: ['beauty'] }, file, ASOF);
    expect(r.freebies.every((f) => f.category === 'beauty')).toBe(true);
    expect(r.freebies.length).toBeGreaterThan(3);
  });
});

describe('checkForNew', () => {
  it('reports new settlements since a date, matched to brands', async () => {
    const r = await checkForNew({ since: '2026-09-10', brands: ['Columbus Regional'], cards: ['Amex Gold'], horizon_days: 15 }, { settlements: settlementsFile, recalls: recallsFile, cards: loadCards() }, ASOF);
    expect(r.new_settlements.map((s) => s.id)).toEqual(['indiana']);
    expect(r.summary.new_settlements_total_since).toBe(1);
    expect(r.recalls.mode).toBe('all_new');
    expect(r.card_credits_ending_soon.length).toBeGreaterThan(0);
  });
});
