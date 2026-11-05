// Question flow: which questions of data/questions.json apply to a deal, and what happens
// to answers that stop applying when an earlier answer (or the deal) changes.
import type { AskWhenCondition, Question } from '@/data/schemas';

/** One answer: text, choice and date answers are strings, money is integer cents, lists are arrays. */
export type AnswerValue = string | number | readonly string[];

/** Answers by question id, e.g. `{ q_customer_type: 'company' }`. */
export type Answers = Readonly<Record<string, AnswerValue>>;

/** The deal fields `ask_when` can look at. A missing field makes conditions on it false. */
export type Deal = {
  customer_type?: string;
  category?: string;
  financed_amount_cents?: number;
  term_months?: number;
};

function fieldValue(field: string, deal: Deal, answers: Answers): AnswerValue | undefined {
  if (field.startsWith('answers.')) return answers[field.slice('answers.'.length)];
  // The applicant's own answer wins over the deal: changing it must re-target the form.
  if (field === 'customer_type') return answers.q_customer_type ?? deal.customer_type;
  return deal[field as keyof Deal];
}

function holds(condition: AskWhenCondition, deal: Deal, answers: Answers): boolean {
  const value = fieldValue(condition.field, deal, answers);
  if (condition.op === 'in') {
    return (
      (typeof value === 'string' || typeof value === 'number') &&
      condition.value.includes(String(value))
    );
  }
  if (typeof value !== 'number') return false;
  return condition.op === 'gte' ? value >= condition.value : value <= condition.value;
}

/** Questions to ask, in bank order: every `ask_when` condition holds (empty list = always). */
export function visibleQuestions(
  questions: readonly Question[],
  deal: Deal,
  answers: Answers
): Question[] {
  return questions.filter((q) => q.ask_when.every((c) => holds(c, deal, answers)));
}

/**
 * Drops every answer whose question is no longer visible (answers to unknown question ids
 * too). Repeats until nothing changes, because dropping one answer can hide a question that
 * depends on it (q_a -> q_b -> q_c). Ends after at most one round per answer.
 * `dropped` lists the removed question ids, so the UI can say what was cleared and why.
 */
export function pruneAnswers(
  questions: readonly Question[],
  deal: Deal,
  answers: Answers
): { answers: Answers; dropped: string[] } {
  let kept: Record<string, AnswerValue> = { ...answers };
  const dropped: string[] = [];
  for (;;) {
    const visible = new Set(visibleQuestions(questions, deal, kept).map((q) => q.id));
    const gone = Object.keys(kept).filter((id) => !visible.has(id));
    if (gone.length === 0) return { answers: kept, dropped };
    dropped.push(...gone);
    kept = Object.fromEntries(Object.entries(kept).filter(([id]) => visible.has(id)));
  }
}
