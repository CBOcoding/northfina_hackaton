# Lease Loop · Team MagicLease

A circular-economy leasing app for e-bikes, laptops and farm machines, built for the Northfina × Hive Helsinki hackathon (5–6 November 2026) by **Claudio Borromei** and **Gabriele Gargani**.

One item goes the whole loop: **catalogue → quote → application → signing → contract → monthly invoices → end of term → second life**. Every number on the way comes from pure, tested functions in `src/domain/`, rounded once and on purpose, and every change to data leaves an audit row.

**Smart Problems we picked:** 🧾 1 · Lock the price, not the tax, 💶 5 · Money that adds up, 🔍 6 · Explain my price.
**Wildcard:** ⏪ a **time-travel slider** that replays a contract month by month.

---

## Run it

```bash
npm ci
npm run db:setup
npx tsx --env-file=.env scripts/seed-demo-contracts.ts
npm run dev
```

The seed script signs the contracts from scenario cards 1, 2, 3, 4 and 6, so the contract pages can be shown straight away. It is safe to run again. After a schema change, run `npm run db:migrate` and then `npx prisma generate`.

### Where to look

| Page                                             | What it shows                                                                                                                                           |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/en`                                            | The catalogue with today's net prices (price list v1 on Thursday, v2 from Friday).                                                                      |
| `/en/quote/ebike-003`                            | Term and down-payment sliders, **Explain my price** in 9 steps, and **24 vs 36 months** side by side.                                                   |
| `/en/apply?asset=laptop-008&customer=cust-mikko` | The question flow: only the questions that apply, why we ask, and a yes / no / manual review with reasons.                                              |
| `/en/sign/{applicationId}`                       | The contract exactly as it will be stored, why this price is locked, and a simulated e-signature.                                                       |
| `/en/contracts`                                  | Every signed contract.                                                                                                                                  |
| `/en/contracts/ML-2026-0001`                     | Locked terms, the **time-travel slider**, every invoice, the VAT change explained, the totals check and the **early exit** cost for the replayed month. |

All pages work in English, Finnish, Swedish and Estonian.

---

## How we solved the Smart Problems

### 🧾 1 · Lock the price, not the tax

- Signing copies everything that sets the rent into the contract (`src/domain/contract.ts`): list price and its version, down payment, financed amount, band, factor, rent and buyout. Nothing reads a price list again after signing.
- VAT is not part of that lock. Every invoice uses the rate valid on its **due date** (`src/domain/vat.ts`), so on 1 January 2027 the invoice total changes while the rent does not.
- The contract page says it in words when it happens: _"Your rent is still locked at €107.30. The VAT rate changed from 25.5 % to 26 % on 5 Jan 2027, so each invoice changed by €0.54. VAT is set by law, not by us."_
- **Card 2, which price is locked?** A quote is honoured for 14 days. Within that time the customer gets the **lower** of the quoted price and the signing-day price, so a price rise never hurts them and a price drop always reaches them. The laptop quoted on v1 (€3,490) and signed on v2 (€3,211) locks €3,211, and the contract page says why and how much was saved.

### 💶 5 · Money that adds up

- **Integer cents everywhere.** Factors are stored as integer millionths (0.027584 → 27584) and percentages as basis points (25.5 % → 2550), so no float ever touches money (`src/domain/money.ts`).
- **One rounding rule:** every amount is computed as an exact fraction and rounded **once, half up**. 12 500 000 × 0.021763 = 272 037.5 → 272 038 (card 7).
- **Totals are sums of invoices,** never a separately rounded figure: Σ rent = monthly rent × term exactly, and Σ total = Σ rent + Σ VAT. The contract page shows the check.
- **Calendar:** invoice k is due on the start day of month k, moved to the last day of shorter months: a lease from 31 January is due on 28 February, on 29 February in 2028, and on 31 March again (`src/domain/calendar.ts`). Rent is paid in advance, one full month per invoice, so a mid-month start needs no partial month.
- **Property-based tests** (`fast-check`): 2 000 random contracts per run check that the totals are exact, every VAT rate matches its date, due dates only move forward and the billing periods have no gaps.

### 🔍 6 · Explain my price

- `src/domain/explain.ts` turns a quote into 9 plain steps: list price, down payment, amount financed and its band, the factor and its yearly interest, rent without VAT, VAT, what you pay each month, the total over the term, and the optional buyout. The screen turns each step into a sentence in the customer's language, so the explanation can never disagree with the contract.
- **24 vs 36 months** side by side, with the cheaper option per month and in total highlighted. For ebike-003: 36 months is cheaper each month (€134.66 vs €173.47), 24 months is cheaper in total (€4,163.28 vs €4,847.76).

### ⏪ Wildcard · Time travel

A slider on each contract page replays it month by month (`src/domain/replay.ts`): the current invoice, what has been invoiced, what is still to come, the full invoice list with the current month highlighted, and the early exit cost for that month. Step to January 2027 and the VAT note appears.

---

## Design decisions

| Topic             | Our rule                                                                                                                                                                                                                                                                                                      | Where                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Rounding          | Exact fraction, rounded once, half up. Factors × 1 000 000, rates in basis points.                                                                                                                                                                                                                            | `money.ts`                         |
| Monthly rent      | financed × factor(band of financed, term). Bands include both ends: €1,999.99 is band A, €2,000.00 band B.                                                                                                                                                                                                    | `pricing.ts`, `coefficient.ts`     |
| VAT               | Rate on the invoice's due date, rounded per invoice.                                                                                                                                                                                                                                                          | `vat.ts`, `invoicing.ts`           |
| Due dates         | Start day each month, clamped to the month's last day.                                                                                                                                                                                                                                                        | `calendar.ts`                      |
| Price lock        | Lower of quote and signing-day price within 14 days; signing-day price after. The reason is stored and shown.                                                                                                                                                                                                 | `contract.ts`                      |
| Fleets            | One contract, a quantity per item, priced on the total (4 × ebike-004 = €21,960, band C).                                                                                                                                                                                                                     | `contract.ts`, `contracts.ts`      |
| Early exit        | Pay what the lease still owes: the remaining rents and the buyout, discounted at the contract's own interest rate. Before the first month this equals the amount financed; after the last month it is exactly the buyout; leaving never costs more than staying. Returning the item credits its market value. | `early-exit.ts`, `market-value.ts` |
| Market value      | List price × residual curve (linear between points) × condition × usage adjustment, multiplied exactly and rounded once.                                                                                                                                                                                      | `market-value.ts`                  |
| Signing           | The browser sends only who signs; items, quantities, terms and the quote date are read from the stored application. The signature is **simulated** (name + accept); a real product would use strong identification such as bank ID.                                                                           | `contracts.ts`, `/sign`            |
| Leased items      | Signing marks an item `reserved`, so it cannot be leased twice.                                                                                                                                                                                                                                               | `contracts.ts`                     |
| Expected failures | Returned as values (`{ ok: false, reason }`) and shown to the customer; exceptions only for bugs.                                                                                                                                                                                                             | all of `src/domain`                |

---

## Scenario cards

| Card                 | Where                                                                               | Result                                                                                                             |
| -------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 1 · Happy path       | `/en/contracts/ML-2026-0001`                                                        | €107.30 rent; €134.66 per invoice in 2026, €135.20 from January 2027; 36 invoices total €4,866.12                  |
| 2 · Price lock       | `/en/contracts/ML-2026-0002`                                                        | Locks v2: €88.57/month instead of €96.27, saving €279 on the price                                                 |
| 3 · Tax is not price | `/en/contracts/ML-2026-0003`                                                        | December 2026 €87.31, January 2027 €87.66, same €69.57 rent                                                        |
| 4 · Calendar traps   | `/en/contracts/ML-2026-0004`                                                        | February 2026 due 28 Feb, February 2028 due 29 Feb                                                                 |
| 5 · Too young        | `/en/apply?customer=cust-mikko&asset=laptop-008`                                    | Rejected with the reason, kindly worded                                                                            |
| 6 · Who can sign?    | `/en/apply?customer=cust-norvi&asset=ebike-004&qty=4`, `/en/contracts/ML-2026-0005` | The signatory's e-mail is asked and the authorised signatory signs; 4 × ebike-004 at €589.93/month                 |
| 7 · Big ticket       | `/en/apply?customer=cust-haapala&asset=farm-002&term=48&down=2000000`               | Annual revenue, owners and PEP questions appear; ends in manual review because of the PEP                          |
| 8 · Early exit       | `/en/contracts/ML-2026-0001`, month 7                                               | Keep it: €3,306.66 + VAT (29 rents and the buyout, minus €388.54 of interest); give it back: market value credited |
| 9 · Second life      | _in progress_                                                                       |                                                                                                                    |
| 10 · Third life      | _in progress_                                                                       |                                                                                                                    |

---

## Engineering

- **Domain logic is pure and tested:** `src/domain/` has no database, no clock and no network. Every module has its tests next to it, including property-based tests for the money rules.
- **Database writes are atomic and audited:** signing stores the contract, its items, every invoice and the `contract.signed` audit row in one transaction (`src/server/contracts.ts`).
- **One API shape:** every route uses `ok()` / `fail()` / `handleRoute()`; refusals return a stable code such as `ASSET_NOT_AVAILABLE`.
- **Hooks and CI on every commit,** conventional commits, small feature branches merged through pull requests. No `--no-verify`.
- **No AI inside the app.** We used AI tools to help write code; every decision in the product is a rule you can read and test.

---

# About the challenge (starter README)

Starter repo for the **Lease Loop** challenge, 5–6 November 2026 at Hive Helsinki. Teams of 3 build a circular-economy leasing app: one e-bike, laptop or tractor, three lives.

- 📋 **The challenge:** [CHALLENGE.md](CHALLENGE.md)
- 📐 **Engineering rules (35 % of your score):** [RULES.md](RULES.md)
- 🗂️ **The data pack:** [data/DATA.md](data/DATA.md)

**Northfina** is a Helsinki-based leasing platform. It started as Etufillari, a bike-leasing service, and now leases any kind of asset. Dealers, banks and customers use it to get from a price quote to a signed contract, then through monthly invoices to the end of the lease. This repo is a small, independent playground, not our product code.

---

## Quick start

You need **Git** and **Node.js 22** (with [nvm](https://github.com/nvm-sh/nvm): `nvm install` reads `.nvmrc`).

```bash
git clone https://github.com/<your-team>/northfina-lease-loop.git
cd northfina-lease-loop
nvm install          # Node 22
npm ci               # installs dependencies and the Git hooks
npm run db:setup     # creates .env and a local SQLite database with the 30 assets
npm run dev          # http://localhost:3000
```

You should see the asset catalogue in English. Switch to Finnish, Swedish or Estonian in the header.

| Command                 | What it does                                                   |
| ----------------------- | -------------------------------------------------------------- |
| `npm run dev`           | Start the app with hot reload                                  |
| `npm test`              | Run all tests once (`npm run test:watch` to keep them running) |
| `npm run test:coverage` | Tests with the 60 % coverage gate                              |
| `npm run check:all`     | **Everything CI runs.** Run it before you push                 |
| `npm run db:migrate`    | After you change `prisma/schema.prisma`: creates a migration   |
| `npm run db:reset`      | Wipe the local database and seed it again                      |
| `npm run db:studio`     | Browse the database in your browser                            |

---

## 15-minute tour

New to TypeScript, Next.js or Prisma? Read these files in this order:

1. **`data/`**: the synthetic data pack. Open `assets.json` and `coefficient-table.json`, then the worked example in [DATA.md](data/DATA.md).
2. **`src/data/`**: Zod schemas that load and type-check every data file. If you want to know a field's type, look here.
3. **`src/domain/coefficient.ts`** and its test: a pure function that finds the pricing factor, and how we test it. **Your business logic goes in `src/domain/`**, written the same way.
4. **`src/domain/price-list.ts`**: picks the right price for a date. The price list changes on Friday.
5. **`src/app/[locale]/page.tsx`**: the catalogue page. Next.js App Router: every folder under `src/app/` is a URL.
6. **`src/app/api/assets/`**: API routes. They use the response envelope (`src/server/api-response.ts`), and the status change writes an audit row in the same transaction (`src/server/audit.ts`).
7. **`prisma/schema.prisma`**: the database. Add your own models (Contract, Invoice, …) and run `npm run db:migrate`.

Handy docs: [Next.js App Router](https://nextjs.org/docs/app), [TypeScript for programmers who know C](https://www.typescriptlang.org/docs/handbook/typescript-in-5-minutes.html), [Prisma](https://www.prisma.io/docs), [Vitest](https://vitest.dev/guide/), [Tailwind CSS](https://tailwindcss.com/docs).

Everything in the skeleton is replaceable. Keep the rules, not necessarily the code.

---

## Submitting

You can't push to this repo. You work in **your own fork** and send us a **pull request**.

1. **One person per team forks** this repo (the **Fork** button, top right) and adds the other two as collaborators in the fork (_Settings → Collaborators_).
2. **Enable Actions in the fork**: open the fork's **Actions** tab and click _"I understand my workflows, go ahead and enable them"_. Now CI runs on every push.
3. Everyone clones the fork and commits as usual. Small, conventional commits; the hooks help.
4. **Before Friday 6 November 16:00**, open a pull request from your fork to `etufillari/northfina-lease-loop` `main`.
   - Title: `Team <name>: <your product name>`.
   - Fill in the template: members, the Smart Problems you picked, and how to demo.
   - You can open it early and keep pushing until the deadline.
5. **At 16:00 we record the latest commit of every open pull request.** That commit is what we judge. Anything pushed later is ignored, and pull requests opened after 16:00 don't count.

We won't merge pull requests. They're only how you hand in your work.

**Heads-up:** forks of a public repo are public, so other teams can see your fork. Your commit history shows who built what, and copying another team's work disqualifies both copies.

---

## Your code is yours

The starter code in this repo is MIT-licensed (see [LICENSE](LICENSE)); use it however you like.

**Your team owns the code you write.** Opening a pull request gives Northfina permission to read and run your code for judging and for interviews with your team. Nothing more: we won't merge it, reuse it or publish it elsewhere without asking you first.

## Help

- During the hackathon: **#ask-a-mentor** on the hackathon Discord.
- A bug in this starter repo: open a GitHub issue here.
- Please follow the [Code of Conduct](CODE_OF_CONDUCT.md).
