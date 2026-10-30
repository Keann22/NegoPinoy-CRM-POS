# How NegoPinoy actually works

Read this before designing or changing any feature. Build around how the team
really works, not around how an ideal warehouse would work. If a request
conflicts with something here, ask before building.

Keep this file current: when the owner explains a workflow, add it here.

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

## Being decided (not built yet)

- Blind counting: staff see product names only, not bought quantities; the
  system compares their count with the receipt and asks for a recount on
  mismatches.
