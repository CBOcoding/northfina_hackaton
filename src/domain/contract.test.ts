import { beforeAll, describe, expect, it } from 'vitest';
import { loadCoefficientTable } from '@/data/load';
import type { CoefficientTable } from '@/data/schemas';
import { decideLockedPrice, QUOTE_VALID_DAYS, signContract, type SigningInput } from './contract';

let table: CoefficientTable;
beforeAll(async () => {
  table = await loadCoefficientTable();
});

const laptop004 = {
  assetId: 'laptop-004',
  lifeNumber: 1,
  quotedPriceCents: 349_000,
  quotedPriceListVersion: 1,
  signingPriceCents: 321_100,
  signingPriceListVersion: 2,
};

function input(overrides: Partial<SigningInput> = {}): SigningInput {
  return {
    number: 'ML-2026-0002',
    customerId: 'cust-aino',
    signedBy: 'Aino Virtanen',
    quotedOn: '2026-11-05',
    signedOn: '2026-11-06',
    downPaymentCents: 0,
    termMonths: 36,
    items: [laptop004],
    ...overrides,
  };
}

function sign(overrides: Partial<SigningInput> = {}) {
  const result = signContract(table, input(overrides));
  if (!result.ok) throw new Error(`expected a contract, got ${result.reason}`);
  return result;
}

describe('card 2: quoted on Thursday (v1), signed on Friday (v2, laptops −8 %)', () => {
  it('locks the lower v2 price and says why', () => {
    const { contract, lock } = sign();
    expect(lock).toEqual({
      reason: 'price_dropped_since_quote',
      priceListVersion: 2,
      quotedTotalCents: 349_000,
      signingTotalCents: 321_100,
      lockedTotalCents: 321_100,
      differenceCents: 27_900,
    });
    expect(contract).toMatchObject({
      priceListVersion: 2,
      listPriceCents: 321_100,
      monthlyNetCents: 8_857,
      lockReason: 'price_dropped_since_quote',
      items: [{ assetId: 'laptop-004', listPriceCents: 321_100, quantity: 1, lifeNumber: 1 }],
    });
  });
});

describe('decideLockedPrice', () => {
  it('honours the quote when the price went up (e-bikes +5 % on v2)', () => {
    const ebike = { ...laptop004, quotedPriceCents: 389_000, signingPriceCents: 408_400 };
    expect(decideLockedPrice('2026-11-05', '2026-11-06', [ebike])).toMatchObject({
      reason: 'quote_price_honoured',
      priceListVersion: 1,
      lockedTotalCents: 389_000,
      differenceCents: 19_400,
    });
  });

  it('uses the one price there is when signing on the quote day', () => {
    const same = { ...laptop004, signingPriceCents: 349_000, signingPriceListVersion: 1 };
    expect(decideLockedPrice('2026-11-05', '2026-11-05', [same])).toMatchObject({
      reason: 'same_day',
      lockedTotalCents: 349_000,
    });
  });

  it(`keeps the quote on day ${QUOTE_VALID_DAYS} and lets it expire the day after`, () => {
    const up = { ...laptop004, quotedPriceCents: 300_000, signingPriceCents: 310_000 };
    expect(decideLockedPrice('2026-11-05', '2026-11-19', [up]).reason).toBe('quote_price_honoured');
    expect(decideLockedPrice('2026-11-05', '2026-11-20', [up])).toMatchObject({
      reason: 'quote_expired',
      lockedTotalCents: 310_000,
    });
  });

  it('adds up a fleet (4 × ebike-004) before deciding', () => {
    const bike = { ...laptop004, quotedPriceCents: 549_000, signingPriceCents: 576_400 };
    expect(decideLockedPrice('2026-11-05', '2026-11-06', [bike, bike, bike, bike])).toMatchObject({
      quotedTotalCents: 2_196_000,
      lockedTotalCents: 2_196_000,
    });
  });
});

describe('signContract: quantity', () => {
  it('multiplies the unit price by the quantity before choosing the band', () => {
    const bike = {
      ...laptop004,
      quotedPriceCents: 549_000,
      signingPriceCents: 549_000,
      signingPriceListVersion: 1,
      quantity: 4,
    };
    const { contract, lock } = sign({ signedOn: '2026-11-05', items: [bike] });
    expect(lock.lockedTotalCents).toBe(2_196_000);
    expect(contract).toMatchObject({
      band: 'C',
      items: [{ quantity: 4, listPriceCents: 549_000 }],
    });
  });

  it('refuses a quantity that is not a whole number of at least 1', () => {
    for (const quantity of [0, -1, 1.5]) {
      expect(signContract(table, input({ items: [{ ...laptop004, quantity }] }))).toEqual({
        ok: false,
        reason: 'invalid_quantity',
      });
    }
  });
});

describe('signContract', () => {
  it('card 1: Aino signs ebike-003 on the quote day: 10730/month, starts the same day', () => {
    const ebike003 = {
      ...laptop004,
      assetId: 'ebike-003',
      quotedPriceCents: 389_000,
      signingPriceCents: 389_000,
      signingPriceListVersion: 1,
    };
    const { contract } = sign({
      number: 'ML-2026-0001',
      signedOn: '2026-11-05',
      items: [ebike003],
    });
    expect(contract).toMatchObject({
      startDate: '2026-11-05',
      financedCents: 389_000,
      band: 'B',
      factorMicro: 27_584,
      monthlyNetCents: 10_730,
      buyoutNetCents: 58_350,
      status: 'active',
      endedOn: null,
    });
  });

  it('prices a fleet on the total: 4 × ebike-004 is band C', () => {
    const bike = {
      ...laptop004,
      quotedPriceCents: 549_000,
      signingPriceCents: 549_000,
      signingPriceListVersion: 1,
    };
    const { contract } = sign({ signedOn: '2026-11-05', items: [bike, bike, bike, bike] });
    expect(contract).toMatchObject({
      financedCents: 2_196_000,
      band: 'C',
      monthlyNetCents: 58_993,
    });
  });

  it('accepts a later start date', () => {
    expect(sign({ startDate: '2026-12-01' }).contract.startDate).toBe('2026-12-01');
  });

  it('is frozen: the locked price cannot be changed afterwards', () => {
    const { contract } = sign();
    expect(Object.isFrozen(contract)).toBe(true);
    expect(Object.isFrozen(contract.items)).toBe(true);
    expect(() => {
      (contract as { monthlyNetCents: number }).monthlyNetCents = 1;
    }).toThrow(TypeError);
  });

  it('does not change when the caller edits its input afterwards', () => {
    const items = [{ ...laptop004 }];
    const { contract } = sign({ items });
    items[0]!.signingPriceCents = 1;
    expect(contract.items[0]?.listPriceCents).toBe(321_100);
  });

  it('refuses no items, a signature before the quote, and an unfinanceable amount', () => {
    expect(signContract(table, input({ items: [] }))).toEqual({ ok: false, reason: 'no_items' });
    expect(signContract(table, input({ signedOn: '2026-11-04' }))).toEqual({
      ok: false,
      reason: 'signed_before_quote',
    });
    expect(signContract(table, input({ termMonths: 18 }))).toEqual({
      ok: false,
      reason: 'unknown_term',
    });
  });
});
