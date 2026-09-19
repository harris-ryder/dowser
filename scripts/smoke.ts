// End-to-end smoke test: boots the Express app on a random port, exercises pages, REST and
// the MCP endpoint with the official client, and exits non-zero on any failure.

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { AddressInfo } from 'node:net';
import app from '../src/app.js';
import { addDays, toISO, today } from '../src/lib/dates.js';
import { TOOL_DEFS } from '../src/tools/index.js';

let failures = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? `  ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`);
  if (!ok) failures++;
}

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((r) => server.once('listening', () => r()));
const { port } = server.address() as AddressInfo;
const base = `http://127.0.0.1:${port}`;
console.log(`smoke → ${base}\n`);

// Pages and metadata
for (const p of ['/', '/docs', '/privacy', '/terms', '/support', '/health', '/openapi.json', '/.well-known/mcp/server-card.json', '/icon.svg', '/icon.png']) {
  const r = await fetch(base + p);
  check(`GET ${p}`, r.ok, r.status);
}
const health = (await (await fetch(`${base}/health`)).json()) as { ok: boolean; data: unknown };
check('health.ok', health.ok, health.data);
const notFound = await fetch(`${base}/api/v1/nope`);
check('404 JSON for unknown api route', notFound.status === 404);

// REST
const rs = (await (await fetch(`${base}/api/v1/settlements?brands=Apple,Ticketmaster,Bank%20of%20America&limit=5`)).json()) as { total_open: number; results: { title: string; matched_inputs: string[]; deadline: string | null }[] };
check('REST settlements', Array.isArray(rs.results), { total_open: rs.total_open, top: rs.results.slice(0, 3).map((r) => `${r.title} ← ${r.matched_inputs.join('/')} (${r.deadline})`) });
const noProof = (await (await fetch(`${base}/api/v1/settlements?no_proof_only=true&limit=3`)).json()) as { results: { proof: string }[] };
check('REST settlements no_proof_only', noProof.results.every((r) => r.proof === 'none'), noProof.results.length);
const bad = await fetch(`${base}/api/v1/settlements?limit=999`);
check('REST validation 400', bad.status === 400);

const rr = (await (await fetch(`${base}/api/v1/recalls?products=stroller,air%20fryer,Peloton%20Tread&limit=5`)).json()) as { recalls_searched: number; live_topup: boolean; live_error: string | null; results: { title: string; matched_products: string[]; remedy_options: string[] }[] };
check('REST recalls', Array.isArray(rr.results) && rr.results.length > 0, { searched: rr.recalls_searched, live: rr.live_topup, live_error: rr.live_error, top: rr.results.slice(0, 3).map((r) => `${r.title.slice(0, 70)} ← ${r.matched_products.join('/')} [${r.remedy_options.join(',')}]`) });

const rc = (await (await fetch(`${base}/api/v1/cards?cards=Amex%20Platinum,Sapphire%20Reserve,Venture%20X,Mystery%20Card`)).json()) as { cards: { card: string; match_confidence: string; estimated_annual_credit_value_usd: number; perks: unknown[] }[]; unmatched: unknown[]; ending_soon: unknown[] };
check('REST cards', rc.cards.length === 3 && rc.unmatched.length === 1, rc.cards.map((c) => `${c.card} (${c.match_confidence}, ~$${c.estimated_annual_credit_value_usd}/yr, ${c.perks.length} perks)`));

const rp = (await (await fetch(`${base}/api/v1/points?programs=American%20Airlines,Marriott,Starbucks&last_activity=${encodeURIComponent(JSON.stringify({ 'American Airlines': '2024-11-01' }))}`)).json()) as { programs: { program: string; expires_on: string | null; days_left: number | null }[] };
check('REST points', rp.programs.length === 3 && rp.programs[0].expires_on === '2026-11-01', rp.programs.map((p) => `${p.program}: ${p.expires_on ?? 'n/a'} (${p.days_left ?? '-'}d)`));

const rf = (await (await fetch(`${base}/api/v1/freebies?state=TX&birthday=03-14&limit=5`)).json()) as { total: number; days_until_birthday: number; freebies: { brand: string; join_by: string | null }[] };
check('REST freebies', rf.total > 30 && rf.freebies.length === 5, { total: rf.total, days_until_birthday: rf.days_until_birthday, first: rf.freebies.map((f) => `${f.brand} join by ${f.join_by}`) });

const since = toISO(addDays(today(), -30));
const ru = (await (await fetch(`${base}/api/v1/updates?since=${since}&brands=Apple,Amazon&products=stroller&cards=Amex%20Gold`)).json()) as { summary: unknown };
check('REST updates', typeof ru.summary === 'object', ru.summary);

// MCP over streamable HTTP with the official client
const client = new Client({ name: 'dowser-smoke', version: '0.0.0' });
await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
const tools = await client.listTools();
const names = tools.tools.map((t) => t.name).sort();
check('MCP tools/list', TOOL_DEFS.every((d) => names.includes(d.name)), names);
check('MCP tools annotated read-only', tools.tools.every((t) => t.annotations?.readOnlyHint === true));
const prompts = await client.listPrompts();
check('MCP prompts/list', prompts.prompts.some((p) => p.name === 'find_my_money'));

const samples: Record<string, Record<string, unknown>> = {
  search_settlements: { brands: ['Apple', 'Equifax', 'Bank of America'], limit: 5 },
  match_recalls: { products: ['stroller', 'air fryer', 'Peloton Tread'], limit: 5, live: false },
  card_benefits: { cards: ['Amex Platinum', 'Chase Sapphire Reserve', 'Venture X'] },
  points_expiry: { programs: ['American Airlines', 'Marriott', 'Starbucks'], last_activity: { 'American Airlines': '2024-11-01' } },
  birthday_freebies: { state: 'TX', birthday: '03-14', limit: 5 },
  check_for_new: { since, brands: ['Apple'], products: ['stroller'], cards: ['Amex Gold'] }
};
for (const def of TOOL_DEFS) {
  const res = await client.callTool({ name: def.name, arguments: samples[def.name] });
  const text = (res.content as { type: string; text?: string }[]).find((c) => c.type === 'text')?.text ?? '';
  const structured = res.structuredContent as Record<string, unknown> | undefined;
  check(`MCP tools/call ${def.name}`, !res.isError && text.length > 20 && structured !== undefined, `${text.length} chars; keys: ${structured ? Object.keys(structured).slice(0, 6).join(',') : 'none'}`);
}
const badCall = await client.callTool({ name: 'check_for_new', arguments: { since: 'not-a-date' } });
check('MCP invalid args → error result', Boolean(badCall.isError) || String((badCall.content as { text?: string }[])[0]?.text ?? '').toLowerCase().includes('error'));

await client.close();
server.close();
console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
