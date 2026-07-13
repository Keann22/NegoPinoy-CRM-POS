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

The sheet only lists products that have an active **Staff Draft** — a `purchase_order_items` row on the special `purchase_orders.notes = 'STAFF_DRAFT'` PO, created via `POST /api/inventory/procurement-request` (called from the Picker app on out-of-stock report, the "Add Missing Item" dialog, or the standalone Procurement Request page). Each row then shows three numbers that look similar but answer different questions:

| Column | Meaning | Source |
|---|---|---|
| **Current Stock** | Running ledger: total ever purchased minus total committed to every open order — including already-picked/packed ones, since stock is deducted the moment an order is *placed*, not when it's picked. Can drift stale if manually mis-synced. | `products.stock_level` |
| **Staff Req. (note)** | A manually-typed number from whoever submitted the request. Informational only — never auto-grows when new orders arrive, only auto-shrinks when an order is edited down. **Never used to decide how much to buy.** | `purchase_order_items.expected_qty` on the STAFF_DRAFT row |
| **Need to Buy (buy qty)** | Live count of orders still needing this item that have **not yet been picked** (`Pending Payment`, `Processing`, `Picked (with issue)`, `On-Hold`, `Waiting for Stock`). Drives the "Buy" quantity default. Orders already `Picked`/`Photo`/`Packed`/`For Shipping`/`For Pick-up` are excluded — a real unit was already pulled for those. | Live `order_items` query in the GET route |

A fourth, internal-only **Total Open Demand** (every open order regardless of pick status — the true counterpart to `stock_level`'s ledger math) exists only to detect when Current Stock has drifted from reality (the orange "Current Stock doesn't match total open orders" warning + "Sync Stock" button — which syncs Current Stock to Total Open Demand, not to Staff Req.).

**Order attribution** (`procurement_request_sources`, migration in `scripts/migrations/add_procurement_request_sources.sql`): when a request is tied to a specific order (currently only the Picker app's out-of-stock report), this table records which order(s) contributed to a draft line's quantity, so "Staff Req." can show "for #A232A043 (Customer Name)" instead of an anonymous number. 

**Order Validation Rule:** Ad-hoc requests created via the standalone Procurement Request page now strictly require a valid Order Number for each item. The system enforces that:
1. The typed Order Number (even a short prefix) resolves to a valid order in the database.
2. The requested product is either directly part of the order (`order_items`) or is an underlying component/part of a bundle product in that order (`assembly_recipe`).

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

**`order_issues` auto-resolution isn't just the Packer app.** `resolveOpenOrderIssues()` + `STATUSES_THAT_CLEAR_ORDER_ISSUES` in `src/lib/services/order-service.ts` is the single source of truth for "which statuses mean the issue is behind us" (`Picked`, `Photo`, `Packed`, `For Shipping`, `For Pick-up`, `Shipped`, `Completed`, `Payment Received (COD)`). It's called from every path that can move an order into one of those statuses — the Packer app, a clean re-pick in the Picker app, the manual "Update Status" dropdown / bulk status change on the Orders page, `mark-shipped-dialog.tsx`, and COD payment completion. Any *new* path that transitions an order's status must call this too, or its issue tickets go stale and sit open on the dashboard forever even after the order shipped (confirmed bug: found 30 stale-but-resolved tickets in one audit before every path was wired up).

### Shared data layer

The apps never call each other directly — they coordinate entirely through shared Supabase tables.

| Table | Written by | Read by |
|---|---|---|
| `order_issues` (+ `order_issue_messages`) | Picker app (on out-of-stock report) | Dashboard `order-issues.tsx` widget via `GET /api/inventory/issues`; `POST /api/inventory/procurement-request` auto-creates restock requests consumed by the Procurement Request page and Procurement Sheet report |
| `order_logs` | Every stage (Picker, Second check, Packer, Packed orders actions) | `order-trail-dialog.tsx` (order history timeline on the Orders page); Second check and Packer both read the latest `Picked`/`Picked (with issue)` log to detect edits made after picking |
| `notifications` | Picker app (issue reported), Packer app (order packed) | Bell-icon notifications for the sales rep who owns the order |

`orders.status` is the state machine; `order_logs` / `order_issues` / `notifications` are side channels that keep reporting and alerts in sync without the apps knowing about each other.

---

## Key Files to Know

| File | Purpose |
|---|---|
| `src/app/dashboard/layout.tsx` | Main nav sidebar — role-based menu rendering |
| `src/app/dashboard/page.tsx` | Dashboard home — metrics, charts |
| `src/app/dashboard/orders/page.tsx` | Order list page (~714 lines — refactor in Phase 2) |
| `src/components/dashboard/orders/OverdueOrders.tsx` | Overdue Orders widget & dialog for displaying and managing aging Processing orders |
| `src/components/dashboard/order-dialog.tsx` | Order create/edit dialog (~1400 lines — refactor in Phase 2) |
| `src/components/dashboard/product-dialog.tsx`, `src/hooks/useProductDialog.ts` | Product create/edit dialog (~1200 lines — refactor in Phase 2) — see "Product Variants: name vs variant_name" |
| `src/lib/supabase/hooks.ts` | `useUser()`, `useAuth()`, `useSupabase()` |
| `src/hooks/useUserProfile.ts` | `useUserProfile()` — builds user profile from auth metadata |
| `src/types/index.ts` | Central type exports |
| `src/app/dashboard/accounting/remittances/page.tsx` | SPX remittance Excel upload — see "SPX Remittance Rules" |
| `src/app/dashboard/accounting/payments/page.tsx` | Payments Log — see "Payments Dashboard" |
| `src/app/api/payments/extract-ocr/route.ts` | Tesseract + Google Vision fallback OCR on payment proof images |
| `src/app/api/payments/verify-pdf/route.ts` | Bank/GCash statement PDF matching — see "Payments Dashboard" |
| `src/app/api/inventory/procurement/route.ts` | Procurement "Buy" action — updates product cost + backfills COGS (see "Cost of Goods Sold"); also self-heals leaked bundle drafts (see "Bundle Products & Assembly Recipes") |
| `src/app/dashboard/reports/pnl-report.tsx` | P&L Statement report — see "Cost of Goods Sold" |
| `update_order_func.sql` | `process_order_transaction` Postgres RPC — where `cost_price_at_sale` gets snapshotted |
| `src/hooks/useProducts.ts` | Products list — paginated fetch, see "1000-row query cap" and "Soft-Deleted Products" |
| `src/hooks/usePicker.ts`, `usePacker.ts`, `useForShipping.ts` | Scan-app hooks — see "Order Fulfillment Pipeline" |
| `src/hooks/useProductSearch.ts` | Order "Add Product" search — see "Soft-Deleted Products" for why every product search needs the `[DELETED]` filter |
| `src/lib/services/order-service.ts` | `resolveOpenOrderIssues()` / `STATUSES_THAT_CLEAR_ORDER_ISSUES` — see "order_issues auto-resolution" under "Order Fulfillment Pipeline" |
| `src/components/dashboard/reserved-stock-dialog.tsx` | "Stock Allocation Details" popup — bundle-aware, see "Bundle Products & Assembly Recipes" |

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
