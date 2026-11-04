# src/domain: the business rules

This folder holds the rules of Lease Loop as plain functions. Most of your
hackathon work belongs here.

## Rules for this folder

1. **Pure.** No database, no files, no network, no `process.env`, no framework imports.
   A function gets everything it needs as arguments and returns a value.
2. **Deterministic.** No `Date.now()`, `new Date()` or `Math.random()`. Dates come in as
   ISO strings (`YYYY-MM-DD`) chosen by the caller. The same input always gives the same output.
3. **Money is integer cents.** `189900` means 1 899,00 €. Do not use floats for money, and
   decide on purpose where you round (and say so in a comment).
4. **Expected failures are values, not exceptions.** "This amount cannot be financed" is an
   answer the UI must show, so return a result such as
   `{ ok: false, reason: 'below_minimum' }`. Throw only for bugs (for example, a fraction of
   a cent).
5. **Every function has tests.** Put them next to the code (`pricing.ts` → `pricing.test.ts`)
   and test the edges: band limits, the first and last day of a date range, zero, empty lists.

ESLint enforces rules 1 and 2 for this folder (see `eslint.config.mjs`).

## What is here

| File             | What it does                                                             |
| ---------------- | ------------------------------------------------------------------------ |
| `coefficient.ts` | Worked example: finds the monthly factor for a financed amount and term. |
| `price-list.ts`  | Worked example: finds the net list price of an asset on a date.          |
| `money.ts`       | Formats cents as euros for a locale. Use it only in the UI.              |

## What teams are expected to add

Create these as you need them. Do not commit empty files.

- `pricing`: monthly rent, down payment, VAT and the end-of-term buyout price.
- `question-flow`: which question to ask next, from `data/questions.json`, and what happens
  to answers that stop applying.
- `contract`: build the contract from an approved application and lock it so it cannot change.
- `invoicing`: the monthly invoices for a contract, including a VAT rate change mid-contract.
- `end-of-term`: return, buy out or extend, and the value of the returned item.
- `second-life`: refurbishment cost, matching a returned item to the waiting list, CO2 saved.
