import { BRAND, CONTACT_EMAIL, REPO_URL } from '../config.js';
import { esc, page } from './layout.js';

export function supportPage(): string {
  const body = `
<h1>Support</h1>
<p class="lead">Questions, corrections and connector problems.</p>
<div class="card">
<h3>Email</h3>
<p><a href="mailto:${esc(CONTACT_EMAIL)}">${esc(CONTACT_EMAIL)}</a>. We aim to reply within two business days.</p>
<h3>Report a wrong or outdated entry</h3>
<p>Card credits, points rules and birthday rewards are hand-maintained. If an entry is wrong, email the card or brand name, what changed and a link to the issuer or brand page. Settlement and recall records come from their sources; if one looks wrong, include the result's <code>info_url</code> or <code>url</code>.</p>
<h3>Source code and issues</h3>
<p>${esc(BRAND)} is open source: <a href="${esc(REPO_URL)}">${esc(REPO_URL)}</a>. Bug reports and pull requests are welcome there.</p>
<h3>Status</h3>
<p><a href="/health">/health</a> shows the service version and how fresh each dataset is.</p>
</div>
`;
  return page({ title: 'Support', body, path: '/support' });
}
