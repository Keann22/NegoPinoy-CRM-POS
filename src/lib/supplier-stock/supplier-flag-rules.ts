import type { SupplierFlagAnswerKind, SupplierFlagStatus } from '@/types/supplier-stock.types';

/**
 * Out of stock at the supplier (owner, 2026-11-20): the statuses and timings.
 * Pure, shared by the screens and the server.
 */

export const SUPPLIER_FLAG_RULES = {
  /** Default "check again" date: this many days after the status is set. */
  checkAgainDays: 7,
  /** "Asked customer, waiting for reply" hides the order for this long. */
  askAgainHours: 4,
  /** No answer for this many days: owners see it too. */
  escalateDays: 3,
  /** "Customer will wait" is asked again after this many days if the item is still out. */
  reaskWaitDays: 14,
  /** A cleared flag still gets its money step (paid line removed) for this long. */
  moneyAfterClearDays: 14,
};

export const SUPPLIER_FLAG_LABELS: Record<SupplierFlagStatus, string> = {
  waiting_restock: 'Wala sa supplier: hintayin',
  other_variant: 'Ibang kulay/size lang ang meron',
  price_up: 'Tumaas ang presyo',
  stop_selling: 'Hindi na ibebenta',
};

/** One line for sales: what it means for their customer. */
export const SUPPLIER_FLAG_HINTS: Record<SupplierFlagStatus, string> = {
  waiting_restock: "The supplier has none and we can't get it anywhere for now. Ask if the customer will wait.",
  other_variant: 'Only another color or size is available. Offer it to the customer.',
  price_up: 'The price went up. Ask if the customer will pay the new price.',
  stop_selling: "We don't sell this anymore. Change it to another item, remove it or cancel.",
};

/** Badge colors (Tailwind) per status, light and dark. */
export const SUPPLIER_FLAG_BADGE: Record<SupplierFlagStatus, string> = {
  waiting_restock: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800',
  other_variant: 'bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800',
  price_up: 'bg-violet-100 text-violet-800 border-violet-300 dark:bg-violet-950/60 dark:text-violet-300 dark:border-violet-800',
  stop_selling: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800',
};

/** Answers that still need sales (or owners) to do something. */
export const OPEN_ANSWERS: SupplierFlagAnswerKind[] = ['asked', 'waiting_customer', 'editing'];

/** Answers that mean the customer is fine waiting / agreed. */
export const WAIT_ANSWERS: SupplierFlagAnswerKind[] = ['wait', 'agreed_on_order'];

/** Answers that end the money step. */
export const CLOSED_ANSWERS: SupplierFlagAnswerKind[] = ['keep_credit', 'refund', 'credit_added', 'handled', 'gone'];

export const ANSWER_LABELS: Record<SupplierFlagAnswerKind, string> = {
  asked: 'Not answered yet',
  waiting_customer: 'Asked customer, waiting',
  wait: 'Customer will wait',
  agreed_on_order: 'Agreed when ordering',
  editing: 'Changing / removing',
  keep_credit: 'Removed: kept as store credit',
  refund: 'Removed: refund (owners told)',
  credit_added: 'Cancelled: put in store credit',
  handled: 'Done',
  gone: 'Done',
};

/** Statuses where the customer can choose to wait for this exact item. */
export function canWait(status: SupplierFlagStatus): boolean {
  return status !== 'stop_selling';
}

/** New Order: the agent must tick "customer knows and agrees" before saving. */
export function needsAgreement(status: SupplierFlagStatus): boolean {
  return status !== 'stop_selling';
}

/** Today's date (YYYY-MM-DD) in Philippine time, plus N days. */
export function phtDatePlus(days: number, from: Date = new Date()): string {
  const d = new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(d);
}

/** True when the check-again date is today or past (PHT). */
export function isCheckDue(checkAgainOn: string | null, now: Date = new Date()): boolean {
  return !!checkAgainOn && checkAgainOn <= phtDatePlus(0, now);
}
