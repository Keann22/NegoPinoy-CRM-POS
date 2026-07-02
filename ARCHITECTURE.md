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

The Accounting module handles uploading SPX Excel remittances. There are specific rules regarding fees:

1. **Valuation Charge**: (1%) This is charged to the customer (part of the Order Total).
2. **COD Fee**: (~0.5%) This is **not** charged to the customer. It is absorbed by the business as a "hidden fee".
3. **Hidden Fee Calculation**: Since the SPX Excel file might not explicitly break down these fees in separate rows, the system automatically calculates the hidden courier fee by taking the **Expected Collection Amount** and subtracting the **Net Remittance** (COD collected minus any explicit shipping fees in the file).
4. **Installment/Layaway Expected Collection**: For installment orders, the Expected Collection Amount is specifically the expected downpayment minus what has already been paid, **not** the full order total. This prevents the system from inflating courier fees for unpaid future installments.

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
