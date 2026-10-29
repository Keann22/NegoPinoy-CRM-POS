import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useRoleCheck } from '@/hooks/useRoleCheck';
import { useSupabase } from '@/lib/supabase/hooks';
import type { Warehouse } from '@/types';

// Items staff added because they arrived but aren't on the list. Kept on this
// device so a reload doesn't lose them while waiting for the receipt.
const ADDED_KEY = 'receivingAddedItems';
const readAdded = (): any[] => {
  try { return JSON.parse(localStorage.getItem(ADDED_KEY) || '[]'); } catch { return []; }
};

// Admin override for goods with no recorded purchase (receipt-first receiving).
const askOverrideReason = (): string | null => {
  const reason = window.prompt('No receipt recorded for this yet. Receive anyway? Type the reason (e.g. urgent order for Maria):');
  return reason && reason.trim() ? reason.trim() : null;
};

export function usePendingPurchases(onReceiveComplete: () => void, refreshKey = 0) {
  const supabase = useSupabase();
  const [items, setItems] = useState<any[]>([]);
  const [unexpectedItems, setUnexpectedItems] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [targetWarehouseId, setTargetWarehouseId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const { toast } = useToast();
  const { userProfile } = useUserProfile();
  const reportedByName = userProfile ? `${userProfile.firstName} ${userProfile.lastName}`.trim() : undefined;
  const { isManagement } = useRoleCheck();
  const [addedLoaded, setAddedLoaded] = useState(false);

  useEffect(() => {
    setUnexpectedItems(readAdded());
    setAddedLoaded(true);
  }, []);

  useEffect(() => {
    if (!addedLoaded) return;
    try { localStorage.setItem(ADDED_KEY, JSON.stringify(unexpectedItems)); } catch { /* private mode */ }
  }, [unexpectedItems, addedLoaded]);

  const fetchPending = async () => {
    try {
      const res = await fetch("/api/inventory/receive/pending-pos");
      const data = await res.json();
      const pending = data.pendingItems || [];
      setItems(pending);
      // An added item whose purchase has since been recorded is now on the list.
      const listed = new Set(pending.map((p: any) => p.productId));
      setUnexpectedItems(prev => prev.filter(u => !listed.has(u.id)));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPending();

    const fetchWh = async () => {
      if (!supabase) return;
      try {
        const { data } = await supabase
          .from('warehouses')
          .select('*')
          .eq('is_active', true)
          .order('is_fulfillment_hub', { ascending: false });

        if (data && data.length > 0) {
          setWarehouses(data);
          const u2 = data.find((w: any) => w.code === 'UNIT2');
          setTargetWarehouseId(u2 ? u2.id : data[0].id);
        }
      } catch (err) {
        console.error('Failed to load warehouses:', err);
      }
    };

    fetchWh();
  }, [supabase]);

  // A receipt corrected in "Received today" can put a line back in this queue.
  useEffect(() => {
    if (refreshKey > 0) fetchPending();
  }, [refreshKey]);

  const handleQtyChange = (id: string, qty: string) => {
    setItems(items.map(i => i.id === id ? { ...i, receivedQty: qty } : i));
  };

  const handleReasonChange = (id: string, reason: string) => {
    setItems(items.map(i => i.id === id ? { ...i, discrepancyReason: reason } : i));
  };

  const handleReceiveSingle = async (item: any, isUnexpected: boolean = false) => {
    const toReceive = [];
    const toReceiveUnexpected = [];

    if (isUnexpected && !isManagement) {
      return toast({ variant: 'destructive', title: 'Not recorded as bought yet', description: 'Message the owners on Facebook to scan the receipt or encode the purchase. Keep it aside.' });
    }

    if (isUnexpected) {
        if (!item.receivedQty || Number(item.receivedQty) <= 0) {
            return toast({ variant: 'destructive', title: 'Invalid Quantity', description: 'Please enter a valid received quantity.' });
        }
        toReceiveUnexpected.push({
            productId: item.id,
            receivedQty: Number(item.receivedQty),
            unitCost: item.sellingPrice ? item.sellingPrice * 0.8 : 0
        });
    } else {
        if (!item.receivedQty || Number(item.receivedQty) <= 0) {
            return toast({ variant: 'destructive', title: 'Invalid Quantity', description: 'Please enter a valid received quantity.' });
        }
        if (Number(item.receivedQty) < Number(item.remainingQty) && (!item.discrepancyReason || item.discrepancyReason.trim() === '')) {
            return toast({ variant: 'destructive', title: 'Reason Required', description: `Please provide a discrepancy reason for: ${item.productName}` });
        }
        toReceive.push({
            itemId: item.id,
            receivedQty: Number(item.receivedQty),
            discrepancyReason: Number(item.receivedQty) < Number(item.remainingQty) ? item.discrepancyReason : undefined
        });
    }

    // Admins can receive unrecorded goods (urgent orders) with a reason.
    let overrideReason: string | undefined;
    if (isUnexpected) {
      const reason = askOverrideReason();
      if (!reason) return;
      overrideReason = reason;
    }

    setSubmittingId(item.id);
    try {
      const res = await fetch("/api/inventory/receive/pending-pos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receives: toReceive, unexpectedItems: toReceiveUnexpected, reportedByName, targetWarehouseId, overrideReason })
      });

      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to receive');

      toast({ title: 'Item Saved!', description: `Successfully received ${item.productName || item.name}.` });
      
      if (isUnexpected) {
          setUnexpectedItems(unexpectedItems.filter(i => i.id !== item.id));
      } else {
          fetchPending();
      }
      onReceiveComplete();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    } finally {
      setSubmittingId(null);
    }
  };

  const handleCancel = async (item: any) => {
      if (!confirm(`Are you sure you want to cancel the request for ${item.productName}?`)) return;
      
      setSubmittingId(item.id);
      try {
        const res = await fetch("/api/inventory/receive/pending-pos/cancel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemId: item.id })
        });
        
        if (!res.ok) throw new Error(await res.text());
        
        toast({ title: 'Request Cancelled', description: `Successfully removed ${item.productName} from the pending list.` });
        fetchPending();
      } catch (e: any) {
        toast({ variant: 'destructive', title: 'Error', description: e.message });
      } finally {
        setSubmittingId(null);
      }
  };

  const handleCloseShort = async (item: any) => {
      if (!confirm(`Are you sure you want to close this short delivery for ${item.productName}? This will set expected quantity to match received quantity (${item.alreadyReceivedQty || 0}).`)) return;
      
      setSubmittingId(item.id);
      try {
        const res = await fetch("/api/inventory/receive/pending-pos/close-short", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemId: item.id })
        });
        
        if (!res.ok) throw new Error(await res.text());
        
        toast({ title: 'Short Delivery Closed', description: `Successfully closed remainder for ${item.productName}.` });
        fetchPending();
      } catch (e: any) {
        toast({ variant: 'destructive', title: 'Error', description: e.message });
      } finally {
        setSubmittingId(null);
      }
  };

  const handleReceive = async () => {
    // Items not on the list have no recorded purchase: staff wait for the
    // receipt; admins can receive them with a reason.
    const allowed = items;
    const allowedUnexpected = isManagement ? unexpectedItems : [];

    const toReceive = allowed.filter(i => i.receivedQty && Number(i.receivedQty) > 0).map(i => ({
      itemId: i.id,
      receivedQty: Number(i.receivedQty),
      discrepancyReason: Number(i.receivedQty) < Number(i.remainingQty) ? i.discrepancyReason : undefined
    }));

    const toReceiveUnexpected = allowedUnexpected.filter(i => i.receivedQty && Number(i.receivedQty) > 0).map(i => ({
      productId: i.id,
      receivedQty: Number(i.receivedQty),
      unitCost: i.sellingPrice ? i.sellingPrice * 0.8 : 0 
    }));

    const invalidDiscrepancies = allowed.filter(i => i.receivedQty && Number(i.receivedQty) > 0 && Number(i.receivedQty) < Number(i.remainingQty) && (!i.discrepancyReason || i.discrepancyReason.trim() === ''));
    if (invalidDiscrepancies.length > 0) {
        return toast({ variant: 'destructive', title: 'Reason Required', description: `Please provide a discrepancy reason for: ${invalidDiscrepancies.map(i => i.productName).join(', ')}` });
    }

    if (toReceive.length === 0 && toReceiveUnexpected.length === 0) {
      return toast({ variant: 'destructive', title: 'No Items', description: "Please enter the received quantity for at least one item." });
    }

    let overrideReason: string | undefined;
    if (toReceiveUnexpected.length > 0) {
      const reason = askOverrideReason();
      if (!reason) return;
      overrideReason = reason;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/inventory/receive/pending-pos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receives: toReceive, unexpectedItems: toReceiveUnexpected, reportedByName, targetWarehouseId, overrideReason })
      });

      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to receive');

      toast({ title: 'Success', description: "Successfully received purchases!" });
      setUnexpectedItems(isManagement ? [] : unexpectedItems);
      fetchPending();
      onReceiveComplete();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const closeBatch = async (batchName: string) => {
    if (!confirm(`Are you sure you want to close ${batchName.replace(/_/g, ' ')}? Any unbought items will roll over to pending requests.`)) return;
    try {
        const res = await fetch('/api/inventory/procurement-batch/close', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ batchName })
        });
        if (!res.ok) throw new Error(await res.text());
        toast({ title: 'Batch Closed', description: `Unbought items rolled over.` });
        fetchPending();
    } catch (e: any) {
        toast({ variant: 'destructive', title: 'Error', description: e.message });
    }
  };

  return {
    items,
    setItems,
    unexpectedItems,
    setUnexpectedItems,
    warehouses,
    targetWarehouseId,
    setTargetWarehouseId,
    loading,
    isSubmitting,
    submittingId,
    handleQtyChange,
    handleReasonChange,
    handleReceiveSingle,
    handleCancel,
    handleCloseShort,
    handleReceive,
    closeBatch,
    isManagement
  };
}
