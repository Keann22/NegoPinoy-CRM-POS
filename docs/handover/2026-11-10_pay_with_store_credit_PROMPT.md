# Prompt: build "pay with store credit"

Copy everything inside the box into the other AI agent, started in this repo
(`NegoPinoy CRM POS`, branch `main`).

---

```text
You are working on NegoPinoy CRM POS, a Next.js + Supabase app used every day by
a small Philippine home-goods business (sales agents on Facebook/Messenger,
warehouse staff, two owners). The database is the LIVE production Supabase
project. The GitHub repo is PUBLIC.

## Read first (in this order, fully)
1. docs/handover/2026-11-10_pay_with_store_credit.md  ← the full spec for this job
2. docs/BUSINESS_WORKFLOW.md  (how the business really works; esp. "Customer
   returns", "One GCash payment for several orders", "Bus shipping and shipping fees")
3. .agents/AGENTS.md  (code rules: 400-line limit, typecheck, hooks for data,
   types in src/types, security rules)
4. CLAUDE.md
Then open every file the handover names before changing it.

## The job
Staff must be able to use a customer's store credit to pay an order that
already exists, and keep any leftover credit for the shipping fee, without
asking the owners. Build it as described in the handover:

- Phase 1: "Store credit" method in Log Payment, saved by a server API route
  that atomically lowers customers.store_credit and records a payments row
  (payment_method 'Store Credit', status 'Verified', no proof), capped at
  min(credit, balance). Update every reader of payments (Cash Flow must not
  count it as cash in; OCR/reference checks skip it; lay-away "usual payment"
  guesses ignore it).
- Phase 2: the leftover pays the SF. Bus SF pop-up gets "Use store credit".
  Do NOT turn the leftover into on-order "advance SF" (it would be taken twice).
- Phase 3: New Order's "Apply store credit" records a Store Credit payment
  instead of lowering total_amount (today it hides those sales from sales,
  commission and P&L).
- Phase 4: invoice (share-receipt-dialog.tsx), order detail, order summary and
  customer page show credit used, and old orders' invoices add up.
- Phase 5: one-off script to convert the 18 old orders whose total was lowered
  by credit (dry run by default; apply only after the owner approves).
- Phase 6: store credit ledger table (only if the owners approve; they must
  paste the SQL: the Management API token is expired).
- Phase 7: cancelling an order gives the store credit it used back.

## Before writing code
1. Check the handover's numbers still hold (read-only queries through PostgREST
   with SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL from .env.local,
   read inside a small Node script, never on the command line; page through
   results, responses cap at 1,000 rows).
2. Ask the owner the open decisions D1–D6 from section 4 of the handover, in
   short plain English, showing the recommended default for each. Wait for
   answers. Then write their decisions into docs/BUSINESS_WORKFLOW.md as a new
   short section "Store credit (owner, <date>)", in the same plain style.
3. Reply with your plan in at most ~10 lines (phases, files, order). Then build
   without waiting, unless an answer changed the plan a lot.

## Rules
- Never write test data to the live database. Put money rules in pure
  functions and check them with a small tsx script on in-memory data.
- Never commit customer names, customer-linked order numbers, reference
  numbers, per-customer amounts, or proof URLs. Backups with customer data go
  in scripts/scratch/ (git-ignored), never scripts/reports/.
- log-payment-dialog.tsx is already over 400 lines: split it before adding to it.
- Money writes follow the pattern in src/lib/services/shipping/bus-shipment-service.ts:
  optimistic checks (.eq on the value you read), rollback on failure, 409 with a
  plain message if someone changed it meanwhile.
- Don't change: paymentEffect()'s status rule, the GCash split, bus advance-SF
  logic, readOrderCarriedAmounts(), customer-return money flows, Payment Fix,
  the locked unallocated-stock formula.
- Times in the DB are UTC; show them in Philippine time (UTC+8).
- Staff UI text: short, plain English (Taglish is fine where staff already use
  it). Must work on iPhone and Huawei phones.
- npm run typecheck must pass with zero errors; run npm run check:lines.
- Commit to main and push, no pull requests (Vercel deploys from main). Other
  sessions share this checkout: run `git diff --cached --stat` and commit only
  your own files. Commit per phase with clear messages. After pushing, check
  the Vercel deploy succeeded.
- Phase 5 --apply and Phase 6 SQL need the owner's explicit yes in chat.

## When done
Tell the owner in plain words: what staff can do now and where (which screen,
which button), what changed in reports (sales for past months go up after
Phase 5), what you did not do and why, and anything you found that needs a
decision. Keep it short.
```
