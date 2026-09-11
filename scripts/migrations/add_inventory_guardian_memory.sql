-- Add inventory_guardian_memory table for Agentic AI Physical Inventory Guardian
CREATE TABLE IF NOT EXISTS public.inventory_guardian_memory (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  action_type text NOT NULL,
  physical_count integer,
  system_stock_before integer,
  system_stock_after integer,
  discrepancy integer,
  active_orders_count integer,
  actor_name text,
  actor_id uuid,
  notes text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inv_guardian_mem_prod ON public.inventory_guardian_memory(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inv_guardian_mem_created ON public.inventory_guardian_memory(created_at DESC);
