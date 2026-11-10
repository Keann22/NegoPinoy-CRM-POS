# Handover: pay with store credit (2026-11-10)

Written for the next AI agent. The prompt to start is in
`docs/handover/2026-11-10_pay_with_store_credit_PROMPT.md`.

The repo is **public**: never commit customer names, order numbers tied to a
customer, GCash/bank reference numbers, per-customer amounts, or proof URLs.
Backups and dry-run output that contain customer data go in `scripts/scratch/`
(git-ignored), **not** `scripts/reports/` (that folder is committed).

---

## 1. Why this is needed (what staff ran into)

A sales agent asked the owner (Taglish, from Messenger):

> "May store credit pa po sya, lagay na daw po sa balance niya, tas yung sobra
> daw po pang SF nalang, add nalang daw po sya pag kulang sa SF."

So the customer wants to:

1. use their store credit to pay the balance of an order that **already exists**, and
2. keep the leftover credit to pay the **shipping fee (SF)** later, adding money
   if the SF is more than the leftover.

Staff **cannot do this in the app today**, so they ask the owners every time.

Example (made-up round numbers, same shape as the real case):

| | ₱ |
|---|---|
| Items + 1% insurance | 6,000 |
| Store credit applied when the order was created | −4,500 |
| Order total now | 1,500 |
| Customer's store credit left | 2,000 |
| Customer wants: credit pays the 1,500, keep 500 for SF | |

Where the credit came from in the real case: an OFW sent a MoneyGram bank
deposit to pay off a lay-away. It was much more than the lay-away owed, and
Log Payment put the excess into store credit (by design). Two things to know:

- The OCR read the **foreign-currency amount** (EUR) instead of the peso
  amount, so the payment is flagged `[Screenshot says ₱…, recorded ₱…]` even
  though the recorded peso amount is right. OCR is out of scope, but don't be
  surprised by the flag.
- That source payment was still **status `Pending`** (owners hadn't checked
  their bank yet) when the credit was being spent. See open decision D2.

---

## 2. How store credit works today (read this carefully)

There is **no ledger**. The only record is one number: `customers.store_credit`.

### Where credit is added

| Path | File | What it does |
|---|---|---|
| Log Payment overpays an order | `src/components/dashboard/log-payment-dialog.tsx` (step 5) | `store_credit += overpayment` (unless "Tip" ticked) |
| One GCash for several orders, extra money | `src/lib/services/payments/gcash-transfer-service.ts` | same |
| Order edited below what was paid | RPC `process_order_transaction` (`update_order_func.sql`, edit branch) | `store_credit += overpayment` **and** inserts an `expenses` row `'Customer Store Credit Liability'` |
| Order edited below the credit it used | `src/lib/services/orders/order-update.ts` (`creditReturned`) | gives unused credit back, logs `order_logs` "Store credit returned" |
| Customer return → store credit | `src/lib/services/customer-returns/customer-return-money.ts` | `store_credit +=`, plus `'Customer Refund (store credit)'` expense (P&L only) |
| Payment Fix "Credit" button | `src/lib/services/payments/payment-reconcile-service.ts` | `store_credit +=` |

### Where credit is used

| Path | File | What it does |
|---|---|---|
| New Order → "Apply store credit" checkbox | `src/hooks/useOrderDialog.ts` (~line 236), `src/lib/services/orders/order-creation.ts` (~line 33), `src/components/dashboard/orders/OrderItemsPanel.tsx` (~line 250) | **Lowers `orders.total_amount`** by `min(credit, total)`; the RPC (create branch) does `store_credit -= overpayment`. No payment row, no log. |
| Bus Shipping takes back advance SF | `src/lib/services/shipping/bus-shipment-service.ts`, `bus-fee-rules.ts` (`busSfResult`) | "Advance" = `amount_paid − total_amount` **on that order**. When the bus fee is recorded, that part is taken back from `store_credit` (optimistic check `.eq('store_credit', current)`, rollback on failure). |

### Edit Order

- The "Apply store credit" checkbox is shown **only when creating** (`!isEditing`).
- On edit, `readOrderCarriedAmounts()` in `src/lib/services/orders/order-utils.ts`
  works out the credit used at creation as the **gap** between items+insurance+SF
  and `total_amount`, and keeps it. Edit cannot apply *more* credit.

### Log Payment

- Methods: GCash, Shopee Platform Payouts, Cash, Bank Transfer, COD Payed,
  Credit Card, Other. **No store-credit method.**
- Proof of payment is required for every payment.
- Money logic lives in `paymentEffect()` in
  `src/lib/services/payments/order-payment-rules.ts` (shared with the GCash split).

### The hidden bug: credit used at creation shrinks sales

Sales, commission and P&L count an order by `total_amount`
(`salesAmount()` in `src/lib/services/report-orders-service.ts` = total − shipping_fee;
also `sales-report.tsx`, `pnl-report.tsx`, `commission-report.tsx`,
`sales-summary-report.tsx`, `sales-by-person/[id]/page.tsx`).

Because "Apply store credit" lowers `total_amount`, the goods paid with credit
**disappear from sales and commission**. In the example, a ₱6,000 sale counts
as ₱1,500. The money did come in, but on a *different* order whose total
didn't go up, so it isn't counted as a sale anywhere.

Measured 2026-11-10 (read-only): **18 non-cancelled orders** have this gap,
**₱16,489.37** in total (2 in Jun, 6 Jul, 3 Aug, 2 Sep, 1 Oct, 4 Nov 2026).
4 more are cancelled. 83 customers hold store credit, ₱88,570.20 in total.

Separately, 16 orders have a total *above* items+insurance+shipping_fee. That is
not store credit; leave them alone.

### The invoice

`src/components/dashboard/share-receipt-dialog.tsx` (the "Order Invoice" image
staff send on Messenger) shows Subtotal, Discount, Insurance, then **Total**.
There's no line for credit used, so the invoice doesn't add up (Subtotal +
Insurance ≠ Total) and customers get confused.

### Cash Flow

`src/app/dashboard/reports/cashflow-report.tsx` counts **every `payments` row
as cash in** (it already skips the `'Customer Refund (store credit)'` expense).
A store-credit payment is **not** new cash (the cash was already counted when
the overpayment came in), so it must be left out or cash is counted twice.

### Cancelling an order

Cancelling only restores stock (`order-update.ts` ~line 91,
`restoreStockForCancelledOrder`; RTS cancel in
`src/lib/services/customer-returns/customer-return-rts.ts`). **Nothing happens
to money.** Today agents copy payments to the new order by hand. If an order
paid with store credit is cancelled, the credit is lost unless we handle it.

---

## 3. What to build

**Core idea: using store credit is a payment, not a discount.** It's a
`payments` row with `payment_method = 'Store Credit'` that raises
`amount_paid`, plus `customers.store_credit` going down by the same amount.
The order total stays the full price of the goods, so sales and commission are
right, and the invoice can show "Paid with store credit".

### Phase 1: "Store credit" in Log Payment (the staff request)

1. **Server service + API route** (the money must change atomically):
   - New `src/lib/services/payments/store-credit-service.ts` with
     `applyStoreCredit(supabase, { orderId, amount, actorName, note? })`.
   - New route `src/app/api/payments/store-credit/route.ts` (POST), same pattern
     as `src/app/api/payments/transfer/route.ts` (uses `serviceClient()`,
     typed error class with HTTP status). `/api/*` is already staff-only via
     `src/middleware.ts`.
   - Rules:
     - Order must exist, not Cancelled, and have a customer.
     - `amount > 0`, `amount ≤ customers.store_credit`, `amount ≤ balance_due`
       (never creates an overpayment; round to centavos).
     - Read order + customer, then write with **optimistic checks**, like
       `bus-shipment-service.ts`: update customer
       `.eq('store_credit', creditRead)`, update order
       `.eq('amount_paid', paidRead)`; if 0 rows updated, roll back what was
       written and return 409 "changed just now, try again".
     - Use `paymentEffect(order, amount, 'Store Credit')` for
       `newAmountPaid / newBalanceDue / newStatus`.
     - Insert payment: `payment_method 'Store Credit'`, `status 'Verified'`,
       `proof_url null`, no OCR call, `notes` = staff note +
       `[Store credit used: ₱X, credit left ₱Y]`.
     - Insert `order_logs` row: status `'Store credit used'`, `user_name`,
       `snapshot_data { amount, creditBefore, creditAfter, paymentId }`.
     - If the balance reaches 0, call the same follow-up as Log Payment
       (`POST /api/priority/paid-check` with `{ orderId }`).
   - Return `{ paymentId, newBalanceDue, creditLeft }`.

2. **Log Payment UI** (`log-payment-dialog.tsx` is **427 lines, over the
   400-line rule**: split it first, e.g. move the submit logic into a hook
   `src/hooks/useLogPayment.ts` and the overpayment/tip box into its own component).
   - Add a method **"Store credit"**. Show it only when the customer has
     credit > 0, and show "Customer has ₱X store credit" under the select.
   - When chosen: amount pre-fills `min(credit, balance_due)`; max is that
     value; **proof of payment not required** (hide the upload); hide the
     overpayment/tip box and the "This GCash also paid other orders" option.
   - Preview line: "Balance after: ₱A · Store credit left: ₱B".
   - Saves through the new API route, not the client-side insert path.
   - Toast: "₱X paid with store credit. ₱B credit left."
   - Need the customer's current credit in the dialog: fetch it in a hook
     (AGENTS.md: data fetching goes through `src/hooks/`).

3. **Everything that reads payments must understand `'Store Credit'`:**
   - `cashflow-report.tsx`: leave `Store Credit` payments out of cash in.
   - `src/app/dashboard/accounting/payments/page.tsx`: already skips rows
     without `proof_url`; confirm store-credit rows don't show up for checking.
   - `src/lib/services/payments/payment-reference-check.ts` and OCR: never run
     on store-credit rows (no proof, no reference).
   - `src/hooks/useLayawayReview.ts` and `suggestedShare()` "last payment"
     guess in the GCash split (`gcash-transfer-service.ts`): ignore
     store-credit rows when guessing the customer's usual installment.
   - `src/hooks/useOrderDetail.ts` payment history: show method "Store credit"
     clearly (no "view proof" link).
   - `src/lib/services/priority-list-service.ts`,
     `priority-notify-service.ts`, `stale-reservations-report.tsx`: check
     whether "last payment date" logic should skip store-credit rows (a credit
     transfer isn't the customer paying again). Decide per file; note it in
     the commit.
   - Grep every `from('payments')` (19 files as of today) and check each one.

### Phase 2: the leftover pays the shipping fee

What the customer asked for: keep the leftover credit for SF.

- **Default: the leftover simply stays as store credit.** No new storage.
- **Bus shipping** (Burgos/Pangasinan-type orders usually go by bus): when
  staff record the bus fee, the fee is added to the order's total, so the order
  owes the SF, and the sales agent gets the pop-up
  `src/components/dashboard/bus-shipping/bus-sf-popup.tsx` "Collect ₱X SF".
  Add a button there: **"Use store credit (₱B available)"** that calls the
  same `applyStoreCredit` for `min(credit, SF owed)`. If credit is short, the
  pop-up stays with the remaining amount ("customer adds the rest"). The
  pop-up already goes away once the balance is paid, so no other change is needed.
- Do **not** put the leftover onto the order as an overpayment to make it
  "advance SF": `busSfResult` treats advance as money that is *also* sitting
  in store credit and takes it back again, so it would be taken twice.
- **SPX / courier orders**: the customer normally pays SF to the rider, so the
  leftover stays as credit for the next order. See open decision D3.
- Optional: on the Order detail and Log Payment, show "Customer has ₱B store
  credit (asked to use it for SF)". Only if cheap; a note on the order is enough.

### Phase 3: New Order uses the same mechanism

- "Apply store credit" on **New Order** should stop lowering `total_amount`.
  Instead, create the order at full price and then call `applyStoreCredit` for
  `min(credit, balance)` right after the RPC returns (or pass it into the RPC
  as a payment). `overpayment` sent to the RPC on create becomes 0.
- Keep `readOrderCarriedAmounts()` working for old orders that still have the
  gap (until Phase 5 runs), and for orders with a bus `shipping_fee`.
- `OrderItemsPanel.tsx`: the summary line "Overpayment Applied −₱X" becomes
  "Paid with store credit ₱X" under payments, not a minus on the total.
- Order edit: since credit is now in `amount_paid`, edit keeps it with no
  special handling. If an edit drops the total below `amount_paid`, the RPC
  already moves the excess to store credit.

### Phase 4: invoice and order screens show it

- `share-receipt-dialog.tsx`: in the payment box show
  "Paid with store credit: ₱X" (sum of `Store Credit` payments) and
  "Other payments: ₱Y", then Balance Due.
- For **old orders that still have the gap** (until Phase 5), show a line
  "Store credit used −₱gap" between Insurance and Total, so the invoice adds up.
  Use `readOrderCarriedAmounts()` logic, don't recompute differently.
- Customer page (`src/app/dashboard/customers/[id]/page.tsx`, shows
  "Store Credit (Overpayment): ₱X"): rename to "Store credit" and list the
  orders it was used on (from `payments` with method `Store Credit` +
  `order_logs`). Full history needs the ledger (Phase 6).

### Phase 5: fix the 18 old orders (one-off script, owner approval first)

- `scripts/fixes/convert_store_credit_gap_to_payments.mjs`:
  for each non-cancelled order where
  `subtotal − total_discount + insurance_fee + shipping_fee − total_amount > 0.01`:
  `total_amount += gap`, `amount_paid += gap`, insert a `Store Credit` payment
  of `gap` dated the order's `created_at`, status `Verified`, notes
  `[Backfill 2026-11: store credit used at order creation]`, plus an
  `order_logs` row. `balance_due` doesn't change. `customers.store_credit`
  doesn't change (it was already taken).
- `--dry-run` by default; print a table; write a JSON backup of every touched
  row to `scripts/scratch/` (git-ignored, has customer data). `--apply` only
  after the owner says yes.
- Skip cancelled orders and anything with a gap that looks like a typo (ask).
- Note: Phase 5 makes past months' sales go **up** by about ₱16.5k in total.
  Tell the owner before running.

### Phase 6: store credit ledger (recommended, needs one SQL migration)

So every peso of credit has a history (where it came from, where it went):

```sql
create table public.store_credit_entries (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id),
  amount numeric(12,2) not null,          -- + added, − used
  balance_after numeric(12,2),
  reason text not null,                   -- 'overpayment','used_on_order','returned_on_cancel','return_refund','bus_sf','edit_refund','manual'
  order_id uuid references public.orders(id),
  payment_id uuid references public.payments(id),
  created_by_name text,
  created_at timestamptz not null default now()
);
alter table public.store_credit_entries enable row level security;
-- grant to authenticated as needed (AGENTS.md security rules)
```

- Write a row from every place in section 2's tables (both lists).
- Opening balance: one `'opening_balance'` row per customer with credit > 0.
- The Supabase Management API token in `.env.local` **has expired** (401).
  Give the owner the SQL to paste in the Supabase SQL editor, then verify the
  table through PostgREST with the service role key.
- If the owner says not now, skip it; Phases 1–5 don't depend on it.

### Phase 7: cancelling gives the credit back

- When an order with `Store Credit` payments is cancelled (any path:
  status change in `order-update.ts`, RTS cancel in `customer-return-rts.ts`):
  add the credit back to the customer, insert a **negative** `Store Credit`
  payment (`[Returned to store credit: order cancelled]`) so `amount_paid`
  drops by the same amount, and log it.
- Old orders with the gap (before Phase 5): give back the gap the same way.
- Un-cancel: don't re-apply automatically; the agent uses Log Payment again.
- Don't touch other payment methods on cancel (agents copy those by hand today;
  out of scope).

---

## 4. Open decisions: ask the owner before building (defaults in bold)

- **D1 Who can pay with store credit?** **Sales agents and owners (everyone who
  can log payments).** Alternative: owners only.
- **D2 Credit that came from a payment still `Pending`?** **Allow it, but show a
  warning** ("This credit came from a payment the owners haven't checked yet")
  and send the owners a bell notification. Alternative: block until Verified.
  (Without the ledger the source payment can only be guessed: the customer's
  latest overpaid payment.)
- **D3 Leftover credit on an SPX order?** **Leave it as store credit for the next
  order.** Alternative: let the agent put it on the order as a shipping fee
  (like Payment Fix's "Shipping fee" button for SPX advance SF).
- **D4 Fix the 18 old orders (Phase 5)?** **Yes, after a dry run the owners have seen.**
- **D5 Build the ledger (Phase 6)?** **Yes**, if the owners will paste one SQL script.
- **D6 Cancelling returns credit automatically (Phase 7)?** **Yes.**

When the owners answer, add a short section to `docs/BUSINESS_WORKFLOW.md`
("Store credit (owner, 2026-11-xx)") with their decisions, in plain words like
the other sections.

---

## 5. Things not to break

- `paymentEffect()` status rule: a fully paid order only closes if it's already
  Shipped / For Pick-up. A paid lay-away that isn't packed must stay open.
- GCash split (`gcash-transfer-service.ts`) and its "extra goes to store
  credit" behaviour.
- Bus Shipping advance-SF logic (`busSfResult`): don't change what "advance" means.
- `readOrderCarriedAmounts()` (keeps credit and bus SF on edit; fixed 2026-11-09).
- Customer return money flows and their expense categories.
- Payment Fix (`[Reconciled` marker, frozen snapshot).
- Locked unallocated-stock formula (not related, but never touch it).
- Supabase responses cap at 1,000 rows: page through (`fetchAllPages`) in any
  report or script.
- Times are stored UTC; show Philippine time (UTC+8).

## 6. Related pre-existing issue (report, don't fix unless asked)

The RPC's edit branch inserts an `expenses` row `'Customer Store Credit
Liability'` when an edit turns into an overpayment. Cash Flow counts it as cash
out and P&L as an expense, although no money left. Mention it to the owner;
fix only if they say so.

## 7. How to work

- **The database is the live production Supabase.** Never write test data to
  it. Reads via PostgREST with `SUPABASE_SERVICE_ROLE_KEY` +
  `NEXT_PUBLIC_SUPABASE_URL` from `.env.local` (read the values in a small Node
  script; never put keys on the command line).
- No test runner in `package.json`. Put the money rules in pure functions
  (like `order-payment-rules.ts`, `bus-fee-rules.ts`) and check them with a
  small `tsx` script against in-memory data (`scripts/tests/` has examples).
- `npm run typecheck` must pass. Run `npm run check:lines`; split files over 400 lines you touch.
- Commit to `main` and push (Vercel deploys from `main`; no PRs). Other
  sessions share this checkout: run `git diff --cached --stat` first and commit
  only your own paths. Check the Vercel deploy after pushing.
- Explain results to the owner in plain words; they don't read the code.
