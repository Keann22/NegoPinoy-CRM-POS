# NegoPinoy CRM POS: Progress Board

The one place to see what is being worked on, what is next, and what is done.
**Two AI coders work on this project: Claude (Claude Code) and Antigravity.**
Both must keep this file current. Dates and times are Philippine time (UTC+8).

## Rules for every agent (Claude and Antigravity)

1. **Before you start:** read this file. If the files you need are listed under
   "In progress" by the other agent, stop and ask the owner first.
2. **When you start a task:** add it under "In progress" with your name
   (Claude / Antigravity), the date, the files or area, and one line on the goal.
3. **When you stop without finishing:** update its status line ("half done:
   UI built, API not yet", "waiting on owner: ...") so the other agent can pick
   it up or leave it alone.
4. **When you finish:** move it to the top of "Done recently" with the date and
   commit hash. Put new business rules in `docs/BUSINESS_WORKFLOW.md`, not here.
5. **Commit only your own files** (`git diff --cached --stat` before committing).
   The other agent may have uncommitted work in the same checkout.
6. Keep entries short (1-3 lines). Details go in the commit, BUSINESS_WORKFLOW.md,
   architecture.md or a plan in `docs/handover/`.
7. Trim "Done recently" to about the last 30 days; older history is in `git log`.

---

## In progress

Format: `- **Task** (Agent, started YYYY-MM-DD). Files/area. Status.`

Other uncommitted files seen 2026-11-25: `.claude/launch.json`,
`docs/staff-guides/connect-messenger-chat.html`, `scripts/reports/1-week-buy-list.html`,
and new BUSINESS_WORKFLOW.md sections (Copilot, task actions).

## Next up

1. **Messenger AI Sales Copilot (Phase 2)**: remaining 4 actions (damage/return,
   bus shipping, waiting prompt reply, delivery/receiver note), `auto_apply`
   tuning after owner dry-run accuracy review, and Meta Send API wiring once
   Meta permissions are approved (`docs/handover/2026-11-24_messenger_ai_sales_copilot_plan.md`).
2. **Physical stock breakdown** (On the shelf → Picked → Packed → Total). See
   BUSINESS_WORKFLOW.md "Unallocated stock is kept and counted".
3. **Customer profile and recommendations, follow-up** (phase 2 released 2e3e586):
   once AI Studio prepayment credits are topped up, run `--retry-fallback` for
   the 356 heuristic-fallback profiles, then monitor what sales use.
   BUSINESS_WORKFLOW.md.

## Waiting on the owners

- **Send staff the notes update**: `docs/staff-guides/2026-11-25_notes-update-inventory.txt`
  and `..._sales.txt` (paste into Messenger). No real tagged note sent yet as of
  2026-11-25 4:45 PM; check use after a few days.
- **18 historical store-credit gap orders**: fix after owners review the dry-run
  (BUSINESS_WORKFLOW.md "Store credit").
- **Orders on a main product**: #A435801 (5-layer rack filed under the 6-layer 120cm
  rack) and #DD58459 (HK Bank has no plain variant). The rest wait for sales (colors).
- **Customer persona: delivered installment still owing** = overdue (payment
  follow-up, no pitch)? BUSINESS_WORKFLOW.md "Customer profile".
- **Customer website** (`website/`): not launched; owner not happy with the look;
  hosting, claims, hulugan terms still open.

## Parked / ideas (not started)

- Customer purchase planner on the website (after the website launches).
- Gamified customer wishlist app (behind the website launch).
- Blind counting against receipts (staff see names only, recount on mismatch).
- Telegram morning digest for the Priority List.
- Security follow-ups: lock the side-app tables; RLS for customer log-ins.
- Ready to Pick page is marked "temporary" (2026-11-23): decide keep or remove.

---

## Done recently

Newest first. Older history: `git log`. Feature rules: `docs/BUSINESS_WORKFLOW.md`.

- **2026-11-27** Cancel work-chain tested (Claude, rollback-only tests on live DB): works,
  except Edit Order on an already-cancelled order added phantom stock (fixed live,
  `2026-11-27_edit_cancelled_order_stock_fix.sql`) and #97F28E7's answered task was
  closed as cancelled during the 11:16–14:41 DB/app gap (repaired to Done). Open for
  owners: auto-reject of Pending payments on cancel vs store credit.
- **2026-11-27** Messenger AI Sales Copilot (Phase 1) + Payment Detection
  Auto-Scan & Receipt Archiving: native Next.js + Supabase + Gemini 2.5 Flash
  pipeline (zero n8n, zero Meta Send API calls); Phase 1 Core 5 actions
  (`order_edit_items` + create new order, `order_hold_or_reschedule`,
  `order_cancel`, `payment_proof`, `payment_promise`) in Approval First
  (`stage_confirm`) mode with 1-tap multi-order switcher, Copy Reply for Meta
  Business Suite, learning loop (mistake lessons + variant-only product aliases),
  owner Dry-Run & Accuracy Dashboard at `/dashboard/approval-queue` (replaces old
  n8n queue), `proof_of_payment` permanent screenshot archiving, photo-burst
  prioritization, `CRON_SECRET` `/api/cron/messenger-ai-scan`, and 90s DB-throttled
  auto-scan (`show_sales_popup` defaults to `false`). (Antigravity, c3f018e)
- **2026-11-27** Order Cancellation Work-Chain & Packed Orders upgrades: put-back
  tasks assigned to Al & Edric only; fixed `process_order_transaction` cancel
  double-deduct and `shelf_order_targets` re-packed RTS edge case; added
  `trg_zz_order_cancel_cleanup` (auto-closes open tasks/alerts/pick-skips/issues,
  resets `is_packed`, cleans `STAFF_DRAFT` demand, rejects `Pending` payments,
  updates ship-together siblings); added canonical `POST /api/orders/cancel` +
  `CancelOrderDialog` wired into Orders, Layaway Review, Ship-Hold pop-up,
  Task Answer, and Packed Orders (plus Unpaid/Paid badges, hold check dates,
  and Ask Sales on Waiting to be Shipped). (Antigravity, 10bd17b)
- **2026-11-27** Out at Supplier: Dashboard prompts card (`SupplierPromptsCard`,
  shared `useSupplierPrompts` hook, cross-view sync) and top-level Out at Supplier
  menu item (`layout.tsx`). (Antigravity, 31443a2)
- **2026-11-27** Bundle recipe self-loop guard (`procurement-service.ts`,
  `procurement-request/route.ts`) + shelf count 500+ typo confirmation and integer
  rounding (`InventoryGuardianAlertModal.tsx`, `alert-review-adjust-dialog.tsx`).
  (Antigravity, 54732bd)
- **2026-11-27** Messenger backfill (`backfill_conversations`) + comment access
  diagnostic (`comments_check`) in `facebook-webhook` (already deployed on Supabase
  as version 32, matching repo byte-for-byte). (Antigravity, 4b082a2)
- **2026-11-26** Picker shelf counts: removed the blocking owner-approval hold so
  higher picker counts save immediately (with 50+ typo confirmation, existing 48h
  Receiving warning, and non-blocking owner bell alert), removed from Owner To-Do,
  and resolved the 5 open holds from Nov 26.
- **2026-11-26** Priority List: Print list (the tab as filtered, tick box per order).
- **2026-11-26** Priority List: green OK to ship tag on orders sales OK'd, plus an
  "OK to ship only" switch (from done tasks with an OK to ship answer).
- **2026-11-26** OK to ship tells the warehouse: Jas's copy of the task pops up again
  with a green OK to ship tag, or a shared Inventory task when only sales had it
  (`ok-to-ship-service.ts`, columns `staff_tasks.ok_to_ship_at/by`). Backfilled 33
  answers from 2026-11-25/26.
- **2026-11-25** Payments Log: unverified payments from before Jul 1, 2026 (testing
  period) hidden from Pending, its count, statement matching and owner to-do
  (`payment-review-cutoff.ts`). 60 pending payments verified by hand against the
  0917/0923 statements; Cash payments that were really GCash/BDO relabeled.
- **2026-11-25** Payments Log triage & 2-pass GCash statement matching: own-phone OCR
  guard + notes ref fallback (`extract-ocr`), multi-line PDF parser & Date+Amount
  bank/remittance matcher with reused-ref safety (`verify-pdf`), Pending bucket
  filters/search/bulk actions/inline ref edit/re-run OCR (`/dashboard/accounting/payments`
  + `/api/payments/manage`), and backlog cleanup (21 cancelled rejected, 19 refs
  backfilled from notes, 15 phone-number refs fixed; backup in
  `scripts/reports/2026-11-25-payments-cleanup-backup.json`); receipt date/time OCR
  (`ocr_payment_date`, `ocr_payment_time`) + Vision backfill of 451 receipt dates /
  427 times / 82 refs + time-based statement scoring. (Antigravity, 6263ad5, 79f5ca9, 2f23098)

- **2026-11-26** Priority List: Ready to pack checks the shelf for unpicked orders
  (paid first, then oldest, same as Ready to Pick); short ones go to Waiting as
  "Not on the shelf" or Bought. Was 180 ready, 60 short. c0dca34 (Claude).

- **2026-11-25** Inventory staff activity history ("My Activity"): dedicated
  `/dashboard/inventory/my-activity` page, "My Activity Today" card on
  `InventoryDashboard`, and `GET /api/inventory/activity` aggregating picking, Second
  Check, packing, receiving, shelf counts (with shelf-match scoring), transfers,
  returns, tasks/notes, and bus shipments retroactively across multi-account profiles
  with strict role isolation and zero supplier/cost fields. Migration
  `2026-11-25_activity_history_indexes.sql` (applied). (Antigravity, 1f2a1b4)

- **2026-11-25** Customer persona & profile, phase 2: DB triggers (`orders`, `payments`,
  `conversation_logs`) + on-view auto-refresh + daily cron refresh + paginated
  2,705-row listing + full order backfill (2,705/2,705 order customers profiled:
  2,349 Gemini + 356 heuristic fallback after AI Studio credits ran out;
  `--retry-fallback` ready after top-up). (Antigravity, 2e3e586)

- **2026-11-25** Task answer buttons for sales: OK to ship / Don't ship yet / Ship by
  bus / Customer hasn't replied (back in 4 hours) / Cancel the order (paid = owners
  decide); "Waiting for customer" tile. Migration
  `2026-11-25_task_progress_waiting.sql` (applied). Tested on fake order #68BF109
  (undone). Not tested live: OK to ship releasing a hold, the paid-cancel Problem.
  (Claude)

- **2026-11-25** Owner to-do "Only you can do these" on the owners' Dashboard and Tasks
  page (GCash statement, SPX file, flagged payments, held counts page, returns, staff
  waiting, supplier returns, Payment Fix, costs, bus unpaid); GCash/SPX uploads saved in
  `owner_uploads`; "Task for me" (Me in Assign a task). (Claude)
- **2026-11-25** Tasks close from the hold / bus dialogs (built by Antigravity,
  reviewed and tested by Claude, 98e991a): Don't ship yet / Change hold / Ship by
  bus on order tasks, Send & mark Done, Move deadline, working-today pause, 7
  status tiles on the Tasks page. Owner holds no longer pre-tick staff tasks
  (follow-up commit). Known small gaps: Ship by bus from the order page
  lists only your own tasks; the Done-needs-a-note rule is checked in the browser
  only. (Antigravity, Claude)
- **2026-11-25** Notes to a person tested end to end on the live site (owner ->
  Keneth Sales, fake order #68BF109, test rows deleted); staff update texts for
  inventory and sales in `docs/staff-guides/`. (Claude)
- **2026-11-25** New tasks and notes (and replies, deadlines, withdrawals) pop up for
  the person right away: live ping on every staff_tasks change. (Claude, 126e30c)
- **2026-11-25** Answer to a note you sent pops up right away (Realtime ping from a
  trigger on staff_tasks, no content; 3-minute check kept). (Claude, 2af97e7)
- **2026-11-25** Answer to a note you sent now pops up on the Tasks page too (your own
  tasks still don't pop up there). (Claude, f84ada9)

- **2026-11-25** Priority List: held Picked/Photo orders go On hold ("pack it while
  waiting") instead of Ready to pack; old "Hold" button removed, 7 old holds converted
  (`scripts/migrations/2026-11-25_convert_priority_holds.sql`, applied), 3 paid orders
  asked of sales by task (Claude, cd0f3d7).

- **2026-11-25** Snap/Scan receipt: size-only lines ("32" under "CY-35-30") carry the
  product code forward; bare sizes never remembered as a match; a different size is never
  a name match (Antigravity + Claude review, 7301c30).
- **2026-11-25** Customer persona & sales playbook, phase 1: Customer Detail, Live Chat
  (Insert into Chat), Customers CRM filters and +5 builder. Claude tested it and fixed 4
  bugs before release (filters only saw the newest 1,000 customers, default SPX note read
  as a clue, catalog capped at 1,000, stale 24h badge). (Antigravity + Claude, 151d8d9)

- **2026-11-25** Wala sa Supplier: multi-select other variants (`alt_product_ids`) and
  With/No waiting orders tabs on the Out at Supplier list. (Antigravity, 5f8c7c4)

- **2026-11-25** Every staff screen in English (labels, pop-ups, toasts, Telegram recount
  messages, put-back task text): glossary in BUSINESS_WORKFLOW.md "Screens in English".
  Customer-facing text stays Filipino. (Claude, 5296908)
- **2026-11-25** Order notes for a person or team: "Para kanino?" on every note box
  (Inventory / Owners / agent / anyone), Kailangan ng sagot / Pasabi lang po; pop-up until
  answered, answer pops up for the sender, 2-hour unseen alert. (Claude, 440a449)
- **2026-11-25** Owners' Dashboard "Tasks for staff": tap any number (e.g. Not seen
  yet) or a per-staff count to list those tasks right there, with Reply / Cancel. (Claude, 2342a0d)
- **2026-11-25** Ship later: "Ipadala sa petsa" on unpicked orders keeps them off
  picking and Need to Buy until 3 days before; "Hindi pa ipi-pick" on Ready to
  Pick asks sales (pop-up); 21 note-only reserved orders converted. (Claude, 7a39616)
- **2026-11-25** Progress board created (this file) and the update rule added to
  `.agents/AGENTS.md` and `CLAUDE.md`. (Claude)
- **2026-11-24** Reprint area shows in print; confirm before clearing change alerts (2145984).
- **2026-11-24** Structured ship holds: reasons, ship-together groups, check-again
  pop-ups for sales, auto-release trigger (6d484e7).
- **2026-11-24** Priority List and tasks show held orders and the customer's other
  open orders (60e810c).
- **2026-11-23** Staff tasks: assign, pop-up, Ginagawa na / May problema, replies with
  photos, several assignees, owner dashboard summary (ee44092 … 9cb933f).
- **2026-11-23** Cancelling a picked order gives Jas, Al and Edric a put-back task (25d20ec).
- **2026-11-23** Orders changed after printing: shown on dashboards, easy reprint (ea1ccd5).
- **2026-11-23** Ready to Pick page (temporary) with batch reprint and order notes
  (e4320f2, 496f94b, c5a020c, 7f2b108).
- **2026-11-23** Returns: "Hold until" date with auto-resume and bell (545c497).
- **2026-11-23** Products: search by image (pgvector) (9baff64).
- **2026-11-23** Order-linked expenses categorized correctly (afdf65f).
- **2026-11-20** Wala sa Supplier flags: owners/Jas flag variants, sales asked per
  order, New Order warning (9af61cb, 96dfb8f).
- **2026-11-20** Procurement Sheet lists variants of one product together (6656615).
- **2026-11-20** Live Chat: connecting to an existing account fixed (236aaac).
- **2026-11-16** 16 open orders moved off main products; old cash/installment codes
  archived (dc1aaa3).
- **2026-11-14** Unit 1 / Unit 2 renamed 3C / 4A; they show physical shelf pieces (bbfcff5).
- **2026-11-13** Screens show the stored shelf number (trial passed) (4f7c5d7).
- **2026-11-12** Picker counts above the shelf number held for the owners (144221e).
- **2026-11-12** Real-time Messenger sync, photos, replies from the CRM; safe chat
  linking with undo (874ce56, 4bb82cc, 65fd032).
- **2026-11-10** Pay with store credit; Add SPX SF from store credit; COD capped at
  what is owed (0e883e5, 554140d, 1bd62ca).
- **2026-11-09** Count accuracy scoring; variant required on orders; GCash receiver
  checks; Lay-aways page for sales (45cd998, a4cc73f, d357ab0, c9ffc07).
- **2026-11-07** Picker "found some, not enough"; Receiving defaults to Unit 1;
  receive per variant (9baefc6, 77e53d6, 63a42e4).
- **2026-11-05** One GCash for several orders; bus shipping fees and Waiting for bus;
  returns: who sent it back, waive balance, store-credit partial refund (4d75c76,
  93a8ee7, 0d19106, 56fbae4, 7f72324, db14f44).
- **2026-11-04** Courier returns flow; one box came back; Pabilang page; Payment Fix
  page; check the shelf before OS (b7fd2e7, 0b8b71f, 8dc8f08, 4b250a5, 6d43b44).
- **2026-11-03** Reserve stock for a replacement; website Katalogo redesign (not
  deployed) (6d082c3, 9274a1f).
- **2026-11-01** Security lock-down: staff-only API/dashboard, roles from app_metadata,
  public key locked (d8cb1cd, 0cf7d03).
- **2026-10-31** Sticky recount pop-up for Jas + Telegram; Customer Returns phase 2;
  picker counts before Found (816d5e5, 529b9a5, f6553d2).
- **2026-10-30** Stored shelf stock steps 1-2; Supplier Returns phases 1-3; Customer
  Returns phase 1 (cab1623, 80e059a, 0216f79, 9c57dfb).
- **2026-10-29** Receipt-first receiving; Snap receipt (9ad9649, 6dbcf63).
- **2026-10-26** Priority List (272915f and follow-ups).
