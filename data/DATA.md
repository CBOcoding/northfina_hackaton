# The data pack

Everything here is **synthetic**. The brands, people, companies and business IDs are made up, the e-mail addresses use `example.com`, and the 2027 VAT change and CO₂ factors are fictional. Use, change or extend it however you like.

Typed loaders and Zod schemas for every file live in `src/data/`. Read those for the exact field types.

## Conventions

- **Money is integer euro cents.** `389000` means €3,890.00. Prices are **net (VAT excluded)** unless a field says otherwise.
- **Dates are ISO `YYYY-MM-DD`.** `valid_to: null` means "still valid".
- **Percentages are plain numbers.** `25.5` means 25.5 %.

## Files

| File                       | What it is                                                                                                                                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `assets.json`              | 30 items (e-bikes, laptops, farm machines) with condition, usage, previous lives and status. **No prices here.**                                                                                                    |
| `price-lists.json`         | Net list price per asset. Version 1 is valid until Thu 5 Nov 2026; **version 2 starts Fri 6 Nov 2026** (e-bikes +5 %, laptops −8 %).                                                                                |
| `coefficient-table.json`   | How the monthly rent is calculated: `monthly_net_rent = financed_amount × factor`. Pick the band by financed amount and the factor by term (12/24/36/48 months). Includes the buyout price at the end of each term. |
| `vat-rates.json`           | Finnish general VAT rate with validity dates, including a **fictional** change to 26 % on 1 Jan 2027.                                                                                                               |
| `residual-curves.json`     | What a used item is worth on the market: age curve × condition multiplier × usage adjustment.                                                                                                                       |
| `refurbishment-costs.json` | What it costs to bring a returned item back to leasable condition, including mandatory steps.                                                                                                                       |
| `second-life-demand.json`  | The waiting list: people who want a used item, their budget, minimum condition, term and deadline.                                                                                                                  |
| `questions.json`           | The application question bank in 4 languages, the targeting rules (`ask_when`) and the eligibility rules.                                                                                                           |
| `customers.json`           | Ten personas, each with a `story`. Several of them are edge cases on purpose.                                                                                                                                       |
| `co2-factors.json`         | **Fictional** manufacturing footprints, for the circular-impact problem.                                                                                                                                            |

## Worked example: the monthly price

`ebike-003` (Nordvolt Trail 500), 36 months, no down payment, signed on 5 Nov 2026:

1. List price on 5 Nov 2026 (price list v1): **389000** cents.
2. Financed amount = 389000 − 0 = **389000**. That's in band **B** (200000–999999).
3. Factor for band B, 36 months: **0.027584**.
4. Monthly net rent = 389000 × 0.027584 = 10730.18 → **10730** cents (rounding is your design decision; document it).
5. VAT on an invoice dated in Nov 2026: 25.5 % → 2736.15 → **2736** cents. Invoice total: **13466** cents.
6. Buyout at the end of 36 months: 15 % of financed = **58350** cents.

The factor already includes interest and the buyout at the end. You don't need to derive it, but the band's `annual_interest_percent` is there if you want to discount money over time (for example, for a fair early exit).

## Rules for `ask_when` in questions.json

`ask_when` is a list of conditions, and **all** must be true for the question to be asked. An empty list means "always ask".

```json
{ "field": "customer_type", "op": "in", "value": ["company"] }
{ "field": "financed_amount_cents", "op": "gte", "value": 1000000 }
{ "field": "answers.q_can_sign", "op": "in", "value": ["no"] }
```

Fields: `customer_type`, `category`, `financed_amount_cents`, `term_months`, `answers.<question id>`. Ops: `in`, `gte`, `lte`. The engine, and what happens when an earlier answer changes, is up to you.

## Things that are deliberately tricky

We're not listing them all. A few to start with:

- Two laptops cost exactly €1,999.99 and €2,000.00, either side of a band boundary.
- One item is too cheap to lease, and one is too expensive.
- One item is reserved and can't be leased.
- One business ID has a wrong check digit. Finnish Y-tunnus check digits follow a public algorithm.
- Two waiting-list entries are identical except for one thing.
