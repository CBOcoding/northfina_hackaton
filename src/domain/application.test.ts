import { beforeAll, describe, expect, it } from 'vitest';
import { loadCustomers, loadQuestions } from '@/data/load';
import type { Customer, Question } from '@/data/schemas';
import { answersFromCustomer, customerFromAnswers, dealFor } from './application';
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

  it('lets an answer override the persona: an adult birth date removes MIN_AGE for Mikko', () => {
    const mikko = customers.find((c) => c.id === 'cust-mikko')!;
    const codes = (c: Customer) => decide(c).reasons.map((r) => r.code);
    expect(codes(mikko)).toContain('MIN_AGE');
    const adult = customerFromAnswers(mikko, {
      ...answersFromCustomer(mikko),
      q_birth_date: '2000-01-01',
    });
    expect(codes(adult)).not.toContain('MIN_AGE');
  });

  it('switches type on q_customer_type and falls back to cautious values', () => {
    const aino = customers.find((c) => c.id === 'cust-aino')!;
    const company = customerFromAnswers(aino, { q_customer_type: 'company', q_can_sign: 'yes' });
    expect(company.type).toBe('company');
    // a "yes" never grants signing rights the record does not have
    expect(company.type === 'company' && company.applicant_can_sign).toBe(false);
    const noDate = customerFromAnswers(
      customers.find((c) => c.id === 'cust-norvi')!,
      {
        q_customer_type: 'consumer',
      }
    );
    expect(decide(noDate).reasons.map((r) => r.code)).toContain('MIN_AGE');
    const junk = customerFromAnswers(aino, { q_birth_date: 'not-a-date' });
    expect(decide(junk).reasons.map((r) => r.code)).toContain('MIN_AGE');
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
