# Engineering rules

These are the rules we follow every day at Northfina, cut down to fit a hackathon. They're 35 % of your score, and the hooks and CI in this repo already enforce most of them. Don't fight them; they're there to save you at 3 a.m.

## 1. No AI inside the product

Use ChatGPT, Claude, Copilot, Cursor or anything else to **write** your code. Crediting them in commits is fine.

But the app itself must **not** call an AI, ML or LLM service, and must not ship a model. Banks need financing decisions they can explain and repeat, so everything in the product is rules, data and algorithms.

`npm run check:no-ai` fails if an AI SDK appears in `package.json`, is imported in `src/`, or an AI API key is read.

You must be able to explain any line in your code during Q&A, including the lines a tool wrote.

## 2. Conventional commits

Every commit message has the form `type(scope): what changed`, for example:

```text
feat(pricing): add monthly rent with down payment
fix(invoices): due date on the last day of short months
test(question-flow): drop answers that no longer apply
```

Types: `feat`, `fix`, `test`, `refactor`, `docs`, `style`, `chore`, `ci`, `perf`. The `commit-msg` hook checks it, and CI checks every commit in your PR. Small, frequent commits tell the judges your story.

## 3. Hooks stay on

The hooks are installed by `npm install` (Husky):

| Hook         | What it runs                                                          |
| ------------ | --------------------------------------------------------------------- |
| `pre-commit` | Secret scan on staged files, then Prettier and ESLint on staged files |
| `commit-msg` | Conventional-commit check                                             |
| `pre-push`   | Type check, tests, file-size check, no-AI check                       |

**Never use `--no-verify`.** It shows: unformatted code or a bad commit message in your history fails CI, and judges look.

## 4. Business logic is pure and tested

- Logic lives in `src/domain/`: plain functions with no database, no `fetch` and no `Date.now()`. Pass dates and data in as arguments. See [`src/domain/README.md`](src/domain/README.md).
- Every domain function has tests next to it (`*.test.ts`, Vitest).
- `npm run test:coverage` needs **at least 60 %** lines, functions, branches and statements on `src/domain`, `src/server`, `src/data` and `src/i18n`. UI pages aren't counted, so test the logic, not the markup.

## 5. Money is integer cents

Never store or add money as floating-point euros. `389000` is €3,890.00. Round once, on purpose, and write down how you round.

## 6. One API shape

Every API route returns the same envelope, using `ok()` and `fail()` from `src/server/api-response.ts`:

```json
{ "success": true, "data": { "…": "…" }, "meta": { "timestamp": "2026-11-05T16:00:00.000Z" } }
{ "success": false, "error": { "code": "NOT_FOUND", "message": "Asset not found" }, "meta": { "timestamp": "…" } }
```

Wrap handlers in `handleRoute()`. An unexpected error returns a generic 500 and is logged on the server. **Never send raw error messages or stack traces to the browser.**

## 7. Every change leaves an audit trail

Anything that changes data (signing a contract, issuing an invoice, returning an item) goes through `withAudit()` in `src/server/audit.ts`. The change and its audit row commit in the **same transaction**: if the audit fails, the change rolls back. Show the trail somewhere in your app; judges like seeing who did what and when.

## 8. Small files

No hand-written source file over **600 lines** (`npm run check:file-size`). Split by responsibility before you get there.

## 9. Four languages

The UI supports `en`, `fi`, `sv` and `et`. Put strings in `src/i18n/messages/*.json`, not inline. A test checks that all four files have the same keys. Machine translation is fine for a hackathon.

## 10. No secrets in Git

Nothing secret belongs in the repo: no API keys, passwords or tokens. `.env` is git-ignored; put examples in `.env.example`. The pre-commit secret scan blocks obvious leaks. You shouldn't need any secrets at all for this challenge.

## 11. CI is green

`.github/workflows/ci.yml` runs on every push and pull request:

- format check, lint, type check;
- file-size and no-AI checks;
- tests with coverage;
- build;
- commit messages.

Run the same thing locally with **`npm run check:all`**.

**Enable Actions in your fork** (GitHub turns them off for forks): open the **Actions** tab of your fork and click _"I understand my workflows, go ahead and enable them"_. A green check on your last commit before the deadline is worth points.
