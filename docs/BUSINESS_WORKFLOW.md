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
- A count higher than the system expected usually means a purchase wasn't
  recorded: the owners get a bell notification to check Purchases & Receipts.
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
- **Unit 2 reserve is free stock, not borrowing.** If unallocated stock is above
  zero, the picker can't borrow from another order until they confirm **both
  Unit 1 and Unit 2 are empty**; that confirmation is saved as a count of 0.

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

## Planned: unallocated stock is kept and counted, not calculated (owner, 2026-10-30)

Not built yet. Owner's direction; design and rollout in architecture.md,
"Planned: Stored Shelf Stock and Physical Stock".

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
  notification.
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
  Do not use Credit on those (it would turn the SF into store credit).
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

How it works (built 2026-11-05): left menu → **Bus Shipping** (or **Ship by
bus** on Packed Orders / For Shipping). Staff find the customer by order # or
name, tick the orders that went on the bus, and enter the bus company,
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
