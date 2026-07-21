# NegoPinoy CRM POS — Architecture Guide

> **For AI assistants**: Read this file first before making any code changes.
> It explains how this system is organized, what each module does, and where to find things.

---

## System Overview

**NegoPinoy CRM POS** is an internal business management system for NegosyantengPinoy.Ph.
It is a **Next.js 15 monolith** (App Router) backed by **Supabase** (PostgreSQL + Auth + Storage).

It combines the following business domains into one application:

| Domain | Status | Description |
|---|---|---|
| **Orders / POS** | ✅ Production | Order creation, tracking, status management |
| **CRM** | ✅ Production | Customer management, payment terms, collections |
| **Inventory** | ✅ Production | Stock tracking, procurement, restocking, batch receiving |
| **Accounting** | ✅ Production | Payments, expenses, recurring costs, SPX remittances |
| **Reports** | ✅ Production | Sales, P&L, AR, commissions, procurement sheets |
| **Shipping** | ✅ Production | SPX courier integration, packing, pick-up management |
| **AI Layer** | 🔧 Partial | Receipt OCR parsing, marketing recommendations |
| **Chatbot** | ⏳ Planned | Not yet implemented |
| **E-commerce Website** | ⏳ Partial | Separate Vite app in `/website` |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router, React 19) |
| Language | TypeScript |
| Styling | Tailwind CSS + shadcn/ui (Radix UI primitives) |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth |
| Storage | Supabase Storage |
| AI | Google Genkit + Gemini |
| Forms | React Hook Form + Zod |
| Charts | Recharts |
| OCR | Tesseract.js + Google Vision (via Genkit) |
| PDF | pdfjs-dist |
| E-commerce | Vite + React (separate app in `/website`) |

---

## Folder Structure

```
/src
  /app                    ← Next.js routes (thin shell, minimal logic)
    /dashboard            ← All protected dashboard routes
      /orders             ← Order list + order detail pages
      /products           ← Product management
      /inventory          ← Inventory sub-routes
      /accounting         ← Accounting sub-routes
      /customers          ← Customer management
      /suppliers          ← Supplier management
      /reports            ← Report pages
      /pack               ← Packer app (warehouse use)
      /for-shipping       ← Shipping queue
      /for-pick-up        ← Pick-up queue
      /packed-orders      ← Packed order management
      /approval-queue     ← AI approval queue
      /simulator          ← AI simulator
      /chat               ← Chat history
      /users              ← User management
      /settings           ← App settings
    /api                  ← Server-side API routes
      /inventory          ← Inventory API endpoints
      /payments           ← Payment processing (OCR)
  /components             ← UI components
    /dashboard            ← Dashboard-specific components
      /accounting         ← Accounting dialog components
      /inventory          ← Inventory dialog components
      /orders             ← Order panel components
      /reports            ← Report components
    /ui                   ← shadcn/ui base components (DO NOT EDIT)
  /hooks                  ← Shared React hooks
  /lib                    ← Core utilities
    /supabase             ← Supabase client setup
    /schemas              ← Zod form validation schemas
  /types                  ← ⭐ CENTRALIZED TYPE DEFINITIONS (see below)
  /ai                     ← AI flows (Genkit)
    /flows                ← Individual AI flow files

/website                  ← Separate Vite e-commerce app (public-facing)

/scripts                  ← One-off utility scripts (NOT production code)
  /migrations             ← Data migration scripts
  /fixes                  ← Data fix scripts
  /audits                 ← Data integrity check scripts
  /reports                ← Report generation scripts
  /scratch                ← Experimental/temp scripts
  /tests                  ← Ad-hoc library test scripts

/docs                     ← Documentation and data files
```

---

## ⭐ Type System (IMPORTANT)

**All application types live in `/src/types/`.**

Always import types from `@/types`:

```typescript
import type { Order, Customer, Product, UserProfile } from '@/types';
```

| File | Contains |
|---|---|
| `user.types.ts` | `UserRole`, `UserProfile`, `AuthUser`, role helper functions |
| `order.types.ts` | `Order`, `OrderItem`, `PaymentRecord`, `OrderStatus`, `PaymentType` |
| `product.types.ts` | `Product`, `ProductVariation`, `StockBatch`, `Category`, `InventoryMovement` |
| `customer.types.ts` | `Customer`, `CustomerWithStats` |
| `supplier.types.ts` | `Supplier`, `ProcurementRequest`, `ProcurementBatch` |
| `accounting.types.ts` | `Expense`, `RecurringExpense`, `SpxRemittance`, `FinancialSummary` |

> For Zod **form validation schemas** (not runtime types), see `/src/lib/schemas/`.

---

## Role System

The app has 4 user roles stored in Supabase user metadata:

| Role | Access |
|---|---|
| `Owner` | Full access — inherits all roles |
| `Admin` | Full access — inherits Sales + Inventory |
| `Sales` | Orders, Customers, Products, Reports |
| `Inventory` | Products, Inventory management, Procurement |

Role checks are done via `useUserProfile()` hook and helper functions in `user.types.ts`.

---

## Database (Supabase)

Key tables (not exhaustive):

| Table | Description |
|---|---|
| `orders` | Order records |
| `order_items` | Line items per order |
| `payments` | Payment records per order |
| `products` | Product catalog |
| `product_variations` | Variant products |
| `stock_batches` | Inventory cost batches (FIFO) |
| `inventory_movements` | Stock movement history |
| `customers` | Customer records |
| `suppliers` | Supplier records |
| `supplier_pricing` | Per-supplier unit costs |
| `procurement_requests` | Stock reorder requests |
| `expenses` | One-time expense records |
| `recurring_expenses` | Recurring expense templates |
| `categories` | Product categories |
| `notifications` | In-app notifications |

**Auth**: Uses `supabase.auth` — user metadata stores `first_name`, `last_name`, and `roles[]`.

### Product Variants: `name` vs `variant_name` (recurring bug source)

A variant is just a row in `products` with `parent_id` set. It has **two separate name columns** that must be kept in sync manually — nothing in the DB enforces it:

- `name` — the full display name (by convention `"${parentName} - ${variantSuffix}"`, e.g. `"18L Kaisa Villa Air fryer Oven - CASH BASIS"`).
- `variant_name` — just the short suffix (e.g. `"CASH BASIS"`), used by `ProductsTable.tsx` to label the row nested under its parent (`child.variantName || child.name`).

The product edit dialog (`product-dialog.tsx` / `useProductDialog.ts`) only exposes a single "Product Name" field, pre-filled with the full `name`. Editing and saving it used to write `name` only — `variant_name` silently went stale, so a renamed variant would keep showing its **old** name in the products list even though the rename "worked" (confirmed bug, fixed in `useProductDialog.ts`'s edit-submit path).

**The fix**: on save, if the product being edited is a variant (`parent_id` set) **and** the name actually changed (`core.name !== displayProduct.name`), `variant_name` is updated to match. The "did it actually change" guard matters — since Product Name always shows the *full* compound name, unconditionally syncing on every save (e.g. just editing price/stock) would overwrite an already-correct short `variant_name` like `"CASH BASIS"` with the full string every time.

**Known limitation**: this only keeps things in sync going forward. Variants renamed *before* the fix landed still show stale `variant_name` in the list until someone re-opens and re-saves that specific variant (which now correctly syncs it).

### `inventory_movements` schema mismatch (recurring bug source)

The real columns are `product_id`, `quantity_change`, `movement_type`, `timestamp`, `reason`, `supplier_name`, `unit_cost` — **there is no `previous_stock`, `new_stock`, `type`, or `user_id` column.** Several call sites were written against that wrong (more descriptive-sounding) shape and silently failed:

- `POST /api/inventory/procurement-request`'s "Option C: Auto-adjust Negative Inventory" insert.
- `POST /api/inventory/procurement/sync` (the per-row "Sync Stock" button's audit log).
- `discrepancy-report.tsx` (the Reports → "Auto-Adjustments" tab) — read the same wrong column names, so the whole tab threw a "column does not exist" error on every load and just showed nothing.

All three were fixed (as of 2026-07-16) to use the real schema — writes now use `quantity_change`/`movement_type`/`supplier_name`, with the before→after transition folded into the free-text `reason` string since there's nowhere else to store it. **Before adding any new `inventory_movements` insert or query, check a live row's actual shape first** (`select('*').limit(1)`) rather than copying an existing call site — several of them were wrong.

### Silent Failures on Logging (`order_logs`, `notifications`, etc.)

A recurring pattern in the codebase involves updating a core table (e.g. `orders`) and then inserting an audit log (e.g. into `order_logs`). If the insert statement does not explicitly check and handle its error (`if (error) throw error;` or log it), a failure in the log insertion (e.g. due to an RLS policy, transient DB lock, or invalid ENUM) will fail silently. 

This causes the system state to become out-of-sync with the audit trail. For example, if a status is updated to `Processing` but the `order_logs` insert fails silently, the UI Order Trail will incorrectly show the last state (e.g. `Packed`), causing major confusion for staff who rely on the Order Trail to understand the current state. 

**Rule**: Always capture and handle the `error` object when inserting logs. If the logging is not wrapped in a transaction with the main update, at least explicitly log the failure to `console.error` to assist in debugging.

### Item-Level Fulfillment (`is_packed`)

Because an order can be reverted to `Processing` after it has already been physically packed (e.g. to add a new item or edit customer details), checking `orders.status` is not sufficient to know if the physical stock has been allocated. This caused issues where reverting an order would incorrectly trigger a fake stock shortage in Procurement.

To solve this, fulfillment is tracked at the **item level**.
- `order_items` has an `is_packed` boolean column.
- When `usePacker.ts` packs an order, it sets `is_packed = true` on all of its items.
- If the order is reverted, these items *keep* their `is_packed = true` status, so they don't reappear in Procurement.
- Any newly added items to a reverted order default to `is_packed = false`, meaning they correctly trigger Procurement demand.
- If a staff member needs to "steal" stock from a packed order for another customer, they use the "Release Stock to Warehouse" option when reverting, which explicitly resets `is_packed = false`.

**Rule**: Whenever calculating "unfulfilled demand" (like in `api/inventory/procurement`), you MUST filter out items where `is_packed = true`. Order-level status is only for workflow stages, not stock allocation.

---

## Supabase Client Usage

```typescript
// In CLIENT components:
import { useSupabase } from '@/lib/supabase/hooks';
const supabase = useSupabase();

// In SERVER components / API routes:
import { createClient } from '@/lib/supabase/server';
const supabase = await createClient();
```

### ⚠️ The 1000-row query cap (recurring bug source)

An unfiltered `.select()` from the Supabase client **silently caps at 1000 rows** (PostgREST default) — no error, it just quietly returns an incomplete result. This has caused real, confirmed production bugs twice already:
- `useProducts.ts` fetched the whole `products` table unfiltered, ordered by name — once the catalog passed 1000 rows, every product alphabetically past the cutoff (e.g. anything starting with "Ti" onward) was completely invisible in the UI, including newly-added ones. Staff kept re-adding products they couldn't find, creating duplicates.
- `pnl-report.tsx` and `dashboard/page.tsx` fetched all `order_items`/`orders`/`expenses` unfiltered — with 1000+ order_items in the table, this silently zeroed out Cost of Goods Sold and Net Profit for whichever periods landed past the cutoff.

**Rule going forward**: never fetch a full table unfiltered and rely on it being complete.
- If the data is naturally scoped (by date range, by a set of IDs), filter **at the query level** — see `dashboard/page.tsx`'s date-range-scoped `orders` query.
- If the full table genuinely needs to load (e.g. a catalog/list page), page through it explicitly with `.range()` in a loop until a page comes back short — see `useProducts.ts`.
- Never fetch everything and filter/paginate client-side in JS; that's what silently breaks once a table crosses 1000 rows.

---

## AI Layer (Genkit)

Located in `/src/ai/`:

| File | Purpose |
|---|---|
| `genkit.ts` | Genkit initialization with Gemini model |
| `flows/parse-receipt-flow.ts` | Parses purchase receipt images/PDFs via OCR |
| `flows/generate-marketing-recommendations.ts` | Generates product marketing copy |

AI flows are called from `/src/app/api/` route handlers, not directly from components.

**Planned** (not yet built):
- `flows/chatbot.flow.ts` — Internal business assistant chatbot
- `flows/order-assistant.flow.ts` — AI-assisted order creation

---

## E-commerce Website (`/website`)

A **separate Vite + React app** deployed independently.

- Has its own `package.json` and `node_modules`
- Connects to the **same Supabase project** for product data
- Currently has no shared type definitions with the main app
- **Integration plan**: Phase 3 will define a shared API contract

---

## SPX Remittance Rules

**Location**: `src/app/dashboard/accounting/remittances/page.tsx`

Staff upload SPX's "Account Transaction List" Excel export. For each tracking number in the file, the system matches it to an order and buckets it into one of two paths:

- **Needs payment**: the order isn't yet marked as COD-received — the file's COD amount is applied toward the order's balance (capped at what's still owed), a payment record is created, and any leftover COD is used to offset shipping/processing fees.
- **Already paid**: the order's balance is already settled (e.g. status is `Payment Received (COD)`, or an SPX remittance payment already exists) — the row is informational only (it doesn't touch `amount_paid` / `balance_due`), but the courier fee SPX actually deducted still gets recorded as an Expense.

A duplicate-guard (matches existing Expense descriptions like `SPX ... Fee for Order #XXXXX`) prevents re-uploading an overlapping file from double-recording the same courier fee.

**Double-booking bug (fixed 2026-07-16)**: the actual logic lives in `useSPXRemittance.ts`. For each tracking number, `balanceNeeded` is computed from `order.amount_paid` at fetch time — if a staff member already manually logged the down payment (e.g. an `Installment`-method payment entered as soon as the rider confirmed COD collection, before the remittance Excel was ever processed), `balanceNeeded` correctly comes out to `0`. The code used to then fall into an `else if (order.status !== 'Payment Received (COD)')` branch that applied the *entire* collected COD as a brand-new payment anyway — reasoning "there's still real money here, don't lose it" — which silently double-booked the same down payment as two separate `payments` rows (one `Installment`, one `SPX COD Remittance`) whenever the manual entry preceded the file upload. The fallback branch was removed; `codToApply` is now `0` whenever `balanceNeeded` is already satisfied, matching the older one-off migration script (`scripts/migrations/process_spx.mjs`) which never had this bug. The "already settled" branch (fee-only recording, no new payment) now also fires whenever real COD was reported but none of it could be applied for this reason, so it's still visible in the sync results instead of silently vanishing.

There are also specific rules regarding fees:

1. **Valuation Charge**: (1%) This is charged to the customer (part of the Order Total).
2. **COD Fee**: (~0.5%) This is **not** charged to the customer. It is absorbed by the business as a "hidden fee".
3. **Hidden Fee Calculation**: Since the SPX Excel file might not explicitly break down these fees in separate rows, the system automatically calculates the hidden courier fee by taking the **Expected Collection Amount** and subtracting the **Net Remittance** (COD collected minus any explicit shipping fees in the file).
4. **Installment/Layaway Expected Collection**: For installment orders, the Expected Collection Amount is specifically the expected downpayment minus what has already been paid, **not** the full order total. This prevents the system from inflating courier fees for unpaid future installments.

---

## Payments Dashboard

**Location**: `src/app/dashboard/accounting/payments/page.tsx`

Shows all logged payments across three tabs (Pending / Verified / Rejected). Payments get created via two paths: the initial payment logged at order creation (`src/lib/services/order-service.ts`), and payments logged later against an existing order (`src/components/dashboard/log-payment-dialog.tsx`).

**OCR auto-fill** (`src/app/api/payments/extract-ocr/route.ts`): when a payment has a proof-of-payment image, an async (non-blocking) request fires to this route right after the payment is created. It runs Tesseract.js first — free, runs in-process, no external API or key needed — to read the reference number and amount off the receipt. If Tesseract can't find one of those two fields, it retries with Google Cloud Vision (`GOOGLE_CLOUD_VISION_API_KEY` env var) as a paid fallback; Vision handles real camera photos (glare, angle, background clutter) far more reliably than Tesseract, which is strongest on clean in-app screenshots. Results populate the payment's `reference_number` / `ocr_amount` columns for staff to cross-check against the reported amount. Because Tesseract needs `worker_threads` and a `.wasm` core that Next's bundler/file-tracer won't pick up by default, `next.config.ts` lists `tesseract.js`/`tesseract.js-core` under `serverExternalPackages` and explicitly traces the `.wasm` files in via `outputFileTracingIncludes`.

**Verify via Statement** (`src/app/api/payments/verify-pdf/route.ts`): staff upload a password-protected bank/GCash statement PDF. The route extracts transaction rows from the PDF by grouping `pdfjs-dist` text fragments by Y-position (naively joining all text on a page collapses every row into one string and breaks row boundaries), then matches each Pending payment's OCR'd reference number against a real transaction row. Since a single real transfer can legitimately be split across multiple payment rows (e.g. applied toward two different orders), matching is grouped by reference number and compares the *summed* amount across every payment sharing that reference against the real transaction amount, with a small (₱5) tolerance for minor OCR amount misreads. Matching payments get marked `Verified`.

---

## Installment Pricing, Early Settlement & Payment-Terms Edits (added 2026-07-21)

Installment "interest" exists in **two different places**, and they are NOT the same thing:

1. **Order-level markup** — for an Installment order, `orders.total_amount = downpayment + (monthly_payment × installment_months)`, which staff set higher than the cash price. This applies to every installment order.
2. **Item-level markup** — for installment **first-timers only** (`isInstallmentFirstTimer` in the order dialog), items are priced at `products.installment_price` instead of `selling_price`, so the markup is **baked into `subtotal`** via `selling_price_at_sale`.

**The "cash basis" formula** used everywhere: `subtotal − total_discount + insurance_fee + shipping_fee`. Reverting an installment order to this waives markup #1 automatically, but NOT markup #2 (first-timer item pricing stays in `subtotal`) — which is why the Early Settlement dialog makes the settlement total editable.

### Early Settlement (customer pays off an installment plan early)

Business policy: a customer who received their item may pay the remaining balance in full; the unearned installment interest is **waived by reverting the order to the cash price** — never by recording a discount (discounts would distort margin/sales reports).

- **UI**: Orders table → ⋮ menu → "Early Settlement (Pay in Full)" (`src/components/dashboard/early-settlement-dialog.tsx`). Shown only for Installment orders with `balance_due > 0` that aren't Cancelled/Returned.
- **DB**: `settle_installment_order(payload)` RPC — locks the order row (`FOR UPDATE`), refuses non-installment orders, computes the payment due from the **live** `amount_paid`, inserts the final payment (note records the plan and waived interest), converts the order to `Full Payment` / `Completed` with `balance_due = 0`, and routes any excess prior payments to `customers.store_credit` (+ an `accounting_expenses` "Customer Store Credit Liability" row) — all in one transaction.

### Edit Payment Terms (`src/components/dashboard/edit-payment-terms-dialog.tsx`)

Backed by the `update_payment_terms(payload)` RPC (same atomic/locking approach). Two invariants that were once bugs — do not reintroduce them:

- The dialog's amount field means **"payment collected now"** and is **added** to `orders.amount_paid` server-side. It must never overwrite the accumulated total (the old client-side version wiped prior payments when switching to COD).
- Moving **away** from Installment reverts `total_amount` to the cash basis (including insurance + shipping fees); `balance_due` is capped at ≥ 0 (the old version could go negative when switching to Full Payment). Moving **to** Installment sets `total_amount = amount_paid + payment_now + monthly × months` (the schedule covers only the *remaining* balance).

Both RPCs live in `scripts/migrations/add_settlement_and_terms_rpcs.sql` (applied 2026-07-21 via the Supabase Management API — `SUPABASE_ACCESS_TOKEN` + `SUPABASE_PROJECT_REF` in `.env.local`). Payment-proof uploads and the fire-and-forget OCR trigger stay client-side; everything that touches money is inside the RPCs.

---

## Cost of Goods Sold (COGS) & Just-In-Time Costing

This business runs **just-in-time inventory** — a product is bought only after a customer orders it, so the real cost is not known at order-creation time. `order_items.cost_price_at_sale` is snapshotted from `products.initial_unit_cost` the moment an order is created (in the `process_order_transaction` Postgres RPC, defined in `update_order_func.sql` at the repo root) and **never updated automatically after that** — so for a JIT business this snapshot is usually `0` until something explicitly backfills it.

**Where the real cost gets captured**: the Procurement Sheet (`src/app/dashboard/reports/procurement/page.tsx`, "Click 'Buy' to record items as you shop") is where staff enter what they actually paid. `POST /api/inventory/procurement` ([route.ts](src/app/api/inventory/procurement/route.ts)) does three things when a purchase is recorded:
1. Updates `products.initial_unit_cost` (so *future* orders snapshot the right cost going forward).
2. **Backfills `order_items.cost_price_at_sale`** for the orders that were actually waiting on this product — oldest first, only fully covering an order line if the purchased quantity can cover it entirely (a line's cost is never split across two purchases). Extra units bought beyond current demand aren't assigned to any order; they're already handled by the `initial_unit_cost` update, since the next order placed will snapshot that value.
3. Auto-resolves any open `procurement_issues` for that product.

Products that have genuinely never been purchased (no cost on file anywhere) can't be backfilled automatically — those need a real "Buy" action before their cost is known. **Known limitation**: there's no true FIFO/batch cost tracking (the `stock_batches` table exists in the schema but nothing ever writes to it — it's dead code, despite the "FIFO" naming that used to appear in the P&L report). If a product is bought at one price, then bought again later at a different price before the first batch sells through, a future order may get costed at whichever price was entered most recently rather than the price of the specific physical unit sold.

**Where COGS gets consumed** — two independent implementations that must stay in sync:
- Dashboard home (`src/app/dashboard/page.tsx`) — Net Profit widget, scoped to the selected date range at the query level.
- P&L Statement report (`src/app/dashboard/reports/pnl-report.tsx`) — same calculation, its own date-range picker.

Both sum `order_items.cost_price_at_sale × quantity` for non-void (`Cancelled`/`Returned` excluded) orders in the period, then subtract expenses (excluding category `"Cost of Goods Sold"`, to avoid double-counting the one-time COGS corrections some inventory screens create as Expense rows — see [pending-costs/page.tsx](src/app/dashboard/inventory/pending-costs/page.tsx)).

**Gotcha worth remembering**: expense records use the column `expense_date`, not `date` or `created_at` (both of those were used by mistake in different files and either error outright or silently return nothing). Every `expenses` insert in the codebase writes to `expense_date` — filter by that column, always.

**Gotcha**: this data is exactly what tripped the 1000-row query cap described under "Supabase Client Usage" — always scope these queries by date range at the query level, never fetch-everything-then-filter.

---

## Procurement Sheet: three numbers that must not be confused

**Location**: `src/app/dashboard/reports/procurement/page.tsx`, backed by `GET /api/inventory/procurement`.

**As of 2026-07-16, the sheet lists a product if *either*:**
1. It has an active **Staff Draft** — a `purchase_order_items` row on the special `purchase_orders.notes = 'STAFF_DRAFT'` PO, created via `POST /api/inventory/procurement-request` (called from the Picker app on out-of-stock report, the "Add Missing Item" dialog, or the standalone Procurement Request page); **or**
2. It's already on a real purchase order pending receipt; **or**
3. `products.stock_level < 0` **and** it has at least one genuinely unfulfilled order (`needToBuyQty > 0` — see the table below), even if nobody has filed a draft for it yet.

(3) exists because a draft is normally only created when a *picker* reports a shortage while picking — an order still sitting in `Processing` (not yet picked) previously left a real, already-oversold shortage completely invisible until someone happened to pick it. The admission check deliberately uses **Need to Buy**, not the broader **Total Open Demand** (see below): a stock deficit fully explained only by an already-`Picked`/`Photo`/`Packed`/`For Shipping`/`For Pick-up`/`Completed`/`Shipped` order is real, but nobody is blocked on it — a picker already secured a physical unit, so buying more wouldn't help. Using Total Open Demand as the admission test was tried first and rejected: it put fully-fulfilled orders' negative stock onto the "what do we need to buy right now" list, which reads as "need to buy 4" when the true answer is "already handled, nothing to buy." Those negative-but-fulfilled products instead show up on the separate **Stock Reconciliation** report (below).

Each row then shows three numbers that look similar but answer different questions:

| Column | Meaning | Source |
|---|---|---|
| **Current Stock** | Running ledger: total ever purchased minus total committed to every open order — including already-picked/packed ones, since stock is deducted the moment an order is *placed*, not when it's picked. Can drift stale if manually mis-synced. | `products.stock_level` |
| **Staff Req. (note)** | A manually-typed number from whoever submitted the request. Informational only — never auto-grows when new orders arrive, only auto-shrinks when an order is edited down. **Never used to decide how much to buy.** | `purchase_order_items.expected_qty` on the STAFF_DRAFT row |
| **Need to Buy (buy qty)** | Live count of orders still needing this item that have **not yet been picked** (`Pending Payment`, `Processing`, `Picked (with issue)`, `On-Hold`, `Waiting for Stock`). Drives the "Buy" quantity default. Orders already `Picked`/`Photo`/`Packed`/`For Shipping`/`For Pick-up` are excluded — a real unit was already pulled for those. | Live `order_items` query in the GET route |

A fourth, internal-only **Total Open Demand** (every open order regardless of pick status — the true counterpart to `stock_level`'s ledger math) exists only to detect when Current Stock has drifted from reality (the orange "Current Stock doesn't match total open orders" warning + "Sync Stock" button — which syncs Current Stock to Total Open Demand, not to Staff Req.).

**Gotcha**: clicking Current Stock or Staff Req. opens the same "Stock Allocation Details" popup (`reserved-stock-dialog.tsx`) that Need to Buy uses, and all three now share one status filter — `Pending Payment`, `Processing`, `Picked (with issue)`, `On-Hold`, `Waiting for Stock`. Plain `Picked`, `Photo`, `Packed`, `For Shipping`, and `For Pick-up` orders are excluded from the popup's row list because the item has already been physically pulled off the shelf by that point (`Picked (with issue)` stays, since that pull may not have actually succeeded). This means the popup's visible rows can sum to *less* than the Current Stock deficit / Total Open Demand number that opened it — that underlying number is unchanged and still counts every open status for the ledger-accuracy check above. Only the popup's displayed list was narrowed, to answer "what still needs physically allocating" rather than "what's on the books."

**Order attribution** (`procurement_request_sources`, migration in `scripts/migrations/add_procurement_request_sources.sql`): when a request is tied to a specific order (currently only the Picker app's out-of-stock report), this table records which order(s) contributed to a draft line's quantity, so "Staff Req." can show "for #A232A043 (Customer Name)" instead of an anonymous number. 

**Order Validation Rule:** Ad-hoc requests created via the standalone Procurement Request page now strictly require a valid Order Number for each item. The system enforces that:
1. The typed Order Number (even a short prefix) resolves to a valid order in the database.
2. The requested product is either directly part of the order (`order_items`) or is an underlying component/part of a bundle product in that order (`assembly_recipe`).
3. The requested quantity **cannot exceed** the total quantity needed by that order for that item (including expansion logic if the item is a component of a requested bundle).

### Stock Reconciliation report (added 2026-07-16)

**Location**: Reports → "Stock Reconciliation" tab (`to-order-report.tsx`, still the `to-order` tab value under the hood — only the label changed). Reads `reconciliationItems` from the same `GET /api/inventory/procurement` response used by the sheet above.

This is the deliberate complement of the procurement sheet: every `stock_level < 0` product that did **not** get admitted onto the actionable sheet because `needToBuyMap` is `0` for it — i.e. no order is currently unfulfilled, so there's nothing to buy right now, but the deficit is still real. It's not a purchasing task; it's a periodic cost/inventory review. Split into two groups, computed by checking `order_items` for *any* non-void (`Cancelled`/`Returned` excluded) order ever, regardless of status:

- **"No connected order — likely a data error"**: nothing in order history explains the deficit at all (should be rare — the initial cleanup pass on 2026-07-16 reset 13 such products to `stock_level = 0`, each logged as an `inventory_movements` adjustment). Has a one-click **"Reset to 0"** button per row, which just calls the existing `POST /api/inventory/procurement/sync` with `targetQty: 0`.
- **"Explained by an already-fulfilled order — accounting debt"**: a real order consumed the stock but already shipped/completed with no purchase ever recorded to true up its cost (see COGS section above — `cost_price_at_sale` stays `0` until a purchase backfills it). No reset button here on purpose: zeroing this would erase the only signal that a real cost still needs recording, and would silently remove the mechanism that would otherwise catch shrinkage/theft or an unpaid supplier. Left negative until someone actually restocks it.

---

## Bundle Products & Assembly Recipes

Some products are **bundles** assembled from other real, purchasable products — e.g. "Cy19 Stainless Pan 32cm with Takip" = 1x pan + 1x glass cover. This is modeled via `products.assembly_recipe` (a JSON array of `{ productId, quantity }`), configured per bundle product. A bundle's own `stock_level` is not meaningful for purchasing — suppliers only sell the components, never the bundle itself.

**Expansion happens in three places:**
- `POST /api/inventory/procurement-request` — when a picker/staff reports a bundle out of stock, the request is expanded onto its components (`requestedQty × component.quantity`) before being written to `purchase_order_items`, so the resulting draft targets something a supplier can actually sell.
- `GET /api/inventory/procurement` ([route.ts](src/app/api/inventory/procurement/route.ts)) — separately expands *order demand* for a bundle onto its components (section "3a/3b" in the route) so both Total Open Demand and Need to Buy reflect real customer orders for the bundle, not just direct component orders.
- `reserved-stock-dialog.tsx` (Stock Allocation Details popup) — does the same expansion client-side, tagging each bundle-driven row with "via <bundle name>", so its customer list matches the number shown on the procurement sheet.

**Gotcha**: `assembly_recipe` defaults to `[]` (empty array), **not `null`**, on almost every product. A `.not('assembly_recipe', 'is', null)` filter matches nearly the whole catalog and silently truncates at the 1000-row cap (see "1000-row query cap" above) before it reaches the bundle you actually need. Page through with `.range()` and check `recipe.length > 0` client-side instead.

**Self-healing leaked bundle drafts**: if a bundle's `assembly_recipe` wasn't configured yet at the moment someone reported it out of stock — or a product merge accidentally reassigns a `purchase_order_items` row onto a bundle's `product_id` — the expansion above has nothing to expand, and the draft lands directly on the bundle's own `product_id`, where it's stuck forever, since a bundle is never a real thing to "Buy". `migrateLeakedBundleDrafts()` (top of `GET /api/inventory/procurement`) runs on every Procurement page load: it finds any `STAFF_DRAFT` item whose product now has a non-empty `assembly_recipe`, and migrates it onto its components, merging into whatever component draft already exists. Because this route can be hit by two near-simultaneous requests, each leak is claimed via an atomic `DELETE ... RETURNING` (not a status flip — `purchase_order_items.status` only allows `pending_receipt`/`received` by a DB check constraint) so only one concurrent request processes a given leak; the other sees nothing deleted and skips it.

---

## Soft-Deleted Products (`[DELETED]` prefix)

Products are never hard-deleted — they're renamed with a `[DELETED] ` prefix. `useProducts.ts` (the main Products page) filters these out with `.not('name', 'ilike', '[DELETED]%')`.

**Rule going forward**: every product search box in the app must apply this same filter, or literal `[DELETED]`-named products become fully searchable and orderable again. This filter was missing from 6 different search components in one audit — order "Add Product" (`useProductSearch.ts`), Bulk Receive (`product-search.tsx`), Receive's "Add Unexpected Item" (`pending-product-search.tsx`), `scan-product-search.tsx`, Procurement's "Add Missing Item" dialog, and `view-supplier-products-dialog.tsx` — check any new product-search UI against this pattern before shipping it.

**Orphaned children (recurring data bug)**: `useProducts.ts` only fetches variant children for parent IDs that survived the `[DELETED]` filter — so if a parent was renamed to `[DELETED]` without first reassigning its children to a new parent, those children become invisible on the Products page (not a top-level row, and not fetched as anyone's child either) even though they still carry real stock and order history. One cleanup pass found and merged 23 such orphans, several with real inventory (one had 4,200 units sitting invisible). If a product seems to have vanished from the Products page, or shows stock/orders with no visible source product, check `products.parent_id` against a `[DELETED]`-named parent first.

---

## Order Fulfillment Pipeline

Scope: Picker app → Second Check → Packer app → Packed Orders review → For Shipping / For Pick-up.

Each scan app is a thin page backed by its own hook. Same shape every time: scan a QR → fetch the order by id → update `orders.status` → append a row to `order_logs`.

| Stage | Page | Hook | Status transition |
|---|---|---|---|
| Picker app | `src/app/dashboard/pick/page.tsx` | `src/hooks/usePicker.ts` | `Processing` → `Picked` (or `Picked (with issue)` if items are flagged out of stock) |
| Second check | `src/app/dashboard/verify/page.tsx` | inline in the page | `Picked` / `Picked (with issue)` → `Photo` |
| Packer app | `src/app/dashboard/pack/page.tsx` | `src/hooks/usePacker.ts` | `Photo` → `Packed` |
| Packed orders | `src/app/dashboard/packed-orders/page.tsx` | inline in the page | `Packed` → `For Shipping` (Verify), stays `Packed` with `not_for_shipping_reason` set (Delay), or → `Processing` (Revert) |
| For shipping / for pick-up | `src/app/dashboard/for-shipping/page.tsx`, `src/app/dashboard/for-pick-up/page.tsx` | `src/hooks/useForShipping.ts` | `For Shipping` → shipped/completed |

Detail per stage:

- **Picker app** — flags out-of-stock items with a missing quantity. On submit with issues: inserts rows into `order_issues`, posts an initial message to `order_issue_messages`, calls `POST /api/inventory/procurement-request` to auto-create restock requests, and inserts a `notifications` row for the sales rep.
- **Second check** — re-diffs the order's current items against the picker's `order_logs` snapshot (`snapshot_data.items`) to catch edits made to the order after picking, and surfaces them as warnings before allowing submission.
- **Packer app** — assigns items into one or more boxes with dimensions/weight (`boxes_config`), and on submit auto-resolves any open `order_issues` for that order.
- **Packed orders** — a review page, not a scanner. `verify-shipping-dialog.tsx` collects shipping address/COD/payment details and moves the order to `For Shipping`; `not-for-shipping-dialog.tsx` delays it; `revert-pending-dialog.tsx` sends it back to `Processing`.
- **For shipping / for pick-up** — syncs SPX courier files, exports courier-format sheets, and marks orders shipped via `mark-shipped-dialog.tsx`.

**Packer app blocks packing until Second Check has run.** `usePacker.ts`'s `handleScanSuccess` previously only checked whether an order was *already* `Packed`/`For Shipping`/`For Pick-up` — it never checked whether the order had passed Second Check (`Photo`) at all, so a packer could scan an order straight from `Picked` / `Picked (with issue)` and confirm it packed without anyone having verified it. Fixed by hard-blocking `handlePackOrder` unless `orderDetails.status === 'Photo'`: submitting shows a destructive toast naming the order's actual current status, and `pack/page.tsx` shows a matching red "Second Check Required" banner (same treatment as the existing "Unresolved Issue" banner) and disables the "Confirm Packed" button while the condition holds. This doesn't change the state machine — `Photo` was already the required predecessor status per the table above — it just closes the gap where the Packer app wasn't actually enforcing it.

**`order_issues` auto-resolution isn't just the Packer app.** `resolveOpenOrderIssues()` + `STATUSES_THAT_CLEAR_ORDER_ISSUES` in `src/lib/services/order-service.ts` is the single source of truth for "which statuses mean the issue is behind us" (`Picked`, `Photo`, `Packed`, `For Shipping`, `For Pick-up`, `Shipped`, `Completed`, `Payment Received (COD)`, `Cancelled`, `Returned`). It's called from every path that can move an order into one of those statuses — the Packer app, a clean re-pick in the Picker app, the manual "Update Status" dropdown / bulk status change on the Orders page, `mark-shipped-dialog.tsx`, COD payment completion, `process-return-dialog.tsx` (finalizing a full return), and the Order Detail page's "Mark as Completed" button. Any *new* path that transitions an order's status must call this too, or its issue tickets go stale and sit open on the dashboard forever even after the order shipped (confirmed bug: found 30 stale-but-resolved tickets in one audit before every path was wired up; a second audit later found 19 more stale tickets from orders that had been `Cancelled`/`Returned` — statuses that weren't in the clearing list yet — or edited to remove the missing product entirely).

**Issue resolution on order edit, not just status change.** `editOrder()` also calls `resolveOrderIssuesForRemovedProducts()`, which resolves an order's open `order_issues` for any product that's no longer in the order's item list — covers the case where sales removes/replaces the specific out-of-stock item instead of moving the order's status. It skips issues with no `product_id`: order-level issues (e.g. the auto-created On-Hold issue) aren't tied to any item, so `null` would never match the "remaining products" list and the issue would get wrongly auto-resolved — and immediately replaced with a generic "System (Auto)" placeholder — on *any* edit to an On-Hold order, silently discarding the actual reason staff had entered.

**Re-reporting must clear the previous report before inserting a new one, not just at status-clearing points (confirmed bug, fixed).** Two paths were found accumulating duplicate open `order_issues` instead of replacing the previous report:
- `usePicker.ts`'s `handleSubmitPicking()` only called `resolveOpenOrderIssues()` when a re-pick came back completely clean (`!hasIssues`). A *partial* re-pick — still short on some items, but fewer than before — left every previously-reported item stuck `open` forever while inserting a fresh row for whatever was still missing on top of it, so the Missing Items dialog kept accumulating duplicates across every re-pick attempt instead of reflecting just the latest one. One real order accumulated 18 open `order_issues` rows (several of the same product duplicated up to 4x) from repeated partial re-picks over about a week, even though most of those items had long since been purchased. Fixed by calling `resolveOpenOrderIssues()` unconditionally before inserting the current attempt's issues, on every submit (clean or partial).
- `on-hold-reason-dialog.tsx` inserted a fresh order-level issue on every "Place On-Hold" confirmation with no check for an already-open one — unlike `editOrder()`'s own On-Hold path a few paragraphs up, which already guards against this. Re-using the dialog on an already On-Hold order would pile up duplicate order-level tickets the same way. Fixed with the same existing-open-issue guard; if one's already open, the new reason is logged as a message on it instead of inserting a duplicate.

Six other orders were found with the same pre-fix duplication (leftover from before these fixes landed) and cleaned up in a one-time data fix — for each order/product pair with multiple open entries, the newest was kept and the older repeats marked `resolved`. Any *new* path that (re-)reports an `order_issues` row for something that might already have one open should call `resolveOpenOrderIssues()` (or an equivalent existing-issue check) first, not just on the "fully fixed" case.

### Shared data layer

The apps never call each other directly — they coordinate entirely through shared Supabase tables.

| Table | Written by | Read by |
|---|---|---|
| `order_issues` (+ `order_issue_messages`) | Picker app (on out-of-stock report); Bulk Receive (on qty shortfall — see below); `POST /api/staff-messages` (manual staff tagging — see below) | Dashboard `order-issues.tsx` widget via `GET /api/inventory/issues`; `POST /api/inventory/procurement-request` auto-creates restock requests consumed by the Procurement Request page and Procurement Sheet report; Inbox Drawer (all issue types) |
| `order_logs` | Every stage (Picker, Second check, Packer, Packed orders Delay/Revert, issue resolution — see "Order Trail" below) | `src/lib/services/order-trail-service.ts`'s `fetchOrderTrail()`, consumed by `order-trail-dialog.tsx` and the Overdue Order dialog; Second check and Packer both read the latest `Picked`/`Picked (with issue)` log to detect edits made after picking |
| `notifications` | Picker app (issue reported), Packer app (order packed), `POST /api/staff-messages` (`source: 'staff_message'`, one row per tagged recipient), `POST /api/inventory/issues/messages` (`@mention` fan-out — see "@Mention Tagging" below), `overdue-order-dialog.tsx`'s `handleSendNote` (Order Notes `@mention` fan-out, client-side) | Bell-icon notifications for the sales rep who owns the order |

`orders.status` is the state machine; `order_logs` / `order_issues` / `notifications` are side channels that keep reporting and alerts in sync without the apps knowing about each other.

### Overdue Orders widget ↔ `order_issues`

**Overdue Orders** (`src/components/dashboard/orders/OverdueOrders.tsx`, rendered at the top of `src/app/dashboard/orders/page.tsx`) is a pure date filter over the already-loaded `orders` list — `orderStatus === "Processing" && paymentType !== "Lay-away" && daysSince(orderDate) > 10` — with no query of its own. It doesn't know about `order_issues` by default; an order can be "overdue" for reasons that have nothing to do with a reported stock problem (most currently are — customer waiting on payment, bundled with another order, waiting on a reply — not a logged issue at all).

The two surfaces are linked at the data layer (same `order_issues` table, filtered to `issue_type = 'order'`, `status = 'open'`) but were only linked in the UI **per-order, on click**: `overdue-order-dialog.tsx` fetches `GET /api/inventory/issues`, filters client-side for the opened order's ID, and shows an "Active Inventory Issue" box (missing items + message thread) if one exists.

As of 2026-07-16, `OverdueOrders.tsx` also fetches `/api/inventory/issues` once for the whole grid (in a `useEffect` keyed on `orders`), builds an `order_id → { count, productNames }` map client-side, and renders a red "Stock issue reported" `Badge` (icon: `PackageX`) directly on any card whose order has an open issue, with the affected product name(s) printed inline underneath (not hover-only, so it also works on touch/mobile) — so a stuck-and-flagged order is visible at a glance in the grid, not just after opening it. This reuses the existing endpoint and the existing per-order dialog fetch is unchanged (still refetches on open, so it stays correct even if the grid-level fetch is stale).

**Second, independent check: live stock, not just reported issues.** Cross-referencing confirmed **zero** of the 35 currently-overdue orders had an open `order_issues` entry — the reported-issue badge above had nothing to show. But that doesn't mean the orders aren't blocked by inventory; it means nobody had filed a report. A direct query of `order_items` joined to `products.stock_level` for those same 35 orders found **25 of them (71%)** contain at least one line item whose product is currently at `stock_level <= 0` — the real, current blocker for most of these orders, just never logged as an `order_issues` row. `OverdueOrders.tsx` now runs this as a second, independent `useEffect` (batches `order_id` in chunks of 150 via the client-side `useSupabase()` client, not an API route) and renders an amber "Still out of stock" badge with the specific product name(s) and quantities, alongside — not instead of — the reported-issue badge. The two badges intentionally don't dedupe against each other: one answers "did someone report a problem," the other answers "is a product in this order actually out of stock right now," and an order can be true on one, both, or neither.

**Not connected to any of this**: `excel/not_found_orders.xlsx` is an export from the courier/SPX reconciliation flow (`src/hooks/useCourierSync.ts`'s `'not_found'` category) — tracking numbers SPX couldn't match to an order during a sync. It has no relationship to `order_issues` or the Overdue Orders widget; verified by cross-referencing its real order-ID references against the DB — none were in the overdue list, and the matched orders were already `Completed`/`Returned`/`Payment Received (COD)` (a few sitting in `Photo`/`Picked`, but none `Processing`).

### Order Trail: one merged history instead of four separate silos

Before 2026-07-16, "the order's history" was scattered across four places with no single view: `order_logs` (status changes only, rendered by `order-trail-dialog.tsx`), `orders.notes` (freeform staff chat, rendered only in the Overdue Order dialog), `order_issues`/`order_issue_messages` (stock-issue reports + discussion, rendered only in the Active Issue box), and `orders.not_for_shipping_reason` (the Packed Orders "Delay" reason, a live field with no history at all — overwriting it lost the previous reason permanently). Worse, **issue resolution was completely silent**: `resolveOpenOrderIssues()` / `resolveOrderIssuesForRemovedProducts()` (`src/lib/services/order-issues-service.ts`) and the manual "Resolve" `PATCH /api/inventory/issues` just flipped `order_issues.status` to `'resolved'` with no timestamp, actor, or record anywhere that it happened.

**`src/lib/services/order-trail-service.ts`** (`fetchOrderTrail(supabase, orderId)`) is the new single source of truth: it merges `order_logs`, parsed `orders.notes` entries (split on the same `\n\n` boundary `handleSendNote` appends with), and `order_issues` + `order_issue_messages` (fetched via `GET /api/inventory/issues?orderId=` — matching the rest of the codebase's pattern of never querying `order_issues` directly client-side) into one `OrderTrailEntry[]` sorted newest-first. Both `order-trail-dialog.tsx` (the existing "View Trail" button on the order detail page) and `overdue-order-dialog.tsx` (a new "Order Trail" box, below the issue/stock status section) now render this same merged list — so a note added from one place, or a delay reason set in Packed Orders, shows up in both.

**Making resolution and delay actions actually loggable** (previously nothing to merge, since these events wrote nowhere):
- `resolveOpenOrderIssues()` / `resolveOrderIssuesForRemovedProducts()` now take an `actorName` param and insert an `order_logs` row (`status: 'Issue Resolved'`, `snapshot_data: { productName }`) for each issue they resolve. The manual PATCH route does the same.
- `not-for-shipping-dialog.tsx` ("Delay" action) now logs `status: 'Marked Not Ready to Ship'` with `snapshot_data: { reason }` — so past delay reasons stop getting silently overwritten and lost; `revert-pending-dialog.tsx` logs `'Reverted to Processing'`.
- `order_logs` has no dedicated "detail" column, so `snapshot_data` (jsonb, previously only used by the Picker for an item-quantity snapshot) is reused generically as `{ reason }` or `{ productName }` — `fetchOrderTrail` reads either as the entry's `detail` line.
- **Known limitation, on purpose**: `resolveOpenOrderIssues()` is also called from `usePicker.ts` just to clear stale issues before a re-pick attempt, even when the re-pick is still partial (not truly resolved — a fresh issue gets reported right after). Logging "Issue Resolved" there would be misleading, so it takes a 4th param, `logResolution`, passed as `!hasIssues` — only a genuinely clean re-pick writes the log entry. Every other call site (Packer, Mark Shipped, COD completion, Process Return, manual/bulk status change, order edit) defaults to logging, since those really do mean the issue is behind the order.
- **Also known and accepted**: only 2 of 8 `resolveOpenOrderIssues()` call sites (`usePacker.ts`, `usePicker.ts`) pass a real actor name — the rest default to `'System'`, since threading `useUserProfile()` through every dialog wasn't worth the blast radius for this change. A future pass could wire the rest through.
- Historical Delay reasons and resolutions from before this change aren't retroactively logged — the trail only gets richer going forward, same pattern as other "known limitation" notes in this file.

### Purchase-Receiving Discrepancies → Inbox Drawer

`order_issues` isn't picker-only. Bulk Receive (`src/app/dashboard/inventory/receive`, `POST /api/inventory/receive/pending-pos`) inserts an `order_issues` row with `issue_type: 'purchase_discrepancy'` (`order_id` left null, `po_id` set instead) whenever received qty is less than expected and staff enters a shortage note — same table as picker-reported issues, discriminated by `issue_type` (`'order'` is the default). This reuses the existing realtime plumbing rather than building a parallel system: the Inbox Drawer (`src/components/dashboard/inbox-drawer.tsx`, global in the dashboard header, not scoped to any one role) subscribes to `INSERT` on `order_issue_messages` and fires an urgent toast + browser notification whenever a message has `requires_attention: true`, regardless of issue type. Clicking a purchase-discrepancy card opens `purchase-issue-dialog.tsx` (reply thread + Resolve) instead of `overdue-order-dialog.tsx`, which handles picker-reported issues.

`GET /api/inventory/issues` (used by the `order-issues.tsx` dashboard widget and `overdue-order-dialog.tsx`) filters to `issue_type = 'order'` only — purchase-discrepancy issues are inbox-only and intentionally don't appear on that widget.

### Message Staff (manual tagging) → Inbox Drawer

A third `issue_type` value, `'staff_message'`, extends the same pattern to manually-composed messages — staff proactively tagging a colleague about an order or a product, as opposed to a system-generated stockout/shortage report. Entry point is `StaffMessageFab` (`src/components/dashboard/staff-message-fab.tsx`), a floating button fixed to the bottom-right of every dashboard page (mounted globally in `src/app/dashboard/layout.tsx`, alongside `InboxDrawer`/`NotificationBell`), which opens `MessageStaffDialog` (`src/components/dashboard/message-staff-dialog.tsx`) — pick "Order Issue" or "Product Issue", pick the order/product, tag one or more staff via `StaffSearch`, write a message, send.

`POST /api/staff-messages` (`src/app/api/staff-messages/route.ts`) does three inserts: an `order_issues` row (`issue_type: 'staff_message'`, `order_id` or `product_id` set depending on the chosen type, never both), the first `order_issue_messages` row (`requires_attention: true`, `mentions` set to the tagged staff's full names — reusing the same mentions mechanism the Inbox Drawer already matches against the viewer's name for urgent toasts), and one `notifications` row **per tagged recipient** (fan-out, not a single multi-recipient row — `notifications` has no recipient-list concept, so N tags means N rows, each independently `is_read` via the existing `sales_person_name`-keyed pattern). `StaffMessageThreadDialog` (`src/components/dashboard/staff-message-thread-dialog.tsx`) is what the Inbox Drawer opens for `staff_message` cards — same message-bubble UI as `overdue-order-dialog.tsx`, replies go through the existing `POST /api/inventory/issues/messages` (no new reply endpoint needed).

`notifications.source` (added by `scripts/migrations/add_source_to_notifications.sql`, run manually — no migration runner in this repo) is set to `'staff_message'` on these fan-out rows, distinguishing them from system notifications (order packed, issue reported) that leave `source` null — not currently read by any UI, but there for future filtering if needed.

**`StaffMessageFab` is compose-only, deliberately.** It first shipped with its own unread badge (counting `notifications` where `source = 'staff_message'`), but that duplicated the Bell's badge and its own realtime channel for the same underlying rows — a single staff message already triggers a Bell notification *and* an Inbox Drawer urgent toast, so a third counter added no real information, just another number the recipient had to reconcile. Removed in favor of a single job: open `MessageStaffDialog`. The Bell stays the "something happened" signal; the Inbox Drawer stays the only place to actually read and reply.

**Staff picker source.** `StaffSearch` (`src/components/dashboard/staff-search.tsx`) calls `supabase.rpc('get_all_users')` — previously only known to be called from the Owner/Admin-gated User Management page (`src/app/dashboard/users/page.tsx`). It's unconfirmed whether the RPC itself restricts by role server-side or whether that page's `canManageUsers` check was the only gate; if the RPC turns out to reject non-Owner/Admin callers, `StaffSearch` will silently show an empty staff list for regular Sales/Inventory accounts.

### @Mention Tagging in Order Notes / Issue Discussion / Order Issue dialog (added 2026-07-16)

Three chat-style composers now support typing `@Name` inline with a live autocomplete dropdown, and tagging someone actually notifies them via the Bell: the **Order Notes** box and the **Issue Discussion** reply box in `overdue-order-dialog.tsx`, and the reply box in `order-issues.tsx`'s Order Issue dialog. Before this, Issue Discussion had a fragile `issueReplyText.match(/@\w+/g)` that only ever matched single-word handles and silently broke on real two-word staff names like "Czarina Suyat"; Order Notes and the Order Issue dialog's reply box had no mention support at all, and none of the three actually created a notification even when `mentions` was captured.

**`MentionInput`** (`src/components/dashboard/mention-input.tsx`) is a drop-in replacement for a plain `<Input>`. It's backed by **`useStaffDirectory`** (`src/hooks/useStaffDirectory.ts`) — the `supabase.rpc('get_all_users')` fetch/parse logic extracted out of `StaffSearch`, which now shares it too. Mentions are tracked as explicit state from dropdown selections (added when a suggestion is clicked/Enter'd), not by regex-parsing the text afterward — this is what makes multi-word names reliable, since there's no ambiguity about where a name ends.

**Notification fan-out is centralized server-side, not per-composer.** `POST /api/inventory/issues/messages` — the one endpoint both the Overdue modal's Issue Discussion box and the Order Issue dialog's reply box post through — now calls `fanOutStaffNotifications()` (generalized with optional `title`/`link` params; see "Message Staff" above for its original shape) whenever the request carries a non-empty `mentions` array, after looking up the message's `order_issues.order_id` to link the notification back to the order. Doing it in the route rather than in each component means any future composer that posts through this same endpoint gets mention notifications for free, with no extra wiring.

**Order Notes is the exception** — it writes straight to `orders.notes` (a single free-text column, no API route — see "Order Trail" above) via a direct client-side Supabase call, so there's nowhere server-side to hook. `handleSendNote` in `overdue-order-dialog.tsx` calls `fanOutStaffNotifications()` directly, client-side, right after the `orders.notes` update succeeds.

**`orders.id` is `uuid`, and this project's PostgREST does not support the `column::type` cast-in-filter trick.** `OrderSearch` (`src/components/dashboard/order-search.tsx`) originally tried `.filter('id::text', 'ilike', ...)` to prefix-search order numbers — confirmed by direct REST testing that this project's PostgREST returns the same `operator does not exist: uuid ~~* unknown` error with or without the cast. Fixed by fetching a bounded batch (`limit(500)`, most recent first) once per popover-open and filtering by ID-prefix/customer-name client-side instead of pushing the `ilike` into Postgres. The same bug (plain `.ilike('id', ...)` with no cast attempt) also exists in `src/app/api/inventory/procurement-request/route.ts`'s order lookup — not yet fixed there as of this writing.

### Realtime Channel Subscriptions (recurring bug source)

`InboxDrawer` and `NotificationBell` both live in the dashboard layout (global, on every page) and each open a Supabase Realtime channel in a `useEffect`. Two rules keep this from crashing the entire dashboard shell on load:

- **Depend on primitives, not the `userProfile` object.** `useUserProfile()`'s `userProfile` is a new object reference on nearly every render — it's rebuilt via `useMemo` off `useUser()`'s `user` state, and `user` itself gets a fresh object literal from `fetchUser()` and again from every `onAuthStateChange` event (`INITIAL_SESSION`, `SIGNED_IN`, etc.) firing in quick succession after mount. An effect with the raw `userProfile` object in its dependency array re-fires several times right after mount as a result. Depend on `userProfile?.id` / `?.firstName` / `?.lastName` instead.
- **Guard against re-subscribing to a channel that's already subscribed.** Calling `.channel(topic).on(...)` on a topic that's already past `.subscribe()` throws (`cannot add \`postgres_changes\` callbacks... after \`subscribe()\``), and since these two components sit in the layout, the throw takes down every dashboard page, not just one component. The repeated effect fires above are exactly the condition that triggers this. Before creating the channel, remove any existing one on the same topic: `supabase.getChannels().filter(c => c.topic === 'realtime:<name>').forEach(c => supabase.removeChannel(c))`. This also covers React Strict Mode's dev-only double-invoke of effects, which can trigger the same race even with a stable dependency array.

---

## Key Files to Know

| File | Purpose |
|---|---|
| `src/app/dashboard/layout.tsx` | Main nav sidebar — role-based menu rendering |
| `src/app/dashboard/page.tsx` | Dashboard home — metrics, charts |
| `src/app/dashboard/orders/page.tsx` | Order list page (~714 lines — refactor in Phase 2) |
| `src/components/dashboard/orders/OverdueOrders.tsx` | Overdue Orders widget & dialog for displaying and managing aging Processing orders — badges cards with an open `order_issues` entry, see "Overdue Orders widget ↔ order_issues" |
| `src/components/dashboard/order-dialog.tsx` | Order create/edit dialog (~1400 lines — refactor in Phase 2) |
| `src/components/dashboard/product-dialog.tsx`, `src/hooks/useProductDialog.ts` | Product create/edit dialog (~1200 lines — refactor in Phase 2) — see "Product Variants: name vs variant_name" |
| `src/lib/supabase/hooks.ts` | `useUser()`, `useAuth()`, `useSupabase()` |
| `src/hooks/useUserProfile.ts` | `useUserProfile()` — builds user profile from auth metadata |
| `src/types/index.ts` | Central type exports |
| `src/app/dashboard/accounting/remittances/page.tsx` | SPX remittance Excel upload — see "SPX Remittance Rules" |
| `src/app/dashboard/accounting/payments/page.tsx` | Payments Log — see "Payments Dashboard" |
| `src/app/api/payments/extract-ocr/route.ts` | Tesseract + Google Vision fallback OCR on payment proof images |
| `src/app/api/payments/verify-pdf/route.ts` | Bank/GCash statement PDF matching — see "Payments Dashboard" |
| `src/app/api/inventory/procurement/route.ts` | Procurement "Buy" action — updates product cost + backfills COGS (see "Cost of Goods Sold"); also self-heals leaked bundle drafts (see "Bundle Products & Assembly Recipes") and computes both the sheet's items and the Reconciliation report's `reconciliationItems` (see "Procurement Sheet: three numbers that must not be confused") |
| `src/components/dashboard/reports/to-order-report.tsx` | Reports → "Stock Reconciliation" tab — see "Stock Reconciliation report" |
| `src/app/dashboard/reports/pnl-report.tsx` | P&L Statement report — see "Cost of Goods Sold" |
| `update_order_func.sql` | `process_order_transaction` Postgres RPC — where `cost_price_at_sale` gets snapshotted |
| `src/hooks/useProducts.ts` | Products list — paginated fetch, see "1000-row query cap" and "Soft-Deleted Products" |
| `src/hooks/usePicker.ts`, `usePacker.ts`, `useForShipping.ts` | Scan-app hooks — see "Order Fulfillment Pipeline" |
| `src/hooks/useProductSearch.ts` | Order "Add Product" search — see "Soft-Deleted Products" for why every product search needs the `[DELETED]` filter |
| `src/lib/services/order-issues-service.ts` | `resolveOpenOrderIssues()` / `resolveOrderIssuesForRemovedProducts()` / `STATUSES_THAT_CLEAR_ORDER_ISSUES` — see "order_issues auto-resolution" under "Order Fulfillment Pipeline" and "Order Trail" |
| `src/lib/services/order-trail-service.ts` | `fetchOrderTrail()` — merges `order_logs` + `orders.notes` + `order_issues`/messages into one chronological list, see "Order Trail: one merged history instead of four separate silos" |
| `src/components/dashboard/reserved-stock-dialog.tsx` | "Stock Allocation Details" popup — bundle-aware, see "Bundle Products & Assembly Recipes" |
| `src/components/dashboard/staff-message-fab.tsx`, `message-staff-dialog.tsx`, `staff-message-thread-dialog.tsx`, `staff-search.tsx`, `order-search.tsx` | "Message Staff" floating compose button, its dialog, thread view, and pickers — see "Message Staff (manual tagging) → Inbox Drawer" |
| `src/app/api/staff-messages/route.ts` | Creates a `staff_message`-type `order_issues` thread + fans out `notifications` to tagged staff |
| `src/components/dashboard/mention-input.tsx`, `src/hooks/useStaffDirectory.ts` | `@Name` autocomplete input + shared staff-directory hook — see "@Mention Tagging" |

---

## Development Rules (Enforced from Phase 1 Onwards)

1. **Types come from `@/types`** — never define `type Foo = {...}` inline in a page or component
2. **Scripts go in `/scripts/`** — never put migration or fix scripts in the root
3. **Files stay under ~300 lines** — if it grows past that, split it
4. **Business logic goes in hooks or server actions** — components only render
5. **Don't commit leftover backup files** — no `old.tsx`, `old-*.tsx`, etc.

---

## Working with AI Effectively

When asking AI to make changes:

✅ **Good**: "In `src/components/dashboard/order-dialog.tsx`, fix the share receipt function around line 450"

❌ **Bad**: "Fix the order system"

✅ **Good**: "Look at `src/types/order.types.ts` for the `Order` type definition"

❌ **Bad**: "Look at however orders are typed"

**Start every session**: "Read `ARCHITECTURE.md` before making any changes."
