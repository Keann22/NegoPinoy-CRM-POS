import {
  cleanNumericRef,
  extractGcashRefFromNotes,
  isBankDatePrefixedRef,
  isPaymentFlagged,
  isStandardGcashRef,
} from './payment-ref-utils';
import type { StatementTransaction } from './gcash-statement-parser';
import type {
  PaymentLogItem,
  StatementAmountMismatch,
  StatementDateAmountCandidate,
} from '@/types/payment-log.types';

function toPhDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const ph = new Date(d.getTime() + 8 * 3600 * 1000);
  return ph.toISOString().slice(0, 10);
}

function calendarDayDiff(dateA: string, dateB: string): number {
  const a = Date.UTC(Number(dateA.slice(0, 4)), Number(dateA.slice(5, 7)) - 1, Number(dateA.slice(8, 10)));
  const b = Date.UTC(Number(dateB.slice(0, 4)), Number(dateB.slice(5, 7)) - 1, Number(dateB.slice(8, 10)));
  return Math.round((a - b) / 86400000);
}

function effectivePaymentRef(p: PaymentLogItem): string | null {
  return cleanNumericRef(p.reference_number) || extractGcashRefFromNotes(p.notes);
}

function findMatchingTx(
  refClean: string,
  transactions: StatementTransaction[],
): { tx: StatementTransaction; matchedRef: string } | null {
  for (const tx of transactions) {
    if (tx.direction === 'debit') continue;
    if (tx.refNo === refClean || tx.rawLine.replace(/\s/g, '').includes(refClean)) {
      return { tx, matchedRef: refClean };
    }
  }
  if (refClean.startsWith('0')) {
    const noZeros = refClean.replace(/^0+/, '');
    if (noZeros.length >= 8) {
      for (const tx of transactions) {
        if (tx.direction === 'debit') continue;
        if (!tx.rawLine.replace(/\s/g, '').includes(noZeros)) continue;
        const token = tx.rawLine.split(/\s+/).find((t) => t.replace(/\D/g, '').startsWith(noZeros));
        if (token) {
          return { tx, matchedRef: token.replace(/\D/g, '') };
        }
      }
    }
  }
  return null;
}

export function matchStatementPayments(params: {
  transactions: StatementTransaction[];
  allPayments: PaymentLogItem[];
}): {
  verifiedIds: string[];
  amountMismatches: StatementAmountMismatch[];
  suggestedMatches: StatementDateAmountCandidate[];
} {
  const { transactions, allPayments } = params;
  const AMOUNT_TOLERANCE = 5;
  const livePayments = allPayments.filter((p) => p.order_status !== 'Cancelled');

  // Group ALL live payments (Pending + Verified) by effective ref so partial split transfers sum accurately
  const groups = new Map<string, PaymentLogItem[]>();
  for (const payment of livePayments) {
    if (!payment.amount) continue;
    const refClean = effectivePaymentRef(payment);
    if (!refClean) continue;
    const list = groups.get(refClean) || [];
    list.push(payment);
    groups.set(refClean, list);
  }

  const verifiedIds: string[] = [];
  const verifiedSet = new Set<string>();
  const mismatchPaymentIds = new Set<string>();
  const consumedTxIndices = new Set<number>();
  const amountMismatches: StatementAmountMismatch[] = [];

  // Pass 1: Exact Reference Number + Sum Matching
  for (const [refClean, group] of groups) {
    const pendingInGroup = group.filter((p) => p.status === 'Pending');
    if (pendingInGroup.length === 0) continue;

    // Never auto-verify flagged reused-ref or wrong-receiver payments in Pass 1.
    const hasHardFlag = pendingInGroup.some((p) => {
      const n = p.notes || '';
      return isPaymentFlagged(n) && (n.includes('[GCash reference already used') || n.includes('[Not sent to our GCash:'));
    });
    if (hasHardFlag) continue;

    const match = findMatchingTx(refClean, transactions);
    if (!match || match.tx.amount === null) continue;

    // Date-gap guard: block auto-verifying if statement tx is > 14 days away from every pending payment.
    if (match.tx.date) {
      const txDate = match.tx.date;
      const anyNearDate = pendingInGroup.some((p) => {
        const payDate = toPhDate(p.payment_date);
        return !payDate || Math.abs(calendarDayDiff(txDate, payDate)) <= 14;
      });
      if (!anyNearDate) continue;
    }

    const sum = group.reduce((s, p) => s + Number(p.amount || 0), 0);
    if (Math.abs(sum - match.tx.amount) <= AMOUNT_TOLERANCE) {
      consumedTxIndices.add(match.tx.index);
      for (const p of pendingInGroup) {
        verifiedIds.push(p.id);
        verifiedSet.add(p.id);
      }
    } else {
      for (const p of pendingInGroup) mismatchPaymentIds.add(p.id);
      amountMismatches.push({
        refNo: match.matchedRef,
        statementDate: match.tx.date,
        statementAmount: match.tx.amount,
        statementDesc: match.tx.description,
        recordedSum: Math.round(sum * 100) / 100,
        payments: pendingInGroup.map((p) => ({
          id: p.id,
          orderId: p.order_id,
          orderShortId: (p.order_id || '').slice(0, 7).toUpperCase(),
          customerName: p.customer_name,
          amount: Number(p.amount),
          status: p.status,
          proofUrl: p.proof_url,
        })),
      });
    }
  }

  // Pass 2: Date + Amount Candidate Matching (Bank Transfers, International Remittance, missing-ref)
  const remainingTxs = transactions.filter(
    (tx) =>
      !consumedTxIndices.has(tx.index) &&
      tx.direction !== 'debit' &&
      tx.amount !== null &&
      tx.amount > 0 &&
      tx.date !== null,
  );

  const candidatePayments = livePayments.filter(
    (p) =>
      p.status === 'Pending' &&
      !verifiedSet.has(p.id) &&
      !mismatchPaymentIds.has(p.id) &&
      !p.transfer_id &&
      !['Cash', 'COD Payed', 'Shopee Platform Payouts'].includes(p.payment_method) &&
      Number(p.amount) > 0,
  );

  const rawPairs: { payment: PaymentLogItem; tx: StatementTransaction; dayDiff: number }[] = [];
  const paymentMatchCounts = new Map<string, number>();
  const txMatchCounts = new Map<number, number>();

  for (const payment of candidatePayments) {
    const payDate = toPhDate(payment.payment_date);
    if (!payDate) continue;
    const payAmount = Number(payment.amount);
    const payCleanRef = cleanNumericRef(payment.reference_number);
    const payHasStdGcashRef = isStandardGcashRef(payment.reference_number);

    for (const tx of remainingTxs) {
      if (!tx.date || tx.amount === null) continue;
      if (Math.abs(tx.amount - payAmount) > 1) continue;
      const diff = calendarDayDiff(tx.date, payDate);
      if (Math.abs(diff) > 2) continue;

      // Do not suggest pairing a GCash-to-GCash payment with a known 13-digit ref against a DIFFERENT GCash-to-GCash transfer.
      if (
        payHasStdGcashRef &&
        !tx.isBankOrRemittance &&
        tx.refNo &&
        isStandardGcashRef(tx.refNo) &&
        tx.refNo !== payCleanRef
      ) {
        continue;
      }

      rawPairs.push({ payment, tx, dayDiff: diff });
      paymentMatchCounts.set(payment.id, (paymentMatchCounts.get(payment.id) || 0) + 1);
      txMatchCounts.set(tx.index, (txMatchCounts.get(tx.index) || 0) + 1);
    }
  }

  const suggestedMatches: StatementDateAmountCandidate[] = rawPairs.map(({ payment, tx, dayDiff }) => {
    const isAmbiguous =
      (paymentMatchCounts.get(payment.id) || 0) > 1 || (txMatchCounts.get(tx.index) || 0) > 1;
    const payAmount = Number(payment.amount);
    const looksLikeNonGcashRef =
      payment.payment_method === 'Bank Transfer' ||
      payment.payment_method === 'Other' ||
      isBankDatePrefixedRef(payment.reference_number) ||
      !cleanNumericRef(payment.reference_number);

    let score = 50;
    if (Math.abs(tx.amount! - payAmount) < 0.01) score += 10;
    if (Math.round(payAmount * 100) % 10000 !== 0) score += 10;
    else if (Math.round(payAmount) % 500 === 0) score -= 5;

    const absDiff = Math.abs(dayDiff);
    if (absDiff === 0) score += 15;
    else if (absDiff === 1) score += 8;
    else score -= 5;

    if (tx.isBankOrRemittance) score += 12;
    if (looksLikeNonGcashRef) score += 5;
    score += isAmbiguous ? -25 : 8;

    const confidenceScore = Math.max(25, Math.min(98, Math.round(score)));
    const confidence: 'high' | 'medium' = confidenceScore >= 85 && !isAmbiguous ? 'high' : 'medium';

    return {
      paymentId: payment.id,
      orderId: payment.order_id,
      orderShortId: (payment.order_id || '').slice(0, 7).toUpperCase(),
      customerName: payment.customer_name,
      paymentDate: payment.payment_date,
      paymentMethod: payment.payment_method,
      amount: payAmount,
      ocrAmount: payment.ocr_amount,
      proofUrl: payment.proof_url,
      notes: payment.notes,
      statementDate: tx.date!,
      statementRef: tx.refNo,
      statementAmount: tx.amount!,
      statementDesc: tx.description,
      channelLabel: tx.channelLabel,
      confidence,
      confidenceScore,
      dayDiff,
      isAmbiguous,
    };
  });

  suggestedMatches.sort((a, b) => {
    if (a.confidenceScore !== b.confidenceScore) return b.confidenceScore - a.confidenceScore;
    return b.statementDate.localeCompare(a.statementDate);
  });

  return { verifiedIds, amountMismatches, suggestedMatches };
}
