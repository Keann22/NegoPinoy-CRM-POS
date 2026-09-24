'use client';

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface AlertReviewAdjustDialogProps {
  item: {
    productId: string;
    name: string;
    currentStock: number;
    openOrdersQty: number;
    lastPhysicalAudit: { physicalCount: number } | null;
  } | null;
  open: boolean;
  onClose: () => void;
  onSuccess: (productId: string, newStockLevel: number, physicalCount: number, notes: string) => void;
}

export function AlertReviewAdjustDialog({
  item,
  open,
  onClose,
  onSuccess
}: AlertReviewAdjustDialogProps) {
  const [shelfCount, setShelfCount] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (item && open) {
      const initialCount = item.lastPhysicalAudit
        ? item.lastPhysicalAudit.physicalCount
        : Math.max(0, item.currentStock);
      setShelfCount(String(initialCount));
      setNotes(`Admin review true-up for ${item.name}`);
    }
  }, [item, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!item || isNaN(Number(shelfCount))) return;

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/inventory/guardian/anomalies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'set_physical_count',
          payload: {
            productId: item.productId,
            physicalShelfCount: Number(shelfCount),
            notes: notes || 'Physical count verified from Alert Review Sheet',
            actorName: 'Admin Review'
          }
        })
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to update stock');

      onSuccess(item.productId, data.newStockLevel, Number(shelfCount), notes);
      onClose();
    } catch (err: any) {
      alert(err.message || 'Failed to update physical count');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={isOpen => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-[420px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="text-base font-bold">
              Set Physical Shelf Count
            </DialogTitle>
            <DialogDescription className="text-xs">
              True up inventory for <strong>{item.name}</strong>. In NegoPinoy, ledger stock will be set to: Physical Count − Active Reservations ({item.openOrdersQty || 0} pcs).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-4 text-xs">
            <div>
              <label className="font-semibold block mb-1">
                How many units are physically on the shelf right now?
              </label>
              <Input
                type="number"
                min="0"
                step="1"
                required
                value={shelfCount}
                onChange={e => setShelfCount(e.target.value)}
                placeholder="0"
                className="font-bold text-sm"
                autoFocus
              />
            </div>

            <div>
              <label className="font-medium text-muted-foreground block mb-1">
                Notes / Audit explanation
              </label>
              <Input
                type="text"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="e.g. Verified empty shelf with warehouse staff"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isSubmitting} className="bg-indigo-600 hover:bg-indigo-700">
              {isSubmitting ? 'Updating...' : 'Save Physical Count'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
