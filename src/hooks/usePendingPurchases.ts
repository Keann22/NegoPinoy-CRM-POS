import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useUserProfile } from '@/hooks/useUserProfile';

export function usePendingPurchases(onReceiveComplete: () => void) {
  const [items, setItems] = useState<any[]>([]);
  const [unexpectedItems, setUnexpectedItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const { toast } = useToast();
  const { userProfile } = useUserProfile();
  const reportedByName = userProfile ? `${userProfile.firstName} ${userProfile.lastName}`.trim() : undefined;

  const fetchPending = async () => {
    try {
      const res = await fetch("/api/inventory/receive/pending-pos");
      const data = await res.json();
      setItems(data.pendingItems || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPending();
  }, []);

  const handleQtyChange = (id: string, qty: string) => {
    setItems(items.map(i => i.id === id ? { ...i, receivedQty: qty } : i));
  };

  const handleReasonChange = (id: string, reason: string) => {
    setItems(items.map(i => i.id === id ? { ...i, discrepancyReason: reason } : i));
  };

  const handleReceiveSingle = async (item: any, isUnexpected: boolean = false) => {
    const toReceive = [];
    const toReceiveUnexpected = [];

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

    setSubmittingId(item.id);
    try {
      const res = await fetch("/api/inventory/receive/pending-pos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receives: toReceive, unexpectedItems: toReceiveUnexpected, reportedByName })
      });

      if (!res.ok) throw new Error(await res.text());

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
    const toReceive = items.filter(i => i.receivedQty && Number(i.receivedQty) > 0).map(i => ({
      itemId: i.id,
      receivedQty: Number(i.receivedQty),
      discrepancyReason: Number(i.receivedQty) < Number(i.remainingQty) ? i.discrepancyReason : undefined
    }));

    const toReceiveUnexpected = unexpectedItems.filter(i => i.receivedQty && Number(i.receivedQty) > 0).map(i => ({
      productId: i.id,
      receivedQty: Number(i.receivedQty),
      unitCost: i.sellingPrice ? i.sellingPrice * 0.8 : 0 
    }));

    const invalidDiscrepancies = items.filter(i => i.receivedQty && Number(i.receivedQty) > 0 && Number(i.receivedQty) < Number(i.remainingQty) && (!i.discrepancyReason || i.discrepancyReason.trim() === ''));
    if (invalidDiscrepancies.length > 0) {
        return toast({ variant: 'destructive', title: 'Reason Required', description: `Please provide a discrepancy reason for: ${invalidDiscrepancies.map(i => i.productName).join(', ')}` });
    }

    if (toReceive.length === 0 && toReceiveUnexpected.length === 0) {
      return toast({ variant: 'destructive', title: 'No Items', description: "Please enter the received quantity for at least one item." });
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/inventory/receive/pending-pos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receives: toReceive, unexpectedItems: toReceiveUnexpected, reportedByName })
      });

      if (!res.ok) throw new Error(await res.text());

      toast({ title: 'Success', description: "Successfully received purchases!" });
      setUnexpectedItems([]);
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
    loading,
    isSubmitting,
    submittingId,
    handleQtyChange,
    handleReasonChange,
    handleReceiveSingle,
    handleCancel,
    handleCloseShort,
    handleReceive,
    closeBatch
  };
}
