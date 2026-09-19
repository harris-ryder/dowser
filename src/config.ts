export const BRAND = 'Dowser';
export const TAGLINE = 'Finds the money hiding in your life.';
export const VERSION = '0.1.0';
export const MCP_PATH = '/mcp';

function computeBaseUrl(): string {
  if (process.env.DOWSER_BASE_URL) return process.env.DOWSER_BASE_URL.replace(/\/$/, '');
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

export const BASE_URL = computeBaseUrl();
export const MCP_URL = `${BASE_URL}${MCP_PATH}`;

// Fill these in via environment variables before submitting to Muse.
export const CONTACT_EMAIL = process.env.DOWSER_CONTACT_EMAIL ?? 'hello@dowser.example';
export const OPERATOR_NAME = process.env.DOWSER_OPERATOR ?? 'Dowser';
export const REPO_URL = process.env.DOWSER_REPO_URL ?? 'https://github.com/YOUR-GITHUB-USER/dowser';

// Optional bearer-key gate. Leave empty to run as a public, rate-limited, read-only service.
export const API_KEYS: string[] = (process.env.DOWSER_API_KEYS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export const RATE_LIMIT_PER_MINUTE = Number(process.env.DOWSER_RATE_LIMIT ?? 60);
export const USER_AGENT = `${BRAND}/${VERSION} (+${BASE_URL})`;

export const DISCLAIMER =
  `${BRAND} is an independent information service, not a law firm, settlement administrator, ` +
  `card issuer or retailer. Figures come from public sources and change often. Confirm details on ` +
  `the official page linked in each result before acting. Nothing here is legal, tax or financial advice.`;

export const SOURCE_NOTES = {
  openclassactions:
    'OpenClassActions.com is an independent directory of U.S. class action settlements. It is not a settlement administrator or law firm.',
  classactionorg: 'ClassAction.org is an independent legal news site with a directory of open settlements.',
  cpsc: 'Recall data comes from the U.S. Consumer Product Safety Commission public recalls API (saferproducts.gov).',
  curated:
    'Card benefits, points-expiry rules and birthday rewards are a hand-maintained catalogue with a last-reviewed date and an issuer or brand link on every entry.'
} as const;
