import type { PaymentBucket, PaymentLogItem } from '@/types/payment-log.types';

export const OUR_GCASH_NUMBERS = ['9171869554', '9232902128'] as const;

const OWN_PHONE_PATTERNS = [
  '9171869554',
  '9232902128',
  '92322902128',
  '0917186',
  '63917186',
  '0923290',
  '63923290',
];

/**
 * Returns true if the extracted digits look like one of our own GCash phone numbers
 * (including OCR truncations/extra digits like 6391718695544, 1639171869554, 0345590917186).
 */
export function isOwnPhoneNumberRef(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const digits = raw.replace(/\D/g, '');
  if (!digits) return false;
  if (OWN_PHONE_PATTERNS.some((p) => digits.includes(p))) return true;
  if (digits.endsWith('917186') || digits.endsWith('923290')) return true;
  return false;
}

/**
 * Extracts a 13-digit GCash reference number from payment notes (e.g. "7047 441 297305"),
 * ignoring our own phone numbers and date-prefixed bank trace IDs.
 */
export function extractGcashRefFromNotes(notes: string | null | undefined): string | null {
  if (!notes) return null;
  const regex = /\b(\d{4}\s?\d{3}\s?\d{6}|\d{13})\b/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(notes)) !== null) {
    const clean = match[1].replace(/\s/g, '');
    if (clean.length !== 13) continue;
    if (isOwnPhoneNumberRef(clean)) continue;
    // Skip ISO-like date-prefixed bank traces (2025.../2026...) unless clearly a GCash ref
    if (/^202[4-9]/.test(clean)) continue;
    return clean;
  }
  return null;
}

export function cleanNumericRef(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = raw.replace(/[\s-]/g, '').match(/\d{8,}/);
  if (!m) return null;
  const clean = m[0];
  if (clean.length <= 5 || isOwnPhoneNumberRef(clean)) return null;
  return clean;
}

export function isStandardGcashRef(ref: string | null | undefined): boolean {
  if (!ref) return false;
  const clean = ref.replace(/[\s-]/g, '');
  if (isOwnPhoneNumberRef(clean)) return false;
  return /^\d0[34]\d{10}$/.test(clean) || /^00\d0[34]\d{9}$/.test(clean);
}

export function isBankDatePrefixedRef(ref: string | null | undefined): boolean {
  if (!ref) return false;
  const clean = ref.replace(/[\s-]/g, '');
  return /^(202[4-9]|026|251[0-2]|260|261)/.test(clean);
}

export function isPaymentFlagged(notes: string | null | undefined): boolean {
  if (!notes) return false;
  return (
    notes.includes('[Not sent to our GCash') ||
    notes.includes('[GCash reference already used')
  );
}

export function classifyPaymentBucket(p: PaymentLogItem): Exclude<PaymentBucket, 'all'> {
  if (p.order_status === 'Cancelled') return 'cancelled';
  if (isPaymentFlagged(p.notes)) return 'flagged';
  if (['Cash', 'COD Payed', 'Shopee Platform Payouts'].includes(p.payment_method)) {
    return 'cash_cod';
  }
  if (
    p.payment_method === 'Bank Transfer' ||
    isBankDatePrefixedRef(p.reference_number) ||
    (p.payment_method === 'Other' && !isStandardGcashRef(p.reference_number))
  ) {
    return 'bank_other';
  }
  const cleanRef = cleanNumericRef(p.reference_number);
  if (!cleanRef) return 'missing_ref';
  if (p.ocr_amount !== null && p.ocr_amount !== undefined && Math.abs(Number(p.ocr_amount) - Number(p.amount)) > 5) {
    return 'amount_mismatch';
  }
  return 'gcash_ref';
}
