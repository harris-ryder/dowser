import { BRAND, MCP_URL, TAGLINE } from '../config.js';
import { TOOL_DEFS } from '../tools/index.js';
import type { RecallsFile, SettlementsFile } from '../types.js';
import { esc, page } from './layout.js';

export function homePage(stats: { settlements: SettlementsFile | null; recalls: RecallsFile | null }): string {
  const s = stats.settlements;
  const r = stats.recalls;
  const body = `
<h1>${esc(TAGLINE)}</h1>
<p class="lead">${esc(BRAND)} is a read-only connector for AI assistants such as Meta Muse. It answers one question fast: where is money you are owed or leaving unused?</p>

<div class="grid">
  <div class="card"><strong>Class action settlements</strong><br><span class="muted">${s ? `${s.count} open, refreshed ${esc(s.generated_at.slice(0, 10))}` : 'Directory of open U.S. settlements'}</span></div>
  <div class="card"><strong>Product recalls</strong><br><span class="muted">${r ? `${r.count} CPSC recalls since ${esc(r.range_start)}, plus live top-up` : 'CPSC recalls with refund remedies'}</span></div>
  <div class="card"><strong>Card credits and perks</strong><br><span class="muted">Monthly, quarterly and annual credits with reset dates</span></div>
  <div class="card"><strong>Points expiry and birthday freebies</strong><br><span class="muted">Keep miles alive; sign up before the birthday</span></div>
</div>

<h2>Connect it to Muse</h2>
<div class="card">
<p>Paste this into Muse to add ${esc(BRAND)} as a custom connector. No account or API key is needed.</p>
<pre><code>Build a custom integration to ${esc(BRAND)}. Its MCP server URL is ${esc(MCP_URL)} (streamable HTTP, no authentication). I want you to be able to find class action settlements, product recalls, unused credit card credits, expiring points and birthday freebies I qualify for, from any future conversation. Connect to it, test every tool end to end, show me the results, and save the integration as a reusable skill.</code></pre>
<p class="muted">Works with any MCP client. Also available as plain REST: see the <a href="/openapi.json">OpenAPI document</a>.</p>
</div>

<h2>What you can ask</h2>
<ul class="tight">
${TOOL_DEFS.map((t) => `<li>${esc(t.examplePrompts[0])}</li>`).join('\n')}
</ul>

<h2>How it stays honest</h2>
<ul class="tight">
  <li>Every result links to the official settlement site, CPSC notice, issuer or brand page. Confirm there before acting.</li>
  <li>Tools are read-only. ${esc(BRAND)} never files claims, signs you up or spends money; your assistant asks you first.</li>
  <li>No accounts, no stored personal data. Requests are processed and discarded.</li>
  <li>Settlement data is refreshed daily from independent directories; recalls come from the CPSC public API; catalogues carry a last-reviewed date.</li>
</ul>
<p><a class="btn" href="/docs">Read the docs</a></p>
`;
  return page({ title: BRAND, body, path: '/' });
}
