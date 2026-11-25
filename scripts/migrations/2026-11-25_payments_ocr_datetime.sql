ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS ocr_payment_date date,
  ADD COLUMN IF NOT EXISTS ocr_payment_time text;
