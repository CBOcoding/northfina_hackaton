import { beforeAll, describe, expect, it } from 'vitest';
import { loadQuestions } from '@/data/load';
import type { Question } from '@/data/schemas';
import { pruneAnswers, visibleQuestions, type Answers, type Deal } from './question-flow';

// Tests run against the real question bank, so a changed data file shows up here.
let bank: Question[];
beforeAll(async () => {
  bank = (await loadQuestions()).questions;
});

const ids = (questions: readonly Question[]) => questions.map((q) => q.id);

/** A synthetic question; only the fields the engine reads matter. */
const q = (id: string, ask_when: Question['ask_when']): Question => ({
  id,
  type: 'text',
  text: { en: id, fi: id, sv: id, et: id },
  why_we_ask: { en: id },
  ask_when,
});

describe('visibleQuestions', () => {
  it('asks only the always-questions before the customer type is known', () => {
    expect(ids(visibleQuestions(bank, {}, {}))).toEqual(['q_customer_type', 'q_email']);
  });

  it('targets a small consumer e-bike lease (no income question below 2000 €)', () => {
    const deal: Deal = { category: 'e_bike', financed_amount_cents: 189_900, term_months: 24 };
    expect(ids(visibleQuestions(bank, deal, { q_customer_type: 'consumer' }))).toEqual([
      'q_customer_type',
      'q_full_name',
      'q_birth_date',
      'q_email',
      'q_country',
      'q_employment',
      'q_usage_purpose',
    ]);
  });

  it('asks for income from exactly 200 000 cents (gte is inclusive)', () => {
    const answers = { q_customer_type: 'consumer' };
    const at = visibleQuestions(bank, { financed_amount_cents: 200_000 }, answers);
    const below = visibleQuestions(bank, { financed_amount_cents: 199_999 }, answers);
    expect(ids(at)).toContain('q_monthly_income');
    expect(ids(below)).not.toContain('q_monthly_income');
  });

  it('card 7: a 125 000 € farm-machine company lease adds revenue, owners and PEP questions', () => {
    const deal: Deal = {
      category: 'farm_machine',
      financed_amount_cents: 12_500_000,
      term_months: 48,
    };
    const answers = { q_customer_type: 'company', q_can_sign: 'yes', q_pep: 'yes' };
    expect(ids(visibleQuestions(bank, deal, answers))).toEqual([
      'q_customer_type',
      'q_email',
      'q_business_id',
      'q_company_name',
      'q_can_sign',
      'q_vat_registered',
      'q_farm_registry',
      'q_annual_revenue',
      'q_beneficial_owners',
      'q_pep',
      'q_pep_details',
    ]);
  });

  it('asks for the signatory email only when the applicant cannot sign', () => {
    const deal: Deal = { financed_amount_cents: 2_196_000 };
    const no = visibleQuestions(bank, deal, { q_customer_type: 'company', q_can_sign: 'no' });
    const yes = visibleQuestions(bank, deal, { q_customer_type: 'company', q_can_sign: 'yes' });
    expect(ids(no)).toContain('q_signatory_email');
    expect(ids(yes)).not.toContain('q_signatory_email');
  });

  it('lets the q_customer_type answer win over the deal customer type', () => {
    const visible = visibleQuestions(
      bank,
      { customer_type: 'company' },
      { q_customer_type: 'consumer' }
    );
    expect(ids(visible)).toContain('q_full_name');
    expect(ids(visible)).not.toContain('q_company_name');
  });

  it('falls back to the deal customer type when there is no answer yet', () => {
    expect(ids(visibleQuestions(bank, { customer_type: 'company' }, {}))).toContain(
      'q_company_name'
    );
  });

  it('supports lte, numbers in "in", and treats missing fields as false', () => {
    const synthetic = [
      q('q_short', [{ field: 'term_months', op: 'lte', value: 24 }]),
      q('q_term_36', [{ field: 'term_months', op: 'in', value: ['36'] }]),
    ];
    expect(ids(visibleQuestions(synthetic, { term_months: 24 }, {}))).toEqual(['q_short']);
    expect(ids(visibleQuestions(synthetic, { term_months: 36 }, {}))).toEqual(['q_term_36']);
    expect(visibleQuestions(synthetic, {}, {})).toEqual([]);
  });

  it('does not compare a text answer with gte', () => {
    const synthetic = [q('q_big', [{ field: 'answers.q_amount', op: 'gte', value: 1 }])];
    expect(visibleQuestions(synthetic, {}, { q_amount: '5' })).toEqual([]);
    expect(ids(visibleQuestions(synthetic, {}, { q_amount: 5 }))).toEqual(['q_big']);
  });
});

describe('pruneAnswers', () => {
  const companyAnswers: Answers = {
    q_customer_type: 'company',
    q_email: 'fleet@norvi.example.com',
    q_business_id: '3299871-7',
    q_company_name: 'Norvi Logistics Oy',
    q_can_sign: 'no',
    q_signatory_email: 'ceo@norvi.example.com',
    q_vat_registered: 'yes',
  };
  const deal: Deal = { category: 'e_bike', financed_amount_cents: 2_196_000, term_months: 36 };

  it('keeps every answer while all questions still apply', () => {
    expect(pruneAnswers(bank, deal, companyAnswers)).toEqual({
      answers: companyAnswers,
      dropped: [],
    });
  });

  it('changing q_customer_type company -> consumer drops the business and company answers', () => {
    const result = pruneAnswers(bank, deal, { ...companyAnswers, q_customer_type: 'consumer' });
    expect(result.answers).toEqual({
      q_customer_type: 'consumer',
      q_email: 'fleet@norvi.example.com',
    });
    expect(result.dropped.sort()).toEqual([
      'q_business_id',
      'q_can_sign',
      'q_company_name',
      'q_signatory_email',
      'q_vat_registered',
    ]);
  });

  it('changing q_can_sign no -> yes drops q_signatory_email', () => {
    const result = pruneAnswers(bank, deal, { ...companyAnswers, q_can_sign: 'yes' });
    const { q_signatory_email: _dropped, ...rest } = companyAnswers;
    expect(result.dropped).toEqual(['q_signatory_email']);
    expect(result.answers).toStrictEqual({ ...rest, q_can_sign: 'yes' });
  });

  it('changing q_pep yes -> no drops q_pep_details', () => {
    const answers = { q_customer_type: 'company', q_pep: 'no', q_pep_details: 'MP since 2019' };
    expect(pruneAnswers(bank, deal, answers).dropped).toEqual(['q_pep_details']);
  });

  it('a smaller deal drops q_pep and q_pep_details together', () => {
    const answers = { q_customer_type: 'consumer', q_pep: 'yes', q_pep_details: 'MP since 2019' };
    const result = pruneAnswers(bank, { financed_amount_cents: 999_999 }, answers);
    expect(result.answers).toEqual({ q_customer_type: 'consumer' });
  });

  it('repeats until stable when one drop hides the next question (a -> b -> c)', () => {
    const chain = [
      q('q_a', []),
      q('q_b', [{ field: 'answers.q_a', op: 'in', value: ['yes'] }]),
      q('q_c', [{ field: 'answers.q_b', op: 'in', value: ['yes'] }]),
    ];
    const result = pruneAnswers(chain, {}, { q_a: 'no', q_b: 'yes', q_c: 'yes' });
    expect(result).toEqual({ answers: { q_a: 'no' }, dropped: ['q_b', 'q_c'] });
  });

  it('drops answers to question ids that are not in the bank', () => {
    expect(pruneAnswers(bank, {}, { q_customer_type: 'consumer', q_ghost: 'x' }).dropped).toEqual([
      'q_ghost',
    ]);
  });

  it('does not change the answers it was given', () => {
    const answers: Answers = { ...companyAnswers, q_can_sign: 'yes' };
    pruneAnswers(bank, deal, answers);
    expect(answers.q_signatory_email).toBe('ceo@norvi.example.com');
  });

  it('returns empty for empty answers', () => {
    expect(pruneAnswers(bank, deal, {})).toEqual({ answers: {}, dropped: [] });
  });
});
