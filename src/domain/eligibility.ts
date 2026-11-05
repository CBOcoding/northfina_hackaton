// Eligibility: turns one application into a decision with reason codes, following the
// eligibility_rules in data/questions.json. Same input, same decision, same reasons.
import type { Customer } from '@/data/schemas';
import { isValidFinnishBusinessId } from './business-id';
import type { Answers } from './question-flow';
import type { ApplicationDecision, Cents, IsoDate } from './types';

// The limits below are copied from the data pack; eligibility.test.ts fails if they drift.
/** q_birth_date blocks_application_when age_under 18. */
export const MIN_AGE_YEARS = 18;
/** q_country options minus its blocking answer "other". */
export const RESIDENCY_COUNTRIES: readonly string[] = ['FI', 'SE', 'EE'];
/** Rule "affordability": rent incl. VAT at most 30 % of monthly net income (consumers). */
export const AFFORDABILITY_MAX_PERCENT = 30;
/** Rule "financed_limits": first and last coefficient-table band, both ends included. */
export const FINANCED_MIN_CENTS = 30_000;
export const FINANCED_MAX_CENTS = 25_000_000;

export type ReasonCode =
  | 'MIN_AGE'
  | 'RESIDENCY'
  | 'AFFORDABILITY_EXCEEDED'
  | 'AFFORDABILITY_NOT_ASSESSED'
  | 'BUSINESS_ID_INVALID'
  | 'PEP_MANUAL_REVIEW'
  | 'FINANCED_OUT_OF_RANGE'
  | 'SIGNATORY_REQUIRED';

/** `rule_id` is an `eligibility_rules[].id`; absent when no data rule covers the reason. */
export type Reason = { code: ReasonCode; rule_id?: string };

export type EligibilityResult = { decision: ApplicationDecision; reasons: Reason[] };

export type EligibilityInput = {
  customer: Customer;
  answers: Answers;
  /** Contract start date, chosen by the caller. Age is measured on this day. */
  startDate: IsoDate;
  financedCents: Cents;
  /** Consumer monthly rent incl. VAT, from pricing. `null` = unknown, not assessed. */
  monthlyGrossRentCents: Cents | null;
  /** Consumer monthly net income (q_monthly_income). `null` = not asked, not assessed. */
  monthlyNetIncomeCents: Cents | null;
};

/** What each code does to the decision. `null` = informational, never changes it. */
const EFFECT: Record<ReasonCode, ApplicationDecision | null> = {
  MIN_AGE: 'rejected',
  RESIDENCY: 'rejected',
  AFFORDABILITY_EXCEEDED: 'rejected',
  BUSINESS_ID_INVALID: 'rejected',
  FINANCED_OUT_OF_RANGE: 'rejected',
  PEP_MANUAL_REVIEW: 'manual_review',
  SIGNATORY_REQUIRED: 'pending',
  AFFORDABILITY_NOT_ASSESSED: null,
};

/** Strongest first: reject > manual_review > pending > approved. */
const PRECEDENCE: readonly ApplicationDecision[] = ['rejected', 'manual_review', 'pending'];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Full years between two ISO dates. Calendar maths on the strings, no Date object.
 * Someone born on 29 Feb turns a year older on 1 Mar in non-leap years (the cautious reading).
 */
export function ageOn(birthDate: IsoDate, onDate: IsoDate): number {
  if (!ISO_DATE.test(birthDate) || !ISO_DATE.test(onDate)) {
    throw new RangeError(`dates must look like YYYY-MM-DD, got "${birthDate}", "${onDate}"`);
  }
  const years = Number(onDate.slice(0, 4)) - Number(birthDate.slice(0, 4));
  return onDate.slice(5) < birthDate.slice(5) ? years - 1 : years;
}

/**
 * Checks every rule and returns all reasons that apply, in the fixed order below, so a
 * rejected PEP applicant still shows both codes. The decision is the strongest effect.
 */
export function evaluateEligibility(input: EligibilityInput): EligibilityResult {
  const { customer, answers, startDate, financedCents } = input;
  if (!ISO_DATE.test(startDate)) {
    throw new RangeError(`startDate must look like YYYY-MM-DD, got "${startDate}"`);
  }
  // NaN, fractions or negatives would make every comparison false and silently approve.
  const amounts = {
    financedCents,
    monthlyGrossRentCents: input.monthlyGrossRentCents ?? 0,
    monthlyNetIncomeCents: input.monthlyNetIncomeCents ?? 0,
  };
  for (const [name, cents] of Object.entries(amounts)) {
    if (!Number.isSafeInteger(cents) || cents < 0) {
      throw new RangeError(`${name} must be a non-negative whole number of cents, got ${cents}`);
    }
  }
  const reasons: Reason[] = [];

  if (customer.type !== 'company' && ageOn(customer.birth_date, startDate) < MIN_AGE_YEARS) {
    reasons.push({ code: 'MIN_AGE', rule_id: 'min_age' });
  }

  if (!RESIDENCY_COUNTRIES.includes(customer.country)) {
    reasons.push({ code: 'RESIDENCY', rule_id: 'residency' });
  }

  if (customer.type === 'consumer') {
    const rent = input.monthlyGrossRentCents;
    const income = input.monthlyNetIncomeCents;
    if (rent === null || income === null) {
      reasons.push({ code: 'AFFORDABILITY_NOT_ASSESSED', rule_id: 'affordability' });
    } else if (rent * 100 > income * AFFORDABILITY_MAX_PERCENT) {
      // Integer comparison: rent / income <= 30 % without dividing cents.
      reasons.push({ code: 'AFFORDABILITY_EXCEEDED', rule_id: 'affordability' });
    }
  }

  if (customer.type !== 'consumer' && !isValidFinnishBusinessId(customer.business_id)) {
    reasons.push({ code: 'BUSINESS_ID_INVALID', rule_id: 'business_id' });
  }

  if (customer.is_pep || answers.q_pep === 'yes') {
    reasons.push({ code: 'PEP_MANUAL_REVIEW', rule_id: 'pep_manual_review' });
  }

  if (financedCents < FINANCED_MIN_CENTS || financedCents > FINANCED_MAX_CENTS) {
    reasons.push({ code: 'FINANCED_OUT_OF_RANGE', rule_id: 'financed_limits' });
  }

  // No data rule for this one: the contract waits for an authorised signatory
  // (q_signatory_email). Either source saying "cannot sign" is enough.
  // A "yes" answer never overrides the record: signing rights are a fact, not a self-claim.
  if (
    customer.type === 'company' &&
    (answers.q_can_sign === 'no' || !customer.applicant_can_sign)
  ) {
    reasons.push({ code: 'SIGNATORY_REQUIRED' });
  }

  const effects = new Set(reasons.map((r) => EFFECT[r.code]));
  const decision = PRECEDENCE.find((d) => effects.has(d)) ?? 'approved';
  return { decision, reasons };
}
