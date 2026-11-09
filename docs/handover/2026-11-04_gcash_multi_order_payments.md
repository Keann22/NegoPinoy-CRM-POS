# Handover: one GCash payment for several orders (2026-11-04)

Written for the next AI agent. The repo is **public**: never commit customer
names, GCash reference numbers, amounts per customer, or proof URLs.

## Prompt to start the next session

> Read `docs/handover/2026-11-04_gcash_multi_order_payments.md`,
> `docs/BUSINESS_WORKFLOW.md` (section "One GCash payment for several orders")
> and `.agents/AGENTS.md`. Then build the "one GCash payment, several orders"
> feature in Log Payment, following the owner decisions there. Start with the
> plan in the handover (phase 1), confirm the plan with me in a few lines, then
> build, type-check, test against a fake/in-memory DB (never write test data to
> the live DB), commit only your own files to `main`, push, and check the Vercel
> deploy. Explain results to me in plain words.

## Where things stand

### Done and live (pushed to `main`, Vercel deployed)

- `4b250a5` Payment Fix page (`/dashboard/payment-discrepancies`, left menu
  "Payment Fix", owners + sales).
- `c1adde5` readable colors (light + dark), "✓ Checked" button, links to the
  other orders on the same transfer.

How Payment Fix works:

- The list is a frozen snapshot (made 2026-10-30) of 160 payments whose recorded
  amount differs from the GCash statement. It lives in the server-only table
  **`payment_discrepancies`** (RLS on, no grants to anon/authenticated; only the
  service role reads it). Migration: `scripts/migrations/2026-11-04_payment_discrepancies.sql`
  (DDL only; the data was loaded separately and must never be committed).
- Code: `src/lib/services/payments/payment-discrepancy-rules.ts` (which buttons
  are safe), `payment-discrepancy-service.ts` (load list + live payments + other
  payments with the same reference), `payment-reconcile-service.ts` (the fixes),
  `src/app/api/payments/discrepancies/route.ts`,
  `src/app/api/payments/reconcile-discrepancy/route.ts`,
  `src/hooks/usePaymentDiscrepancies.ts`,
  `src/components/dashboard/payments/discrepancy-row.tsx`, `discrepancy-kpis.tsx`,
  `src/types/payment-discrepancy.types.ts`.
- Rules: an order's share of a transfer = GCash amount − other payments with the
  same reference. Credit/Tip only if the share is more than recorded; Fix Typo
  only if not shared; Split only when shared and the total fits; if shared
  payments add up to more than the transfer → no money buttons, "fix by hand".
  "✓ Checked" (no money change) on every open row.
- A row is done when the payment's notes contain `[Reconciled`. (All payments
  were already status `Verified`, so status can't be used.) Fixes refuse if
  already done or if the payment amount changed since the snapshot; only new
  excess goes to store credit; failures roll back.
- Nobody has fixed any of the 160 yet (as of handover).
- `public/payment-discrepancies.html` (old standalone copy with customer data)
  is git-ignored; never commit it.

### Not done: Split with a typed order #

The earlier agent's Split asked for "the other order #" when no other payment
had the same reference, but only wrote a note. I removed that. The owner may
want it back properly (look up that order's payment, add it to the total,
refuse if over the transfer, then link). **Wait** until the multi-order payment
feature below exists; then Split on Payment Fix should become "link these into
one transfer" using the same grouping.

## The next job: one GCash payment for several orders

### What happens today (measured 2026-11-04, read-only)

- No tool for it. Agents upload the same screenshot to each order in Log
  Payment and type each order's share by hand.
- The app reads the reference number and amount from the screenshot afterwards
  (OCR, `src/app/api/payments/extract-ocr/route.ts`, fire-and-forget after the
  payment is saved; sets `payments.reference_number` and `payments.ocr_amount`).
  OCR takes the **largest number** on the screenshot, so `ocr_amount` can be wrong.
- 1,661 payments have a reference; 149 references are on more than one payment
  (325 payments; 34 in the last 30 days). 114 = same customer, different orders;
  24 = different customers (18 same day: may be the same person saved twice);
  11 = the same order twice.
- Compared with the OCR amount: 80 add up; 11 have the full amount on every
  order; 35 add up to more; 22 to less.
- 119 were logged the same day, 8 within 3 days, 22 more than 3 days apart
  (old screenshot reused). 18 involve a cancelled order (payment copied to the
  new order and left on the old one).
- Customers mostly pay **one month of each lay-away** in one transfer.

### Owner decisions (also in docs/BUSINESS_WORKFLOW.md)

1. **Same customer only.** A transfer can only pay that customer's own orders.
   A reference shared with another customer's payment is flagged for owners.
2. **Extra money → store credit** (same as today's overpayment).
3. **Reused reference → warn and tell owners.** The payment saves, is marked
   "reference already used on #order", owners get a bell notification.
4. **The app pre-fills each order's share; the agent edits it.** Lay-away: its
   monthly installment (`orders.monthly_payment`, capped at `balance_due`);
   other orders: the remaining `balance_due`. Shares must add up to the transfer.

### Suggested plan

Phase 1, Log Payment for several orders:

- In `src/components/dashboard/log-payment-dialog.tsx` (today: one order, inserts
  into `payments` from the browser with the session client, then updates
  `orders.amount_paid / balance_due / status`, overpayment → `customers.store_credit`,
  then calls extract-ocr): add "This GCash also paid other orders". It lists the
  same customer's orders that still owe money, pre-filled per decision 4, with
  editable amounts, a running total vs the transfer amount, extra → store credit.
- Saving should happen on the server in one place (new API route + service in
  `src/lib/services/payments/`), not many browser writes: one payment row per
  order, same proof URL, same reference, plus a shared link. Suggested schema
  (new migration, run on the live DB via the Supabase Management API; see
  memory "Supabase SQL via Management API"): `payments.transfer_group_id uuid`
  and `payments.transfer_amount numeric` (the whole GCash amount), or a small
  `payment_transfers` table. Keep it simple.
- Keep each order's status/amount_paid logic identical to the single-order
  path; reuse it rather than copying it. Check how "fully paid" notifications
  fire in log-payment-dialog (it notifies owner/warehouse once) and keep that.

Phase 2, reused reference warning:

- When OCR sets `reference_number`, check other payments with the same digits
  (`substring(reference_number from '\d{8,}')`; the statement drops leading
  zeros) that are not in the same `transfer_group_id`. If found: mark the
  payment (a note or a flag column) and insert a bell notification for owners.
  Bell pattern: `supabase.from('notifications').insert({ ... title, message, link })`
  (see `src/lib/services/borrow-service.ts`; check how owner-targeted
  notifications are addressed elsewhere before choosing fields).
- Different customer on the same reference → same warning (decision 1).

Phase 3, use the group elsewhere:

- Statement matching (`src/app/api/payments/verify-pdf/route.ts`) already sums
  payments by reference in **uncommitted edits by another session**. Don't edit
  that file without asking the owner; it should use `transfer_group_id` later.
- Payment Fix: Split becomes "link into one transfer" (sets the group).

Out of scope unless asked: cleaning up the 149 old shared references, the 18
cancelled-order payments, merging duplicate customers.

## How to work in this repo (learned the hard way)

- Read `CLAUDE.md`, `docs/BUSINESS_WORKFLOW.md`, `.agents/AGENTS.md` first.
  Times in the DB are UTC; show Philippine time (UTC+8).
- **Shared checkout:** other sessions edit files here at the same time. Before
  committing run `git diff --cached --stat`, stage only your own paths, never
  `git add .`. To commit one line of a file that has other people's edits, build
  the blob from `HEAD` + your change and `git update-index --cacheinfo`.
- Commit and push to `main` (no PRs). GitHub had a push outage on 2026-11-04;
  retry the push. Then check Vercel:
  `gh api repos/Keann22/NegoPinoy-CRM-POS/commits/<sha>/status`.
- Live app: `https://nego-pinoy-crm-pos.vercel.app`. The owner is logged in
  there in Chrome (Claude in Chrome works for checking live pages).
- `npm run typecheck` has ~45 errors in files unrelated to this work (they were
  there before); make sure none are in your files. `next.config` ignores type
  errors on build.
- Local dev server: another chat often runs one in this folder and they share
  `.next`, which causes ENOENT 500s. Test services with `npx tsx` scripts in a
  temporary folder (delete it after), using a small fake Supabase client for
  anything that writes.
- The DB is live production. Read-only SQL is fine; get the owner's OK before
  writing real payment/order data.
- No database trigger recalculates `orders.amount_paid`; code must update it.
  `orders` has an AFTER UPDATE trigger `trg_shelf_sync_orders` (shelf stock).
- Supabase returns at most 1000 rows per query; page through bigger tables.
