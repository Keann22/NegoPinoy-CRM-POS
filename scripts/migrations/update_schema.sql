-- Add structured address fields to the customers table
ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS region text,
ADD COLUMN IF NOT EXISTS province text,
ADD COLUMN IF NOT EXISTS city text,
ADD COLUMN IF NOT EXISTS barangay text,
ADD COLUMN IF NOT EXISTS postal_code text,
ADD COLUMN IF NOT EXISTS street_address text;
