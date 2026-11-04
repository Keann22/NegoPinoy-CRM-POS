import type { ReconcileAction } from '@/types/payment-discrepancy.types';

/** Every fix adds a note starting with this; a payment that has it is done. */
export const RECONCILED_MARK = '[Reconciled';

/** Pesos of slack before two amounts count as different. */
export const PESO_TOLERANCE = 1;

export interface TransferFigures {
  /** What this payment says now. */
  recorded: number;
  /** The whole GCash transfer. */
  gcash: number;
  /** Other payments logged with the same reference. */
  otherCount: number;
  othersTotal: number;
}

export interface RuleResult {
  allowed: ReconcileAction[];
  blockedReason?: string;
  /** This order's part of the transfer (the transfer minus the other orders on it). */
  share: number;
}

const peso = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Which fixes are safe for a payment. One GCash transfer often pays several orders, so
 * this order only owns what is left after the other orders' payments.
 */
export function reconcileRules(f: TransferFigures): RuleResult {
  const share = f.gcash - f.othersTotal;

  if (f.otherCount > 0) {
    const total = f.recorded + f.othersTotal;
    if (total > f.gcash + PESO_TOLERANCE) {
      return {
        allowed: [],
        share,
        blockedReason:
          `The ${f.otherCount + 1} orders on this transfer add up to ${peso(total)}, but only ${peso(f.gcash)} was received. ` +
          'Open each order (links under GCash Ref), fix the wrong or duplicate payment, then tap Checked.',
      };
    }
    // The orders cover the transfer: link them. Money left over can go to this customer.
    const allowed: ReconcileAction[] = ['split_payment'];
    if (share > f.recorded + PESO_TOLERANCE) allowed.push('overpayment_credit', 'tip');
    return { allowed, share };
  }

  if (f.gcash > f.recorded + 0.01) return { allowed: ['overpayment_credit', 'tip'], share };
  if (f.gcash < f.recorded - 0.01) return { allowed: ['typo_correction'], share };
  return { allowed: [], share, blockedReason: 'The payment already matches the GCash amount.' };
}

export const ACTION_LABELS: Record<ReconcileAction, string> = {
  overpayment_credit: 'Store credit',
  tip: 'Tip / keep the change',
  split_payment: 'Split transfer',
  typo_correction: 'Fix typo',
  mark_checked: 'Checked, no change',
};
