# The Lease Loop challenge

> Build the app that lets one thing live three lives.

Most things we buy are used for a few years and then sit in a drawer. Leasing changes that: you pay for the years you use something, then it goes back, gets fixed up, and starts a new life with someone else.

Your job is to build that loop for e-bikes, laptops and farm machines, with logic smart enough that a bank would trust it with real money.

```text
  catalogue → price → application → contract → invoices → end of term
      ↑                                                         │
      └──────────── second life (refurbish, re-price, re-lease) ┘
```

There is no single right answer. We want to see how you think.

---

## 1. The Spine (required)

One item has to go round the whole loop in your app, end to end. Rough is fine; broken is not.

| #   | Step            | Minimum                                                                                                   |
| --- | --------------- | --------------------------------------------------------------------------------------------------------- |
| 1   | **Catalogue**   | Browse the assets in `data/assets.json` with today's price.                                               |
| 2   | **Price**       | Pick a term and a down payment with sliders and see the monthly price update live.                        |
| 3   | **Application** | The customer answers questions from `data/questions.json` and gets a yes, a no, or "a person will check". |
| 4   | **Contract**    | Signing locks the agreed price. Later changes to price lists must not touch it.                           |
| 5   | **Invoices**    | Monthly invoices generated from the locked contract.                                                      |
| 6   | **End of term** | Buy it, return it, or pass it on.                                                                         |
| 7   | **Second life** | A returned item gets a new price and can be leased to the next person.                                    |

The Spine is the entry ticket. It can't win on its own.

---

## 2. Smart Problems (pick at least 2)

This is where you win. Each problem has traps hidden in the data pack. Go deep on the ones you pick rather than shallow on all of them.

### 🧾 1. Lock the price, not the tax

On 1 January 2027 (fictional), Finnish VAT goes from 25.5 % to 26 % (`data/vat-rates.json`). A contract signed in 2026 has a locked net rent, but VAT is charged at the rate on the invoice date. Get it right for every invoice, and make it obvious to the customer why the total changed when "the price is locked".

### 🚪 2. Fair early exit

A customer wants out in month 7 of 36. What should it cost? Remaining rents? Market value from `data/residual-curves.json`? The buyout from `data/coefficient-table.json`? There's no official formula; design one that's fair to both sides, show the calculation, and keep it consistent with what a buyout costs at the end of the term.

### ♻️ 3. Second-life matchmaking

A returned item has a condition, wear (`usage`) and refurbishment costs (`data/refurbishment-costs.json`). People are waiting for used items (`data/second-life-demand.json`) with budgets, minimum conditions and deadlines. Decide: refurbish or not, who gets it, and at what rent. Two people on the list have the same needs: who wins, and why?

Bonus: give every item a **passport**, its full history across lives.

### 🧠 4. The smart question flow

Ask only what's needed. `data/questions.json` targets questions by customer type, asset, amount and earlier answers. Build an engine that:

- shows each question only when it applies;
- explains _why we ask_;
- handles a customer who goes back and changes an answer, which can make earlier answers irrelevant.

The eligibility rules in the same file must produce a clear yes, no or manual review, with reasons.

### 💶 5. Money that adds up

Money is integer cents, never floats. A lease that starts on 31 January: when is the February invoice due? A leap-year February? A contract starting mid-month: is the first month a full month? Every invoice must be rounded, yet all invoices must add up exactly to the contract total.

Property-based tests (thousands of random contracts) are the gold standard here.

### 🔍 6. Explain my price

A breakdown a 70-year-old or a 17-year-old can understand: list price, down payment, financed amount, coefficient, VAT, buyout at the end, total cost. Compare options side by side ("24 months vs 36 months"). Trust is a feature.

### 🌍 7. Circular impact

Using `data/co2-factors.json` (fictional factors), show the CO₂ and money saved by second and third lives, per item and for the whole fleet. Is the saving the same when an item was almost worn out? Defend your method.

---

## 3. Wildcard

Invent your own twist. Some ideas:

- a time-travel slider that replays a contract month by month;
- a dealer dashboard showing which items come back next month;
- a contract for a whole fleet (a company leasing 6 laptops);
- offline-first;
- accessibility-first;
- a printable contract PDF.

Surprise us.

**One firm rule:** your app works on rules, data and algorithms. **No AI, ML or LLM features inside the app.** Use AI tools to help you write code as much as you like; see [RULES.md](RULES.md).

---

## 4. Scenario cards

On Friday the judges run these against your app. Make sure the ones related to your Smart Problems work, and that the others don't crash.

1. **Happy path.** Aino (`cust-aino`) leases `ebike-003`, 36 months, no down payment, signed 5 Nov 2026. Show the monthly rent (net and with VAT), the first 3 invoices and the total cost.
2. **The price lock.** A quote for `laptop-004` is made on Thu 5 Nov 2026 (price list v1). The customer signs on Fri 6 Nov, when price list v2 is live and laptops are 8 % cheaper. Which price is locked, and does your app say why?
3. **Tax is not price.** `ebike-001`, 24 months, started 15 Sep 2026. Show the December 2026 and January 2027 invoices.
4. **Calendar traps.** `laptop-001`, 24 months, starting 31 Jan 2026. When are the February 2026 and February 2028 invoices due?
5. **Too young.** Mikko (`cust-mikko`, 17) applies for `laptop-008`. What does he see? Be kind and clear.
6. **Who can sign?** Norvi Logistics (`cust-norvi`) applies for 4 × `ebike-004`. The applicant is not allowed to sign for the company.
7. **Big ticket.** Haapalan Tila (`cust-haapala`) leases `farm-002` (€145,000) for 48 months with €20,000 down. Which questions appear, and why does it end in manual review?
8. **Early exit.** Aino ends the lease from card 1 in month 7. What does it cost, and why?
9. **Second life.** `ebike-007` came back in fair condition with 18,400 km. Refurbish? Who on the waiting list gets it (`wait-02` or `wait-13`?) and at what rent?
10. **Third life.** `ebike-008` already had 2 lives. Lease it again and show its passport and the CO₂ it has saved.

The data pack has more traps than these: band boundaries, minimum and maximum amounts, a broken business ID, reserved items. Finding them is part of the game. The judges also bring **3 surprise scenarios** on Friday, so general rules beat hard-coded answers.

---

## 5. How you're judged

| Area               | Weight | What we look at                                                                                                                                                                                      |
| ------------------ | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Product**        | 40 %   | The Spine works (10). Depth and cleverness of your Smart Problems (20). UX, languages, accessibility (10).                                                                                           |
| **Engineering**    | 35 %   | Domain logic in pure, tested functions (12). Hooks respected, clean conventional commits, green CI (10). Readable structure, files under 600 lines (8). Money in cents, API envelope, audit log (5). |
| **Pitch and demo** | 25 %   | Live demo that works (10). You explain your smart choices and trade-offs (10). Q&A (5).                                                                                                              |

Pitches: **4 minutes demo + 2 minutes Q&A** per team. Anyone in the team may be asked to explain any part of the code, including the parts an AI tool helped write.

---

## 6. Timeline

| When            | What                                                                                   |
| --------------- | -------------------------------------------------------------------------------------- |
| Thu 5 Nov 16:00 | Kick-off and challenge presentation at Hive Helsinki                                   |
| Thu 5 Nov 16:30 | Hacking starts                                                                         |
| Fri 6 Nov 16:00 | **Submission deadline**: your pull request is open, see [README](README.md#submitting) |
| Fri 6 Nov 16:30 | Pitches (4 + 2 minutes per team)                                                       |
| Fri 6 Nov 18:00 | Winners announced                                                                      |

**Help:** the Northfina team is on site for the kick-off and the pitches. In between, ask in **#ask-a-mentor** on the hackathon Discord; we answer there throughout the hackathon. Repo or setup bugs can also go in a GitHub issue.

## 7. Prizes

- **€100 per person** on the winning team
- An **interview with Northfina** for every member of the winning team

Good luck, and have fun. 🚲💻🚜
