# How NegoPinoy actually works

Read this before designing or changing any feature. Build around how the team
really works, not around how an ideal warehouse would work. If a request
conflicts with something here, ask before building.

Keep this file current: when the owner explains a workflow, add it here.

## Our customers (owner confirmed, 2026-11-01)

- **Nanay / misis** buying appliances and gamit for the home.
- **Small negosyo**: sari-sari stores, eateries, home bakers.
- **OFWs** buying for their family back home.
- They order through **Facebook / Messenger**, often **COD**, and many pay by
  **hulugan (lay-away)**.

## People and roles

- **Owners (husband and wife, Admin accounts)** do the buying themselves and run
  the business. They are tired after a buying trip, so anything they must do
  after buying has to take seconds, not minutes. Recording purchases has
  historically been skipped for this reason.
- **Jas** handles receiving and is one of the price managers (selling prices).
  Jas does not get supplier or cost information.
- **Warehouse staff** help Jas unpack and count, and also pick and pack orders.

## Confidential: suppliers and costs

- Supplier identities and purchase costs are **owner/admin only**.
- Staff, including Jas, must never see supplier names, unit costs, totals, or
  receipt photos. Group things "by purchase" for staff if needed, never by a
  named supplier.
- Do not store receipt photos anywhere staff can open them (no public bucket
  URLs on staff screens).

## Purchasing

Where we buy:

1. **Divisoria (in person)**: the most common. The owners buy, then bring the
   goods to the warehouse themselves. By the time staff start counting, the
   buying is already finished.
2. **Pinduoduo and Shopee (online)**: tracked as online orders with shipment
   stages on purchase orders (in-transit chip).

Receipts:

- Divisoria receipts often have **no supplier name** on them.
- Sometimes there is **no receipt at all**; then the purchase has to be encoded
  by hand.
- Receipt lines are often cryptic abbreviations.

## Lay-away and Need to Buy (owner, 2026-11-04)

- A lay-away still being paid off is **not** bought for: it uses stock on the
  shelf but never goes on the Procurement Sheet's Need to Buy.
- Once the customer has **paid for the items**, it goes on Need to Buy like any
  other order (and is marked paid, so it is listed first). **Insurance and
  shipping fee don't count**: a lay-away with only the ₱28 insurance left is
  paid for (found 2026-11-04, #924BB26 rice cooker missing from the sheet).

## Receiving and counting

- Staff count **only after everything has arrived** and the unpacking is done,
  not item by item as goods come in.
- They write counts **on paper** first, then encode them in the app afterwards.
- **Counting mistakes are common.** Any design must assume the first count can
  be wrong and give a way to catch it.
- If staff can see the expected (bought) quantity, they tend to copy it, so the
  count stops being a real check.

## Unallocated stock (owner rule, 2026-10-30, do not change)

- **Unallocated stock = what is physically on the shelf, ready to pick.**
- A sales order does **not** lower it. Only a picker marking the item Found does,
  because only then has it left the shelf.
- Formula and details: architecture.md, "Unallocated Stock = What Is on the Shelf
  (LOCKED)".

## Picking when the shelf says there's not enough (owner, 2026-10-31)

- If unallocated stock is **less than what the picker needs**, the picker can't
  just tap Found. They must either:
  - **Count the Unit 1 shelf** (including the pieces in their hand) without
    seeing the system's number. The count is saved like a Guardian count, and
    Found goes through for what the count covers (the rest is OS). Unit 2 is
    left as recorded.
  - Or say it came from a **delivery that isn't recorded yet**: blocked, mark OS,
    note it on Receiving and message the owners (receipt-first).
  - Or **check again**: it may be the wrong variant.
- **A count higher than the system is held, not added (owner, 2026-11-12).**
  Extra pieces usually mean a purchase wasn't recorded. Found 2026-11-11: Jas
  counted 1 Acacia Wood Chopping Board 33×20 (never bought in the system) and the
  count added it; in 30 days, 30 of 74 picker counts added 132 pieces this way.
  Now the extra isn't added: the line goes OS for it, the picker sets the pieces
  aside, and the owners get a bell ("Picker counted more: not added yet") with
  **Record purchase / Snap receipt** (Receiving then counts it in and the order is
  picked), **the system was wrong: add N** (added to what's on the shelf now), or
  **ignore** (wrong item). Receiving shows the held pieces on the matching line.
  Only picker counts; owners' own counts and Guardian/Pabilang counts still save.
- **Don't count a delivery twice** (found 2026-10-31: 4 of the first 5 picker
  counts included goods from that day's buying trip, which Receiving then added
  again). The count asks pickers to leave out anything not received yet, and
  warns when a delivery of the item is waiting on Receiving. Receiving warns on
  any item a picker counted in the last 2 days: receive only the pieces that
  weren't already on the shelf.
- **OS when the shelf should have some (owner, 2026-11-04).** If the system says
  free pieces are on the shelf, tapping OS asks the picker to look again (Unit 1,
  nearby bins, Unit 2, the right size/color). If there are still none, they count
  the Unit 1 shelf (blind, 0 is fine) and confirm Unit 2 is empty; the count fixes
  the system number, then OS goes through for what's missing. Found 2026-11-04:
  52 open OS lines (32 products, e.g. KAISA VILLA BLENDER - Red) had been marked
  OS, and a purchase requested, while the system still showed shelf stock.
- **Found some, but not enough (owner, 2026-11-07).** In that OS pop-up the
  picker counts **everything they can find** (in hand, Unit 1, nearby bins,
  Unit 2). Found goes through for those pieces and the rest is OS. If the pieces
  can **finish another order** (it needs that many or fewer), the pop-up lists up
  to 3 such orders (oldest first) and the picker chooses: give the pieces to that
  order (this one becomes all OS, pick that order next) or keep them here. Found
  2026-11-07: one Korean Utensils Gold piece left, #38CDA89 needed 2 and
  #0E212665 needed 1; Tess worked around the pop-up to give it to #0E212665.
- **Unit 2 can't show more than the whole shelf (2026-11-07).** Orders take stock
  off Unit 1's number, so pieces picked from Unit 2 never lowered Unit 2: the
  pop-up said "Unit 2 has 3" when all 3 were gone. Found on 329 products (1,851
  pieces). Pickers now see at most the shelf total, and after each pick the extra
  is moved from Unit 2 to Unit 1 (a transfer; the total doesn't change).
- **One warehouse in practice (owner, 2026-11-07).** The two-unit setup (Unit 1
  shelf, Unit 2 reserve, runner transfers) isn't used yet; only a few SKUs are
  kept in Unit 2 (none right now). Receiving had put every delivery into Unit 2
  by default, so on 2026-11-07 all Unit 2 numbers (4,068 pieces, 550 products)
  were moved to Unit 1 and Receiving now defaults to Unit 1.
- **Unit 1 is called 3C and Unit 2 is called 4A (owner, 2026-11-14).** Every
  screen says 3C / 4A now.
- **3C and 4A show what's physically there (owner, 2026-11-14).** 3C + 4A =
  unallocated stock. The 3C number used to be "free to sell" (shelf minus orders
  not picked yet), so 334 products looked negative while the pieces were on the
  shelf (e.g. Ha130 Food Warmer 37cm: 40 on the shelf, shown as −21). The old
  number is still shown as "Free to sell".
- **Unit 2 reserve is free stock, not borrowing.** If unallocated stock is above
  zero, the picker can't borrow from another order until they confirm **both
  Unit 1 and Unit 2 are empty**; that confirmation is saved as a count of 0.

## Count accuracy (built 2026-11-09)

- Every shelf count (Guardian, picker, Pabilang, Procurement Sheet edit) is
  scored: **"Tugma sa shelf"** when the count equals the **shelf (unallocated)
  number the system showed** before it. Shown on Pabilang → Pag-usad ng Bilang
  (today, 14 days, per staff), on the Guardian card, and as "✓ Checked" on the
  Procurement Sheet.
- When stock is below zero the shelf shows 0, so **a count of 0 is a match**
  (found 2026-11-09: 54 such counts had been scored "+N").
- 2026-11-09: 157 Procurement Sheet edits made before the fix had saved the
  system stock instead of the typed shelf number; repaired from each record's
  note (backup in scripts/reports).

## Recount requests (owner, 2026-10-31)

- When the owners suspect a stock number is wrong, they ask Jas to count it.
  Jas gets a **sticky pop-up** on all her accounts with the owner's message and
  the products. She counts the **Unit 1 shelf only** (owner, 2026-11-04: Unit 2
  is rarely used; it is left as recorded), without seeing the system's numbers. It can be minimized while she counts but comes back
  every 30 minutes and on every page load until each product is saved.
- **Long lists go on a page (owner, 2026-11-04):** left menu →
  **Pabilang (Recount)**. Each product saves on its own, so Jas can stop and
  come back; it shows how many are done. With more than 5 products there is
  **no pop-up**: just a small red chip in the corner ("38 pabilang pa") that
  opens the page. Up to 5 products keep the sticky pop-up.
- The owner gets a **Telegram message as soon as Jas finishes** (her counts vs
  the old numbers), and a **reminder at 12 noon** if she hasn't finished by the
  due date (not on Sundays). No work Nov 1, holiday Nov 2 (2026): the first
  batch is due Tuesday, Nov 3.

## Products with variants (owner, 2026-11-16)

- An order must be on the **variant** (color, size, design), never on the main
  product: the picker can't match a main product to the shelf. New Order and
  Edit Order block the main product since 2026-11-09.
- **Cash / installment is not a variant.** Codes like "CASH BASIS" and
  "INSTALLMENT" under a product are old leftovers; the price type is picked on
  the order. Archived 2026-11-16 on 18L Kaisa Villa Air fryer Oven and
  Stainless Steamer/Casserole.
- 2026-11-16 cleanup: 36 open orders from before the block were on a main
  product. 15 were switched (plus one line of #9E3C443) where the variant was
  certain from the price charged, the saved item name, the chat or only one
  choice, and 4 air fryer orders were fixed by archiving the old codes. Backup:
  scripts/reports/2026-11-16-parent-variant-fix-backup.json. The rest wait for
  sales (colors). Two wait for the owners: the 6-layer 120cm rack has a
  5-layer rack filed under it (#A435801), and HK Bank has no plain variant
  (#DD58459).

## Devices

- Owners use **iPhone and Huawei** phones. Anything mobile must work on both,
  and must not depend on Android-only browser features without a fallback.

## Receipt-first receiving (built 2026-10-29)

- Staff can only receive what the owners recorded as bought (Procurement Sheet
  Buy or Scan receipt, or an online order).
- Anything else that arrives can't be received. Staff can note it at the
  bottom of Receiving ("Arrived but not on the list?"), then **message the
  owners on Facebook** to upload the receipt or encode the purchase, and keep
  it aside. Once recorded, it moves up to the list to be counted in. (The team
  asks through Facebook, not an in-app button.)
- Owners can receive unrecorded goods for urgent orders by giving a reason.
- Staff procurement requests (STAFF_DRAFT) are the shopping list, not
  deliveries. They live on the Procurement Sheet and Priority List, not on
  Receiving. Never delete them as "backlog".
- **Snap receipt** (owners, on the phone at the store): pick the supplier if
  known, photograph the receipt, done. Lines the system is sure about are
  recorded as bought immediately. Unsure lines appear on Receiving as
  "From receipts: match these" showing only the item text; staff match them
  while unpacking (no prices or supplier shown), and each match is remembered.
- The receipt still gets checked on **Purchases & Receipts** (admin only):
  scan each supplier's receipt against what was received.

## Unallocated stock is kept and counted, not calculated (owner, 2026-10-30; on screens 2026-11-13)

**Live on every screen since 2026-11-13** (owner approved after the two-week
trial: 2,908 of 2,920 products matched, 0 errors). The Procurement Sheet,
Inventory List, Guardian, picker checks and Pabilang show the **stored** shelf
number; the formula is only a fallback for products without one and a nightly
drift check. Design: architecture.md, "Stored Shelf Stock and Physical Stock".
Not built yet: the physical stock breakdown (On the shelf → Picked → Packed →
Total).

- **What staff count is unallocated stock** (the Guardian asks three staff to
  count 5 products a day). So unallocated stock is the number the system keeps,
  and a count simply corrects it, one product at a time.
- It goes **up** when goods are received (purchases) or a return arrives back.
- It goes **down only when a picker picks the item** (taps Found).
- Sales orders, edits and cancellations of **unpicked** items do not change it.
- **No returns area:** when a picked order is cancelled, or picked items are
  removed from an order, the pieces go straight back on the shelf, so they are
  added back to unallocated stock.
- **Physical stock = unallocated stock + everything else still in the
  warehouse** (picked, photo check, packed, waiting for the courier or for
  pick-up). It drops when the courier or customer takes the order.
- System stock (today's `stock_level`) is unstable because orders move it while
  nothing physical moves. It stays only as a calculated "free to sell" number
  (unallocated − orders not picked yet).

## Returns to suppliers (owner, 2026-10-30; phase 1 built)

Page: Inventory Management → **Supplier Returns** (and a "Report damaged" icon on
the Inventory List). Design and later phases: architecture.md, "Supplier Returns".

- Bad items are returned to suppliers often, and **suppliers are slow to
  replace them**. Today nothing tracks what a supplier still owes.
- **Most bad items are found by a picker or on the shelf**, less often while
  unpacking or from customer returns.
- **The owners take items back** to the supplier, mostly on buying trips.
- **What the supplier gives back:** usually the **same item**. Sometimes a
  **refund**. Sometimes a **partial refund**, when the item still works but
  can't be sold, so we keep it. No vouchers or next-purchase discounts yet, but
  they could happen.
- **Shopee:** returned through the Shopee app. **Pinduoduo:** returns aren't
  possible, so we only get a discount (we keep the item).
- **"Waiting too long" is different per supplier.**
- Everyone should see what's waiting, but staff must not see supplier names or
  costs (see "Confidential" above).

## Customer returns (owner, 2026-10-30; phases 1-2 built)

Page: Inventory Management → **Returns**, and the **Returns** tab on the
Priority List. Open a case from the order (Orders → Process Return, or set the
status to Returned); courier sync opens one for every parcel it marks Returned.
Design and later phases: architecture.md, "Customer Returns".

Money and replacements (owner, 2026-10-31):

- A **replacement** is a one-tap **₱0 order** for the same customer and address;
  it goes through picking and packing like any order.
- **Who pays shipping on a replacement is decided each time** (we pay = free
  shipping, or the customer pays the shipping fee).
- A **refund** is recorded in **Expenses** (Customer Refund) with how it was paid.
- **Waiving what's still owed** (owner, 2026-11-05): on an installment or lay-away
  that arrived damaged, the owners sometimes let the customer stop paying the
  rest (#D4CEF54, Jazzly Luna: ₱973 forgiven). Decide **Partial refund / discount**,
  then **Take it off what they owe**. No money goes out, so nothing goes to
  Expenses: the amount is added to the order's **discount**, so the sale becomes
  what she paid and the balance drops. Only on return cases.
- **Store credit** goes on the customer's balance and is used on their next order.
- **Partial refund, customer keeps the damaged item** (owner, 2026-11-05): paid
  three ways, picked under "How?" when recording it: **Sent money** (GCash, bank,
  cash: an Expenses row), **Store credit** (used on the next order), or **Off what
  they owe** (waived, above). Store credit from a return is recorded as
  "Customer Refund (store credit)": P&L counts it as a cost, Cash Flow leaves it
  out (no cash went out).

Reserved for a replacement (owner, 2026-11-03):

- Found 2026-10-30: a 12L jar bought for Virginia's replacement (#8E12BCB) was
  re-picked for another customer's older order. Nothing told staff it was meant
  for the replacement.
- **Sales decides** when a replacement should be first in line: they tap
  **Reserve for replacement** on the order (Priority List) with what it replaces.
  Nothing is reserved automatically.
- Until that order is picked, the **Picker blocks** Found on other orders when
  the shelf can't cover both ("Leave it for them → mark OS"). **Only owners can
  override**, with a reason; the agent who reserved it is told.
- **Receiving shows** "reserved for a replacement: #order, customer. Tag it and
  set it aside."
- It ends by itself once the order is picked.

How returns reach us:

1. **Courier sends the parcel back (RTS):** failed delivery or rejected by the
   recipient.
2. **Customer reports damage** on Facebook, usually with a photo. The item may
   or may not come back.
3. **Customer ships the damaged item back** to the warehouse.

(No walk-in returns.)

What happens to an RTS parcel **depends**: staff open it and **check every
item for damage**. Then either the order is **re-shipped**, or the customer
cancels and the good pieces **go back on the shelf**.

Courier returns in practice (owner, 2026-11-03):

- **Most returns are courier returns (RTS).** An inventory staff member
  receives the parcel from the courier, then posts in a **Messenger group for
  returns**. **Sales replies: resend to the customer, or cancel the order.**
  Staff also check whether the item is damaged and tell the owners.
- The courier's data comes in later than the parcel (2026-11-03: three parcels
  came back, only one showed up from courier sync). So staff must be able to
  **log the parcel when it is in their hands**, finding it by **order # or
  customer name**.
- **Sales decides resend vs cancel** for RTS; owners don't need to approve.
  Owners decide only when something is **damaged**.
- Sales agents **don't watch the bell**; a **pop-up** gets noticed.
- Most orders are **COD**, so a cancelled RTS usually needs **no refund**.
- Cancelled: OK pieces go back on the shelf, and staff confirm when that's done.
- Customers often **don't reply right away**. Sales can answer **"Asked
  customer, waiting for reply"**; the question comes back **after 4 hours**,
  and the case shows how long it has waited. After **3 days** with no answer,
  the **owners decide** resend or cancel.
- Sales can answer from the pop-up **or from the Returns page** (same buttons).
- **Log returned parcel asks "Who sent it back?"** (owner, 2026-11-05). Found on
  return #7: a leaking jar the **customer** sent back was logged as a courier
  return, so the paid order was voided. **Courier** (failed delivery, rejected):
  as above, sales decides. **Customer** (damaged, defective, wrong item): staff
  pick the items, the order stays a sale, and the **owners decide** (replacement,
  refund...). If the order already has a case asking for the item back, logging
  just marks the parcel as arrived.

Only one box came back (owner, 2026-11-04; built 2026-11-04):

- Rare: an order shipped as **several boxes** (each with its own tracking # and
  COD amount); one box is delivered and accepted, another comes back.
- Staff log the parcel and **pick which box came back**; only that box's items
  are in the return, and the order is **not** voided (the delivered box was sold).
- **Resend:** the box becomes **its own new order** (same customer, address,
  agent, original order date), starting at **Packed** (it is already packed and
  checked) so it goes straight to booking. **The money moves with the box**:
  - COD: the box's unpaid amount moves to the new order (collected on re-send).
  - Already paid: the payment for the box moves too, so the new order is paid
    and the courier collects nothing for the item.
  - Partly paid: what was paid covers the **delivered box first**; the rest moves.
  - **Shipping fee: sales picks each time** (customer pays SF, or we pay).
- **Customer doesn't want it:** the box's items are **removed from the order**,
  so the sale only counts what the customer kept; OK pieces go back on the shelf.
- If the customer had **already paid** for a box they don't keep, the order
  shows as overpaid and the **owners are alerted** to refund or give store credit.
- Courier sync no longer marks a multi-box order Returned when one box comes back;
  staff log the parcel and pick the box.

What the customer can get: a **replacement shipped**, a **full refund**, a
**partial refund / discount** (they keep the item), or **store credit**. The
**owners decide**; staff then do the work (check, re-ship, pack the
replacement).

The owners also decide **whether to ask for the damaged item back**. Often the
customer reports damage and we **don't ask for it back**: we give a discount /
partial refund, or just send a replacement. Sometimes we ask the customer to
ship it back first. So a replacement can be with or without a return.

The damaged piece: **thrown away** (our loss), **sold cheaper as 2nd-hand**, or
it **never comes back** (customer keeps or throws it). Damaged items from
customers are **never** returned to the supplier.

When the courier damaged it, the owners **sometimes file a claim** with the
courier (e.g. SPX), so whether the courier paid needs tracking.

Why nothing happened before return cases (2026-10-30):

- Staff **put items back in stock even when they are no longer okay**, so
  damaged pieces can end up on the shelf and be picked again.
- Staff are **waiting on the owners** to say replace or refund, and nobody
  tells them.
- There is **no place in the app** listing open returns, so they are forgotten.
  (The old "Process return" button only logs a row; 40 of 44 uses were
  "exchange", which does nothing.)

## One GCash payment for several orders (owner, 2026-11-04; built 2026-11-05)

How it happens today:

- A customer often pays **2-3 of their orders in one GCash transfer**, usually
  lay-aways. There is no tool for it: the agent uploads the same screenshot to
  each order and types each order's share, with notes like "kasama po dito
  payment sa isang invoice".
- Found 2026-11-04: 149 GCash references are on more than one payment (34 in the
  last 30 days). Only 80 add up to the transfer. 11 have the **full amount on
  every order** (one order looks paid when it isn't), 35 add up to more than the
  transfer, 22 to less. 22 references show up again more than 3 days later (an
  **old screenshot reused** for a new payment), and 18 involve a cancelled order
  whose payment was copied to the new order but left on the old one too.
- The app reads the reference number and amount from the screenshot (OCR); it
  can misread the amount.

Owner decisions:

- **Same customer only.** One transfer can pay only that customer's own orders.
  A reference shared with another customer's payment is flagged for the owners.
- **Extra money goes to store credit** when the transfer is more than the chosen
  orders still owe.
- **Reused reference: warn and tell the owners.** If a screenshot's reference is
  already on another payment that isn't part of the same split, the payment still
  saves, is marked "reference already used on #order", and the owners get a bell
  notification. A split typed by hand (e.g. a downpayment on a new order) isn't
  flagged when it's the same customer, within 3 days, and the shares add up to no
  more than the screenshot (2026-11-09, #C3C41DD + #F89542F = ₱2,000).
- **GCash must go to our two numbers (owner, 2026-11-09):** 0917 186 9554 or
  0923 290 2128. A screenshot showing another PH number and neither of ours is
  marked "Not sent to our GCash" and the owners get a bell. From another wallet or
  bank our number shows hidden ("•••• 9554"), which counts as ours. No receiver
  number at all (remittance or bank slip, cropped or blurry) is flagged too
  ("receiver not shown", owner 2026-11-09), after a second read with Google Vision.
- **The app pre-fills each order's share; the agent edits it.** Pre-fill what
  each order needs now: a lay-away's monthly installment (never more than its
  balance), the rest of the balance for other orders. The agent changes it to
  what the customer said, and the shares must add up to the transfer. (Not
  "oldest first": customers pay one month of each lay-away, e.g. a ₱1,691
  transfer on 2026-11-02 = ₱871 + ₱460 + ₱360, 1/5 of each of 3 lay-aways.)

How it works (built 2026-11-05): Log Payment → method GCash or Bank Transfer →
tick **"This GCash also paid other orders"**, enter the whole GCash amount, tick
the customer's other orders. "Installment" orders store a monthly amount;
"Lay-away" orders don't, so the app suggests what the customer paid last time on
that order. Each order gets its own payment, linked as one transfer.

## Bus shipping and shipping fees (owner, 2026-11-05; built 2026-11-05)

- Normal courier orders (SPX, "SF Only"): the customer pays the shipping fee to
  the courier on delivery; it never passes through us.
- **Bus shipping** (Victory Liner, Five Star, Partas, Florida...): often several
  orders of one customer go together ("sabay-sabay"). **We only learn the fee
  after bringing the parcel to the bus company and paying it ourselves**; then
  the customer is charged that amount.
- Sometimes customers **send the SF in advance** together with the item price in
  one GCash ("kasama na po SF dito"). Orders have no place for it today
  (`shipping_fee` is 0 on every order), so the payment looks like the customer
  paid more. Found 2026-11-05: at least 20 of the 148 Payment Fix rows are this.
  On Payment Fix (2026-11-05): **SPX** advance SF (most of them, 14 of 18) →
  **Shipping fee** button: the extra goes on the order as its shipping fee, no
  store credit (SPX charges us the SF; found #4238B22, wrongly put in store
  credit with Credit). **Bus** advance SF → **Credit**: recording the bus fee for
  that order later takes it back from store credit as the shipping fee. Never Tip.
- What we pay the bus company is not recorded in Expenses.
- Owner idea: **track each bus company's fee per destination**, entered every
  time we ship, so over time we know where to send and which is cheapest, and
  can quote the customer an estimate before shipping.
- **How bus companies charge (owner, 2026-11-05):** by **weight plus the item's
  value**, not by box size like SPX. Several boxes sent together = **one fee**
  for the whole trip.
- Today the company and terminal are only typed into the order notes and the
  tracking number (e.g. "VICTORY LINER -- BINALONAN PANGASINAN"); found 37 such
  orders on 2026-11-05. Many bus orders skip the Packer scan, so box weight is
  often missing on the order.
- Owner decisions (2026-11-05): **staff record the fee on their phone at the
  terminal**, right after paying. If the customer owes more SF or sent extra, the
  **sales agent gets a pop-up**. Bus fees are not confidential.
- SF sent in advance already became **store credit**: Log Payment has always
  put any amount above the order total into the customer's store credit (found
  2026-11-05: 188 overpaid orders, 53 of those customers still have credit).

**Mark for bus first (owner, 2026-11-05):** it's hard to look up order numbers
at the terminal; staff want to see a list of what goes by bus. So when a customer
wants bus shipping, **sales marks the orders** (Bus Shipping → Waiting → "Mark
orders for bus"): tick the customer's orders (they don't need to be packed yet),
pick the **bus company and station**, add a note if needed. The **Waiting for
bus** list then shows one card per customer + bus + station, which orders are
ready (picked or later) and which aren't yet. Marking also sets the order's
not-for-shipping reason to "BUS SHIPPING: …" (unless someone already typed one),
so once packed it waits in Packed Orders → Waiting to be Shipped instead of being
verified for SPX. "X" on an order = not by bus anymore. Open orders whose notes
say bus but aren't marked are listed under the cards (12 on 2026-11-05) for sales
to mark.

At the terminal, staff tap **"Paid the bus? Record fee"** on the customer's card:
the ready orders are ticked and the bus and station filled in; they enter the fee.

How it works (built 2026-11-05): left menu → **Bus Shipping** (or **Ship by
bus** on Packed Orders / For Shipping). Staff find the customer by order # or
name (or from the Waiting list), tick the orders that went on the bus, and enter the bus company,
destination, weight, item value, boxes and the fee (optional photo of the bus
receipt). One save:

- splits the fee over the orders (orders where SF was sent in advance take it
  first, the rest by item value; editable) and adds it to each order's
  shipping fee, so the order total and balance go up;
- marks the orders **Shipped** with "BUS: VICTORY LINER — BINALONAN, PANGASINAN"
  as the tracking text;
- records one **Shipping Fee** expense for the trip;
- uses the SF sent in advance: that money is taken back from store credit
  (owners get a bell if the credit was already spent).
- Then the **sales agent's pop-up**: "Collect ₱X SF" (goes away once the payment
  is logged; "Asked customer, waiting" hides it 4 hours), or "Customer sent ₱X
  more": keep as store credit, tip, or refund (owners are told).
- **Free shipping** tick: only the expense is recorded; the customer isn't charged.
- **Bus rates** tab: past trips per company and destination, and a quote for a
  weight and value (cheapest first). It's rough until a few trips are recorded.
- Sales and commission reports leave out the shipping fee (it passes through to
  the bus company). Profit & Loss keeps it in sales and in expenses, so it nets out.

## Customer profile and recommendations (owner, 2026-11-12; phase 1 built 2026-11-25)

- Messenger chats are now readable by the system (connection fixed 2026-11-12).
  Goal: a profile per customer of what she likes and what we can sell her,
  from order history plus the chats (what she asked about but didn't buy,
  what was out of stock, clues like "may baby", "para sa tindahan").
- **Sales staff send the recommendation, not the system.** The system finds the
  opportunity and drafts the message; the agent sends, edits or skips it.
  (Facebook only allows promo messages within 24 hours of the customer's last
  message, and a wrong suggestion costs trust.)
- **Agents only see the customers worth messaging today**, not a suggestion
  for every customer.
- **Overdue lay-away: remind / follow up, don't recommend.** For a customer
  behind on a lay-away, the card is a payment follow-up, not a new item.
- **Phase 1 (built 2026-11-25):** **Customer Persona & Sales Playbook** stored
  in `customer_profiles` (never overwrites staff's `ai_summary_notes`), shown on
  Customer Detail, Live Chat (`CustomerInfoTab` with 1-tap **Insert into Chat**
  into `ChatComposer` for manual review/sending), and Customers CRM (persona
  badges, *"Worth Messaging Today"* & persona filter pills, and **"Build AI
  Personas (+5)"** batch builder). Overdue lay-aways automatically force
  `payment_followup` with zero product pitches, and staff can mark a persona
  **Tama** or **Correct** (`staff_correction_note` feeds into future refreshes).
- **Fixed in testing (2026-11-25, released 151d8d9):** the SPX rider note that
  Verify Shipping puts on every order ("Kuya wag nyo po sabihin na galing
  Shopee!…") is ours, so it is removed before the AI reads orders (it showed up
  as a customer "clue"). The 24h promo window is worked out from the customer's
  last message each time, not saved. Recommendations use the whole catalog.
- **Open question for the owners:** should an installment that was delivered
  but still owes count as overdue (payment follow-up, no pitch)? Today only
  lay-aways and installments not yet shipped count. Found 2026-11-25: Marilyn
  Valderama owes ₱530 due Sep 24 on a delivered installment and was pitched new
  items; but some delivered orders show balances that look wrong.
- Chat history in the system (checked 2026-11-12): ~9,300 customer messages from
  May-Jul 2026 (customer side only, no agent replies), only ~170 a month from
  Aug-Oct, and full two-way messages only from 2026-11-11. The regular sync
  pulls just the 15 latest conversations.
- Gamified customer wishlist app: owner raised it again 2026-11-12; parked behind
  the website launch (see the planner below).

## Out of stock at the supplier (owner, 2026-11-20; built 2026-11-20)

- We run **lean**: we usually buy only after a customer orders.
- Sometimes the supplier has none. Usually we **wait until the supplier gets
  stock**; sometimes we **stop selling** the item.
- Often sales already took the order, and sometimes the customer **already
  paid**, so sales must go back to the customer and tell us what they decided.
- Today the buyer taps **Report Procurement Issue** on the Procurement Sheet
  (free text). It sends a bell to admins, Jas and the agents with a waiting
  order. **Sales usually do nothing with it.**
- Checked 2026-11-20: 24 reports since June, **none answered by sales**, 12
  still open. The Egg Pan was reported 3 times because nothing on the product
  remembers it. The 8in1 Can Opener (reported 2026-11-19) has 5 orders
  waiting, 3 of them paid (₱3,440 to ₱7,622).
  The Priority List's OS buttons (wait / send the rest / remove) were never used.
- What the reports say besides "no stock": only another color or size, price
  went up, bad quality (don't sell), supplier doesn't know when.
- Owner wants sales to be **reminded when they place a new order** for a
  flagged item.

Owner decisions (2026-11-20):

- **Owners and Jas** set the status (it never shows the supplier or the cost).
- It means **we can't get it anywhere for now** (Divisoria, Shopee, Pinduoduo),
  not just one supplier.
- Statuses: **Wala sa supplier: hintayin** (waiting for restock), **Ibang
  kulay/size lang ang meron** (pick the variant to offer), **Tumaas ang presyo**
  (its own status, optional new selling price), **Hindi na ibebenta** (stop
  selling).
- **Check again after 7 days** by default (the date can be changed).
- **Stop selling** still allows selling what's left (free to sell).
- Sales **change the item or remove it**; if the order is paid, they choose
  **store credit or refund** (refund: owners are told and pay it out).

How it works (built 2026-11-20):

- Set it from the Procurement Sheet (the flag button on each row) or left menu
  → Inventory Management → **Wala sa Supplier** (search any variant). The old
  free-text reports are listed there to turn into a status or close.
- **Sales pop-up** (like returned parcels) for each order the shelf can't
  cover, paid orders first: Customer will wait / Change or remove the item
  (opens Edit Order) / Cancel the order / Asked customer, waiting (back in 4
  hours). Owners see it too after 3 days with no answer. "Customer will wait"
  is asked again after 14 days if the item is still out. Price up: "Customer
  agrees" tells owners and Jas to update the price on the order (sales can't
  change prices).
- Orders the shelf still covers (oldest first) are **not** asked.
- After a paid line is removed, the extra money is already in store credit
  (Edit Order does that); the pop-up asks **keep as store credit or refund**.
  A cancelled paid order asks **put in store credit, refund, or already done**.
- **New / Edit Order**: badge in the product search and a warning under the
  line. Adding a flagged item needs the tick **"Customer knows and agrees"**; a
  stopped item is blocked above what's left. Lines already on the order are
  left to the pop-up.
- **Procurement Sheet**: flagged items leave Need to Buy (section "Wala sa
  supplier") and come back on the check-again date with a badge.
- **May stock na** (or recording a purchase of it) clears the status; agents
  whose customers were asked or agreed to wait get a bell.

## Order changed after it was printed (owner, 2026-11-23; built 2026-11-23)

- Customers **keep adding to their orders** on Messenger, so sales edit the order
  often. The warehouse works from the **printed order form**, so items added
  later are **left behind** (the pickers never hear about it).
- Checked 2026-11-23: almost every order is printed right after it's made
  (~500 in 30 days), and orders were edited ~525 times in those 30 days (~350
  orders, 200+ of the edits after picking). Edits only logged "Order Edited",
  never what changed.
- Now every edit saves **what changed** (added, removed, more, fewer) in the
  order's activity. If the order was **already printed or picked** and hasn't
  shipped, the **Inventory dashboard and the owners' dashboard** show it under
  **"Orders changed after printing"**: what changed, who changed it and when, and
  "Already picked" when the new items still have to be picked.
- **Reprint** prints the updated form marked "Updated order: replaces the
  earlier copy", with new/more lines tagged and removed lines struck out ("don't
  pack"). **Got it** closes it without printing. Several edits in a row show as
  one net change; it closes by itself once the order ships or is cancelled.
- **Reprinting is easier**: "Reprint an order" search (order # or customer name)
  on the same card, and a **Reprint** button on every order page.

## Tasks for staff (owner, 2026-11-23; built 2026-11-23)

- The owners used to give tasks on **Messenger** with a screenshot of the order
  ("jas pwede na yang ipadala", "yan din"), mostly to Jas but also to other
  staff. Nothing showed whether it was seen or done.
- Now the owners **assign a task**: from the order page, any Priority List card
  ("Assign task"), or left menu → **Tasks** → New task. Pick who, write the task
  (quick picks for orders: "Pwede na ipadala", "Paki-pick at i-book", "Paki-check
  ang order"), attach the order if any, and an **optional deadline** (within
  1 hour, today, tomorrow or a date; "today / a date" means by 6 PM).
- The staff member gets a **pop-up** until they tap **Nakita ko** (opening the
  order counts too). Then it stays on their **dashboard** ("Mga task ko") and as a
  count next to Tasks in the menu (not a floating corner button) until they tap
  **Tapos na**, with an optional note or photo. Past the deadline, the pop-up
  comes back ("Later" hides it 30 minutes).
- The owner who assigned it gets a **bell** when it's done. Tasks page (owners):
  every task with Not seen yet / Seen / Done and who did it, the order's status
  now, late ones in red; owners can cancel one. The order page lists its tasks.
- **One person, several accounts:** a task for Jas shows on all three of her
  accounts; accounts with the same name count as one person.
- **Progress (owner, 2026-11-23):** between Seen and Done, staff tap **Ginagawa
  na** (working on it, optional note like "ipapadala mamayang hapon") or **May
  problema** (can't do it, reason required). A problem sends the owner a bell
  ("Task problem"), shows in orange at the top of the Tasks page, and stops the
  late pop-up (they're waiting on the owners). Staff can still tap Tapos na later.
- **Replies (owner, 2026-11-23):** staff can ask a question or reply on a task
  (**Magtanong**), and the owners answer there (**Reply**). Staff writing: the
  owner who assigned it gets a bell ("Task reply") and the task shows **New reply**
  at the top of the Tasks page. An owner writing: the task **pops up again** for
  the staff member (staff don't watch the bell), even if it's already done.
  Either side can **attach a photo** to a reply (camera button), e.g. a photo of
  the item or the shelf.
- **Several people at once (owner, 2026-11-23):** tap more than one person when
  assigning. **Each gets their own copy** (own Nakita ko / Tapos na); the owners
  see "2 of 3 done" on each copy.
- **Dashboard summary (owners):** "Tasks for staff" on the owners' Dashboard:
  open, not seen yet, working on it, problem, late, new replies, done today; a
  "Waiting on you" list (problems and replies); and a per-staff table.
  The Tasks tab (`/dashboard/tasks`) shares the same 7 clickable status tiles.
- **Order-linked actions, reply close, and working-today updates (owner, 2026-11-25):**
  - Open tasks about an order have direct **Don't ship yet / Change hold** and
    **Ship by bus** actions right on the task card and reply dialog (and on the
    Order page). Both dialogs list the open regular tasks on that order so
    saving a hold, releasing a hold (**Ready: ship it**), or marking for bus
    updates the order and closes the ticked tasks together with the real
    outcome saved as the Done note. Ticked to start: the task it was opened
    from and your own tasks; someone else's task (an owner holding from the
    order page) is listed but unticked (owner, 2026-11-25).
  - Clicking **Done** on an open order task that still has no active hold or
    bus plan warns staff and requires a note explaining what happened (with
    one-tap **Don't ship yet** / **Ship by bus** shortcuts). This applies to
    every order task, warehouse ones like "Please pick and book" included
    (owner confirmed 2026-11-25).
  - Staff and owners can click **Send & mark Done** in Replies; owners can also
    click **Done** directly on tasks/replies and **Move deadline** on open
    tasks.
  - Logging a **Working on it** update on a past-due task requires a note and
    pauses the late pop-up and red Late count for **that Philippine day only**
    (`Past due · updated today`); if still open tomorrow without a fresh
    update, it alerts as Late again.
- **Answer buttons (owner, 2026-11-25).** Found 2026-11-25: sales answered "check
  with the customer: ship or cancel?" tasks with free-text replies (Ask), so 11
  tasks stayed open, one answer was typed on the wrong customer's task, and a
  customer's reply went unnoticed. Now a task about an open order shows **What did
  the customer say?** for sales and owners (their own tasks): **OK to ship**
  (releases the hold if any, closes the task), **Don't ship yet** / **Ship by bus**
  (the hold and bus dialogs), **Customer hasn't replied** (note what was asked; the
  task isn't late while waiting and pops up again after 4 hours: "Customer replied
  yet?"), and **Cancel the order** (reason required). An unpaid order is cancelled
  right away (stock back, put-back task if picked, history shows who and why). A
  **paid** order isn't cancelled from the task: it becomes a Problem so the owners
  decide store credit or refund. Warehouse staff keep Working on it / Done. Owners'
  Tasks page counts **Waiting for customer**.

## Put back the pieces of a cancelled order (owner, 2026-11-23; built 2026-11-23)

- When sales cancel an order that was **already picked**, the system puts the
  pieces back on the shelf number, but nobody told the warehouse to put the real
  pieces back. Checked 2026-11-23: in 30 days, 23 cancelled orders still had
  picked pieces (93 pieces). Cancelling also never showed in the order's history.
- Now the cancel creates **one shared task for Jas, Al and Edric** (owner's
  choice; Tess was left out): it lists each item and how many, and says if the
  order was already packed ("buksan ang box"). All three get it (pop-up, then
  "Mga task ko"); **whoever puts the pieces back taps Tapos na, which closes it
  for everyone**. Due today 6 PM, or tomorrow noon if cancelled after 4 PM.
- Only for picked orders: an unpicked order has nothing to put back, so no task.
  Courier returns aren't included (the Returns flow has its own put-back step).
- If the order is un-cancelled, the task closes by itself. "May problema" (e.g.
  pieces not found) sends the owners a bell; owners see every put-back task on
  the Tasks page ("Auto (cancelled order)").
- The order's history now shows **Cancelled**, who cancelled it and from which
  status.
- The team is set in the database (`put_back_team()` in
  scripts/migrations/2026-11-23_put_back_tasks.sql); changing who gets it is a
  one-line change there.

## Held orders and "Pwede na ipadala" (owner, 2026-11-24; phase 1 built 2026-11-24)

- Sales hold a packed order with a free-text reason (Packed Orders → **Delay**,
  or Bus Shipping marks it "BUS SHIPPING: …"): waiting for the customer's other
  orders ("sabay-sabay"), waiting for payment, will add more, ship on a date.
  Checked 2026-11-24: 34 picked/packed orders held this way, 41 days old on
  average; 12 wait on another open order of the same customer.
- Found 2026-11-24: the Priority List never read that note, so #020106B (paid,
  packed) looked ready and the owner assigned Czarina "Pwede na ipadala". It was
  waiting for #3509BAD (₱2,661.05) and #D911D94 (₱691.85, not picked). Czarina
  had nowhere to say "hindi pa" except the Done note, so the task closed as Done.
- **A bus doesn't collect COD**, so orders going together by bus must be paid
  first even when they're marked COD.
- Now (phase 1): a **packed** order with a hold note is under **On hold** on the
  Priority List (not Ready), with the note, who held it and since when. Every
  Priority card, the **Assign task** screen and the staff member's **task card**
  show the hold note, what the order still owes, and the **same customer's other
  open orders** with status and balance (COD included). Assigning a "ship" task
  ("Pwede na ipadala", "i-book") on a held order warns first (it can still be sent).
- Staff: when a task can't be done yet, tap **May problema** (or **Magtanong**),
  not Tapos na.
- **Phase 2 (built 2026-11-24): structured holds.** Packed Orders → **Delay** /
  **Change hold** and the Priority card's **Hindi pa ipapadala** open one dialog:
  pick why (**Isasabay sa ibang order**, **Hintay bayad**, **Mag-a-add pa ang
  customer**, **Ipadala sa petsa**, **Iba pa**), when to ask again (default 7
  days), and for ship-together the customer's orders to tick and **Courier or
  Bus** (by bus, COD orders must be paid first). Each order in a group gets the
  hold; the note on each says "Isasabay sa #...".
- The order's **sales agent gets a pop-up**: **Kumpleto na / Bayad na: pwede na
  ipadala** as soon as every order in the group is packed and paid (or the
  payment it waited for came in), and **Ready na ba?** on the ask-again date.
  Answers: **Ready na: ipadala** (the orders go back to Packed Orders → Ready),
  **Hindi pa** (pick the next date), **Asked customer, waiting** (back in 4
  hours), **Change hold**. Owners see what sales didn't answer for 3 days. Only
  once something in the group is picked or packed.
- **Held from Picked onward (owner, 2026-11-25).** Found #ECB5662: paid,
  waiting for the customer's other orders, 138 days "late" on Ready to pack,
  because a hold only counted once Packed. Now a held **Picked / Photo** order is
  On hold too ("pack it while waiting": the warehouse still packs it, no
  deadline, so "Complete: OK to ship" can fire). Picked (with issue) stays on
  Waiting for items (its OS lines still need work).
- **The old Priority "Hold" (until a date) is gone (2026-11-25):** when it ran
  out the order came back to Ready without asking anyone. The 7 open ones became
  "Don't ship yet" holds (#ECB5662 ships with #C1B47D8 and #6DDF728; #C4C2A82 with
  lay-away #E7B12D2). The 3 paid orders waiting for weeks with no hold (#A1195FB,
  #932851A, #1F4AB9A) got a task for their sales agent: OK to ship, or Don't ship yet.
- A hold ends by itself when the order ships, is cancelled, or Verify Shipping /
  Revert clears the note (database trigger). Bus-marked orders ("BUS SHIPPING:")
  stay with Bus Shipping.
- 2026-11-24 conversion: the 37 free-text holds became structured (11 waiting for
  payment incl. "layaway na lang", 8 ship on a date, 4 adding more, 4 ship
  together with 9 of the customers' other orders added to their groups, 10
  other). Ask date today (December ones: Dec 1), so each agent first sees 10-12
  old holds to review. Backup: scripts/reports/2026-11-24-ship-hold-conversion-backup.json.

## Ship later: don't pick yet (owner, 2026-11-25; built 2026-11-25)

- Some orders are **reserved** or ship on a **later date** ("reserve for
  December", "NOV21 SHIPPING ONWARDS"). Staff kept skipping them on Ready to
  Pick, but the reason was only in the notes, so they stayed on every list.
  Found 2026-11-25: 7 orders on Ready to Pick → Picked (with issue): 2 said
  reserved, 1 had a released hold, **4 had no reason saved**. 21 unpicked orders
  had "reserved / ship on a date" only in their notes.
- **We run lean, so an order that ships later isn't picked yet.** Sales sets
  **Ipadala sa petsa** (the ship date) on the unpicked order: Priority card
  **Ipadala sa ibang petsa**, or the hold dialog (it opens on that reason for
  unpicked orders). Until **3 days before** that date the order is off Ready to
  Pick (listed under "Ipapadala pa sa ibang petsa"), on the Priority List under
  On hold, and **not on Need to Buy**. Its shelf pieces stay free for other
  orders; we buy close to the date if the shelf is short then.
- 3 days before, it comes back to picking and Need to Buy by itself. After it's
  packed, the usual **Ready na ba?** pop-up comes on the ship date.
- The Picker warns if someone scans it early ("I-pick pa rin?"); they can
  still go ahead.
- **Need it kept aside now** (paid, or hard to get again): pick it now, then
  hold the packed order as before.
- **Hindi pa ipi-pick** (Ready to Pick): staff who skip an order must say why
  (reserved / later date, or Iba pa with a note). The order's **sales agent
  gets a pop-up** (with the held-orders pop-up): **Ipadala sa petsa…** (set the
  date), **I-pick na ngayon** (back on Ready to Pick), or **Asked customer,
  waiting** (back in 4 hours). Owners see it after 3 days with no answer or when
  the order has no agent. Until answered, the order is under "Hinihintay ang
  sagot ng sales" on Ready to Pick. Wrong or missing items still go through the
  Picker as OS.
- 2026-11-25: the 21 note-only orders were turned into these questions for
  their sales agents (undo in
  `scripts/migrations/2026-11-25_convert_reserved_notes_to_pick_questions.sql`).
- **Free to sell still counts ship-later orders** (it comes from `stock_level`,
  which orders lower when they're made). Not changed yet.

## Notes for a person or team (owner, 2026-11-25; built 2026-11-25)

- Sales wrote requests for the warehouse as **order notes** ("meron na daw stock,
  pacheck", "pwede na padala", "update po? wala pa din?"), but a note told no one,
  and inventory only opens an order to pick or check it. Checked 2026-11-25: 31
  notes written by people in 30 days, only 1 with an @tag. Sales had never opened
  most Messages threads (20 and 18 unread), but they answer pop-ups.
- Now every note box (order page Activity & Notes, Priority List, Ready to Pick)
  asks **Para kanino?**: **Note lang** (default: nobody is told), **Inventory**
  (Jas, Al, Tess, Edric, Rey), **Owners**, the order's **sales agent**, or anyone
  else (**Iba pa**). An @tag in the note sends it to that person too. Notes go
  **both ways** (inventory can send to sales).
- Then **Kailangan ng sagot** (default: stays until they reply or tap Tapos na) or
  **Pasabi lang po** (closes when they tap Nakita ko). Not "FYI": it sounds
  sarcastic in Filipino (owner).
- **Pop-ups come right away (2026-11-25):** a new task or note, a reply, a new
  deadline or a withdrawn note shows on the person's screen within seconds (it
  used to wait up to 3 minutes).
- It works like a task: a **pop-up** (closing it brings it back in 30 minutes and
  on every page load), then it stays on their dashboard ("Para sa'yo") and in
  **Tasks** with a count in the menu until answered. Open notes also show on the
  **order page** and in the **Picker** when the order is scanned.
- A note to **Inventory** or **Owners** is one shared note: whoever answers first
  closes it for everyone.
- The answer **pops up for the sender right away** (not the bell; any page, Tasks
  included) and is added to the order's
  Activity & Notes. Senders see their notes under Tasks → **Mga note na pinadala
  ko** (Hindi pa nakikita / Seen by Al / Answered) and can **Bawiin** one.
- **Not seen in 2 hours:** the sender gets a pop-up once (message them on
  Messenger), and the owners see it on their dashboard and the Tasks page.
- The Inventory team list is in `src/lib/services/staff-tasks/staff-note-service.ts`.

## Screens in English (owner, 2026-11-25)

- **Every staff screen is in English.** Older sections of this file still use the
  Filipino names the screens had before; this is what they are called now:
  - Tasks and notes: Nakita ko → **Got it**, Ginagawa na → **Working on it**, May
    problema → **Problem**, Tapos na → **Done**, Magtanong → **Ask**, Sumagot →
    **Answer**, Bawiin → **Withdraw**, Mga task ko / Para sa'yo → **My tasks / For
    you**, Mga note na pinadala ko → **Notes I sent**.
  - Note box: Para kanino? → **Who is it for?**, Note lang → **Just a note**, Iba pa →
    **Someone else**, Kailangan ng sagot → **Needs a reply**, Pasabi lang po → **Just
    letting you know** (not "FYI").
  - Task quick picks: **OK to ship**, **Please pick and book**, **Please check the order**.
  - Menu: Pabilang (Recount) → **Recount**, Wala sa Supplier → **Out at Supplier**.
    Statuses: **Out at supplier: wait for stock**, **Only another color/size**, **Price
    went up**, **Stop selling**; May stock na → **Back in stock**.
  - Holds: Hindi pa ipapadala → **Don't ship yet**, Ipadala sa ibang petsa → **Ship on
    another date**, reasons **Ship with other orders / Waiting for payment / Customer
    will add more / Ship on a date / Other**; Kumpleto na / Bayad na: pwede na ipadala →
    **Complete / Paid: OK to ship**, Ready na ba? → **Ready to ship?**, Ready na:
    ipadala → **Ready: ship it**, Hindi pa → **Not yet**.
  - Picking: Hindi pa ipi-pick → **Don't pick yet**, I-pick na ngayon → **Pick it now**.
  - Counts: Tugma sa shelf → **Matches shelf**, Sobra / Kulang → **Over by / Short by**,
    Pag-usad ng Bilang → **Count progress**.
  - Nagmamadali → **Urgent**.
- **Still in Filipino on purpose:** what goes to customers or couriers (Live Chat
  quick replies, customer emails, the AI persona's draft messages, the SPX rider
  instruction), and whatever staff type themselves (notes, task text, hold notes).
- The put-back task for a cancelled picked order is written in English too (database
  function, `scripts/migrations/2026-11-25_put_back_task_english.sql`); tasks made
  before 2026-11-25 keep their old text.

## Owner to-do: only you can do these (owner, 2026-11-25; built 2026-11-25)

- Some work only the owners can do, and it was being missed: checked 2026-11-25,
  **only 6 GCash payments were verified in November** (297 waiting) and **no SPX
  remittance file since Oct 30** (187 delivered COD orders still owing ₱293k).
  The owners don't read the bell (500+ unread in 30 days, mostly "Order Packed" /
  "Order Issue Reported"), so it has to be a list on the Dashboard.
- **Dashboard and Tasks page (owners): "Only you can do these"**. Each line has a
  count, what it's about and a button to the screen; red = overdue. It's worked out
  from live data each time, so **a line clears by itself once it's done** (nothing
  to tick off). Both owners see the same list.
- Lines: **Upload the GCash statement** (payments since the last upload; red after
  7 days), **Check flagged payments** (not sent to our GCash / reference used twice,
  with the list), **Upload the SPX remittance file** (COD orders delivered in the last
  90 days still owing; red after 7 days), **Picker counted more than the shelf:
  decide** (all held counts on one page, `/dashboard/owner-todo/held-counts`),
  **Decide on returns**, **Staff are waiting on you** (task problems, unread
  replies), **Supplier returns** (to bring back, suppliers late), **Finish Payment
  Fix**, **Enter costs** (deliveries in the last 30 days with no cost), **Collect
  from shipped orders (bus / no tracking)**.
- **Uploads are remembered now** (`owner_uploads`): the GCash statement (Payments →
  Verify) and the SPX file save when and by whom. Before 2026-11-25 neither was
  saved, so the GCash line starts from the newest payment a statement verified
  (Nov 15). The GCash statement check is owners only now (the page already was).
- **Task for me**: owners can give themselves a task (button on the card, or **Me**
  at the top of Assign a task). It doesn't pop up (it starts as seen), stays under
  **My tasks** until Done, pops up if it passes the deadline, and isn't counted in
  "Tasks for staff".

## Payments from the testing period (owner, 2026-11-25)

- Payments made **before July 1, 2026** were logged while the app was still being
  tested. If they were never verified, they **don't show** on Payments Log →
  Pending (or its count), aren't matched against GCash statements, and don't count
  on the owners' to-do. They aren't deleted: the orders and the Verified / Rejected
  tabs still have them. The date is in
  `src/lib/services/payments/payment-review-cutoff.ts`.
- Checked 2026-11-25: 60 pending payments were verified against the 0917 and 0923
  GCash statements (misread reference numbers, one transfer split over several
  orders); 143 pending ones from before July were hidden by this rule.

## Being decided (not built yet)

- **Customer purchase planner (owner, 2026-11-01)**: a premium feature on the
  website behind a customer log-in. Customers list what they plan to buy
  (not a wishlist), ask "okay bang bilhin?" and get pros, cons and a better
  suggestion for them, and later check if an appliance fits / looks good in
  their house. Lightly gamified. **Not tied to hulugan.** Collect as much
  customer information as is useful. Customer accounts must never be able to
  open the staff dashboard.
  - "Premium" means **free, but only for logged-in customers** (an extra mile
    for them), not paid.
  - If we don't sell a product that fits the customer better, the advisor
    **says so honestly**.
  - Still deciding if it's worth building (cost vs. use).
  - The customer website (`website/`) is **not launched yet** (2026-11-01) and
    the owner isn't happy with its look. Launch the website first; the planner
    comes after we see how many customers use it.

- Blind counting: staff see product names only, not bought quantities; the
  system compares their count with the receipt and asks for a recount on
  mismatches.

## Store credit (owner, 2026-11-10)

- **Who can use store credit:** Sales agents and owners (everyone who can log payments). Customers order through Messenger, so sales agents apply it on their behalf.
- **Credit from unverified/pending payments:** Allowed. When used, the app shows a warning badge ("Credit came from a payment not yet verified by owners") and sends a bell notification to owners so they can verify the source payment.
- **Leftover credit on SPX orders:** SPX orders should not have leftover credit put on the order as shipping fee; any remaining credit stays untouched in the customer's store credit balance.
- **Historical gap orders (18 orders):** Will be corrected after owners review the dry-run summary.
- **Ledger table:** Approved; SQL script will be provided for owners to run in Supabase SQL editor.
- **Order cancellations:** Kept as manual adjustment by staff for now.
- **SPX shipping fee paid with store credit:** When a sender/OFW wants the receiver to pay ₱0 at delivery (Non-COD), staff use "Add SPX SF" on the Order Detail page. The SF is added to the order's shipping fee and total, deducted from the customer's store credit as a Verified Store Credit payment, and `shipping_payment_type` is set to `'free shipping'`. If store credit is less than the SF, the leftover credit covers part of the fee, and the remainder is added to the order's balance due for the customer to pay (by GCash before Verify Shipping; otherwise the courier collects it from the receiver).
  - **The SF is added to the COD at SPX booking, not by our file** (found 2026-11-10: SPX collected more than the balance on 2,284 of 2,502 COD orders; a paid lay-away sent with ₱0 COD was collected ₱410). So for free-shipping orders the SPX file's delivery instruction says "FREE SHIPPING: SF already paid … do not add SF", and Verify Shipping warns. Whoever books in SPX must not add the SF.
  - Add SPX SF works **once, before the order ships** (2026-11-10).
  - The SPX file never asks the courier to collect more than the order still owes, so a payment logged after Verify Shipping lowers the COD (2026-11-10).

## Inventory staff activity history (staff request, built 2026-11-25)

- Inventory staff can check what they did on **My Activity** (`/dashboard/inventory/my-activity`, in the top-level menu right under **Recount**) and see a **My Activity Today** card on their Dashboard.
- **Staff see only their own activity**, automatically combined across all accounts belonging to the same person (e.g. Jas's three accounts, Tess's two, Edric's two). **Owners/Admins** can view **All Inventory Staff** (default), **My Activity**, or any individual staff member.
- Covers existing warehouse actions retroactively: picking (`Picked`, `Picked (with issue)`, OS items, borrowed stock, resolved issues), Second Check (`Photo`), packing (`Packed`, `For Shipping`, `Shipped`), receiving and stock adjustments, shelf counts (Guardian, Recount/Pabilang, Picker, Procurement Sheet) with shelf-match scoring, manual `3C ⇄ 4A` transfers, customer & supplier return events, tasks & notes done/replied, and bus shipments.
- **Confidentiality:** supplier names, unit costs, refund amounts, and receipt photos are excluded server-side (`GET /api/inventory/activity`).
