import { z } from 'zod';
import { API_KEYS, BASE_URL, BRAND, MCP_URL, RATE_LIMIT_PER_MINUTE } from '../config.js';
import { TOOL_DEFS } from '../tools/index.js';
import { esc, page } from './layout.js';

interface Prop {
  type?: string | string[];
  description?: string;
  items?: { type?: string };
  enum?: unknown[];
}

function paramsTable(shape: Record<string, z.ZodType>): string {
  const json = z.toJSONSchema(z.object(shape)) as { properties?: Record<string, Prop>; required?: string[] };
  const required = new Set(json.required ?? []);
  const rows = Object.entries(json.properties ?? {}).map(([k, v]) => {
    let type = Array.isArray(v.type) ? v.type.join(' | ') : (v.type ?? 'any');
    if (type === 'array') type = `array of ${v.items?.type ?? 'string'}`;
    if (v.enum) type = v.enum.map((e) => `"${String(e)}"`).join(' | ');
    return `<tr><td><code>${esc(k)}</code>${required.has(k) ? '<span class="pill">required</span>' : ''}</td><td class="muted">${esc(type)}</td><td>${esc(v.description ?? '')}</td></tr>`;
  });
  return `<table><thead><tr><th>Parameter</th><th>Type</th><th>Meaning</th></tr></thead><tbody>${rows.join('')}</tbody></table>`;
}

export function docsPage(): string {
  const auth = API_KEYS.length > 0 ? 'This deployment requires an API key: send <code>Authorization: Bearer &lt;key&gt;</code>.' : 'No authentication is required. Requests are rate-limited per client.';
  const body = `
<h1>Docs</h1>
<p class="lead">One MCP server, six read-only tools, plus a REST mirror. Everything returns JSON with an official link per item.</p>

<h2>Connecting</h2>
<div class="card">
<h3>MCP (recommended)</h3>
<p>Endpoint: <code>${esc(MCP_URL)}</code><br>Transport: Streamable HTTP, stateless, JSON responses. Send <code>Accept: application/json, text/event-stream</code> as the MCP SDKs do.<br>${auth}</p>
<h3>Meta Muse</h3>
<p>Muse can add ${esc(BRAND)} as a custom connector in one message:</p>
<pre><code>Build a custom integration to ${esc(BRAND)}. Its MCP server URL is ${esc(MCP_URL)} (streamable HTTP, no authentication). I want you to be able to find class action settlements, product recalls, unused credit card credits, expiring points and birthday freebies I qualify for, from any future conversation. Connect to it, test every tool end to end, show me the results, and save the integration as a reusable skill.</code></pre>
<h3>Claude, Cursor, other MCP clients</h3>
<pre><code>{ "mcpServers": { "dowser": { "url": "${esc(MCP_URL)}" } } }</code></pre>
<h3>REST</h3>
<p>Each tool is also a <code>GET</code> endpoint under <code>${esc(BASE_URL)}/api/v1/</code>. Arrays are comma-separated. Machine-readable description: <a href="/openapi.json">/openapi.json</a>.</p>
<pre><code>curl "${esc(BASE_URL)}/api/v1/settlements?brands=Apple,Ticketmaster&amp;state=CA&amp;limit=5"
curl "${esc(BASE_URL)}/api/v1/recalls?products=Peloton%20Tread,Cosori%20air%20fryer"
curl "${esc(BASE_URL)}/api/v1/cards?cards=Amex%20Platinum,Sapphire%20Reserve"
curl "${esc(BASE_URL)}/api/v1/freebies?state=TX&amp;birthday=03-14"</code></pre>
</div>

<h2>Tools</h2>
${TOOL_DEFS.map(
    (t) => `
<div class="card">
<h3><code>${esc(t.name)}</code> <span class="muted">· GET ${esc(t.restPath)}</span></h3>
<p>${esc(t.description)}</p>
${paramsTable(t.shape)}
<p class="muted" style="margin-top:10px">Example prompts:</p>
<ul class="tight">${t.examplePrompts.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
</div>`
  ).join('\n')}

<h2>Data sources and freshness</h2>
<div class="card">
<ul class="tight">
  <li><strong>Settlements</strong>: OpenClassActions.com and ClassAction.org open-settlement directories, merged and de-duplicated, refreshed daily. Both are independent directories, not settlement administrators or law firms. Expired deadlines are filtered at query time.</li>
  <li><strong>Recalls</strong>: the U.S. Consumer Product Safety Commission public recalls API. A three-year snapshot is bundled and refreshed daily; each request also tops up from the live API for anything newer.</li>
  <li><strong>Card benefits, points expiry, birthday rewards</strong>: hand-maintained catalogues with a <code>last_reviewed</code> date, a <code>confidence</code> rating and a verification URL on every entry. Corrections are welcome through the support page.</li>
</ul>
</div>

<h2>Limits and behaviour</h2>
<div class="card">
<ul class="tight">
  <li>U.S. only. Settlements, recalls and rewards are U.S. programs.</li>
  <li>Rate limit: ${RATE_LIMIT_PER_MINUTE} requests per minute per client. Responses include <code>Retry-After</code> when exceeded.</li>
  <li>All tools are annotated <code>readOnlyHint: true</code>. Nothing is written, purchased, filed or sent.</li>
  <li>Results carry a <code>disclaimer</code> and a <code>sources</code> list. Assistants should show the official link and ask before acting.</li>
</ul>
</div>
`;
  return page({ title: 'Docs', body, path: '/docs', description: `${BRAND} MCP tools and REST API documentation.` });
}
