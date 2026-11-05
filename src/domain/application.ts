// Application: bridges the question form and the eligibility rules.
// A demo persona (data/customers.json) prefills the answers; whatever the applicant answers
// then overrides the persona, and the result is the customer the rules are checked against.
import type { Customer } from '@/data/schemas';
import type { Answers, Deal } from './question-flow';
import type { Cents, TermMonths } from './types';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** A birth date nobody can have: age comes out negative, so an unknown date fails MIN_AGE. */
const UNKNOWN_BIRTH_DATE = '9999-12-31';

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
 * The customer the rules see: `answers` override `base`. Missing facts fall back to `base`,
 * then to the cautious value (unknown birth date fails, no signing right, no income).
 * Two facts are never taken from answers: `is_pep` (q_pep is read by eligibility itself) and,
 * for a company, `applicant_can_sign` (a "yes" must not override the record).
 */
export function customerFromAnswers(base: Customer, answers: Answers): Customer {
  const type = text(answers.q_customer_type) ?? base.type;
  const pick = <K extends string>(key: K) => (base as Record<string, unknown>)[key];
  const common = {
    id: base.id,
    city: base.city,
    story: base.story,
    email: text(answers.q_email) ?? base.email,
    // Not a two-letter code if the applicant chose "other": eligibility rejects it either way.
    country: text(answers.q_country) ?? base.country,
    is_pep: base.is_pep,
  };
  const yesNo = (v: unknown, fallback: unknown) =>
    v === 'yes' ? true : v === 'no' ? false : fallback === true;
  const businessId = text(answers.q_business_id) ?? text(pick('business_id')) ?? '';
  const vat = yesNo(answers.q_vat_registered, pick('vat_registered'));
  const birth = text(answers.q_birth_date) ?? text(pick('birth_date'));
  const birth_date = birth !== undefined && ISO_DATE.test(birth) ? birth : UNKNOWN_BIRTH_DATE;

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
