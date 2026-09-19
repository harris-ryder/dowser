import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { BASE_URL, BRAND, DISCLAIMER, TAGLINE, VERSION } from './config.js';
import {
  birthdayFreebies,
  cardBenefits,
  checkForNew,
  matchRecalls,
  pointsExpiry,
  searchSettlements,
  toolDef
} from './tools/index.js';
import { birthdayFreebiesShape } from './tools/freebies.js';
import { cardBenefitsShape } from './tools/cards.js';
import { checkForNewShape } from './tools/checkForNew.js';
import { matchRecallsShape } from './tools/recalls.js';
import { pointsExpiryShape } from './tools/programs.js';
import { searchSettlementsShape } from './tools/settlements.js';

const INSTRUCTIONS = `${BRAND}: ${TAGLINE}
Read-only tools that find money a U.S. consumer may be owed or is leaving unused: open class action settlements, CPSC product recalls with refunds, unused credit card credits, expiring loyalty points and birthday freebies.

How to use well:
- Build the inputs from what you already know about the person: brands from receipts and subscriptions, products from order emails, card names from statements. Then call the matching tool.
- Never file a claim, sign up for a program or spend money without showing the person the result and getting approval. These tools only return information and official links.
- Results include an official URL for each item; send the person there rather than restating terms from memory. Deadlines and amounts change.
- For recurring sweeps, call check_for_new with the date of the last check.

${DISCLAIMER}`;

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true } as const;

function ok(result: unknown): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    structuredContent: result as Record<string, unknown>
  };
}

function fail(err: unknown): CallToolResult {
  const message = err instanceof Error ? err.message : String(err);
  return { isError: true, content: [{ type: 'text', text: `Error: ${message}` }] };
}

export function createMcpServer(): McpServer {
  const server = new McpServer(
    { name: 'dowser', version: VERSION, title: BRAND, websiteUrl: BASE_URL },
    { instructions: INSTRUCTIONS }
  );

  const reg = <S extends Record<string, unknown>>(name: string, shape: S, run: (args: never) => Promise<unknown> | unknown) => {
    const def = toolDef(name);
    server.registerTool(
      name,
      { title: def.title, description: def.description, inputSchema: shape as never, annotations: READ_ONLY },
      (async (args: unknown) => {
        try {
          return ok(await run(args as never));
        } catch (err) {
          return fail(err);
        }
      }) as never
    );
  };

  reg('search_settlements', searchSettlementsShape, (a) => searchSettlements(a));
  reg('match_recalls', matchRecallsShape, (a) => matchRecalls(a));
  reg('card_benefits', cardBenefitsShape, (a) => cardBenefits(a));
  reg('points_expiry', pointsExpiryShape, (a) => pointsExpiry(a));
  reg('birthday_freebies', birthdayFreebiesShape, (a) => birthdayFreebies(a));
  reg('check_for_new', checkForNewShape, (a) => checkForNew(a));

  server.registerPrompt(
    'find_my_money',
    {
      title: 'Find my money',
      description: 'A full sweep: settlements, recalls, card credits, expiring points and birthday freebies, built from what the assistant already knows about the person.'
    },
    () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text:
              'Help me find money I am owed or leaving unused. Steps: ' +
              '1) From my email receipts, subscriptions and bank transactions, list the brands, companies and products I have used in the last five years and the credit cards I hold. Show me the list and let me correct it. ' +
              '2) Call search_settlements with those brands, match_recalls with the products, card_benefits with the cards, and points_expiry for any loyalty programs I mention. ' +
              '3) Report only items that apply to me, ordered by deadline, with the dollar value, what proof is needed and the official link. ' +
              '4) Ask before filing anything, and offer to set up a weekly check_for_new sweep.'
          }
        }
      ]
    })
  );

  return server;
}
