# Messenger AI Sales Copilot — Plan & To-Do Note

- **Date:** 2026-11-24 (Phase 1 built 2026-11-27)
- **Status:** Phase 1 Built (Native Next.js + Supabase + Gemini, Zero n8n, Copy Reply for Meta Business Suite)
- **Repo Note:** Public repository — examples below use generic placeholder names and order numbers only.

---

## 1. Goal

Turn incoming Facebook Messenger conversations (`conversation_logs`) into an **AI Sales Copilot** that:
1. Reads incoming customer message bursts and photo attachments.
2. Automatically prepares (and later, once graduated, optionally executes) CRM actions for sales.
3. Prompts the assigned sales agent to verify via a sticky pop-up card (**`✓ Tama`**, **`✎ Edit`**, **`✗ Mali`**).
4. Tracks accuracy per action type and **learns from every mistake** through structured correction lessons and a learned product slang alias table.

---

## 2. Locked Owner Decisions (2026-11-24)

### A. Learning Phase = Approval First (`stage_confirm`) for ALL Actions
- On Day 1, **every action type defaults to `stage_confirm` (Approval First)**. Nothing mutates live orders, ship holds, bus requests, or payments until a sales agent taps approve.
- The AI still performs all analysis and pre-fills 100% of fields, showing a clear **Before → After** preview on the verification card.

### B. Graduation to `auto_apply` Later (Per-Action Toggle + Undo)
- The `mode` setting (`'stage_confirm' | 'auto_apply'`) in `messenger_ai_action_rules` and the `before_snapshot` 1-tap Undo mechanism will be built into the foundation from Day 1, with every rule defaulted to `'stage_confirm'`.
- Once the Owner Accuracy Dashboard shows an action type consistently reaching **≥ 95% accuracy**, owners can flip that specific action type to `'auto_apply'`.
- **Automatic fallback guard:** Even for actions toggled to `'auto_apply'`, ambiguous multi-order cases or low-confidence reads (`< min_confidence`) automatically downgrade to `'stage_confirm'` (Approval First).

### C. Multi-Order Resolution (Critical Workflow Rule)
Customers often have **2–4 open orders** at the same time (e.g., multiple active lay-aways + a COD order, or an already-packed order waiting alongside a new `Processing` order).
- **Swaps / Qty Changes / Removals:** Match requested items across all open orders' line items.
  - If only one open order contains the item (or variant sibling), pre-select it.
  - If **2 or more open orders** match, mark `ambiguous_order = true`, force Approval First, and require the sales agent to pick the target order.
- **Add-ons vs. New Order:** Inspect chat clues (payment terms like *"sa COD ko"* vs. *"sa lay-away ko"*, sibling items mentioned, or order `#`) and fulfillment state:
  - Never blindly add items onto an already **`Packed`** or **`For Shipping`** order or an older partly-paid lay-away when a new unpicked order makes more sense or when the customer actually wants a **separate new order**.
  - Every `order_edit_items` card includes a **`+ Gawing Bagong Order (Create New Order)`** option directly in the switcher so sales can convert a misclassified edit into a new order in 1 tap.
- **Multi-Order Card Switcher:** Whenever a customer has 2+ open orders, the verification pop-up displays a **1-tap radio switcher** listing each open order (`#ABC1234`, date, payment type, status, items) plus `+ Gawing Bagong Order`.
- **Cross-Action Multi-Order Support:**
  - `payment_proof`: Lists all unpaid open orders with checkboxes and pre-filled split shares (aligned with `gcash-transfer-service.ts`).
  - `order_hold_or_reschedule` & `bus_shipping_request`: Pre-ticks open orders to hold/group together (`order_ship_holds.group_id` / `bus_ship_requests`) and lets sales untick any exclusions.
  - `order_cancel`: Lists all open orders (plus item-level removal option if they only meant one item).

### D. Burst Grouping, Agent Routing & Auto-Close
- **Burst Grouping:** Wait **60–90 seconds** of quiet after a customer's last message before analyzing, grouping rapid multi-message sends (*"Ma'am"* + *"nagbayad na po"* + `[photo]` + *"kasama SF"*) into **one combined action** instead of multiple pop-ups.
- **Auto-Routing:** Route to the `sales_person_name` on the matched order (grouping multi-account staff the same way `staff-task-service.ts` does), falling back to the last agent active in that chat thread, or all on-duty sales accounts.
- **Auto-Close When Handled Manually:** If sales edits the order or logs the payment manually before reviewing the open AI card, auto-close the pending card (`auto_superseded`) so they aren't nagged twice, while still comparing the manual action against the AI proposal for accuracy scoring.

### E. Tracking & Continuous Learning Loop
- Every reviewed card saves `verdict` (`'correct' | 'edited' | 'rejected'`).
- On **`✎ Edit`**, the backend compares `proposed_payload` vs. `final_payload` and automatically computes `diff_fields`:
  - `wrong_variant`
  - `wrong_qty`
  - `wrong_order`
  - `wrong_amount`
  - `wrong_date`
  - `wrong_action_type`
- **Product Alias Learning:** When sales corrects a matched product/variant (or confirms a nickname match), save the normalized phrase → variant mapping into `messenger_product_aliases` (**variants only, never parent products**).
- **Mistake Lesson Memory:** On **`✎ Edit`** or **`✗ Mali`** (with 1-tap rejection reason chips such as *Nagtanong lang*, *Maling item / kulay*, *Maling order*, *Maling bayad*, *Nagawa ko na*), save structured rows in `messenger_ai_feedback_lessons` and inject relevant recent lessons into future analyzer prompts.

---

## 3. Action Types Roadmap

### Phase 1 (Core 5)
1. **`order_edit_items`** — Add, remove, change qty, or swap variant on an open order (variants only, never parent products), with **`+ Create New Order`** option in the switcher.
2. **`order_hold_or_reschedule`** — Maps to `order_ship_holds` (`payment`, `date`, `with_orders`, `adding`, `other`) with `check_on` date and multi-order grouping (`group_id`).
3. **`order_cancel`** — Full order cancellation (or redirects to item removal if the customer only meant one item on a multi-item order).
4. **`payment_proof`** — Payment screenshot OCR (Tesseract → Vision fallback) + GCash receiver check (`0917 186 9554` / `0923 290 2128`) + reused-reference check + multi-order split shares & advance SF detection.
5. **`payment_promise`** — Schedules follow-up reminder / updates lay-away or hold check date when customer promises a payment date (*"sa 15th po"*).

### Phase 2 (Next 4)
6. **`bus_shipping_request`** — Marks open orders in `bus_ship_requests` with matched bus company & station.
7. **`damage_or_complaint`** — Pre-fills a Customer Return / Damage case linked to the recent order and attaches the customer's chat photo.
8. **`waiting_prompt_reply`** — Detects replies to open RTS, *Wala sa Supplier*, or *Ship Hold* prompts and pre-selects the customer's choice.
9. **`delivery_or_order_note`** — Appends receiver/delivery instructions to `orders.shipping_details` (never overwrites the main customer mobile number, preserving OFW sender safety).

### Later / Backlog Ideas
- Hot-lead & unanswered inquiry reminders before Facebook's 24-hour messaging window expires.
- `"Nasaan na po order ko?"` tracking / ETA follow-up tasks.
- `"Pa-inform po pag may stock na"` restock notification queue tied to `May stock na` / receiving.

---

## 4. Planned Architecture Overview

- **Database Migration (`scripts/migrations/2026-11-24_messenger_ai_copilot.sql`):**
  - `messenger_ai_action_rules`
  - `messenger_ai_actions`
  - `messenger_ai_feedback_lessons`
  - `messenger_product_aliases`
  - Partial index on `conversation_logs(customer_psid, created_at)` where `sender_type = 'customer' and ai_analyzed_at is null`
  - All tables server-only with RLS enabled (accessed via authenticated API routes using service role).
- **Shared Types (`src/types/messenger-ai.types.ts`):** Re-exported from `src/types/index.ts`.
- **Services (`src/lib/services/messenger-ai/`, each < 400 lines):**
  - `messenger-context-builder.ts` — Burst detection + customer, multi-order, waiting prompt, alias, and lesson loading.
  - `messenger-ai-analyzer.ts` — Gemini Flash structured JSON analysis + GCash OCR integration.
  - `messenger-action-executor.ts` — Delegates to existing domain services (`order-update.ts`, `ship-hold-service.ts`, payment & task services) + `undoAutoAppliedAction()` using `before_snapshot`.
  - `messenger-learning-service.ts` — Field diff calculator, alias learner, mistake lesson generator, accuracy scoreboard.
- **API Routes (`src/app/api/messenger-ai/`):**
  - `route.ts` (`GET` pending checks & stats, `POST` process ready bursts)
  - `review/route.ts` (`POST` handle `✓ Tama`, `✎ Edit`, `✗ Mali / Undo`)
  - `rules/route.ts` (`PATCH` toggle `stage_confirm` ⇄ `auto_apply`, manage lessons/aliases)
- **UI Components (`src/components/dashboard/messenger-ai/`):**
  - `messenger-ai-check-popup.tsx` (mounted in `src/app/dashboard/layout.tsx` using `usePopupSnooze`)
  - `messenger-ai-action-card.tsx` (chat quote, Before → After preview, multi-order radio switcher)
  - `messenger-ai-edit-dialog.tsx` & `messenger-ai-reject-dialog.tsx`
  - `messenger-ai-accuracy-panel.tsx` (Owner scoreboard, mistake log, learned aliases, mode toggles)

---

## 5. Ordered To-Do Checklist ("What We Will Do First")

- [ ] **0. Confirm open design choices** (see Section 6 below).
- [ ] **1. Database & Types:** Create `scripts/migrations/2026-11-24_messenger_ai_copilot.sql` and `src/types/messenger-ai.types.ts` (with all action rules defaulted to `stage_confirm`).
- [ ] **2. Burst & Multi-Order Context Builder:** Implement `messenger-context-builder.ts` (60–90s quiet window, load all open orders + line items + active prompts + product aliases + recent mistake lessons).
- [ ] **3. AI Analyzer & OCR Bridge:** Implement `messenger-ai-analyzer.ts` calling Gemini Flash with structured output, multi-order ambiguity detection, and payment proof OCR / receiver verification.
- [ ] **4. Action Executor & Undo Snapshots:** Implement `messenger-action-executor.ts` delegating to existing CRM/order/hold/payment services, plus `before_snapshot` undo support and manual-action auto-supersede check.
- [ ] **5. Mistake Tracker & Learning Engine:** Implement `messenger-learning-service.ts` (`diff_fields`, `messenger_product_aliases` auto-upsert, `messenger_ai_feedback_lessons`, accuracy metrics).
- [ ] **6. API Endpoints:** Build `/api/messenger-ai`, `/api/messenger-ai/review`, and `/api/messenger-ai/rules`.
- [ ] **7. Sales Verification Pop-up UI:** Build `MessengerAiCheckPopup` + `MessengerAiActionCard` (with 1-tap multi-order switcher & `+ Create New Order`), `MessengerAiEditDialog`, and `MessengerAiRejectDialog`.
- [ ] **8. Owner Accuracy & Learning Dashboard:** Build `MessengerAiAccuracyPanel` with accuracy %, error breakdown, mistake feed, learned aliases, and `stage_confirm` ⇄ `auto_apply` toggles.
- [ ] **9. Verification:** Run `npm run typecheck`, `npm run check:lines`, and end-to-end tests covering multi-order add-ons, holds, cancels, GCash splits, edits, and rejections.

---

## 6. Open Decisions Before Starting Implementation

1. **Where Owners View the Accuracy & Learning Dashboard:**
   - **Option A (Recommended):** Upgrade `/dashboard/approval-queue` into **Messenger AI Copilot & Accuracy**.
   - **Option B:** Add it as a new tab inside `/dashboard/tasks`.
2. **Phase 1 Scope:**
   - **Option A (Recommended):** Build the engine + learning loop with the **Core 5 actions** first (`order_edit_items`, `order_hold_or_reschedule`, `order_cancel`, `payment_proof`, `payment_promise`).
   - **Option B:** Wire all **9 actions** in one pass.
3. **Burst Wait Window:** Confirm **60–90 seconds** of quiet after the customer's last message (vs. shorter e.g. 45s).
