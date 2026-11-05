import { beforeAll, describe, expect, it } from 'vitest';
import { loadCustomers, loadQuestions } from '@/data/load';
import type { Customer, Question } from '@/data/schemas';
import {
  answersFromCustomer,
  customerFromAnswers,
  dealFor,
  missingQuestionIds,
  RECORD_QUESTION_IDS,
} from './application';
import { evaluateEligibility } from './eligibility';

let customers: Customer[];
let questions: Question[];
beforeAll(async () => {
  customers = await loadCustomers();
  questions = (await loadQuestions()).questions;
});

const START = '2026-11-05';
const decide = (customer: Customer, answers = {}) =>
  evaluateEligibility({
    customer,
    answers,
    startDate: START,
    financedCents: 100_000,
    monthlyGrossRentCents: 5_000,
    monthlyNetIncomeCents: 300_000,
  });

describe('answersFromCustomer / customerFromAnswers', () => {
  it('round-trips all 10 customers: same customer, same eligibility result', () => {
    expect(customers).toHaveLength(10);
    for (const c of customers) {
      const answers = answersFromCustomer(c);
      const back = customerFromAnswers(c, answers);
      expect(back, c.id).toEqual(c);
      expect(decide(back, answers), c.id).toEqual(decide(c));
    }
  });

  it('uses only q_customer_type values that questions.json offers', () => {
    const options = questions.find((q) => q.id === 'q_customer_type')?.options;
    for (const c of customers) expect(options).toContain(answersFromCustomer(c).q_customer_type);
  });

  it('Mikko answering an adult birth date is still MIN_AGE (the record wins)', () => {
    const mikko = customers.find((c) => c.id === 'cust-mikko')!;
    const back = customerFromAnswers(mikko, {
      ...answersFromCustomer(mikko),
      q_birth_date: '2000-01-01',
      q_country: 'SE',
    });
    expect(back).toEqual(mikko);
    expect(decide(back).reasons.map((r) => r.code)).toContain('MIN_AGE');
  });

  it('Norvi answering sole_trader still SIGNATORY_REQUIRED', () => {
    const norvi = customers.find((c) => c.id === 'cust-norvi')!;
    const back = customerFromAnswers(norvi, {
      q_customer_type: 'sole_trader',
      q_birth_date: '1980-01-01',
      q_business_id: '1234567-8',
      q_can_sign: 'yes',
    });
    expect(back.type).toBe('company');
    expect(back.type === 'company' && back.applicant_can_sign).toBe(false);
    expect(decide(back).reasons.map((r) => r.code)).toContain('SIGNATORY_REQUIRED');
  });

  it('q_pep = yes only adds PEP; q_pep = no never removes it', () => {
    const haapala = customers.find((c) => c.id === 'cust-haapala')!;
    const aino = customers.find((c) => c.id === 'cust-aino')!;
    const codes = (c: Customer, answers: Record<string, string>) =>
      decide(customerFromAnswers(c, answers), answers).reasons.map((r) => r.code);
    expect(haapala.is_pep).toBe(true);
    expect(codes(haapala, { q_pep: 'no' })).toContain('PEP_MANUAL_REVIEW');
    expect(codes(aino, { q_pep: 'yes' })).toContain('PEP_MANUAL_REVIEW');
    expect(codes(aino, {})).not.toContain('PEP_MANUAL_REVIEW');
  });

  it('RECORD_QUESTION_IDS are exactly the identity questions', () => {
    expect(RECORD_QUESTION_IDS).toEqual([
      'q_customer_type',
      'q_birth_date',
      'q_country',
      'q_business_id',
    ]);
  });

  it('answers that are not record facts still override: email and income', () => {
    const aino = customers.find((c) => c.id === 'cust-aino')!;
    const back = customerFromAnswers(aino, {
      q_email: 'new@example.com',
      q_monthly_income: 12_300,
    });
    expect(back).toMatchObject({ email: 'new@example.com', monthly_net_income_cents: 12_300 });
  });
});

describe('missingQuestionIds', () => {
  const deal = dealFor({
    customerType: 'consumer',
    category: 'e_bike',
    financedCents: 300_000,
    termMonths: 12,
  });
  const full = {
    q_full_name: 'A B',
    q_email: 'a@b.fi',
    q_employment: 'student',
    q_monthly_income: 90_000,
    q_usage_purpose: 'leisure',
  };

  it('is empty when every visible question has a valid answer (record questions need none)', () => {
    expect(missingQuestionIds(questions, deal, full)).toEqual([]);
  });

  it.each([
    ['absent', undefined],
    ['wrong type', 'lots'],
    ['negative', -1],
    ['fractional', 1.5],
  ])('money answer %s counts as missing', (_n, value) => {
    const answers = { ...full, q_monthly_income: value } as never;
    expect(missingQuestionIds(questions, deal, answers)).toEqual(['q_monthly_income']);
  });

  it('a choice outside the options and blank text count as missing', () => {
    expect(
      missingQuestionIds(questions, deal, { ...full, q_employment: 'astronaut', q_full_name: '  ' })
    ).toEqual(['q_full_name', 'q_employment']);
  });

  it('a question the deal does not show is never missing', () => {
    const small = { ...deal, financed_amount_cents: 100_000 };
    const answers = { ...full, q_monthly_income: undefined } as never;
    expect(missingQuestionIds(questions, small, answers)).toEqual([]);
  });
});

describe('dealFor', () => {
  it('maps to the ask_when deal fields', () => {
    expect(
      dealFor({ customerType: 'company', category: 'laptop', financedCents: 5, termMonths: 24 })
    ).toEqual({
      customer_type: 'company',
      category: 'laptop',
      financed_amount_cents: 5,
      term_months: 24,
    });
  });
});
