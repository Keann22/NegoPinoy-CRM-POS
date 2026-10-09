-- Price list: one SKU, several prices (regular / sale / ads / live / installment).
-- Run BEFORE deploying the code that reads these columns — the POS product
-- search selects ads_price and live_price explicitly and 400s without them.
-- Additive only: no existing column or row is changed.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS ads_price numeric NULL,
  ADD COLUMN IF NOT EXISTS live_price numeric NULL;

-- Which price each order line used. NULL on lines created before this change.
-- price_type: regular | sale | ads | live | installment | custom
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS price_type text NULL,
  ADD COLUMN IF NOT EXISTS price_override_reason text NULL,
  ADD COLUMN IF NOT EXISTS price_override_by text NULL;
