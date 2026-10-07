'use client';

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ShieldAlert, Loader2, Package, CheckCircle2, Clock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useUser } from '@/lib/supabase/hooks';
import { useUserProfile } from '@/hooks/useUserProfile';
import { InventoryGuardianMemoryTimeline } from '@/components/dashboard/inventory/InventoryGuardianMemoryTimeline';

interface EditUnallocatedStockDialogProps {
  item: any | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function EditUnallocatedStockDialog({ item, isOpen, onClose, onSuccess }: EditUnallocatedStockDialogProps) {
  const { user } = useUser();
  const { userProfile } = useUserProfile();
  const { toast } = useToast();
  const [newStock, setNewStock] = useState<string>('');
  const [reasonCode, setReasonCode] = useState<string>('Physical Count Correction');
  const [notes, setNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Sync initial state when item opens
  React.useEffect(() => {
    if (item) {
      const initialVal = (item.unallocatedStock ?? item.physicalStock ?? item.currentStock ?? 0);
      setNewStock(initialVal.toString());
      setReasonCode('Physical Count Correction');
      setNotes('');
    }
  }, [item]);

  if (!item) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedQty = Number(newStock);
    if (isNaN(parsedQty)) {
      return alert('Please enter a valid stock quantity.');
    }
    if (!reasonCode) {
      return alert('Please select a reason for editing the stock.');
    }

    setSubmitting(true);
    try {
      const profileName = userProfile ? `${userProfile.firstName} ${userProfile.lastName}`.trim() : '';
      const actorName = profileName || user?.userMetadata?.full_name || user?.email || 'Staff';
      const res = await fetch('/api/inventory/procurement/edit-unallocated-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: item.productId,
          newUnallocatedStock: parsedQty,
          reasonCode,
          notes: notes.trim(),
          actorName
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update stock');

      toast({
        title: 'Stock Updated & Guardian Alerted',
        description: `Unallocated stock for ${item.productName} set to ${parsedQty}. AI Inventory Guardian memory recorded.`,
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Failed to update unallocated stock:', err);
      alert(`Error updating stock: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold flex items-center gap-2">
            <Package className="w-5 h-5 text-indigo-600" />
            Edit Unallocated Stock: {item.productName}
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Directly update the available unallocated stock for this product.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {item.lastEditedAt ? (
            <div className="flex items-center gap-2 text-xs text-slate-600 bg-slate-100/90 px-3 py-2 rounded-lg border border-slate-200">
              <Clock className="w-4 h-4 text-indigo-600 shrink-0" />
              <span>
                Manually adjusted <strong className="text-slate-800 font-semibold">{item.manualAdjustmentCount ?? 1} {(item.manualAdjustmentCount ?? 1) === 1 ? 'time' : 'times'}</strong> · Last: <strong className="text-slate-800 font-semibold">{new Date(item.lastEditedAt).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}</strong>
                {item.lastEditedBy ? <> by <strong className="text-slate-800 font-semibold">{item.lastEditedBy}</strong></> : ''}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200/60">
              <Clock className="w-4 h-4 text-slate-400 shrink-0" />
              <span>No manual stock adjustment recorded for this item.</span>
            </div>
          )}

          <div className="bg-indigo-50/80 border border-indigo-200 rounded-lg p-3 text-xs text-indigo-900 space-y-1">
            <div className="font-semibold flex items-center gap-1.5 text-indigo-800">
              <ShieldAlert className="w-4 h-4 text-indigo-600" />
              AI Inventory Guardian Notice
            </div>
            <p className="text-[11px] text-indigo-700">
              Saving this change will update live inventory, log an audit movement, and send an alert to the AI Inventory Guardian.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 block">
              New Unallocated Stock Quantity
            </label>
            <Input
              type="number"
              value={newStock}
              onChange={(e) => setNewStock(e.target.value)}
              onFocus={(e) => e.target.select()}
              placeholder="e.g. 5"
              className="font-bold text-base bg-white"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 block">
              Reason for Adjustment
            </label>
            <Select value={reasonCode} onValueChange={setReasonCode}>
              <SelectTrigger className="bg-white text-xs">
                <SelectValue placeholder="Select reason..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Physical Count Correction">Physical Count Correction</SelectItem>
                <SelectItem value="Previous Miscount">Previous Miscount</SelectItem>
                <SelectItem value="Damaged Stock">Damaged Stock</SelectItem>
                <SelectItem value="Lost / Missing">Lost / Missing</SelectItem>
                <SelectItem value="Found Extra Stock">Found Extra Stock</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 block">
              Notes / Explanation (Optional)
            </label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Explain why this inventory count is being adjusted..."
              rows={2}
              className="text-xs bg-white"
            />
          </div>

          <div className="pt-2 border-t border-slate-200">
            <InventoryGuardianMemoryTimeline productId={item.productId} adjustmentsOnly />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={submitting} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold">
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  Updating...
                </>
              ) : (
                'Save & Alert Guardian'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
