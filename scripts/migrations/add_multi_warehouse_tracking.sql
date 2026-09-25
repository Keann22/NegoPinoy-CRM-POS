-- ==============================================================================
-- Migration: Add Multi-Warehouse Tracking for Strategy A
-- Unit 1: Fulfillment Hub (Active Pick & Pack)
-- Unit 2: Reserve & Inbound (Bulk Storage & Receiving)
-- ==============================================================================

-- 1. Warehouses Table
CREATE TABLE IF NOT EXISTS public.warehouses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    is_fulfillment_hub BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read access to authenticated users" ON public.warehouses;
CREATE POLICY "Allow read access to authenticated users"
    ON public.warehouses FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Allow write access to authenticated users" ON public.warehouses;
CREATE POLICY "Allow write access to authenticated users"
    ON public.warehouses FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Seed Unit 1 and Unit 2
INSERT INTO public.warehouses (code, name, is_fulfillment_hub, is_active)
VALUES 
    ('UNIT1', 'Unit 1 - Fulfillment Hub', true, true),
    ('UNIT2', 'Unit 2 - Reserve & Inbound', false, true)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    is_fulfillment_hub = EXCLUDED.is_fulfillment_hub,
    is_active = EXCLUDED.is_active;

-- 2. Product Warehouse Stock Table
CREATE TABLE IF NOT EXISTS public.product_warehouse_stock (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
    stock_level INTEGER NOT NULL DEFAULT 0,
    shelf_location TEXT,
    reorder_threshold INTEGER NOT NULL DEFAULT 5,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT product_warehouse_stock_unique UNIQUE (product_id, warehouse_id)
);

-- Enable RLS
ALTER TABLE public.product_warehouse_stock ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read stock to authenticated users" ON public.product_warehouse_stock;
CREATE POLICY "Allow read stock to authenticated users"
    ON public.product_warehouse_stock FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Allow write stock to authenticated users" ON public.product_warehouse_stock;
CREATE POLICY "Allow write stock to authenticated users"
    ON public.product_warehouse_stock FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_pws_product ON public.product_warehouse_stock(product_id);
CREATE INDEX IF NOT EXISTS idx_pws_warehouse ON public.product_warehouse_stock(warehouse_id);

-- 3. Stock Transfers Table
CREATE TABLE IF NOT EXISTS public.stock_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transfer_number TEXT UNIQUE NOT NULL,
    from_warehouse_id UUID NOT NULL REFERENCES public.warehouses(id),
    to_warehouse_id UUID NOT NULL REFERENCES public.warehouses(id),
    status TEXT NOT NULL DEFAULT 'completed',
    notes TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.stock_transfers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read transfers to authenticated" ON public.stock_transfers;
CREATE POLICY "Allow read transfers to authenticated"
    ON public.stock_transfers FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Allow write transfers to authenticated" ON public.stock_transfers;
CREATE POLICY "Allow write transfers to authenticated"
    ON public.stock_transfers FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Stock Transfer Items Table
CREATE TABLE IF NOT EXISTS public.stock_transfer_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transfer_id UUID NOT NULL REFERENCES public.stock_transfers(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.stock_transfer_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read transfer items to authenticated" ON public.stock_transfer_items;
CREATE POLICY "Allow read transfer items to authenticated"
    ON public.stock_transfer_items FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Allow write transfer items to authenticated" ON public.stock_transfer_items;
CREATE POLICY "Allow write transfer items to authenticated"
    ON public.stock_transfer_items FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_sti_transfer ON public.stock_transfer_items(transfer_id);

-- 4. Sync Trigger: Keep products.stock_level and products.shelf_location in sync
CREATE OR REPLACE FUNCTION public.sync_product_warehouse_totals()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_target_product_id UUID;
    v_total_stock INTEGER;
    v_hub_shelf TEXT;
    v_hub_id UUID;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_target_product_id := OLD.product_id;
    ELSE
        v_target_product_id := NEW.product_id;
    END IF;

    -- Calculate total stock across all warehouses
    SELECT COALESCE(SUM(stock_level), 0)
    INTO v_total_stock
    FROM public.product_warehouse_stock
    WHERE product_id = v_target_product_id;

    -- Get Unit 1 (fulfillment hub) shelf location
    SELECT id INTO v_hub_id FROM public.warehouses WHERE is_fulfillment_hub = true LIMIT 1;
    
    SELECT shelf_location
    INTO v_hub_shelf
    FROM public.product_warehouse_stock
    WHERE product_id = v_target_product_id AND warehouse_id = v_hub_id;

    -- Update products table
    UPDATE public.products
    SET 
        stock_level = v_total_stock,
        shelf_location = COALESCE(v_hub_shelf, shelf_location)
    WHERE id = v_target_product_id;

    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_product_warehouse_totals ON public.product_warehouse_stock;
CREATE TRIGGER trg_sync_product_warehouse_totals
AFTER INSERT OR UPDATE OR DELETE ON public.product_warehouse_stock
FOR EACH ROW
EXECUTE FUNCTION public.sync_product_warehouse_totals();

-- 5. Seed Initial Stock Levels for Existing Products into Unit 1 and Unit 2
DO $$
DECLARE
    v_unit1_id UUID;
    v_unit2_id UUID;
BEGIN
    SELECT id INTO v_unit1_id FROM public.warehouses WHERE code = 'UNIT1';
    SELECT id INTO v_unit2_id FROM public.warehouses WHERE code = 'UNIT2';

    -- Insert existing product stock into Unit 1
    INSERT INTO public.product_warehouse_stock (product_id, warehouse_id, stock_level, shelf_location)
    SELECT 
        p.id, 
        v_unit1_id, 
        COALESCE(p.stock_level, 0), 
        p.shelf_location
    FROM public.products p
    ON CONFLICT (product_id, warehouse_id) DO NOTHING;

    -- Initialize Unit 2 with 0 stock
    INSERT INTO public.product_warehouse_stock (product_id, warehouse_id, stock_level, shelf_location)
    SELECT 
        p.id, 
        v_unit2_id, 
        0, 
        NULL
    FROM public.products p
    ON CONFLICT (product_id, warehouse_id) DO NOTHING;
END $$;

-- 6. RPC: Increment / Decrement Stock for a Specific Warehouse
CREATE OR REPLACE FUNCTION public.increment_warehouse_stock(
    p_product_id UUID,
    p_warehouse_id UUID,
    p_qty INTEGER,
    p_new_unit_cost NUMERIC DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_new_stock INTEGER;
BEGIN
    -- Ensure row exists
    INSERT INTO public.product_warehouse_stock (product_id, warehouse_id, stock_level)
    VALUES (p_product_id, p_warehouse_id, p_qty)
    ON CONFLICT (product_id, warehouse_id)
    DO UPDATE SET 
        stock_level = public.product_warehouse_stock.stock_level + p_qty,
        updated_at = now()
    RETURNING stock_level INTO v_new_stock;

    IF p_new_unit_cost IS NOT NULL AND p_new_unit_cost > 0 THEN
        UPDATE public.products 
        SET initial_unit_cost = p_new_unit_cost 
        WHERE id = p_product_id;
    END IF;

    RETURN v_new_stock;
END;
$$;

-- 7. RPC: Execute Atomic Stock Transfer (e.g. Unit 2 Reserve -> Unit 1 Active)
CREATE OR REPLACE FUNCTION public.execute_stock_transfer(
    p_from_warehouse_id UUID,
    p_to_warehouse_id UUID,
    p_items JSONB, -- Array of { productId: string, quantity: number }
    p_notes TEXT DEFAULT NULL,
    p_created_by TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
    v_transfer_id UUID;
    v_transfer_num TEXT;
    v_from_name TEXT;
    v_to_name TEXT;
    v_item JSONB;
    v_prod_id UUID;
    v_qty INTEGER;
    v_prod_name TEXT;
    v_unit_cost NUMERIC;
BEGIN
    SELECT name INTO v_from_name FROM public.warehouses WHERE id = p_from_warehouse_id;
    SELECT name INTO v_to_name FROM public.warehouses WHERE id = p_to_warehouse_id;
    
    v_transfer_num := 'TRF-' || to_char(now(), 'YYYYMMDD-HH24MISS');

    -- Create Transfer Header
    INSERT INTO public.stock_transfers (
        transfer_number,
        from_warehouse_id,
        to_warehouse_id,
        notes,
        created_by
    ) VALUES (
        v_transfer_num,
        p_from_warehouse_id,
        p_to_warehouse_id,
        p_notes,
        p_created_by
    ) RETURNING id INTO v_transfer_id;

    -- Process Each Item
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_prod_id := (v_item->>'productId')::UUID;
        v_qty := (v_item->>'quantity')::INTEGER;

        IF v_qty > 0 THEN
            -- 1. Deduct from source warehouse
            PERFORM public.increment_warehouse_stock(v_prod_id, p_from_warehouse_id, -v_qty);

            -- 2. Add to destination warehouse
            PERFORM public.increment_warehouse_stock(v_prod_id, p_to_warehouse_id, v_qty);

            -- 3. Record transfer item
            INSERT INTO public.stock_transfer_items (transfer_id, product_id, quantity)
            VALUES (v_transfer_id, v_prod_id, v_qty);

            -- 4. Get product details for movement logging
            SELECT name, initial_unit_cost INTO v_prod_name, v_unit_cost 
            FROM public.products WHERE id = v_prod_id;

            -- 5. Insert movement log (net change 0, documents transfer)
            INSERT INTO public.inventory_movements (
                product_id,
                quantity_change,
                movement_type,
                timestamp,
                reason,
                unit_cost
            ) VALUES (
                v_prod_id,
                0,
                'transfer',
                now(),
                'Internal Transfer (' || v_from_name || ' -> ' || v_to_name || '): ' || v_qty || ' pcs. Ref #' || v_transfer_num,
                COALESCE(v_unit_cost, 0)
            );
        END IF;
    END LOOP;

    RETURN v_transfer_id;
END;
$$;
