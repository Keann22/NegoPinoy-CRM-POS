-- Borrowing: an item already picked for one order (from_order) is taken to
-- fill another order (to_order). The donor order is reopened with an OS issue
-- and a buy request for the replacement, so no customer silently loses an item.
-- Stock is not adjusted: both orders already reserved their unit; one unit just
-- moved physically from one order's set-aside items to the other.

CREATE TABLE IF NOT EXISTS order_borrows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id),
  product_name text NOT NULL,
  qty integer NOT NULL CHECK (qty > 0),
  from_order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  to_order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status text,                -- donor order's status before it was reopened
  note text,
  created_by_id uuid,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_borrows_from_idx ON order_borrows (from_order_id, created_at);
CREATE INDEX IF NOT EXISTS order_borrows_to_idx ON order_borrows (to_order_id, created_at);

-- Server routes use the service role; no browser access.
ALTER TABLE order_borrows ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
