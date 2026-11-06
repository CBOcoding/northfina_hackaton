import { beforeAll, describe, expect, it } from 'vitest';
import { loadRefurbishmentCosts } from '@/data/load';
import { assetConditionSchema, type RefurbishmentCosts } from '@/data/schemas';
import {
  betterCondition,
  CONDITION_ORDER,
  conditionRank,
  planRefurbishment,
  timesApplied,
} from './refurbishment';

let costs: RefurbishmentCosts;
beforeAll(async () => {
  costs = await loadRefurbishmentCosts();
});

describe('CONDITION_ORDER / conditionRank', () => {
  it('ranks every condition from worst to best, each exactly once', () => {
    expect(CONDITION_ORDER).toEqual(['poor', 'fair', 'good', 'like_new', 'new']);
    expect([...CONDITION_ORDER].sort()).toEqual([...assetConditionSchema.options].sort());
    expect(CONDITION_ORDER.map(conditionRank)).toEqual([0, 1, 2, 3, 4]);
  });

  it('a better condition has a higher rank', () => {
    expect(conditionRank('good')).toBeGreaterThan(conditionRank('fair'));
    expect(conditionRank('poor')).toBeLessThan(conditionRank('new'));
  });
});

describe('timesApplied', () => {
  const km = (value: number) => ({ unit: 'km' as const, value });
  const hours = (value: number) => ({ unit: 'engine_hours' as const, value });

  it('"always" applies once, even with no usage', () => {
    expect(timesApplied('always', km(0))).toBe(1);
  });

  it('"usage.value >= N" applies from exactly N, not one below', () => {
    expect(timesApplied('usage.value >= 15000 km', km(14_999))).toBe(0);
    expect(timesApplied('usage.value >= 15000 km', km(15_000))).toBe(1);
  });

  it('"per started N" counts every started block of N, and none at 0', () => {
    const rule = 'per started 1000 engine_hours since last service';
    expect(timesApplied(rule, hours(0))).toBe(0);
    expect(timesApplied(rule, hours(1))).toBe(1);
    expect(timesApplied(rule, hours(1_000))).toBe(1);
    expect(timesApplied(rule, hours(2_001))).toBe(3);
  });

  it('throws on a rule it cannot read or a unit that does not match the item', () => {
    expect(() => timesApplied('when it rains', km(0))).toThrow(/unknown refurbishment rule/);
    expect(() => timesApplied('usage.value >= 500 battery_cycles', km(600))).toThrow(/km/);
  });
});

describe('planRefurbishment', () => {
  it('card 9: ebike-007 (fair, 18 400 km) to good = new battery + inspection + one upgrade', () => {
    const result = planRefurbishment(
      costs,
      'e_bike',
      { condition: 'fair', usage: { unit: 'km', value: 18_400 } },
      'good'
    );
    expect(result).toEqual({
      ok: true,
      plan: {
        steps: [
          { id: 'battery_replacement', kind: 'fixed', times: 1, costCents: 35_000 },
          { id: 'safety_inspection', kind: 'fixed', times: 1, costCents: 4_500 },
          { id: 'fair->good', kind: 'upgrade', times: 1, costCents: 12_000 },
        ],
        totalCents: 51_500,
        upgradeCents: 12_000,
        conditionAfter: 'good',
        usageAfter: 0, // the new battery resets the counter
      },
    });
  });

  it('adds up several upgrade steps: poor → like_new', () => {
    const result = planRefurbishment(
      costs,
      'e_bike',
      { condition: 'poor', usage: { unit: 'km', value: 100 } },
      'like_new'
    );
    expect(result.ok && result.plan.upgradeCents).toBe(15_000 + 12_000 + 8_000);
    expect(result.ok && result.plan.usageAfter).toBe(100);
  });

  it('never downgrades: a good laptop asked for fair stays good, data wipe still mandatory', () => {
    const result = planRefurbishment(
      costs,
      'laptop',
      { condition: 'good', usage: { unit: 'battery_cycles', value: 120 } },
      'fair'
    );
    expect(result).toEqual({
      ok: true,
      plan: {
        steps: [{ id: 'certified_data_wipe', kind: 'fixed', times: 1, costCents: 2_500 }],
        totalCents: 2_500,
        upgradeCents: 0,
        conditionAfter: 'good',
        usageAfter: 120,
      },
    });
  });

  it('farm machine: a major service per started 1000 engine hours', () => {
    const result = planRefurbishment(
      costs,
      'farm_machine',
      { condition: 'good', usage: { unit: 'engine_hours', value: 2_400 } },
      'good'
    );
    expect(result.ok && result.plan.totalCents).toBe(3 * 150_000 + 40_000);
  });

  it('refuses a condition the data has no upgrade to ("new")', () => {
    expect(
      planRefurbishment(
        costs,
        'e_bike',
        { condition: 'like_new', usage: { unit: 'km', value: 0 } },
        'new'
      )
    ).toEqual({ ok: false, reason: 'no_upgrade_path', from: 'like_new', to: 'new' });
  });
});

describe('betterCondition', () => {
  it('picks the better one in either order', () => {
    expect(betterCondition('fair', 'good')).toBe('good');
    expect(betterCondition('like_new', 'poor')).toBe('like_new');
    expect(betterCondition('fair', 'fair')).toBe('fair');
  });
});
