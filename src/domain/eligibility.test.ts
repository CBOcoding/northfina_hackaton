import { beforeAll, describe, expect, it } from 'vitest';
import { loadCoefficientTable, loadCustomers, loadPriceLists, loadQuestions } from '@/data/load';
import type { CoefficientTable, Customer, PriceList, QuestionsFile } from '@/data/schemas';
import { monthlyFactorFor } from './coefficient';
import {
  AFFORDABILITY_MAX_PERCENT,
  FINANCED_MAX_CENTS,
  FINANCED_MIN_CENTS,
  MIN_AGE_YEARS,
  RESIDENCY_COUNTRIES,
  ageOn,
  evaluateEligibility,
  type EligibilityInput,
  type ReasonCode,
} from './eligibility';
import { listPriceOn } from './price-list';
import { pruneAnswers, type Answers } from './question-flow';
import type { ApplicationDecision } from './types';

let customers: Customer[];
let questions: QuestionsFile;
let table: CoefficientTable;
let priceLists: PriceList[];
beforeAll(async () => {
  [customers, questions, table, priceLists] = await Promise.all([
    loadCustomers(),
    loadQuestions(),
    loadCoefficientTable(),
    loadPriceLists(),
  ]);
});

const START = '2026-11-05';

function customer(id: string): Customer {
  const found = customers.find((c) => c.id === id);
  if (!found) throw new Error(`no customer ${id}`);
  return found;
}

/**
 * Stand-in for stream A's quote: rent incl. VAT from coefficient.ts + price-list.ts.
 * Net and VAT each rounded half up to whole cents; VAT 25.5 % (valid until 2026-12-31).
 */
function grossRentCents(financedCents: number, termMonths: number): number {
  const factor = monthlyFactorFor(table, financedCents, termMonths);
  if (!factor.ok) throw new Error(factor.reason);
  const net = Math.round(financedCents * factor.factor);
  return net + Math.round((net * 255) / 1000);
}

function priceOf(assetId: string): number {
  const price = listPriceOn(priceLists, assetId, START);
  if (!price.ok) throw new Error(price.reason);
  return price.priceCents;
}

/** The applicant's answers, taken from the persona record and pruned to what the deal asks. */
function answersFor(c: Customer, financedCents: number): Answers {
  const raw: Answers = {
    q_customer_type: c.type,
    q_pep: c.is_pep ? 'yes' : 'no',
    ...(c.type === 'company' ? { q_can_sign: c.applicant_can_sign ? 'yes' : 'no' } : {}),
  };
  return pruneAnswers(questions.questions, { financed_amount_cents: financedCents }, raw).answers;
}

/** A deal for `quantity` × `assetId` on START, with income from the persona record. */
function application(
  customerId: string,
  assetId: string,
  termMonths: number,
  { quantity = 1, downPaymentCents = 0 } = {}
): EligibilityInput {
  const c = customer(customerId);
  const financedCents = priceOf(assetId) * quantity - downPaymentCents;
  const consumer = c.type === 'consumer';
  return {
    customer: c,
    answers: answersFor(c, financedCents),
    startDate: START,
    financedCents,
    monthlyGrossRentCents: consumer ? grossRentCents(financedCents, termMonths) : null,
    monthlyNetIncomeCents: consumer ? c.monthly_net_income_cents : null,
  };
}

const codes = (input: EligibilityInput) => evaluateEligibility(input).reasons.map((r) => r.code);

describe('evaluateEligibility over the 10 data-pack customers', () => {
  const cases: [string, () => EligibilityInput, ApplicationDecision, ReasonCode[]][] = [
    [
      'aino, card 1: ebike-003 36 m',
      () => application('cust-aino', 'ebike-003', 36),
      'approved',
      [],
    ],
    [
      'mikko, card 5: 17 on the start date',
      () => application('cust-mikko', 'laptop-008', 36),
      'rejected',
      ['MIN_AGE'],
    ],
    ['lena: EE resident', () => application('cust-lena', 'ebike-001', 24), 'approved', []],
    ['pekka: sole trader', () => application('cust-pekka', 'ebike-004', 36), 'approved', []],
    [
      'kettukoodi: 6 laptops',
      () => application('cust-kettukoodi', 'laptop-004', 36, { quantity: 6 }),
      'approved',
      [],
    ],
    [
      'haapala, card 7: farm-002 48 m, 20 000 € down, PEP owner',
      () => application('cust-haapala', 'farm-002', 48, { downPaymentCents: 2_000_000 }),
      'manual_review',
      ['PEP_MANUAL_REVIEW'],
    ],
    [
      'norvi, card 6: applicant cannot sign',
      () => application('cust-norvi', 'ebike-004', 36, { quantity: 4 }),
      'pending',
      ['SIGNATORY_REQUIRED'],
    ],
    [
      'broken-id: wrong check digit',
      () => application('cust-broken-id', 'laptop-001', 36),
      'rejected',
      ['BUSINESS_ID_INVALID'],
    ],
    [
      'sanna: 5490 € e-bike over 12 m is too expensive',
      () => application('cust-sanna', 'ebike-004', 12),
      'rejected',
      ['AFFORDABILITY_EXCEEDED'],
    ],
    [
      'sanna: same bike over 24 m fits',
      () => application('cust-sanna', 'ebike-004', 24),
      'approved',
      [],
    ],
    [
      'sanna: same bike over 36 m fits',
      () => application('cust-sanna', 'ebike-004', 36),
      'approved',
      [],
    ],
    ['olavi: 70, retired', () => application('cust-olavi', 'ebike-001', 24), 'approved', []],
  ];

  it.each(cases)('%s', (_name, build, decision, expected) => {
    const result = evaluateEligibility(build());
    expect(result.decision).toBe(decision);
    expect(result.reasons.map((r) => r.code)).toEqual(expected);
  });

  it('covers every customer in the data pack', () => {
    const tested = new Set(cases.map(([, build]) => build().customer.id));
    expect([...tested].sort()).toEqual(customers.map((c) => c.id).sort());
  });

  it('sanna: the term decides, with a cap of 27 000 cents on 900 € income', () => {
    expect(grossRentCents(549_000, 12)).toBe(37_757);
    expect(grossRentCents(549_000, 24)).toBe(24_481);
    expect(grossRentCents(549_000, 36)).toBe(19_006);
  });

  it('is repeatable: the same input gives the same result', () => {
    const input = application('cust-haapala', 'farm-002', 48, { downPaymentCents: 2_000_000 });
    expect(evaluateEligibility(input)).toEqual(evaluateEligibility(input));
  });
});

describe('evaluateEligibility rules and edges', () => {
  const aino = () => application('cust-aino', 'ebike-003', 36);
  const withBirthDate = (birth_date: string): EligibilityInput => ({
    ...aino(),
    customer: { ...(customer('cust-aino') as Extract<Customer, { type: 'consumer' }>), birth_date },
  });

  it('accepts an applicant whose 18th birthday is exactly the start date', () => {
    expect(codes(withBirthDate('2008-11-05'))).toEqual([]);
    expect(codes(withBirthDate('2008-11-06'))).toEqual(['MIN_AGE']);
  });

  it('applies the age rule to sole traders but not to companies', () => {
    const pekka = customer('cust-pekka') as Extract<Customer, { type: 'sole_trader' }>;
    const young = {
      ...application('cust-pekka', 'ebike-004', 36),
      customer: { ...pekka, birth_date: '2010-01-01' },
    };
    expect(codes(young)).toEqual(['MIN_AGE']);
    expect(codes(application('cust-kettukoodi', 'laptop-004', 36))).toEqual([]);
  });

  it.each([
    [29_999, ['FINANCED_OUT_OF_RANGE']],
    [30_000, []],
    [25_000_000, []],
    [25_000_001, ['FINANCED_OUT_OF_RANGE']],
  ])('financed %i cents -> %j', (financedCents, expected) => {
    const input = { ...application('cust-kettukoodi', 'laptop-004', 36), financedCents };
    expect(codes(input)).toEqual(expected);
  });

  it('tags a financed amount out of range with its rule id', () => {
    const input = { ...application('cust-kettukoodi', 'laptop-004', 36), financedCents: 29_999 };
    expect(evaluateEligibility(input)).toEqual({
      decision: 'rejected',
      reasons: [{ code: 'FINANCED_OUT_OF_RANGE', rule_id: 'financed_limits' }],
    });
  });

  it.each(['FI', 'SE', 'EE'])('accepts residents of %s', (country) => {
    const input = { ...aino(), customer: { ...customer('cust-aino'), country } };
    expect(evaluateEligibility(input)).toEqual({ decision: 'approved', reasons: [] });
  });

  it.each(['DE', 'other'])('rejects residents of %s', (country) => {
    const input = { ...aino(), customer: { ...customer('cust-aino'), country } };
    expect(evaluateEligibility(input)).toEqual({
      decision: 'rejected',
      reasons: [{ code: 'RESIDENCY', rule_id: 'residency' }],
    });
  });

  it('allows rent of exactly 30 % of income and rejects one cent more', () => {
    const base = { ...aino(), monthlyNetIncomeCents: 100_000 };
    expect(codes({ ...base, monthlyGrossRentCents: 30_000 })).toEqual([]);
    expect(evaluateEligibility({ ...base, monthlyGrossRentCents: 30_001 })).toEqual({
      decision: 'rejected',
      reasons: [{ code: 'AFFORDABILITY_EXCEEDED', rule_id: 'affordability' }],
    });
    expect(codes({ ...base, monthlyNetIncomeCents: 0, monthlyGrossRentCents: 1 })).toEqual([
      'AFFORDABILITY_EXCEEDED',
    ]);
  });

  it('flags affordability as not assessed, without rejecting, when income or rent is missing', () => {
    for (const missing of [{ monthlyNetIncomeCents: null }, { monthlyGrossRentCents: null }]) {
      expect(evaluateEligibility({ ...aino(), ...missing })).toEqual({
        decision: 'approved',
        reasons: [{ code: 'AFFORDABILITY_NOT_ASSESSED', rule_id: 'affordability' }],
      });
    }
  });

  it('checks the business ID of sole traders too', () => {
    const pekka = customer('cust-pekka') as Extract<Customer, { type: 'sole_trader' }>;
    const input = {
      ...application('cust-pekka', 'ebike-004', 36),
      customer: { ...pekka, business_id: '3012456-4' },
    };
    expect(evaluateEligibility(input)).toEqual({
      decision: 'rejected',
      reasons: [{ code: 'BUSINESS_ID_INVALID', rule_id: 'business_id' }],
    });
  });

  it('sends a PEP answer to manual review even when the record says no PEP', () => {
    const input = { ...aino(), answers: { q_pep: 'yes' } };
    expect(evaluateEligibility(input).decision).toBe('manual_review');
  });

  it('never approves a PEP and never rejects for PEP alone; a real reject still wins', () => {
    const pep = { ...aino(), customer: { ...customer('cust-aino'), is_pep: true } };
    expect(evaluateEligibility(pep).decision).toBe('manual_review');
    const youngPep = {
      ...withBirthDate('2010-01-01'),
      customer: { ...withBirthDate('2010-01-01').customer, is_pep: true },
    };
    expect(evaluateEligibility(youngPep)).toEqual({
      decision: 'rejected',
      reasons: [
        { code: 'MIN_AGE', rule_id: 'min_age' },
        { code: 'PEP_MANUAL_REVIEW', rule_id: 'pep_manual_review' },
      ],
    });
  });

  it('puts manual review above a missing signatory', () => {
    const norvi = application('cust-norvi', 'ebike-004', 36, { quantity: 4 });
    expect(
      evaluateEligibility({ ...norvi, answers: { ...norvi.answers, q_pep: 'yes' } }).decision
    ).toBe('manual_review');
  });

  it('waits for a signatory when the answer says the applicant cannot sign', () => {
    const kettu = application('cust-kettukoodi', 'laptop-004', 36);
    expect(evaluateEligibility({ ...kettu, answers: { q_can_sign: 'no' } })).toEqual({
      decision: 'pending',
      reasons: [{ code: 'SIGNATORY_REQUIRED' }],
    });
  });

  it('keeps waiting for a signatory when the answer says yes but the record says no', () => {
    const norvi = application('cust-norvi', 'ebike-004', 36, { quantity: 4 });
    expect(
      evaluateEligibility({ ...norvi, answers: { ...norvi.answers, q_can_sign: 'yes' } })
    ).toEqual({
      decision: 'pending',
      reasons: [{ code: 'SIGNATORY_REQUIRED' }],
    });
  });

  it('throws on a malformed start date, because that is a bug in the caller', () => {
    expect(() => evaluateEligibility({ ...aino(), startDate: '5.11.2026' })).toThrow(RangeError);
  });

  it.each(['financedCents', 'monthlyGrossRentCents', 'monthlyNetIncomeCents'] as const)(
    'throws when %s is not a non-negative whole number of cents',
    (field) => {
      for (const bad of [NaN, 1.5, -1, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
        expect(() => evaluateEligibility({ ...aino(), [field]: bad })).toThrow(RangeError);
      }
    }
  );
});

describe('ageOn', () => {
  it('counts full years and turns a year older on the birthday', () => {
    expect(ageOn('2009-03-10', '2026-11-05')).toBe(17);
    expect(ageOn('2009-03-10', '2027-03-09')).toBe(17);
    expect(ageOn('2009-03-10', '2027-03-10')).toBe(18);
  });

  it('makes a 29 February baby a year older on 1 March in non-leap years', () => {
    expect(ageOn('2008-02-29', '2026-02-28')).toBe(17);
    expect(ageOn('2008-02-29', '2026-03-01')).toBe(18);
    expect(ageOn('2008-02-29', '2028-02-29')).toBe(20);
  });

  it('throws on a malformed date', () => {
    expect(() => ageOn('2008-2-29', '2026-03-01')).toThrow(RangeError);
  });
});

describe('eligibility limits match the data pack', () => {
  it('uses only rule ids that exist in eligibility_rules', () => {
    const known = new Set(questions.eligibility_rules.map((r) => r.id));
    for (const id of [
      'min_age',
      'residency',
      'affordability',
      'business_id',
      'pep_manual_review',
      'financed_limits',
    ]) {
      expect(known.has(id)).toBe(true);
    }
  });

  it('copies the age limit and the countries from the question blocks', () => {
    const byId = (id: string) => questions.questions.find((x) => x.id === id);
    expect(byId('q_birth_date')?.blocks_application_when).toEqual([
      { rule: 'age_under', value: MIN_AGE_YEARS },
    ]);
    const country = byId('q_country');
    const blocked = country?.blocks_application_when?.flatMap((b) =>
      b.rule === 'answer_in' ? b.value : []
    );
    expect(country?.options?.filter((o) => !blocked?.includes(o))).toEqual(RESIDENCY_COUNTRIES);
    expect(questions.eligibility_rules.find((r) => r.id === 'affordability')?.text).toBe(
      `For consumers, monthly rent incl. VAT may be at most ${AFFORDABILITY_MAX_PERCENT} % of monthly net income.`
    );
  });

  it('copies the financed limits from the first and last coefficient band', () => {
    expect(table.bands[0]?.min_financed_cents).toBe(FINANCED_MIN_CENTS);
    expect(table.bands.at(-1)?.max_financed_cents).toBe(FINANCED_MAX_CENTS);
  });
});
