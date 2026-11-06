import { beforeAll, describe, expect, it } from 'vitest';
import {
  loadCoefficientTable,
  loadRefurbishmentCosts,
  loadResidualCurves,
  loadSecondLifeDemand,
} from '@/data/load';
import type {
  CoefficientTable,
  RefurbishmentCosts,
  ResidualCurves,
  SecondLifeRequest,
} from '@/data/schemas';
import { ageInMonths, matchSecondLife, type SecondLifeInput } from './second-life';

let base: Omit<SecondLifeInput, 'asset' | 'listPriceCents'>;
let waitingList: SecondLifeRequest[];
beforeAll(async () => {
  const [costs, curves, table, demand]: [
    RefurbishmentCosts,
    ResidualCurves,
    CoefficientTable,
    SecondLifeRequest[],
  ] = await Promise.all([
    loadRefurbishmentCosts(),
    loadResidualCurves(),
    loadCoefficientTable(),
    loadSecondLifeDemand(),
  ]);
  waitingList = demand;
  base = { today: '2026-11-06', waitingList: demand, costs, curves, table };
});

// ebike-007 from data/assets.json, today's (v2) list price 576 400.
const ebike007 = {
  category: 'e_bike',
  condition: 'fair',
  usage: { unit: 'km', value: 18_400 },
  model_year: 2023,
} as const;
// ebike-008, two lives already, v2 list price 188 900.
const ebike008 = {
  category: 'e_bike',
  condition: 'good',
  usage: { unit: 'km', value: 9_800 },
  model_year: 2022,
} as const;

const byId = (match: ReturnType<typeof matchSecondLife>, id: string) =>
  match.candidates.find((c) => c.request.id === id);

describe('ageInMonths', () => {
  it('counts from 1 January of the model year', () => {
    expect(ageInMonths(2023, '2026-11-06')).toBe(46);
    expect(ageInMonths(2026, '2026-01-31')).toBe(0);
  });

  it('is 0 for a model year that has not started', () => {
    expect(ageInMonths(2027, '2026-11-06')).toBe(0);
  });
});

describe('matchSecondLife, card 9: ebike-007', () => {
  it('goes to wait-13 at 58.34 €/month net for 24 months, after a refurbishment to good', () => {
    const match = matchSecondLife({ ...base, asset: ebike007, listPriceCents: 576_400 });
    expect(match.ageMonths).toBe(46); // curve 32.5 %
    expect(match.winner?.request.id).toBe('wait-13');
    // 576 400 × 0.325 × 0.85 (good) × 1.00 (new battery, 0 km) = 159 230.5 → 159 231
    expect(match.winner?.valueAfterCents).toBe(159_231);
    expect(match.winner?.plan?.totalCents).toBe(51_500);
    // fair → good adds 159 231 − 121 765 of value for 12 000 of work: worth it
    expect(match.winner?.upgradeGainCents).toBe(37_466);
    expect(match.winner?.quote?.band).toBe('A');
    expect(match.winner?.quote?.monthlyNetCents).toBe(5_834); // × 0.036637
    // Same deadline and budget as wait-02, but wait-02 also accepts fair.
    expect(match.runnerUp?.request.id).toBe('wait-02');
    expect(match.decidedBy).toBe('stricter_condition');
  });

  it('prices each person for the condition they asked for', () => {
    const match = matchSecondLife({ ...base, asset: ebike007, listPriceCents: 576_400 });
    // As returned: fair and 18 400 km (−20 %): 576 400 × 0.325 × 0.65 × 0.80 = 97 411.6
    expect(byId(match, 'wait-02')?.valueBeforeCents).toBe(97_412);
    // wait-02 accepts fair: no upgrade, 121 765 × 0.056022 (12 months) = 6 821.5 → 6 822
    expect(byId(match, 'wait-02')?.plan?.upgradeCents).toBe(0);
    expect(byId(match, 'wait-02')?.quote?.monthlyNetCents).toBe(6_822);
    expect(byId(match, 'wait-03')?.plan?.conditionAfter).toBe('like_new');
    expect(byId(match, 'wait-03')?.excludedBecause).toBeNull();
  });

  it('says why the others do not get it', () => {
    const match = matchSecondLife({ ...base, asset: ebike007, listPriceCents: 576_400 });
    expect(byId(match, 'wait-01')?.excludedBecause).toBe('over_budget'); // 5 834 > 4 500
    expect(byId(match, 'wait-05')?.excludedBecause).toBe('over_budget'); // 8 920 > 3 500
    expect(match.candidates.map((c) => c.request.category)).toEqual(
      Array(match.candidates.length).fill('e_bike')
    );
  });
});

describe('matchSecondLife, served people', () => {
  it('someone who already got an item never wins again: ebike-007 goes to wait-02', () => {
    const match = matchSecondLife({
      ...base,
      asset: ebike007,
      listPriceCents: 576_400,
      served: ['wait-13'],
    });
    expect(byId(match, 'wait-13')?.excludedBecause).toBe('already_served');
    expect(byId(match, 'wait-13')?.quote).toBeNull();
    expect(match.winner?.request.id).toBe('wait-02');
    expect(match.winner?.quote?.monthlyNetCents).toBe(6_822); // fair, 12 months, no repair
    expect(match.winner?.quote?.termMonths).toBe(12);
  });
});

describe('matchSecondLife, card 10: ebike-008', () => {
  it('goes to the most urgent person (wait-05) and skips an upgrade that does not pay', () => {
    const match = matchSecondLife({ ...base, asset: ebike008, listPriceCents: 188_900 });
    expect(match.ageMonths).toBe(58); // curve 26 %, 9 800 km → −18 %
    expect(match.winner?.request.id).toBe('wait-05');
    expect(match.winner?.valueAfterCents).toBe(34_232);
    expect(match.winner?.quote?.monthlyNetCents).toBe(1_918); // 34 232 × 0.056022
    expect(match.decidedBy).toBe('earlier_deadline');
    // like_new adds 38 260 − 34 232 = 4 028 of value for 8 000 of work.
    expect(byId(match, 'wait-03')?.excludedBecause).toBe('upgrade_not_worth_it');
  });
});

describe('matchSecondLife, rules', () => {
  const laptop = {
    category: 'laptop',
    condition: 'good',
    usage: { unit: 'battery_cycles', value: 100 },
    model_year: 2025,
  } as const;

  it('two identical requests: the one who signed up first wins (wait-06 before wait-14)', () => {
    const twins = waitingList.filter((r) => r.id === 'wait-06' || r.id === 'wait-14');
    const match = matchSecondLife({
      ...base,
      waitingList: twins,
      asset: laptop,
      listPriceCents: 120_000,
    });
    expect(match.winner?.request.id).toBe('wait-06');
    expect(match.runnerUp?.request.id).toBe('wait-14');
    expect(match.decidedBy).toBe('signed_up_first');
  });

  it('skips people whose deadline has passed, and has no winner when nobody is left', () => {
    const match = matchSecondLife({
      ...base,
      today: '2027-12-01',
      asset: ebike007,
      listPriceCents: 576_400,
    });
    expect(match.candidates.every((c) => c.excludedBecause === 'deadline_passed')).toBe(true);
    expect(match).toMatchObject({ winner: null, runnerUp: null, decidedBy: null });
  });

  it('refuses an item worth less than the smallest lease (band A minimum)', () => {
    const match = matchSecondLife({ ...base, asset: ebike008, listPriceCents: 50_000 });
    expect(byId(match, 'wait-05')?.excludedBecause).toBe('below_minimum');
  });

  it('refuses a request for a condition the item cannot reach', () => {
    const wantsNew: SecondLifeRequest = { ...waitingList[0]!, min_condition: 'new' };
    const match = matchSecondLife({
      ...base,
      waitingList: [wantsNew],
      asset: ebike008,
      listPriceCents: 188_900,
    });
    expect(match.candidates[0]?.excludedBecause).toBe('no_upgrade_path');
    expect(match.winner).toBeNull();
  });
});
