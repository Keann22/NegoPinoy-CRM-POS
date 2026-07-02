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

## Key Files to Know

| File | Purpose |
|---|---|
| `src/app/dashboard/layout.tsx` | Main nav sidebar — role-based menu rendering |
| `src/app/dashboard/page.tsx` | Dashboard home — metrics, charts |
| `src/app/dashboard/orders/page.tsx` | Order list page (~714 lines — refactor in Phase 2) |
| `src/components/dashboard/order-dialog.tsx` | Order create/edit dialog (~1400 lines — refactor in Phase 2) |
| `src/components/dashboard/product-dialog.tsx` | Product create/edit dialog (~1200 lines — refactor in Phase 2) |
| `src/lib/supabase/hooks.ts` | `useUser()`, `useAuth()`, `useSupabase()` |
| `src/hooks/useUserProfile.ts` | `useUserProfile()` — builds user profile from auth metadata |
| `src/types/index.ts` | Central type exports |
| `src/app/dashboard/accounting/remittances/page.tsx` | SPX remittance Excel upload — see "SPX Remittance Rules" |
| `src/app/dashboard/accounting/payments/page.tsx` | Payments Log — see "Payments Dashboard" |
| `src/app/api/payments/extract-ocr/route.ts` | Tesseract + Google Vision fallback OCR on payment proof images |
| `src/app/api/payments/verify-pdf/route.ts` | Bank/GCash statement PDF matching — see "Payments Dashboard" |

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
