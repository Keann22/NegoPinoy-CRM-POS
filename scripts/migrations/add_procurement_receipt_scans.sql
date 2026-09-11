-- Migration: add_procurement_receipt_scans.sql
-- Table to persist procurement receipt scans and drafts for review later.

CREATE TABLE IF NOT EXISTS public.procurement_receipt_scans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
    supplier_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft', -- 'draft', 'completed', 'discarded'
    image_url TEXT,
    raw_lines JSONB NOT NULL DEFAULT '[]'::jsonb,
    engine TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS and add basic policies
ALTER TABLE public.procurement_receipt_scans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read receipt scans"
ON public.procurement_receipt_scans FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Allow authenticated insert receipt scans"
ON public.procurement_receipt_scans FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Allow authenticated update receipt scans"
ON public.procurement_receipt_scans FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Allow authenticated delete receipt scans"
ON public.procurement_receipt_scans FOR DELETE
TO authenticated
USING (true);

-- Allow anon read/write if using anon key in client
CREATE POLICY "Allow anon read receipt scans"
ON public.procurement_receipt_scans FOR SELECT
TO anon
USING (true);

CREATE POLICY "Allow anon insert receipt scans"
ON public.procurement_receipt_scans FOR INSERT
TO anon
WITH CHECK (true);

CREATE POLICY "Allow anon update receipt scans"
ON public.procurement_receipt_scans FOR UPDATE
TO anon
USING (true);

CREATE POLICY "Allow anon delete receipt scans"
ON public.procurement_receipt_scans FOR DELETE
TO anon
USING (true);

CREATE INDEX IF NOT EXISTS idx_procurement_receipt_scans_status ON public.procurement_receipt_scans(status);
CREATE INDEX IF NOT EXISTS idx_procurement_receipt_scans_supplier ON public.procurement_receipt_scans(supplier_id);
