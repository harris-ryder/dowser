# Dowser

**Finds the money hiding in your life.** A read-only MCP connector for AI assistants such as Meta Muse: open class action settlements, CPSC product recalls with refunds, unused credit card credits, expiring loyalty points and birthday freebies, each with an official link.

Built for the [Muse Connector Platform](https://muse.ai/platform). Works with any MCP client, and every tool doubles as a REST endpoint.

## Tools

| Tool | What it answers | REST |
|---|---|---|
| `search_settlements` | Which open U.S. class action settlements match the brands I use? Deadline, payout, proof needed, claim link. | `GET /api/v1/settlements` |
| `match_recalls` | Has anything I own been recalled in the last three years, and what is the remedy? | `GET /api/v1/recalls` |
| `card_benefits` | Which statement credits and perks on my cards reset soon and how do I use them? | `GET /api/v1/cards` |
| `points_expiry` | When do my miles and points expire, and what keeps them alive? | `GET /api/v1/points` |
| `birthday_freebies` | What do chains near me give away on birthdays, and by when must I join? | `GET /api/v1/freebies` |
| `check_for_new` | What is new since my last check? One call for a weekly sweep. | `GET /api/v1/updates` |

Plus one MCP prompt, `find_my_money`, that walks an assistant through a full sweep.

## How it works

```
data/settlements.json  ← scripts/build-data.ts  ← OpenClassActions.com + ClassAction.org (daily, GitHub Action)
data/recalls.json      ← scripts/build-data.ts  ← CPSC recalls API, 3-year window (daily) + live top-up per request
data/cards.json, programs.json, freebies.json     hand-maintained catalogues with last_reviewed + confidence per entry

src/app.ts     Express: POST /mcp (stateless streamable HTTP, official SDK), /api/v1/*, pages, /openapi.json
src/mcp.ts     registers the six tools (all readOnlyHint) and the prompt
src/tools/*    pure functions; the MCP and REST layers are thin wrappers
api/index.js   Vercel entry (imports dist/app.js)
```

No database, no accounts, no stored personal data. Matching is a small TF-IDF index over titles, product names and summaries, so "Bank of America" scores higher than "America" and generic words do not match everything.

## Run it locally

```bash
npm install
npm run build:data      # ~30 s: scrapes settlements, pulls 3 years of CPSC recalls
npm run dev             # http://localhost:3000  (MCP at /mcp)

npm test                # unit tests (vitest)
npm run smoke           # boots the app, hits pages + REST + MCP with the official client
npm run typecheck
```

Try it:

```bash
curl "http://localhost:3000/api/v1/settlements?brands=Apple,Ticketmaster&limit=5"
curl "http://localhost:3000/api/v1/recalls?products=Peloton%20Tread,air%20fryer"
curl "http://localhost:3000/api/v1/cards?cards=Amex%20Platinum,Sapphire%20Reserve"
```

## Deploy to Vercel

The repo is preconfigured (`vercel.json`, `api/index.js`, build to `dist/`).

```bash
npm i -g vercel
vercel link            # create or pick a project
vercel env add DOWSER_CONTACT_EMAIL production
vercel env add DOWSER_OPERATOR production
vercel env add DOWSER_REPO_URL production
vercel --prod
```

Or push to GitHub and import the repo in the Vercel dashboard; the daily data workflow then commits refreshed JSON and Vercel redeploys automatically.

### Environment variables

| Variable | Purpose | Default |
|---|---|---|
| `DOWSER_BASE_URL` | Public URL used in docs, OpenAPI and the server card | Vercel production URL, else `http://localhost:3000` |
| `DOWSER_CONTACT_EMAIL` | Shown on privacy, terms and support pages | `hello@dowser.example` |
| `DOWSER_OPERATOR` | Legal operator name on privacy and terms | `Dowser` |
| `DOWSER_REPO_URL` | Link on the support page | placeholder GitHub URL |
| `DOWSER_API_KEYS` | Comma-separated bearer keys; when set, `/mcp` and `/api/v1/*` require one | unset (public) |
| `DOWSER_RATE_LIMIT` | Requests per minute per client | `60` |

## Connect from Muse

Paste into Muse:

> Build a custom integration to Dowser. Its MCP server URL is https://dowser-sooty.vercel.app/mcp (streamable HTTP, no authentication). I want you to be able to find class action settlements, product recalls, unused credit card credits, expiring points and birthday freebies I qualify for, from any future conversation. Connect to it, test every tool end to end, show me the results, and save the integration as a reusable skill.

For directory listing, see [`submission/README.md`](submission/README.md) and the paste-ready [`submission/muse-form.json`](submission/muse-form.json).

## Data sources and attribution

- **OpenClassActions.com** and **ClassAction.org**: independent directories of open U.S. settlements, not settlement administrators or law firms. OpenClassActions publishes an agent-readable `llms.txt` and permits crawling in `robots.txt`; ClassAction.org's `robots.txt` allows the settlements page. Review their terms before commercial use.
- **CPSC**: U.S. government public data via the SaferProducts.gov recalls REST API.
- **Catalogues**: hand-maintained in `data/`. Every entry has `last_reviewed`, `confidence` and a verification URL. Corrections welcome as pull requests.

## Maintaining the catalogues

Card benefits change every few months. Before submitting and then quarterly:

1. Open each `benefits_url` in `data/cards.json` and reconcile the perks list.
2. Bump `last_reviewed` on the file.
3. Run `npm test` (the tests assert a few stable facts such as Uber Cash resetting monthly).

## License

MIT.
