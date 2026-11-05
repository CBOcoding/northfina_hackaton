# Team MagicLease: who builds what

Claudio Borromei and Gabriele Gargani. Smart Problems **1 · 5 · 6**, wildcard **time-travel slider**.

## Goal

- A demo that holds on Friday at 16:30: one asset goes the whole loop.
- Scenario cards 1–4 exact to the cent, with the explanation visible.
- Cards 5–10 don't crash and give a sensible answer.
- `npm run check:all` green, PR to upstream open before Friday 16:00.

**Cut order if behind:** time-travel polish → passport → early-exit detail.

## Streams

|          | A: money (Claudio)                                                                                   | B: loop (Gabriele)                                                                                                |
| -------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Domain   | `money`, `pricing`, `calendar`, `vat`, `contract` (price lock), `invoicing`, `explain`, `early-exit` | `question-flow`, `eligibility` (incl. Y-tunnus), `end-of-term` (buy, return, pass on), `second-life` (+ passport) |
| Screens  | quote sliders + explain + 24 vs 36 months, contract + invoices, time travel                          | catalogue, application flow, end of term, second life, audit log page                                             |
| Cards    | 1, 2, 3, 4, 8                                                                                        | 5, 6, 7, 9, 10                                                                                                    |
| Language | each person adds their own UI keys to all four files                                                 | same                                                                                                              |

Out of scope: optimised matchmaking (3), deep CO₂ (7), PDF, offline, real auth, online deploy.

## Shared files

1. `prisma/schema.prisma`: tell the other person before a change, pull `main` first, one migration at a time.
2. `src/domain/types.ts`: the contract and invoice shapes both streams build on. Change together.
3. `src/i18n/messages/*.json`: keys prefixed per stream (`quote.*`, `invoice.*`, `timeTravel.*` vs `catalogue.*`, `apply.*`, `endOfTerm.*`), added in your own block.
4. Otherwise each person touches only their own `src/domain/*` files and their own pages.

## Branches and commits

- Short-lived feature branches from an up-to-date `main` (`git switch main && git pull`), named by feature:
  A: `pricing`, `invoices`, `explain`, `price-lock`, `time-travel`, `early-exit`;
  B: `catalogue`, `question-flow`, `eligibility`, `end-of-term`, `second-life`, `audit-view`.
- Pull request inside the fork (`feature → main`), merged when CI is green, every 1–2 hours.
- Conventional, small commits with the test next to the code, e.g. `feat(pricing): quote financed amount, monthly rent and buyout`.
- Never `--no-verify`. Run `npm run check:all` before pushing.
- Hand-in: one PR from fork `main` to `etufillari/northfina-lease-loop`, titled `Team MagicLease: <product name>`.
