import {
  cleanNumericRef,
  extractGcashRefFromNotes,
  isBankDatePrefixedRef,
  isPaymentFlagged,
  isStandardGcashRef,
} from './payment-ref-utils';
import {
  calendarDaysBetween,
  extractDateFromNotes,
  minutesDiff,
  toPhDateString,
} from './payment-date-ocr';
import type { StatementTransaction } from './gcash-statement-parser';
import type {
  PaymentLogItem,
  StatementAmountMismatch,
  StatementDateAmountCandidate,
} from '@/types/payment-log.types';

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
        if (token) return { tx, matchedRef: token.replace(/\D/g, '') };
      }
    }
  }
  return null;
}

function isWeekendToMonday(stmtDate: string, dayDiff: number): boolean {
  if (dayDiff !== -1 && dayDiff !== -2) return false;
  const d = new Date(`${stmtDate}T12:00:00Z`).getUTCDay();
  return d === 6 || d === 0; // Saturday or Sunday
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

    const hasHardFlag = pendingInGroup.some((p) => {
      const n = p.notes || '';
      return isPaymentFlagged(n) && (n.includes('[GCash reference already used') || n.includes('[Not sent to our GCash:'));
    });
    if (hasHardFlag) continue;

    const match = findMatchingTx(refClean, transactions);
    if (!match || match.tx.amount === null) continue;

    if (match.tx.date) {
      const txDate = match.tx.date;
      const anyNearDate = pendingInGroup.some((p) => {
        const payDate = p.ocr_payment_date || toPhDateString(p.payment_date);
        return !payDate || Math.abs(calendarDaysBetween(txDate, payDate)) <= 14;
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

  // Pass 2: Receipt Date/Time + Amount Candidate Matching
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

  type Pair = {
    payment: PaymentLogItem;
    tx: StatementTransaction;
    dayDiff: number;
    dateSource: 'receipt' | 'notes' | 'uploaded';
    effDate: string;
    effTime: string | null;
  };
  const rawPairs: Pair[] = [];
  const paymentMatchCounts = new Map<string, number>();
  const txMatchCounts = new Map<number, number>();

  for (const payment of candidatePayments) {
    const notesDate = !payment.ocr_payment_date ? extractDateFromNotes(payment.notes, payment.payment_date) : null;
    const uploadedDate = toPhDateString(payment.payment_date);
    const dateSource: Pair['dateSource'] = payment.ocr_payment_date ? 'receipt' : notesDate ? 'notes' : 'uploaded';
    const effDate = payment.ocr_payment_date || notesDate || uploadedDate;
    if (!effDate) continue;
    const effTime = payment.ocr_payment_date ? payment.ocr_payment_time : null;

    const payAmount = Number(payment.amount);
    const payCleanRef = cleanNumericRef(payment.reference_number);
    const payHasStdGcashRef = isStandardGcashRef(payment.reference_number);

    for (const tx of remainingTxs) {
      if (!tx.date || tx.amount === null) continue;
      if (Math.abs(tx.amount - payAmount) > 1) continue;
      const diff = calendarDaysBetween(tx.date, effDate);
      const inWindow =
        dateSource === 'receipt'
          ? Math.abs(diff) <= 1
          : Math.abs(diff) <= 2 || (diff === -3 && new Date(`${tx.date}T12:00:00Z`).getUTCDay() >= 5);
      if (!inWindow) continue;

      if (
        payHasStdGcashRef &&
        !tx.isBankOrRemittance &&
        tx.refNo &&
        isStandardGcashRef(tx.refNo) &&
        tx.refNo !== payCleanRef
      ) {
        continue;
      }

      rawPairs.push({ payment, tx, dayDiff: diff, dateSource, effDate, effTime });
      paymentMatchCounts.set(payment.id, (paymentMatchCounts.get(payment.id) || 0) + 1);
      txMatchCounts.set(tx.index, (txMatchCounts.get(tx.index) || 0) + 1);
    }
  }

  const suggestedMatches: StatementDateAmountCandidate[] = rawPairs.map(
    ({ payment, tx, dayDiff, dateSource, effDate, effTime }) => {
      const isAmbiguous =
        (paymentMatchCounts.get(payment.id) || 0) > 1 || (txMatchCounts.get(tx.index) || 0) > 1;
      const payAmount = Number(payment.amount);
      const looksLikeNonGcashRef =
        payment.payment_method === 'Bank Transfer' ||
        payment.payment_method === 'Other' ||
        isBankDatePrefixedRef(payment.reference_number) ||
        !cleanNumericRef(payment.reference_number);

      const timeDiffMinutes =
        effTime && tx.time && dayDiff === 0 ? minutesDiff(tx.time, effTime) : null;
      const exactTimeMatch = timeDiffMinutes !== null && Math.abs(timeDiffMinutes) <= 15;

      let score = 50;
      if (Math.abs(tx.amount! - payAmount) < 0.01) score += 10;
      if (Math.round(payAmount * 100) % 10000 !== 0) score += 10;
      else if (Math.round(payAmount) % 500 === 0) score -= 5;

      let matchReason = '';
      if (dateSource === 'receipt') {
        if (dayDiff === 0 && exactTimeMatch) {
          score += 28;
          const mAbs = Math.abs(timeDiffMinutes!);
          matchReason = mAbs === 0 ? 'Exact receipt date & time' : `Receipt date & time (±${mAbs}m)`;
        } else if (dayDiff === 0) {
          score += 20;
          matchReason = 'Receipt date matches';
        } else {
          score += 10;
          matchReason = 'Receipt date ±1d';
        }
      } else if (dateSource === 'notes') {
        if (dayDiff === 0) {
          score += 18;
          matchReason = 'Notes date matches';
        } else if (Math.abs(dayDiff) === 1) {
          score += 8;
          matchReason = 'Notes date ±1d';
        } else {
          score -= 5;
          matchReason = `${Math.abs(dayDiff)}d gap`;
        }
      } else {
        if (dayDiff === 0) {
          score += 15;
          matchReason = 'Same day';
        } else if (isWeekendToMonday(tx.date!, dayDiff)) {
          score += 8;
          matchReason = 'Weekend → Mon upload';
        } else if (Math.abs(dayDiff) === 1) {
          score += 8;
          matchReason = 'Uploaded ±1d';
        } else {
          score -= 5;
          matchReason = `Uploaded ${Math.abs(dayDiff)}d later`;
        }
      }

      if (tx.isBankOrRemittance) score += 12;
      if (looksLikeNonGcashRef) score += 5;

      const timeDisambiguated = dateSource === 'receipt' && dayDiff === 0 && timeDiffMinutes !== null && Math.abs(timeDiffMinutes) <= 10;
      if (!isAmbiguous) score += 8;
      else score += timeDisambiguated ? -5 : -25;

      const confidenceScore = Math.max(25, Math.min(99, Math.round(score)));
      const effectiveAmbiguous = isAmbiguous && !timeDisambiguated;
      const confidence: 'high' | 'medium' = confidenceScore >= 85 && !effectiveAmbiguous ? 'high' : 'medium';

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
        statementTime: tx.time,
        statementRef: tx.refNo,
        statementAmount: tx.amount!,
        statementDesc: tx.description,
        channelLabel: tx.channelLabel,
        receiptDate: dateSource === 'receipt' ? effDate : null,
        receiptTime: effTime,
        timeDiffMinutes,
        matchReason,
        confidence,
        confidenceScore,
        dayDiff,
        isAmbiguous: effectiveAmbiguous,
      };
    },
  );

  suggestedMatches.sort((a, b) => {
    if (a.confidenceScore !== b.confidenceScore) return b.confidenceScore - a.confidenceScore;
    return b.statementDate.localeCompare(a.statementDate);
  });

  return { verifiedIds, amountMismatches, suggestedMatches };
}
