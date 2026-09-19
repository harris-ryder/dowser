import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express, { type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { API_KEYS, BASE_URL, BRAND, MCP_PATH, MCP_URL, TAGLINE, VERSION } from './config.js';
import { requireApiKey } from './lib/auth.js';
import { loadRecalls, loadSettlements, publicDir } from './lib/data.js';
import { rateLimit } from './lib/rateLimit.js';
import { createMcpServer } from './mcp.js';
import { buildOpenApi } from './openapi.js';
import { docsPage } from './pages/docs.js';
import { homePage } from './pages/home.js';
import { esc, page } from './pages/layout.js';
import { privacyPage, termsPage } from './pages/legal.js';
import { supportPage } from './pages/support.js';
import { BirthdayFreebiesSchema, birthdayFreebies } from './tools/freebies.js';
import { CardBenefitsSchema, cardBenefits } from './tools/cards.js';
import { CheckForNewSchema, checkForNew } from './tools/checkForNew.js';
import { TOOL_DEFS } from './tools/index.js';
import { MatchRecallsSchema, matchRecalls } from './tools/recalls.js';
import { PointsExpirySchema, pointsExpiry } from './tools/programs.js';
import { SearchSettlementsSchema, searchSettlements } from './tools/settlements.js';

export const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(express.json({ limit: '1mb' }));

// CORS: browser-based MCP inspectors and dashboards may call us directly.
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Api-Key, Mcp-Session-Id, Mcp-Protocol-Version, Accept');
  res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id, Retry-After');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

app.use(express.static(publicDir(), { maxAge: '1d', index: false }));

// ---------- MCP (stateless streamable HTTP) ----------

app.post(MCP_PATH, rateLimit, requireApiKey, async (req, res) => {
  const server = createMcpServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on('close', () => {
    void transport.close();
    void server.close();
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error('[mcp] request failed', err);
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
    }
  }
});

const statelessOnly = (_req: Request, res: Response) => {
  res.status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed. This server is stateless; send JSON-RPC over POST.' }, id: null });
};
app.get(MCP_PATH, statelessOnly);
app.delete(MCP_PATH, statelessOnly);

// ---------- REST mirror ----------

function list(v: unknown): string[] | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const arr = Array.isArray(v) ? v : String(v).split(',');
  return arr.map((s) => String(s).trim()).filter(Boolean);
}
function bool(v: unknown): boolean | undefined {
  if (v === undefined || v === '') return undefined;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
}
function int(v: unknown): number | undefined {
  if (v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
}
function str(v: unknown): string | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  return String(v);
}
function obj(v: unknown): Record<string, string> | undefined {
  if (v === undefined || v === '') return undefined;
  if (typeof v === 'object' && v !== null) return v as Record<string, string>;
  try {
    const parsed = JSON.parse(String(v));
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, string>) : undefined;
  } catch {
    return undefined;
  }
}

function validate<T>(schema: z.ZodType<T>, input: unknown, res: Response): T | null {
  const parsed = schema.safeParse(input);
  if (parsed.success) return parsed.data;
  res.status(400).json({ error: 'invalid_request', issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
  return null;
}

const api = express.Router();
api.use(rateLimit, requireApiKey);

api.get('/settlements', (req, res) => {
  const q = req.query;
  const input = validate(SearchSettlementsSchema, {
    brands: list(q.brands), query: str(q.query), category: str(q.category), state: str(q.state)?.toUpperCase(),
    no_proof_only: bool(q.no_proof_only), include_automatic: bool(q.include_automatic),
    deadline_within_days: int(q.deadline_within_days), sort: str(q.sort), limit: int(q.limit)
  }, res);
  if (input) res.json(searchSettlements(input));
});

api.get('/recalls', async (req, res, next) => {
  const q = req.query;
  const input = validate(MatchRecallsSchema, { products: list(q.products) ?? [], since: str(q.since), live: bool(q.live), limit: int(q.limit) }, res);
  if (!input) return;
  try {
    res.json(await matchRecalls(input));
  } catch (err) {
    next(err);
  }
});

api.get('/cards', (req, res) => {
  const q = req.query;
  const input = validate(CardBenefitsSchema, { cards: list(q.cards) ?? [], as_of: str(q.as_of), expiring_within_days: int(q.expiring_within_days) }, res);
  if (input) res.json(cardBenefits(input));
});

api.get('/points', (req, res) => {
  const q = req.query;
  const input = validate(PointsExpirySchema, { programs: list(q.programs) ?? [], last_activity: obj(q.last_activity), as_of: str(q.as_of) }, res);
  if (input) res.json(pointsExpiry(input));
});

api.get('/freebies', (req, res) => {
  const q = req.query;
  const input = validate(BirthdayFreebiesSchema, { state: str(q.state)?.toUpperCase(), birthday: str(q.birthday), categories: list(q.categories), as_of: str(q.as_of), limit: int(q.limit) }, res);
  if (input) res.json(birthdayFreebies(input));
});

api.get('/updates', async (req, res, next) => {
  const q = req.query;
  const input = validate(CheckForNewSchema, {
    since: str(q.since), brands: list(q.brands), products: list(q.products), cards: list(q.cards),
    state: str(q.state)?.toUpperCase(), horizon_days: int(q.horizon_days), limit: int(q.limit)
  }, res);
  if (!input) return;
  try {
    res.json(await checkForNew(input));
  } catch (err) {
    next(err);
  }
});

app.use('/api/v1', api);

// ---------- Pages and metadata ----------

function safeLoad<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch {
    return null;
  }
}

app.get('/', (_req, res) => {
  res.type('html').send(homePage({ settlements: safeLoad(loadSettlements), recalls: safeLoad(loadRecalls) }));
});
app.get('/docs', (_req, res) => res.type('html').send(docsPage()));
app.get('/privacy', (_req, res) => res.type('html').send(privacyPage()));
app.get('/terms', (_req, res) => res.type('html').send(termsPage()));
app.get('/support', (_req, res) => res.type('html').send(supportPage()));
app.get('/openapi.json', (_req, res) => res.json(buildOpenApi()));

app.get('/health', (_req, res) => {
  const s = safeLoad(loadSettlements);
  const r = safeLoad(loadRecalls);
  res.json({
    ok: Boolean(s && r),
    service: BRAND,
    version: VERSION,
    mcp: MCP_URL,
    auth: API_KEYS.length > 0 ? 'api_key' : 'none',
    data: {
      settlements: s ? { count: s.count, generated_at: s.generated_at } : null,
      recalls: r ? { count: r.count, generated_at: r.generated_at, range_start: r.range_start } : null
    }
  });
});

app.get('/.well-known/mcp/server-card.json', (_req, res) => {
  res.json({
    name: 'dowser',
    title: BRAND,
    description: TAGLINE,
    version: VERSION,
    website: BASE_URL,
    endpoint: MCP_URL,
    transport: 'streamable-http',
    authentication: API_KEYS.length > 0 ? ['bearer'] : ['none'],
    read_only: true,
    tools: TOOL_DEFS.map((t) => ({ name: t.name, title: t.title, description: t.description, rest: `${BASE_URL}${t.restPath}` })),
    documentation: `${BASE_URL}/docs`,
    openapi: `${BASE_URL}/openapi.json`,
    privacy: `${BASE_URL}/privacy`,
    terms: `${BASE_URL}/terms`,
    support: `${BASE_URL}/support`
  });
});

// ---------- Errors ----------

app.use((req, res) => {
  if (req.path.startsWith('/api/') || req.path === MCP_PATH) {
    res.status(404).json({ error: 'not_found', path: req.path });
    return;
  }
  res.status(404).type('html').send(page({ title: 'Not found', path: req.path, body: `<h1>Not found</h1><p class="muted">No page at <code>${esc(req.path)}</code>.</p>` }));
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[app] error', err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'internal_error', message: err instanceof Error ? err.message : 'Unexpected error' });
});

export default app;
