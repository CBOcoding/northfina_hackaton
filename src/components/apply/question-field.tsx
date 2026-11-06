'use client';

// One question of the application form, drawn by its type. The "why we ask" line is tied to
// the input with aria-describedby, so a screen reader reads it with the question.
import { useState } from 'react';
import type { Question } from '@/data/schemas';
import type { AnswerValue } from '@/domain/question-flow';
import { messages, type Translate } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';
import { centsToEuroText, parseEuroToCents, tOr } from './helpers';

const inputClass =
  'mt-2 block min-h-11 w-full rounded-lg border border-stone-400 bg-white px-3 py-2 text-base text-stone-900 aria-[invalid=true]:border-red-700 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100 dark:aria-[invalid=true]:border-red-400';

type Props = {
  question: Question;
  locale: Locale;
  t: Translate;
  value: AnswerValue | undefined;
  invalid: boolean;
  /** From the verified customer record: shown, not editable. */
  fixed?: boolean;
  onChange: (value: AnswerValue | undefined) => void;
};

export function QuestionField({ question: q, locale, t, value, invalid, fixed, onChange }: Props) {
  const id = `q-${q.id}`;
  const whyId = `why-${q.id}`;
  const errorId = `err-${q.id}`;
  const describedBy = `${whyId}${invalid ? ` ${errorId}` : ''}`;
  const whyKey = `apply.why.${q.id}`;
  const why = tOr(t, whyKey, q.why_we_ask[locale] ?? q.why_we_ask.en);
  const text = q.text[locale];

  const hint = (
    <>
      <p
        id={whyId}
        lang={whyKey in messages.en || q.why_we_ask[locale] ? undefined : 'en'}
        className="mt-1 text-sm text-stone-700 dark:text-stone-300"
      >
        <span className="font-medium">{t('apply.whyLabel')}</span> {why}
      </p>
      {invalid ? (
        <p id={errorId} className="mt-1 text-sm font-medium text-red-800 dark:text-red-300">
          {t('apply.required')}
        </p>
      ) : null}
    </>
  );

  if (fixed) {
    const shown =
      typeof value === 'string' ? tOr(t, `apply.option.${value}`, value) : String(value);
    return (
      <div>
        <p id={id} className="text-base font-semibold">
          {text}
        </p>
        <p
          aria-describedby={whyId}
          className="mt-2 min-h-11 rounded-lg bg-stone-100 px-3 py-2 text-base dark:bg-stone-800"
        >
          {shown}
        </p>
        <p className="mt-1 text-sm text-stone-700 dark:text-stone-300">{t('apply.fromRecord')}</p>
        {hint}
      </div>
    );
  }

  if (q.type === 'choice') {
    return (
      <fieldset aria-describedby={describedBy} className="min-w-0">
        <legend className="text-base font-semibold">{text}</legend>
        {hint}
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {(q.options ?? []).map((option) => (
            <label
              key={option}
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-stone-300 bg-white px-3 py-2 has-checked:border-emerald-700 has-checked:bg-emerald-50 dark:border-stone-700 dark:bg-stone-900 dark:has-checked:border-emerald-500 dark:has-checked:bg-emerald-950"
            >
              <input
                type="radio"
                name={q.id}
                value={option}
                checked={value === option}
                onChange={() => onChange(option)}
                aria-invalid={invalid}
                className="size-5 accent-emerald-700"
              />
              <span>{tOr(t, `apply.option.${option}`, option)}</span>
            </label>
          ))}
        </div>
      </fieldset>
    );
  }

  return (
    <div>
      <label htmlFor={id} className="text-base font-semibold">
        {text}
      </label>
      {hint}
      {q.type === 'money' ? (
        <MoneyInput
          id={id}
          describedBy={describedBy}
          invalid={invalid}
          t={t}
          value={value}
          onChange={onChange}
        />
      ) : q.type === 'list' ? (
        <ListInput
          id={id}
          describedBy={describedBy}
          invalid={invalid}
          t={t}
          value={value}
          onChange={onChange}
        />
      ) : (
        <input
          id={id}
          type={q.type === 'date' ? 'date' : q.type === 'email' ? 'email' : 'text'}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)}
          aria-describedby={describedBy}
          aria-invalid={invalid}
          autoComplete={q.type === 'email' ? 'email' : undefined}
          className={inputClass}
        />
      )}
    </div>
  );
}

type InnerProps = {
  id: string;
  describedBy: string;
  invalid: boolean;
  t: Translate;
  value: AnswerValue | undefined;
  onChange: (value: AnswerValue | undefined) => void;
};

/** Euros on screen, integer cents in the answer. Keeps the typed text so "12." is not rewritten. */
function MoneyInput({ id, describedBy, invalid, t, value, onChange }: InnerProps) {
  const [text, setText] = useState(typeof value === 'number' ? centsToEuroText(value) : '');
  const bad = text !== '' && parseEuroToCents(text) === null;
  return (
    <>
      <div className="relative">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            onChange(parseEuroToCents(e.target.value) ?? undefined);
          }}
          aria-describedby={`${describedBy} ${id}-hint`}
          aria-invalid={invalid || bad}
          className={`${inputClass} pr-10`}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-3 mt-1 -translate-y-1/2 text-stone-600 dark:text-stone-400"
        >
          €
        </span>
      </div>
      <p id={`${id}-hint`} className="mt-1 text-sm text-stone-700 dark:text-stone-300">
        {bad ? t('apply.moneyBad') : t('apply.moneyHint')}
      </p>
    </>
  );
}

/** One entry per line, kept as typed so Enter and trailing spaces are not eaten. */
function ListInput({ id, describedBy, invalid, t, value, onChange }: InnerProps) {
  const [text, setText] = useState(Array.isArray(value) ? value.join('\n') : '');
  return (
    <>
      <textarea
        id={id}
        rows={3}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const lines = e.target.value
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean);
          onChange(lines.length > 0 ? lines : undefined);
        }}
        aria-describedby={`${describedBy} ${id}-hint`}
        aria-invalid={invalid}
        className={inputClass}
      />
      <p id={`${id}-hint`} className="mt-1 text-sm text-stone-700 dark:text-stone-300">
        {t('apply.listHint')}
      </p>
    </>
  );
}
