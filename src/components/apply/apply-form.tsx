'use client';

// The application form. All state lives here; which questions show, and which answers are
// cleared, is computed with the domain (question-flow, application), never in the JSX.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CoefficientTable, Customer, Question } from '@/data/schemas';
import {
  answersFromCustomer,
  customerFromAnswers,
  dealFor,
  recordQuestionIds,
} from '@/domain/application';
import { maxDownPaymentCents } from '@/domain/down-payment';
import { formatEuro } from '@/domain/money';
import {
  pruneAnswers,
  visibleQuestions,
  type AnswerValue,
  type Answers,
} from '@/domain/question-flow';
import type { TermMonths } from '@/domain/types';
import { getT } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
import { centsToEuroText, parseEuroToCents, TERMS, tOr } from './helpers';
import { QuestionField } from './question-field';
import { ResultPanel, type ApplyResult } from './result-panel';

export type ApplyAsset = {
  id: string;
  label: string;
  category: string;
  status: 'available' | 'reserved' | 'returned';
  priceCents: number;
};

export type ApplyInitial = {
  customerId: string;
  assetId: string;
  term: TermMonths;
  downCents: number;
};

type Props = {
  locale: Locale;
  questions: Question[];
  customers: Customer[];
  assets: ApplyAsset[];
  /** For the down payment limit: the same rule as the quote page. */
  table: CoefficientTable;
  initial: ApplyInitial;
};

type Inputs = {
  customerId: string;
  assetId: string;
  term: TermMonths;
  downText: string;
};

const field =
  'mt-2 block min-h-11 w-full rounded-lg border border-stone-400 bg-white px-3 py-2 text-base text-stone-900 aria-[invalid=true]:border-red-700 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100 dark:aria-[invalid=true]:border-red-400';
const sectionClass =
  'rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6 dark:border-stone-800 dark:bg-stone-900';
const help = 'mt-1 text-sm text-stone-700 dark:text-stone-300';
const errorText = 'font-medium text-red-800 dark:text-red-300';

const filled = (v: AnswerValue | undefined) =>
  v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0);
const parseDown = (text: string) => (text.trim() === '' ? 0 : parseEuroToCents(text));

function dealOf(
  customer: Customer,
  asset: ApplyAsset,
  downCents: number,
  term: TermMonths,
  answers: Answers
) {
  return dealFor({
    customerType: customerFromAnswers(customer, answers).type,
    category: asset.category,
    financedCents: Math.max(0, asset.priceCents - downCents),
    termMonths: term,
  });
}

export function ApplyForm({ locale, questions, customers, assets, table, initial }: Props) {
  const t = useMemo(() => getT(locale), [locale]);
  const money = (cents: number) => formatEuro(cents, intlLocale[locale]);
  // The page renders this form only when there is at least one person and one item.
  const pick = (customerId: string, assetId: string) => {
    const customer = customers.find((c) => c.id === customerId) ?? customers[0];
    const asset = assets.find((a) => a.id === assetId) ?? assets[0];
    if (!customer || !asset) throw new Error('ApplyForm needs customers and assets');
    return { customer, asset };
  };

  const [inputs, setInputs] = useState<Inputs>({
    customerId: initial.customerId,
    assetId: initial.assetId,
    term: initial.term,
    downText: initial.downCents === 0 ? '' : centsToEuroText(initial.downCents),
  });
  const [answers, setAnswers] = useState<Answers>(() => {
    const { customer, asset } = pick(initial.customerId, initial.assetId);
    const start = answersFromCustomer(customer);
    const deal = dealOf(customer, asset, initial.downCents, initial.term, start);
    return pruneAnswers(questions, deal, start).answers;
  });
  const [cleared, setCleared] = useState<string[]>([]);
  const [showErrors, setShowErrors] = useState(false);
  const [sending, setSending] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [result, setResult] = useState<ApplyResult | null>(null);
  const [tries, setTries] = useState(0);
  const resultRef = useRef<HTMLHeadingElement>(null);
  const apiErrorRef = useRef<HTMLDivElement>(null);

  // After the commit, so the target exists: result heading, or the first invalid field.
  useEffect(() => {
    if (result) resultRef.current?.focus();
  }, [result]);
  // The submit button is disabled while sending, so focus would be lost: take it to the error.
  useEffect(() => {
    if (apiError) apiErrorRef.current?.focus();
  }, [apiError]);
  useEffect(() => {
    if (tries > 0) document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [tries]);

  const { customer, asset } = pick(inputs.customerId, inputs.assetId);
  const downCents = parseDown(inputs.downText);
  const listCents = asset.priceCents;
  // Same limit as the quote page: at most half the price, at least 300 € left to finance.
  const maxDownCents = maxDownPaymentCents(table, listCents);
  const downTooHigh = downCents !== null && downCents > 0 && downCents > maxDownCents;
  const deal = dealOf(customer, asset, downCents ?? 0, inputs.term, answers);
  const visible = visibleQuestions(questions, deal, answers);
  const missing = visible.filter(
    (q) => !filled(answers[q.id]) || (q.type === 'email' && !String(answers[q.id]).includes('@'))
  );
  const unavailable = asset.status !== 'available';
  const dealErrors = downCents === null || downTooHigh || unavailable;
  const bad = (isBad: boolean) => showErrors && isBad;

  /** Applies a change, then drops the answers that no longer apply and says which. */
  function change(next: Inputs, nextAnswers: Answers, announce = true) {
    const picked = pick(next.customerId, next.assetId);
    const nextDeal = dealOf(
      picked.customer,
      picked.asset,
      parseDown(next.downText) ?? 0,
      next.term,
      nextAnswers
    );
    const pruned = pruneAnswers(questions, nextDeal, nextAnswers);
    setInputs(next);
    setAnswers(pruned.answers);
    setCleared(announce ? pruned.dropped : []);
  }

  const setInput = (patch: Partial<Inputs>) => change({ ...inputs, ...patch }, answers);
  const setAnswer = (id: string, value: AnswerValue | undefined) => {
    const rest = Object.fromEntries(Object.entries(answers).filter(([key]) => key !== id));
    change(inputs, value === undefined ? rest : { ...rest, [id]: value });
  };

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setApiError(null);
    if (missing.length > 0 || dealErrors) {
      setShowErrors(true);
      setTries((n) => n + 1);
      return;
    }
    setSending(true);
    try {
      const response = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          customerId: customer.id,
          items: [{ assetId: asset.id, quantity: 1 }],
          termMonths: inputs.term,
          downPaymentCents: downCents,
          answers,
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        success?: boolean;
        data?: Partial<ApplyResult>;
        error?: { code?: string };
      } | null;
      if (body?.success && body.data?.decision && Array.isArray(body.data.reasons)) {
        setResult(body.data as ApplyResult);
      } else {
        // Never show the server's own message: map the stable code to our own words.
        setApiError(tOr(t, `apply.error.${body?.error?.code ?? ''}`, t('apply.error.generic')));
      }
    } catch {
      setApiError(t('apply.error.generic'));
    } finally {
      setSending(false);
    }
  }

  if (result) {
    return (
      <ResultPanel
        ref={resultRef}
        result={result}
        answers={answers}
        locale={locale}
        t={t}
        onEdit={() => setResult(null)}
      />
    );
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      <section aria-labelledby="deal-title" className={sectionClass}>
        <h2 id="deal-title" className="text-xl font-semibold">
          1. {t('apply.deal.title')}
        </h2>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="f-customer" className="text-base font-semibold">
              {t('apply.field.customer')}
            </label>
            <select
              id="f-customer"
              value={customer.id}
              aria-describedby="f-customer-help"
              onChange={(e) => {
                const next = pick(e.target.value, asset.id).customer;
                change({ ...inputs, customerId: next.id }, answersFromCustomer(next), false);
                setShowErrors(false);
              }}
              className={field}
            >
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({tOr(t, `apply.option.${c.type}`, c.type)})
                </option>
              ))}
            </select>
            <p id="f-customer-help" className={help}>
              {t('apply.field.customerHelp')}
            </p>
          </div>
          <div>
            <label htmlFor="f-asset" className="text-base font-semibold">
              {t('apply.field.asset')}
            </label>
            <select
              id="f-asset"
              value={asset.id}
              aria-describedby="f-asset-help"
              aria-invalid={bad(unavailable)}
              onChange={(e) => setInput({ assetId: e.target.value })}
              className={field}
            >
              {assets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
            <p id="f-asset-help" className={unavailable ? `${help} ${errorText}` : help}>
              {unavailable
                ? t('apply.notAvailable', { status: t(`status.${asset.status}`) })
                : t('apply.field.assetPrice', { price: money(asset.priceCents) })}
            </p>
          </div>
          <div>
            <label htmlFor="f-term" className="text-base font-semibold">
              {t('apply.field.term')}
            </label>
            <select
              id="f-term"
              value={inputs.term}
              onChange={(e) => setInput({ term: Number(e.target.value) as TermMonths })}
              className={field}
            >
              {TERMS.map((m) => (
                <option key={m} value={m}>
                  {t('apply.term.option', { months: m })}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="f-down" className="text-base font-semibold">
              {t('apply.field.down')}
            </label>
            <input
              id="f-down"
              type="text"
              inputMode="decimal"
              value={inputs.downText}
              aria-invalid={bad(downCents === null || downTooHigh)}
              aria-describedby="f-down-help"
              onChange={(e) => setInput({ downText: e.target.value })}
              className={`${field} sm:max-w-xs`}
            />
            <p id="f-down-help" className={help}>
              {bad(downCents === null)
                ? t('apply.moneyBad')
                : bad(downTooHigh)
                  ? t('apply.downTooHigh', { max: money(maxDownCents) })
                  : t('apply.field.downHelp')}
            </p>
          </div>
        </div>
        <p className="mt-5 rounded-lg bg-stone-100 px-4 py-3 text-base dark:bg-stone-800">
          {t('apply.summary', {
            price: money(listCents),
            financed: money(Math.max(0, listCents - (downCents ?? 0))),
          })}
        </p>
      </section>

      <section aria-labelledby="you-title" className={sectionClass}>
        <h2 id="you-title" className="text-xl font-semibold">
          2. {t('apply.you.title')}
        </h2>
        <p className="mt-1 text-stone-700 dark:text-stone-300">{t('apply.you.intro')}</p>
        <div
          role="status"
          className={
            cleared.length > 0
              ? 'mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100'
              : undefined
          }
        >
          {cleared.length > 0
            ? t('apply.cleared', {
                list: cleared
                  .map((id) => questions.find((q) => q.id === id)?.text[locale] ?? id)
                  .join(', '),
              })
            : null}
        </div>
        <div className="mt-5 space-y-6">
          {visible.map((q) => (
            <QuestionField
              key={`${customer.id}-${q.id}`}
              question={q}
              locale={locale}
              t={t}
              value={answers[q.id]}
              invalid={bad(missing.includes(q))}
              fixed={recordQuestionIds(customer).includes(q.id) && filled(answers[q.id])}
              onChange={(v) => setAnswer(q.id, v)}
            />
          ))}
        </div>
      </section>

      <section aria-labelledby="send-title" className={sectionClass}>
        <h2 id="send-title" className="text-xl font-semibold">
          3. {t('apply.send.title')}
        </h2>
        <p className="mt-1 text-stone-700 dark:text-stone-300">{t('apply.send.intro')}</p>
        <div role="status" className={`mt-3 ${errorText}`}>
          {showErrors && (missing.length > 0 || dealErrors) ? t('apply.errors.fix') : null}
        </div>
        <div ref={apiErrorRef} tabIndex={-1} role="alert" className={`mt-3 ${errorText}`}>
          {apiError}
        </div>
        <button
          type="submit"
          disabled={sending}
          className="mt-4 min-h-12 rounded-full bg-emerald-700 px-6 py-3 text-lg font-semibold text-white hover:bg-emerald-800 disabled:opacity-60 dark:bg-emerald-600 dark:hover:bg-emerald-500"
        >
          {sending ? t('apply.sending') : t('apply.submit')}
        </button>
      </section>
    </form>
  );
}
