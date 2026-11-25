'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { classifyPaymentBucket } from '@/lib/services/payments/payment-ref-utils';
import type {
  PaymentBucket,
  PaymentLogCounts,
  PaymentLogItem,
  PaymentStatus,
  StatementDateAmountCandidate,
} from '@/types/payment-log.types';

function toPhDateStr(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Date(d.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

export function usePaymentsLog(enabled: boolean) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<PaymentStatus>('Pending');
  const [payments, setPayments] = useState<PaymentLogItem[]>([]);
  const [counts, setCounts] = useState<PaymentLogCounts>({ Pending: 0, Verified: 0, Rejected: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [rerunningOcrId, setRerunningOcrId] = useState<string | null>(null);

  const [bucket, setBucket] = useState<PaymentBucket>('all');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 25;
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const fetchPayments = useCallback(async () => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch(`/api/payments/manage?status=${encodeURIComponent(activeTab)}`, {
        cache: 'no-store',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load payments.');
      setPayments(data.payments || []);
      setCounts(data.counts || { Pending: 0, Verified: 0, Rejected: 0 });
      setSelectedIds(new Set());
    } catch (err: unknown) {
      toast({
        variant: 'destructive',
        title: 'Error loading payments',
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsLoading(false);
    }
  }, [enabled, activeTab, toast]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  useEffect(() => {
    setCurrentPage(1);
    setBucket('all');
    setSelectedIds(new Set());
  }, [activeTab]);

  useEffect(() => {
    setCurrentPage(1);
  }, [bucket, search, dateFrom, dateTo]);

  const bucketCounts = useMemo(() => {
    const map: Record<PaymentBucket, number> = {
      all: payments.length,
      flagged: 0,
      gcash_ref: 0,
      amount_mismatch: 0,
      missing_ref: 0,
      bank_other: 0,
      cash_cod: 0,
      cancelled: 0,
    };
    for (const p of payments) {
      map[classifyPaymentBucket(p)] += 1;
    }
    return map;
  }, [payments]);

  const filteredPayments = useMemo(() => {
    const q = search.trim().toLowerCase();
    return payments.filter((p) => {
      if (activeTab === 'Pending' && bucket !== 'all' && classifyPaymentBucket(p) !== bucket) {
        return false;
      }
      if (dateFrom || dateTo) {
        const ph = toPhDateStr(p.payment_date);
        if (dateFrom && ph < dateFrom) return false;
        if (dateTo && ph > dateTo) return false;
      }
      if (q) {
        const shortOrder = (p.order_id || '').slice(0, 7).toLowerCase();
        const haystack = [
          shortOrder,
          p.customer_name,
          p.sales_person_name,
          p.reference_number || '',
          p.payment_method,
          p.notes || '',
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [payments, activeTab, bucket, search, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(filteredPayments.length / pageSize));
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredPayments.slice(start, start + pageSize);
  }, [filteredPayments, currentPage]);

  const toggleSelect = useCallback((paymentId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(paymentId)) next.delete(paymentId);
      else next.add(paymentId);
      return next;
    });
  }, []);

  const toggleSelectPage = useCallback((checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const p of paginatedData) {
        if (checked) next.add(p.id);
        else next.delete(p.id);
      }
      return next;
    });
  }, [paginatedData]);

  const selectAllFiltered = useCallback(() => {
    setSelectedIds(new Set(filteredPayments.map((p) => p.id)));
  }, [filteredPayments]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const bulkUpdateStatus = useCallback(
    async (ids: string[], newStatus: PaymentStatus, note?: string) => {
      if (ids.length === 0) return;
      setIsMutating(true);
      try {
        const res = await fetch('/api/payments/manage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'bulk_status', paymentIds: ids, status: newStatus, note }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to update payment status.');
        toast({
          title: 'Status Updated',
          description: `${data.updatedCount} payment${data.updatedCount === 1 ? '' : 's'} marked ${newStatus}.`,
        });
        await fetchPayments();
      } catch (err: unknown) {
        toast({
          variant: 'destructive',
          title: 'Update Failed',
          description: err instanceof Error ? err.message : String(err),
        });
      } finally {
        setIsMutating(false);
      }
    },
    [fetchPayments, toast],
  );

  const updateStatus = useCallback(
    async (paymentId: string, newStatus: PaymentStatus) => {
      await bulkUpdateStatus([paymentId], newStatus);
    },
    [bulkUpdateStatus],
  );

  const updateReference = useCallback(
    async (paymentId: string, referenceNumber: string | null) => {
      setIsMutating(true);
      try {
        const res = await fetch('/api/payments/manage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'update_reference', paymentId, referenceNumber }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to save reference number.');
        setPayments((prev) =>
          prev.map((p) => (p.id === paymentId ? { ...p, reference_number: data.referenceNumber } : p)),
        );
        toast({ title: 'Reference Updated', description: 'Reference number saved.' });
        return true;
      } catch (err: unknown) {
        toast({
          variant: 'destructive',
          title: 'Could Not Save Ref No.',
          description: err instanceof Error ? err.message : String(err),
        });
        return false;
      } finally {
        setIsMutating(false);
      }
    },
    [toast],
  );

  const rerunOcr = useCallback(
    async (payment: PaymentLogItem) => {
      if (!payment.proof_url) return;
      setRerunningOcrId(payment.id);
      try {
        const res = await fetch('/api/payments/extract-ocr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentId: payment.id, proofUrl: payment.proof_url }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'OCR failed.');
        toast({
          title: 'OCR Finished',
          description: data.referenceNumber
            ? `Extracted Ref ${data.referenceNumber}${data.ocrAmount != null ? `, Amount ₱${data.ocrAmount}` : ''}.`
            : data.ocrAmount != null
              ? `Extracted Amount ₱${data.ocrAmount}, but no Ref No. found.`
              : 'No reference number or amount found on this image.',
        });
        await fetchPayments();
      } catch (err: unknown) {
        toast({
          variant: 'destructive',
          title: 'OCR Failed',
          description: err instanceof Error ? err.message : String(err),
        });
      } finally {
        setRerunningOcrId(null);
      }
    },
    [fetchPayments, toast],
  );

  const confirmStatementMatches = useCallback(
    async (candidates: StatementDateAmountCandidate[]) => {
      if (candidates.length === 0) return false;
      setIsMutating(true);
      try {
        const res = await fetch('/api/payments/manage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'confirm_statement_matches',
            matches: candidates.map((c) => ({
              paymentId: c.paymentId,
              statementRef: c.statementRef,
              statementDate: c.statementDate,
              statementDesc: c.statementDesc,
            })),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to confirm matches.');
        toast({
          title: 'Matches Verified',
          description: `Verified ${data.updatedCount} matched payment${data.updatedCount === 1 ? '' : 's'}.`,
        });
        await fetchPayments();
        return true;
      } catch (err: unknown) {
        toast({
          variant: 'destructive',
          title: 'Could Not Verify Matches',
          description: err instanceof Error ? err.message : String(err),
        });
        return false;
      } finally {
        setIsMutating(false);
      }
    },
    [fetchPayments, toast],
  );

  return {
    activeTab,
    setActiveTab,
    counts,
    isLoading,
    isMutating,
    rerunningOcrId,
    bucket,
    setBucket,
    bucketCounts,
    search,
    setSearch,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    currentPage,
    setCurrentPage,
    pageSize,
    totalPages,
    filteredPayments,
    paginatedData,
    selectedIds,
    toggleSelect,
    toggleSelectPage,
    selectAllFiltered,
    clearSelection,
    updateStatus,
    bulkUpdateStatus,
    updateReference,
    rerunOcr,
    confirmStatementMatches,
    refresh: fetchPayments,
  };
}
