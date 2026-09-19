import { BRAND, CONTACT_EMAIL, OPERATOR_NAME } from '../config.js';
import { esc, page } from './layout.js';

const EFFECTIVE = '2026-09-19';

export function privacyPage(): string {
  const body = `
<h1>Privacy policy</h1>
<p class="muted">Effective ${EFFECTIVE}. Operated by ${esc(OPERATOR_NAME)}.</p>

<h2>Summary</h2>
<p>${esc(BRAND)} has no accounts and stores no personal data. Each request is processed in memory and discarded.</p>

<h2>What we receive</h2>
<ul class="tight">
  <li><strong>Tool inputs.</strong> Brand names, product names, card names, program names, a U.S. state, a birthday month and day, and dates. These describe things you have bought or joined. We do not ask for names, addresses, account numbers, emails or full birth dates, and we do not need them.</li>
  <li><strong>Request metadata.</strong> IP address, user agent and timestamps, used only for rate limiting and abuse prevention. Hosting-provider logs may retain this for up to 30 days.</li>
</ul>

<h2>What we do not do</h2>
<ul class="tight">
  <li>We do not store tool inputs or results after the response is sent.</li>
  <li>We do not sell or share data, run advertising, or use cookies or tracking on the API.</li>
  <li>We do not file claims, sign you up for programs, or contact companies on your behalf.</li>
</ul>

<h2>Third parties</h2>
<ul class="tight">
  <li>When you ask about recalls, we may query the U.S. Consumer Product Safety Commission public API with product keywords only.</li>
  <li>Settlement data is downloaded in bulk on a schedule from public directories; no request data is sent to them.</li>
  <li>The service is hosted on a cloud platform (currently Vercel) that processes request metadata under its own privacy terms.</li>
</ul>

<h2>Your AI assistant</h2>
<p>If you use ${esc(BRAND)} through an assistant such as Meta Muse, the assistant decides what to send. Its own privacy terms govern what it stores. ${esc(BRAND)} sees only the tool inputs it receives.</p>

<h2>Children</h2>
<p>The service is for adults. It is not directed at children and knowingly collects nothing from them.</p>

<h2>Changes and contact</h2>
<p>Changes are posted here with a new effective date. Questions: <a href="mailto:${esc(CONTACT_EMAIL)}">${esc(CONTACT_EMAIL)}</a>.</p>
`;
  return page({ title: 'Privacy', body, path: '/privacy' });
}

export function termsPage(): string {
  const body = `
<h1>Terms of service</h1>
<p class="muted">Effective ${EFFECTIVE}. Operated by ${esc(OPERATOR_NAME)}.</p>

<h2>What ${esc(BRAND)} is</h2>
<p>${esc(BRAND)} is a free, read-only information service that surfaces public information about U.S. class action settlements, product recalls, credit card benefits, loyalty program rules and birthday rewards. It is provided for U.S. residents and their AI assistants.</p>

<h2>What it is not</h2>
<ul class="tight">
  <li>Not a law firm, settlement administrator, claims filer, card issuer, retailer or financial adviser.</li>
  <li>Not legal, tax or financial advice. Eligibility, deadlines, payouts and benefits are determined by the official sources linked in each result and can change without notice.</li>
  <li>Not affiliated with any company, court, administrator or program mentioned in results, nor with Meta or Muse.</li>
</ul>

<h2>Acceptable use</h2>
<ul class="tight">
  <li>Use the service for lawful, personal or household purposes, or to build assistants that do so.</li>
  <li>Do not overload the service, resell raw data, or misrepresent results as originating from an official source.</li>
  <li>Do not use the service to file claims you are not eligible for. Settlement claims are made under penalty of perjury.</li>
</ul>

<h2>Accuracy and availability</h2>
<p>The service is provided "as is" without warranties of any kind. We work to keep data current but do not guarantee completeness, accuracy or uptime. Always verify on the official page before acting.</p>

<h2>Liability</h2>
<p>To the fullest extent permitted by law, ${esc(OPERATOR_NAME)} is not liable for any loss arising from use of the service or reliance on its results, including missed deadlines or rejected claims.</p>

<h2>Data sources and attribution</h2>
<p>Settlement listings come from independent public directories including OpenClassActions.com and ClassAction.org, which are not settlement administrators or law firms. Recall data is U.S. government public information from the Consumer Product Safety Commission. Trademarks belong to their owners and are used only to identify programs and products.</p>

<h2>Changes and contact</h2>
<p>We may update these terms; the effective date above will change. Contact: <a href="mailto:${esc(CONTACT_EMAIL)}">${esc(CONTACT_EMAIL)}</a>.</p>
`;
  return page({ title: 'Terms', body, path: '/terms' });
}
