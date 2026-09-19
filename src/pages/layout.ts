import { BRAND, CONTACT_EMAIL, TAGLINE } from '../config.js';

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

const CSS = `
:root{--bg:#f7f6f2;--fg:#17201d;--muted:#5a6661;--card:#ffffff;--line:#e3e1da;--accent:#1b8a6b;--accent-2:#f5c24b;--code:#eef2f0}
@media (prefers-color-scheme:dark){:root{--bg:#0f1513;--fg:#e8ebe9;--muted:#9aa5a0;--card:#161e1b;--line:#26302c;--accent:#3cc59c;--accent-2:#f5c24b;--code:#1c2622}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
a{color:var(--accent)}
.wrap{max-width:820px;margin:0 auto;padding:24px 20px 64px}
header.site{display:flex;align-items:center;gap:14px;padding:8px 0 24px}
header.site img{width:44px;height:44px;border-radius:12px}
header.site .name{font-weight:700;font-size:20px;text-decoration:none;color:var(--fg)}
header.site nav{margin-left:auto;display:flex;gap:16px;flex-wrap:wrap}
header.site nav a{text-decoration:none;color:var(--muted);font-size:15px}
h1{font-size:34px;line-height:1.15;margin:8px 0 8px;letter-spacing:-.01em}
h2{font-size:22px;margin:36px 0 10px}
h3{font-size:17px;margin:22px 0 6px}
p.lead{font-size:19px;color:var(--muted);margin:0 0 20px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px 20px;margin:14px 0}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px}
code,pre{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:14px}
code{background:var(--code);padding:2px 6px;border-radius:6px}
pre{background:var(--code);padding:14px 16px;border-radius:12px;overflow-x:auto;line-height:1.5}
pre code{background:none;padding:0}
table{width:100%;border-collapse:collapse;font-size:15px}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}
th{color:var(--muted);font-weight:600}
.muted{color:var(--muted)}
.pill{display:inline-block;font-size:12px;font-weight:600;padding:2px 8px;border-radius:999px;background:var(--code);color:var(--muted);margin-left:6px;vertical-align:middle}
footer{margin-top:48px;padding-top:18px;border-top:1px solid var(--line);color:var(--muted);font-size:14px}
footer a{color:var(--muted)}
.btn{display:inline-block;background:var(--accent);color:#fff;text-decoration:none;padding:10px 16px;border-radius:10px;font-weight:600}
ul.tight li{margin:4px 0}
`;

export function page(opts: { title: string; description?: string; body: string; path: string }): string {
  const title = opts.title === BRAND ? `${BRAND}: ${TAGLINE}` : `${opts.title} · ${BRAND}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(opts.description ?? TAGLINE)}">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<style>${CSS}</style>
</head>
<body>
<div class="wrap">
<header class="site">
  <img src="/icon.svg" alt="">
  <a class="name" href="/">${esc(BRAND)}</a>
  <nav>
    <a href="/docs">Docs</a>
    <a href="/openapi.json">OpenAPI</a>
    <a href="/privacy">Privacy</a>
    <a href="/terms">Terms</a>
    <a href="/support">Support</a>
  </nav>
</header>
${opts.body}
<footer>
  <div>${esc(BRAND)} is an independent information service. It is not a law firm, settlement administrator, card issuer or retailer, and nothing here is legal, tax or financial advice.</div>
  <div style="margin-top:8px"><a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> · <a href="/support">Support</a> · <a href="mailto:${esc(CONTACT_EMAIL)}">${esc(CONTACT_EMAIL)}</a></div>
</footer>
</div>
</body>
</html>`;
}
