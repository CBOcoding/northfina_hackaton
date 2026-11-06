// What it takes to bring a returned item up to a condition (data/refurbishment-costs.json).
//
// Fixed steps come with a `when` rule written in words. We read three shapes and throw on any
// other, so a new rule in the data pack fails loudly instead of being skipped:
//   "always"                                    → once
//   "usage.value >= N <unit>"                   → once, when usage ≥ N
//   "per started N <unit> since last service"   → once per started N units. We have no service
//                                                 records, so we count from 0: ⌈usage / N⌉.
// Condition upgrades go one step at a time (fair → good → like_new) and add up.
// An item is never downgraded: asking for a worse condition than it has costs no upgrade.
import type { AssetCategory, AssetCondition, RefurbishmentCosts, UsageUnit } from '@/data/schemas';
import type { Cents } from './types';

/** Worst first, so a higher index is a better condition. */
export const CONDITION_ORDER: readonly AssetCondition[] = [
  'poor',
  'fair',
  'good',
  'like_new',
  'new',
];

export function conditionRank(condition: AssetCondition): number {
  return CONDITION_ORDER.indexOf(condition);
}

/** The better of two conditions. */
export function betterCondition(a: AssetCondition, b: AssetCondition): AssetCondition {
  return conditionRank(a) >= conditionRank(b) ? a : b;
}

export type RefurbStep = {
  /** Fixed step id from the data (e.g. "battery_replacement") or an upgrade ("fair->good"). */
  id: string;
  kind: 'fixed' | 'upgrade';
  /** How many times the step is done (more than 1 only for "per started N" rules). */
  times: number;
  costCents: Cents;
};

export type RefurbPlan = {
  steps: RefurbStep[];
  totalCents: Cents;
  /** Cost of the condition upgrades only: the part that is a choice, not a rule. */
  upgradeCents: Cents;
  conditionAfter: AssetCondition;
  usageAfter: number;
};

export type RefurbItem = {
  condition: AssetCondition;
  usage: { unit: UsageUnit; value: number };
};

export type RefurbResult =
  | { ok: true; plan: RefurbPlan }
  | { ok: false; reason: 'no_upgrade_path'; from: AssetCondition; to: AssetCondition };

const AT_LEAST = /^usage\.value >= (\d+) ([a-z_]+)$/;
const PER_STARTED = /^per started (\d+) ([a-z_]+) since last service$/;

/** How many times a fixed step applies to this item. */
export function timesApplied(when: string, usage: RefurbItem['usage']): number {
  if (when === 'always') return 1;
  const atLeast = AT_LEAST.exec(when);
  const perStarted = atLeast ? null : PER_STARTED.exec(when);
  const match = atLeast ?? perStarted;
  if (!match) throw new Error(`unknown refurbishment rule: "${when}"`);
  const limit = Number(match[1]);
  if (match[2] !== usage.unit) {
    throw new Error(`rule "${when}" is in ${match[2]}, the item counts ${usage.unit}`);
  }
  if (atLeast) return usage.value >= limit ? 1 : 0;
  return Math.ceil(usage.value / limit);
}

/** The steps and cost to make a returned item ready for its next lease in `target` condition. */
export function planRefurbishment(
  costs: RefurbishmentCosts,
  category: AssetCategory,
  item: RefurbItem,
  target: AssetCondition
): RefurbResult {
  const table = costs[category];
  const steps: RefurbStep[] = [];
  let resets = false;
  for (const step of table.fixed) {
    const times = timesApplied(step.when, item.usage);
    if (times === 0) continue;
    steps.push({ id: step.id, kind: 'fixed', times, costCents: step.cost_cents * times });
    if (step.resets_usage) resets = true;
  }

  const conditionAfter = betterCondition(item.condition, target);
  for (let rank = conditionRank(item.condition); rank < conditionRank(conditionAfter); rank++) {
    const id = `${CONDITION_ORDER[rank]}->${CONDITION_ORDER[rank + 1]}`;
    const cost = table.condition_upgrades[id];
    if (cost === undefined) {
      return { ok: false, reason: 'no_upgrade_path', from: item.condition, to: conditionAfter };
    }
    steps.push({ id, kind: 'upgrade', times: 1, costCents: cost });
  }

  const sum = (list: RefurbStep[]) => list.reduce((total, s) => total + s.costCents, 0);
  return {
    ok: true,
    plan: {
      steps,
      totalCents: sum(steps),
      upgradeCents: sum(steps.filter((s) => s.kind === 'upgrade')),
      conditionAfter,
      usageAfter: resets ? 0 : item.usage.value,
    },
  };
}
