import { z } from 'zod';
import { birthdayFreebies, birthdayFreebiesShape } from './freebies.js';
import { cardBenefits, cardBenefitsShape } from './cards.js';
import { checkForNew, checkForNewShape } from './checkForNew.js';
import { matchRecalls, matchRecallsShape } from './recalls.js';
import { pointsExpiry, pointsExpiryShape } from './programs.js';
import { searchSettlements, searchSettlementsShape } from './settlements.js';

export { birthdayFreebies, cardBenefits, checkForNew, matchRecalls, pointsExpiry, searchSettlements };
export { birthdayFreebiesShape, cardBenefitsShape, checkForNewShape, matchRecallsShape, pointsExpiryShape, searchSettlementsShape };

export interface ToolDef {
  name: string;
  title: string;
  description: string;
  shape: Record<string, z.ZodType>;
  restPath: string;
  examplePrompts: string[];
}

export const TOOL_DEFS: ToolDef[] = [
  {
    name: 'search_settlements',
    title: 'Search open class action settlements',
    description:
      'Find open U.S. class action settlements the person may be able to claim, matched against brands, companies and products they have used. Returns eligibility summary, payout, claim deadline, days left, whether proof or a notice ID is needed, and the official claim link. Use it when someone asks about class actions, settlements, or "money I might be owed", and feed it the brands found in their receipts, subscriptions and bank transactions. Read-only.',
    shape: searchSettlementsShape,
    restPath: '/api/v1/settlements',
    examplePrompts: [
      'Search for class action settlements I might be eligible for based on the companies in my email receipts, and tell me which ones are worth filing.',
      'Which open settlements need no proof of purchase and close in the next 30 days?',
      'Is there a settlement involving my bank or my phone carrier?'
    ]
  },
  {
    name: 'match_recalls',
    title: 'Match products to CPSC recalls',
    description:
      'Check products the person owns against U.S. Consumer Product Safety Commission recalls from the last three years, with the remedy (refund, replacement or repair), where it was sold, and how to contact the company. Use it when someone lists things they bought, especially baby gear, appliances, furniture, fitness equipment and toys. Read-only; queries the live CPSC API for anything newer than the bundled snapshot.',
    shape: matchRecallsShape,
    restPath: '/api/v1/recalls',
    examplePrompts: [
      'Go through my Amazon and Target order emails from the last two years and check whether anything I bought has been recalled.',
      'Has my Peloton treadmill or my Cosori air fryer been recalled? What do I get?'
    ]
  },
  {
    name: 'card_benefits',
    title: 'Card credits and use-it-or-lose-it perks',
    description:
      'List the recurring statement credits, memberships and activation-required perks on the person\'s credit cards, with when each current period ends and how to use it. Pair it with their transactions to spot credits they have not used this month, quarter or year. Use it for "am I leaving card benefits on the table", "what credits reset soon", or before an annual fee posts. Read-only, hand-maintained catalogue of popular U.S. cards.',
    shape: cardBenefitsShape,
    restPath: '/api/v1/cards',
    examplePrompts: [
      'Check my credit cards for statement credits, perks or points expiring soon that I have not used, and tell me how to capture them.',
      'Which of my card credits reset at the end of this month?'
    ]
  },
  {
    name: 'points_expiry',
    title: 'Points and miles expiry rules',
    description:
      'Explain when miles and points expire for airline, hotel, bank and retail loyalty programs, and, given the date of last activity, compute the expiry date and days left plus the cheapest ways to keep them alive. Use it when someone mentions a frequent flyer or hotel program, or asks whether their points are about to expire. Read-only.',
    shape: pointsExpiryShape,
    restPath: '/api/v1/points',
    examplePrompts: [
      'Are any of my airline miles or hotel points about to expire? My last American flight was in 2024.',
      'How do I keep my Marriott points from expiring without a stay?'
    ]
  },
  {
    name: 'birthday_freebies',
    title: 'Birthday freebies near me',
    description:
      'List U.S. chains that give loyalty members something free or discounted for their birthday, with the reward, the program to join, how it is delivered, whether a purchase is needed and the latest date to sign up. Filter by state and category. Use it for "free stuff on my birthday" and to set sign-up reminders a few weeks ahead. Read-only.',
    shape: birthdayFreebiesShape,
    restPath: '/api/v1/freebies',
    examplePrompts: [
      'Find all the places near me where I can get something free on my birthday, and sign me up for the ones I approve.',
      'My birthday is March 14. What do I need to join before then, and by when?'
    ]
  },
  {
    name: 'check_for_new',
    title: 'What is new since last check',
    description:
      'One call for a recurring sweep: new settlements matching the person\'s brands, new recalls matching their products, and card credits whose period ends soon. Pass the date of the last check as "since". Ideal for a weekly or monthly background task that reports only when something actionable appears. Read-only.',
    shape: checkForNewShape,
    restPath: '/api/v1/updates',
    examplePrompts: [
      'Every Monday, check whether any new settlements or recalls apply to me and remind me about card credits that reset this month. Only message me if there is something to do.'
    ]
  }
];

export function toolDef(name: string): ToolDef {
  const def = TOOL_DEFS.find((t) => t.name === name);
  if (!def) throw new Error(`Unknown tool ${name}`);
  return def;
}
