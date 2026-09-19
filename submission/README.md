# Submitting Dowser to the Muse Connector Platform

Everything Meta's form asks for, and the order to do it in.

## Before you open the form

1. Deploy (see the root README). Confirm `https://<your-host>/health` returns `"ok": true`.
2. Set the environment variables on the deployment so the pages show real contact details:
   `DOWSER_CONTACT_EMAIL`, `DOWSER_OPERATOR`, `DOWSER_REPO_URL`, and `DOWSER_BASE_URL` if you use a custom domain.
3. Add Dowser to your own Muse account first as a custom connector, using the prompt on the site's home page. Confirm Muse lists all six tools and that `search_settlements` returns results. Meta runs an end-to-end test during review; this makes sure it passes on the first try.
4. Replace every ALL-CAPS placeholder in `muse-form.json`.

## The form (muse.ai/platform → Submit a connector; requires a Muse login, U.S., 18+)

### Step 1: Overview

| Field | Value |
|---|---|
| Connector name | `Dowser` |
| Company or developer | `companyName` from `muse-form.json` |
| Product website | your deployment URL |
| Example prompts | `useCases`, one per line |
| Connector icon | `public/icon.png` (512×512 PNG, well under the 256 KiB limit) |
| Payments | Does not accept payments |
| Your name / Work email | you |
| Support email or URL | `https://<host>/support` |
| Privacy policy | `https://<host>/privacy` |
| Terms of service | `https://<host>/terms` |
| Anything else? | `extraNotes` |

### Step 2: Technical specs

| Field | Value |
|---|---|
| Connection type | Existing MCP |
| Hosted MCP endpoint | `https://<host>/mcp` |
| API or MCP documentation | `https://<host>/docs` |
| Access requirements | `limits` |
| Authentication methods | Other: `authOther` |

### Step 3: Review

Read the Muse Connector Terms (only visible when signed in), tick the three attestations, submit. Meta says it will be in touch after functional, security and legal review; there is no published SLA.

## If Meta asks for keyed access

Set `DOWSER_API_KEYS=<random-key>` on the deployment, redeploy, and send them the key. Every `/mcp` and `/api/v1/*` request then requires `Authorization: Bearer <key>`. Pages stay public.
