// Application: bridges the question form and the eligibility rules.
// A demo persona (data/customers.json) prefills the answers; the applicant's answers fill in
// the rest, but never the verified identity fields (RECORD_QUESTION_IDS). The result is the
// customer the rules are checked against.
import type { Customer, Question } from '@/data/schemas';
import { visibleQuestions, type Answers, type Deal } from './question-flow';
import type { Cents, TermMonths } from './types';

/** A birth date nobody can have: age comes out negative, so an unknown date fails MIN_AGE. */
const UNKNOWN_BIRTH_DATE = '9999-12-31';

/** Identity questions the customer record answers. The record is verified, so answers to these are ignored. */
export const RECORD_QUESTION_IDS = [
  'q_customer_type',
  'q_birth_date',
  'q_country',
  'q_business_id',
] as const;

/**
 * Questions the record answers for this customer: the identity ones always, and q_can_sign when
 * the record says the applicant cannot sign (a "yes" must not give them that right).
 */
export function recordQuestionIds(base: Customer): string[] {
  const ids: string[] = [...RECORD_QUESTION_IDS];
  if (base.type === 'company' && !base.applicant_can_sign) ids.push('q_can_sign');
  return ids;
}

/** `answers` with every record question answered by the record (removed if the record has no answer). */
export function withRecordAnswers(base: Customer, answers: Answers): Answers {
  const given: Record<string, Answers[string]> = { ...answers };
  const fromRecord = answersFromCustomer(base);
  for (const id of recordQuestionIds(base)) {
    if (fromRecord[id] === undefined) delete given[id];
    else given[id] = fromRecord[id];
  }
  return given;
}

/** The answers a persona would give, keyed by question id. Questions that do not apply are pruned later. */
export function answersFromCustomer(customer: Customer): Answers {
  const answers: Record<string, string | number | readonly string[]> = {
    q_customer_type: customer.type,
    q_email: customer.email,
    q_pep: customer.is_pep ? 'yes' : 'no',
  };
  if (customer.type === 'company') {
    answers.q_company_name = customer.name;
    answers.q_can_sign = customer.applicant_can_sign ? 'yes' : 'no';
    answers.q_annual_revenue = customer.annual_revenue_cents;
    if (customer.beneficial_owners) answers.q_beneficial_owners = customer.beneficial_owners;
  } else {
    answers.q_full_name = customer.name;
    answers.q_birth_date = customer.birth_date;
    answers.q_country = customer.country;
  }
  if (customer.type === 'consumer') {
    answers.q_employment = customer.employment;
    answers.q_monthly_income = customer.monthly_net_income_cents;
  } else {
    answers.q_business_id = customer.business_id;
    answers.q_vat_registered = customer.vat_registered ? 'yes' : 'no';
  }
  return answers;
}

const text = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const cents = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : undefined;

/**
 * The customer the rules see: `base` (the verified record) plus the applicant's answers.
 * Never taken from answers: the RECORD_QUESTION_IDS fields (type, birth date, country, business id),
 * `is_pep` (q_pep = yes can only add PEP, eligibility reads it itself) and, for a company,
 * `applicant_can_sign` (a "yes" must not override the record). Missing facts fall back to the
 * cautious value (no signing right, no income).
 */
export function customerFromAnswers(base: Customer, answers: Answers): Customer {
  const type = base.type;
  const pick = <K extends string>(key: K) => (base as Record<string, unknown>)[key];
  const common = {
    id: base.id,
    city: base.city,
    story: base.story,
    email: text(answers.q_email) ?? base.email,
    country: base.country,
    is_pep: base.is_pep,
  };
  const yesNo = (v: unknown, fallback: unknown) =>
    v === 'yes' ? true : v === 'no' ? false : fallback === true;
  const businessId = text(pick('business_id')) ?? '';
  const vat = yesNo(answers.q_vat_registered, pick('vat_registered'));
  const birth_date = text(pick('birth_date')) ?? UNKNOWN_BIRTH_DATE;

  if (type === 'company') {
    return {
      ...common,
      type: 'company',
      name: text(answers.q_company_name) ?? base.name,
      business_id: businessId,
      vat_registered: vat,
      annual_revenue_cents:
        cents(answers.q_annual_revenue) ?? cents(pick('annual_revenue_cents')) ?? 0,
      applicant_can_sign: base.type === 'company' ? base.applicant_can_sign : false,
      ...(Array.isArray(answers.q_beneficial_owners)
        ? { beneficial_owners: [...answers.q_beneficial_owners] }
        : base.type === 'company' && base.beneficial_owners
          ? { beneficial_owners: base.beneficial_owners }
          : {}),
    };
  }
  const person = { ...common, name: text(answers.q_full_name) ?? base.name, birth_date };
  if (type === 'sole_trader') {
    return { ...person, type: 'sole_trader', business_id: businessId, vat_registered: vat };
  }
  const employment = text(answers.q_employment) ?? text(pick('employment')) ?? 'unemployed';
  return {
    ...person,
    type: 'consumer',
    employment: employment as Extract<Customer, { type: 'consumer' }>['employment'],
    monthly_net_income_cents:
      cents(answers.q_monthly_income) ?? cents(pick('monthly_net_income_cents')) ?? 0,
  };
}

/** The deal fields `ask_when` looks at, from a quote in progress. */
export function dealFor(input: {
  customerType: string;
  category: string;
  financedCents: Cents;
  termMonths: TermMonths;
}): Deal {
  return {
    customer_type: input.customerType,
    category: input.category,
    financed_amount_cents: input.financedCents,
    term_months: input.termMonths,
  };
}

/** True when `answer` is a usable reply to `question` (right type, a listed option for choices). */
function isValidAnswer(question: Question, answer: unknown): boolean {
  switch (question.type) {
    case 'money':
      return cents(answer) !== undefined;
    case 'list':
      return Array.isArray(answer) && answer.length > 0;
    case 'choice':
      return typeof answer === 'string' && (question.options ?? []).includes(answer);
    default:
      return typeof answer === 'string' && answer.trim() !== '';
  }
}

/**
 * Ids of the questions the deal shows that have no valid answer yet. Record questions are
 * skipped: the verified customer record answers them. Call it with the answers already pruned.
 */
export function missingQuestionIds(
  questions: readonly Question[],
  deal: Deal,
  answers: Answers
): string[] {
  const record: readonly string[] = RECORD_QUESTION_IDS;
  return visibleQuestions(questions, deal, answers)
    .filter((q) => !record.includes(q.id) && !isValidAnswer(q, answers[q.id]))
    .map((q) => q.id);
}
