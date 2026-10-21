-- ==============================================================================
-- Migration: link receipts to what they changed, so a receipt can be corrected
-- (Bulk Receive -> "Received today" -> Edit).
--
-- Before this, inventory_movements had no link back to the purchase line, the
-- warehouse or the person, so a mis-counted receipt could only be patched by
-- guessing which rows it touched. Columns are nullable: older rows stay as they
-- are and simply can't be edited from the Receive screen.
--
-- Run BEFORE deploying the code that writes these columns. (The receive route
-- retries without them if they are missing, so receiving keeps working either
-- way - but receipts made before this runs can't be edited.)
-- ==============================================================================

ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS po_item_id uuid
    REFERENCES public.purchase_order_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS warehouse_id uuid
    REFERENCES public.warehouses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS performed_by_id uuid,
  ADD COLUMN IF NOT EXISTS performed_by_name text,
  -- Set on the zero-quantity 'receipt_correction' note row that documents an edit.
  ADD COLUMN IF NOT EXISTS corrects_movement_id uuid
    REFERENCES public.inventory_movements(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_movements_po_item
  ON public.inventory_movements(po_item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_corrects
  ON public.inventory_movements(corrects_movement_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_performed_by
  ON public.inventory_movements(performed_by_id, timestamp DESC);

-- PostgREST caches the schema; make the new columns visible to the API now.
NOTIFY pgrst, 'reload schema';
