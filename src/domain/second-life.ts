// Second life: who on the waiting list gets a returned item, in what condition and at what rent.
//
// For every person waiting for this category we price the item as they would get it:
//   1. Condition: the worse of what they accept and 'fair' is the floor (nobody leases a
//      'poor' item), and we never downgrade. We refurbish only as far as they need.
//   2. Refurbishment: the fixed steps the data requires, plus the condition upgrades.
//      An upgrade must pay for itself: the value it adds must be at least what it costs.
//   3. New price = market value after refurbishment (market-value.ts). The age counts from
//      1 January of the model year (the data has no first-lease date), and the list price is
//      today's (the data has no price from the first lease either).
//   4. Rent = the normal quote on that price, no down payment, for the term they want.
// The person gets it if the rent fits their budget and their deadline has not passed.
//
// Several people qualify? The order, and why it is fair:
//   1. Earliest `needed_by`: who needs it soonest.
//   2. Strictest condition: someone who also accepts 'fair' will have more items to choose
//      from, someone who needs 'good' has fewer.
//   3. Earlier on the waiting list: first come, first served.
// Someone who already has a contract from the waiting list has been served and never wins again.
import type {
  Asset,
  CoefficientTable,
  RefurbishmentCosts,
  ResidualCurves,
  SecondLifeRequest,
} from '@/data/schemas';
import { parseIsoDate } from './calendar';
import { marketValue } from './market-value';
import { quoteLease, type Quote, type QuoteRefusal } from './pricing';
import {
  betterCondition,
  conditionRank,
  planRefurbishment,
  type RefurbPlan,
} from './refurbishment';
import type { Cents, IsoDate } from './types';

export type SecondLifeExclusion =
  | 'already_served'
  | 'deadline_passed'
  | 'no_upgrade_path'
  | 'upgrade_not_worth_it'
  | 'over_budget'
  | QuoteRefusal;

export type SecondLifeCandidate = {
  request: SecondLifeRequest;
  /** Position on the waiting list (0 = signed up first). */
  listIndex: number;
  /** null when the item cannot be brought to the condition they need. */
  plan: RefurbPlan | null;
  /** Value as returned, and after refurbishment (the new price). */
  valueBeforeCents: Cents;
  valueAfterCents: Cents | null;
  /** Value the condition upgrades add (after minus the same item without them). */
  upgradeGainCents: Cents | null;
  quote: Quote | null;
  excludedBecause: SecondLifeExclusion | null;
};

export type TieBreak = 'earlier_deadline' | 'stricter_condition' | 'signed_up_first';

export type SecondLifeMatch = {
  ageMonths: number;
  /** Everyone waiting for this category, in waiting-list order. */
  candidates: SecondLifeCandidate[];
  winner: SecondLifeCandidate | null;
  /** The next eligible person, and the rule that put the winner first. */
  runnerUp: SecondLifeCandidate | null;
  decidedBy: TieBreak | null;
};

export type SecondLifeInput = {
  asset: Pick<Asset, 'category' | 'condition' | 'usage' | 'model_year'>;
  /** Today's net list price of the item, in cents. */
  listPriceCents: Cents;
  today: IsoDate;
  waitingList: readonly SecondLifeRequest[];
  costs: RefurbishmentCosts;
  curves: ResidualCurves;
  table: CoefficientTable;
  /** Waiting-list ids that already have a contract with us. */
  served?: readonly string[];
};

/** Whole months from 1 January of the model year to `today` (0 if the year has not started). */
export function ageInMonths(modelYear: number, today: IsoDate): number {
  const { year, month } = parseIsoDate(today);
  return Math.max(0, (year - modelYear) * 12 + (month - 1));
}

function candidateFor(
  input: SecondLifeInput,
  ageMonths: number,
  request: SecondLifeRequest,
  listIndex: number
): SecondLifeCandidate {
  const { asset, listPriceCents, today, costs, curves, table } = input;
  const value = (condition: typeof asset.condition, usageValue: number) =>
    marketValue(curves, {
      listPriceCents,
      category: asset.category,
      ageMonths,
      condition,
      usageValue,
    }).valueCents;
  const valueBeforeCents = value(asset.condition, asset.usage.value);
  const base = { request, listIndex, valueBeforeCents };
  const none = { plan: null, valueAfterCents: null, upgradeGainCents: null, quote: null };

  if (input.served?.includes(request.id)) {
    return { ...base, ...none, excludedBecause: 'already_served' };
  }
  if (request.needed_by < today) return { ...base, ...none, excludedBecause: 'deadline_passed' };

  const target = betterCondition(request.min_condition, 'fair');
  const refurb = planRefurbishment(costs, asset.category, asset, target);
  if (!refurb.ok) return { ...base, ...none, excludedBecause: 'no_upgrade_path' };
  const { plan } = refurb;

  const valueAfterCents = value(plan.conditionAfter, plan.usageAfter);
  const upgradeGainCents = valueAfterCents - value(asset.condition, plan.usageAfter);
  const priced = { ...base, plan, valueAfterCents, upgradeGainCents };
  if (upgradeGainCents < plan.upgradeCents) {
    return { ...priced, quote: null, excludedBecause: 'upgrade_not_worth_it' };
  }

  const result = quoteLease(table, {
    listPriceCents: valueAfterCents,
    downPaymentCents: 0,
    termMonths: request.preferred_term_months,
  });
  if (!result.ok) return { ...priced, quote: null, excludedBecause: result.reason };
  const over = result.quote.monthlyNetCents > request.max_monthly_net_rent_cents;
  return { ...priced, quote: result.quote, excludedBecause: over ? 'over_budget' : null };
}

/** Negative when `a` comes before `b`, with the rule that decided it. */
function compare(a: SecondLifeCandidate, b: SecondLifeCandidate): [number, TieBreak] {
  if (a.request.needed_by !== b.request.needed_by) {
    return [a.request.needed_by < b.request.needed_by ? -1 : 1, 'earlier_deadline'];
  }
  const strict = conditionRank(b.request.min_condition) - conditionRank(a.request.min_condition);
  if (strict !== 0) return [strict, 'stricter_condition'];
  return [a.listIndex - b.listIndex, 'signed_up_first'];
}

export function matchSecondLife(input: SecondLifeInput): SecondLifeMatch {
  const ageMonths = ageInMonths(input.asset.model_year, input.today);
  const candidates = input.waitingList
    .map((request, listIndex) => ({ request, listIndex }))
    .filter(({ request }) => request.category === input.asset.category)
    .map(({ request, listIndex }) => candidateFor(input, ageMonths, request, listIndex));

  const ranked = candidates
    .filter((c) => c.excludedBecause === null)
    .sort((a, b) => compare(a, b)[0]);
  const winner = ranked[0] ?? null;
  const runnerUp = ranked[1] ?? null;
  return {
    ageMonths,
    candidates,
    winner,
    runnerUp,
    decidedBy: winner && runnerUp ? compare(winner, runnerUp)[1] : null,
  };
}
