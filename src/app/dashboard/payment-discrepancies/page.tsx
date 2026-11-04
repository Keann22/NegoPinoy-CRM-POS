'use client';

import { useState, useMemo } from 'react';
import { Search, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { usePaymentDiscrepancies } from '@/hooks/usePaymentDiscrepancies';
import { DiscrepancyKpis } from '@/components/dashboard/payments/discrepancy-kpis';
import { DiscrepancyRow } from '@/components/dashboard/payments/discrepancy-row';

export default function PaymentDiscrepanciesPage() {
  const { toast } = useToast();
  const { items, currentUser, isLoading, processingId, reconcile } = usePaymentDiscrepancies();
  const [search, setSearch] = useState('');
  const [selectedStaff, setSelectedStaff] = useState('all');
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const filteredItems = useMemo(() => {
    const q = search.toLowerCase().trim();
    return items.filter(item => {
      const matchesStaff = selectedStaff === 'all' || item.salesPerson.toLowerCase() === selectedStaff.toLowerCase();
      const matchesSearch = !q ||
        item.orderShortId.toLowerCase().includes(q) ||
        item.customerName.toLowerCase().includes(q) ||
        item.actualRef.toLowerCase().includes(q) ||
        item.recordedRef.toLowerCase().includes(q) ||
        (item.notes || '').toLowerCase().includes(q);
      return matchesStaff && matchesSearch;
    });
  }, [items, selectedStaff, search]);

  const kpis = useMemo(() => {
    const total = filteredItems.length;
    const resolved = filteredItems.filter(i => i.isResolved).length;
    const remaining = total - resolved;
    const gcashSum = filteredItems.reduce((s, i) => s + i.gcashAmount, 0);
    const recordedSum = filteredItems.reduce((s, i) => s + i.recordedAmount, 0);
    const varSum = recordedSum - gcashSum;
    return { total, resolved, remaining, gcashSum, recordedSum, varSum };
  }, [filteredItems]);

  const copyRef = (ref: string) => {
    navigator.clipboard.writeText(ref);
    toast({ title: 'Reference Copied', description: ref });
  };

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2 text-sm text-muted-foreground">Loading payment records...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Payment Discrepancies to Fix</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {currentUser?.isManagement
              ? 'Review and resolve GCash receipt amount discrepancies across all sales staff.'
              : `Showing orders created by you (${currentUser?.name || 'Sales Staff'}). Review and fix discrepancies.`}
          </p>
        </div>

        {currentUser?.isManagement && (
          <div className="flex gap-2 flex-wrap">
            {['all', 'Jan Marie Sabado', 'Czarina Suyat', 'jessa vergara'].map(staff => (
              <Button
                key={staff}
                size="sm"
                variant={selectedStaff === staff ? 'default' : 'outline'}
                onClick={() => setSelectedStaff(staff)}
                className="rounded-full text-xs"
              >
                {staff === 'all' ? 'All Staff' : staff.split(' ')[0]}
              </Button>
            ))}
          </div>
        )}
      </div>

      <DiscrepancyKpis kpis={kpis} />

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search Order #, customer, ref..."
          className="pl-9 text-sm"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground uppercase">
            <tr>
              <th className="p-3">Order #</th>
              <th className="p-3">Customer</th>
              {currentUser?.isManagement && <th className="p-3">Staff</th>}
              <th className="p-3">GCash Ref</th>
              <th className="p-3 text-right">GCash</th>
              <th className="p-3 text-right">Recorded</th>
              <th className="p-3 text-center">Variance</th>
              <th className="p-3">Proof</th>
              <th className="p-3 min-w-[200px]">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filteredItems.length === 0 ? (
              <tr>
                <td colSpan={currentUser?.isManagement ? 9 : 8} className="p-8 text-center text-muted-foreground">
                  No payment discrepancies found.
                </td>
              </tr>
            ) : (
              filteredItems.map(item => (
                <DiscrepancyRow
                  key={item.paymentId}
                  item={item}
                  isManagement={!!currentUser?.isManagement}
                  isBusy={processingId === item.paymentId}
                  onCopyRef={copyRef}
                  onPreviewImage={url => setPreviewImage(url)}
                  onAction={reconcile}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {previewImage && (
        <div 
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-2xl max-h-[90vh] bg-card rounded-lg overflow-hidden" onClick={e => e.stopPropagation()}>
            <Button
              size="icon"
              variant="ghost"
              className="absolute top-2 right-2 h-8 w-8 rounded-full bg-background/80"
              onClick={() => setPreviewImage(null)}
            >
              <X className="h-4 w-4" />
            </Button>
            <img src={previewImage} alt="Payment Proof" className="max-w-full max-h-[85vh] object-contain" />
          </div>
        </div>
      )}
    </div>
  );
}
