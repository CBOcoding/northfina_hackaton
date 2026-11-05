import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { earlyExit, earlyReturnCostCents, type EarlyExitInput } from './early-exit';

const aino: Omit<EarlyExitInput, 'monthsPaid'> = {
  monthlyNetCents: 10_730,
  termMonths: 36,
  buyoutNetCents: 58_350,
  annualInterestPercent: 7.9,
};

function exitAfter(monthsPaid: number, input = aino) {
  const result = earlyExit({ ...input, monthsPaid });
  if (!result.ok) throw new Error(result.reason);
  return result.exit;
}

describe('earlyExit: card 8, Aino ends in month 7 of 36', () => {
  it('pays off 29 rents and the buyout, discounted at 7.9 % a year', () => {
    expect(exitAfter(7)).toEqual({
      monthsPaid: 7,
      remainingRents: 29,
      payoffNetCents: 330_666,
      undiscountedNetCents: 369_520,
      interestSavedCents: 38_854,
    });
  });
});

describe('earlyExit: consistent with the normal end of term', () => {
  it('after the last month costs exactly the buyout', () => {
    expect(exitAfter(36)).toMatchObject({
      remainingRents: 0,
      payoffNetCents: 58_350,
      interestSavedCents: 0,
    });
  });

  it('one month before the end costs one rent plus the buyout, minus a little interest', () => {
    expect(exitAfter(35)).toMatchObject({ payoffNetCents: 68_628, undiscountedNetCents: 69_080 });
  });

  it('with no interest, the payoff is simply the rents left plus the buyout', () => {
    expect(exitAfter(7, { ...aino, annualInterestPercent: 0 })).toMatchObject({
      payoffNetCents: 369_520,
      interestSavedCents: 0,
    });
  });

  it('never costs more than staying, and costs less every month you stay (property)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1_000, max: 300_000 }),
        fc.constantFrom(12, 24, 36, 48),
        fc.constantFrom(5.5, 6.5, 7.9, 9.9),
        (monthly, term, rate) => {
          const input = {
            monthlyNetCents: monthly,
            termMonths: term,
            buyoutNetCents: monthly * 4,
            annualInterestPercent: rate,
          };
          let previous = Infinity;
          for (let m = 1; m <= term; m++) {
            const exit = exitAfter(m, input);
            expect(exit.payoffNetCents).toBeLessThanOrEqual(exit.undiscountedNetCents);
            expect(exit.payoffNetCents).toBeLessThan(previous);
            previous = exit.payoffNetCents;
          }
        }
      ),
      { numRuns: 200 }
    );
  });
});

describe('earlyExit: input checks', () => {
  it('refuses months outside the contract', () => {
    for (const monthsPaid of [0, 37, 6.5]) {
      expect(earlyExit({ ...aino, monthsPaid })).toEqual({
        ok: false,
        reason: 'month_out_of_range',
      });
    }
  });
});

describe('earlyReturnCostCents', () => {
  it('credits the market value and never goes below zero', () => {
    expect(earlyReturnCostCents(330_666, 259_230)).toBe(71_436);
    expect(earlyReturnCostCents(58_350, 120_000)).toBe(0);
  });
});
