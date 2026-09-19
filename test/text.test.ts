import { describe, expect, it } from 'vitest';
import { jaccard, SearchIndex, tokenize } from '../src/lib/text.js';

describe('tokenize', () => {
  it('lowercases, strips punctuation and drops stopwords', () => {
    expect(tokenize("Apple Siri Privacy Class Action Settlement")).toEqual(['apple', 'siri', 'privacy']);
    expect(tokenize('AT&T data breach')).toEqual(['at&t', 'data', 'breach']);
    expect(tokenize('Peloton Tread+')).toEqual(['peloton', 'tread']);
  });
  it('keeps model-number style tokens', () => {
    expect(tokenize('Model X1 recall')).toContain('x1');
  });
  it('joins hyphenated brands and stems plurals', () => {
    expect(tokenize('T-Mobile')).toEqual(['tmobile']);
    expect(tokenize('Fisher-Price Snuga Infant Swings')).toEqual(['fisherprice', 'snuga', 'infant', 'swing']);
    expect(tokenize('Air Fryers and Batteries')).toEqual(['air', 'fryer', 'battery']);
    expect(tokenize('Glass dishes')).toEqual(['glass', 'dish']);
  });
});

describe('SearchIndex partial-match rules', () => {
  const docs = [
    { id: 'boa', title: 'EY & Bank of America MOVEit Data Breach Settlement' },
    { id: 'dfa', title: 'Dairy Farmers of America Data Breach Settlement' },
    { id: 'huuuge', title: 'Huuuge Casino Mobile Games Settlement' },
    { id: 'tmo', title: 'T-Mobile Data Breach Settlement' },
    { id: 'amzn', title: 'Amazon Returns Class Action Settlement' }
  ];
  const index = new SearchIndex(docs, (d) => [{ text: d.title, weight: 3 }]);

  it('does not match a multi-word brand on its trailing word alone', () => {
    const ids = index.search(['Bank of America']).map((h) => h.doc.id);
    expect(ids).toEqual(['boa']);
  });
  it('keeps hyphenated brands whole', () => {
    expect(index.search(['T-Mobile']).map((h) => h.doc.id)).toEqual(['tmo']);
  });
  it('allows a leading-brand partial match but marks and down-weights it', () => {
    const hits = index.search(['Amazon Prime']);
    expect(hits.map((h) => h.doc.id)).toEqual(['amzn']);
    expect(hits[0].quality).toBe('partial');
    expect(hits[0].full).toEqual([]);
    const exact = index.search(['Amazon Returns'])[0];
    expect(exact.quality).toBe('full');
    expect(exact.score).toBeGreaterThan(hits[0].score * 3);
  });
  it('can disable partial matches entirely', () => {
    expect(index.search(['Amazon Prime'], { allowPartial: false })).toEqual([]);
  });
});

describe('SearchIndex', () => {
  const docs = [
    { id: 1, title: 'Apple Siri Privacy Settlement', body: 'Apple devices with Siri enabled between 2014 and 2024' },
    { id: 2, title: 'Equifax Data Breach Settlement', body: 'Consumers affected by the 2017 breach' },
    { id: 3, title: 'Bank of America Overdraft Fee Settlement', body: 'Retry NSF fees charged to checking customers' },
    { id: 4, title: 'Ticketmaster Live Nation Antitrust Settlement', body: 'Ticket buyers overcharged fees' }
  ];
  const index = new SearchIndex(docs, (d) => [
    { text: d.title, weight: 3 },
    { text: d.body, weight: 1 }
  ]);

  it('ranks the brand match first and reports which query matched', () => {
    const hits = index.search(['Apple', 'Ticketmaster']);
    expect(hits.map((h) => h.doc.id).slice(0, 2).sort()).toEqual([1, 4]);
    const apple = hits.find((h) => h.doc.id === 1)!;
    expect(apple.matched).toEqual(['Apple']);
    expect(apple.terms).toContain('apple');
  });

  it('gives a phrase bonus for verbatim multi-word matches', () => {
    const [top] = index.search(['Bank of America']);
    expect(top.doc.id).toBe(3);
    const single = index.search(['America'])[0];
    expect(top.score).toBeGreaterThan(single.score);
  });

  it('returns nothing for unrelated queries or stopword-only queries', () => {
    expect(index.search(['Peloton'])).toEqual([]);
    expect(index.search(['the settlement'])).toEqual([]);
  });
});

describe('jaccard', () => {
  it('measures token overlap', () => {
    expect(jaccard(['a', 'b'], ['a', 'b'])).toBe(1);
    expect(jaccard(['a', 'b'], ['b', 'c'])).toBeCloseTo(1 / 3);
    expect(jaccard([], ['a'])).toBe(0);
  });
});
