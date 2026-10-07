'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useSupabase } from '@/lib/supabase/hooks';
import { useUserProfile } from '@/hooks/useUserProfile';
import { recordGuardianMemory } from '@/lib/services/inventory/inventory-guardian-memory-service';
import { Loader2, Boxes } from 'lucide-react';

interface AdjustStockDialogProps {
  product: {
    id: string;
    name: string;
    variantName?: string;
    parentName?: string;
    quantityOnHand?: number;
    reservedStock?: number;
    packedStock?: number;
    initial_unit_cost?: number;
  } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function AdjustStockDialog({
  product,
  open,
  onOpenChange,
  onSuccess,
}: AdjustStockDialogProps) {
  const supabase = useSupabase();
  const { userProfile } = useUserProfile();
  const { toast } = useToast();

  const [mode, setMode] = useState<'set' | 'relative'>('set');
  const [exactValue, setExactValue] = useState<string>('0');
  const [relativeValue, setRelativeValue] = useState<string>('0');
  const [reason, setReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const currentAvailable = product?.quantityOnHand ?? 0;
  const productName = product
    ? product.variantName
      ? `${product.parentName ? product.parentName + ' — ' : ''}${product.variantName}`
      : product.name
    : '';

  useEffect(() => {
    if (product && open) {
      setMode('set');
      setExactValue(String(currentAvailable));
      setRelativeValue('0');
      setReason('');
    }
  }, [product, open, currentAvailable]);

  const calculateTargetStock = (): number => {
    if (mode === 'set') {
      const val = parseInt(exactValue, 10);
      return isNaN(val) ? currentAvailable : val;
    } else {
      const change = parseInt(relativeValue, 10);
      return currentAvailable + (isNaN(change) ? 0 : change);
    }
  };

  const newStockLevel = calculateTargetStock();
  const delta = newStockLevel - currentAvailable;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const canManageProducts = userProfile?.roles?.some(r => ['Admin', 'Owner', 'Inventory'].includes(r));
    if (!canManageProducts) {
      toast({
        title: 'Permission Denied',
        description: 'Sales accounts cannot modify inventory or stock levels.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    toast({ title: 'Updating Stock...', description: `Changing stock for "${productName}".` });

    try {
      if (delta !== 0) {
        // 1. Update product stock level in database
        const { error: updateError } = await supabase
          .from('products')
          .update({ stock_level: newStockLevel })
          .eq('id', product.id);

        if (updateError) throw updateError;

        const actorName = userProfile
          ? `${userProfile.firstName} ${userProfile.lastName}`.trim()
          : 'Staff';

        // 2. Insert inventory movement audit record
        const noteText = reason.trim()
          ? reason.trim()
          : `Manual Stock Adjustment (${currentAvailable} -> ${newStockLevel}) by ${actorName}`;

        const { error: movError } = await supabase
          .from('inventory_movements')
          .insert({
            product_id: product.id,
            quantity_change: delta,
            movement_type: 'adjustment',
            timestamp: new Date().toISOString(),
            reason: noteText,
            unit_cost: product.initial_unit_cost || 0,
          });

        if (movError) console.error('Failed to insert inventory movement:', movError);

        // 3. Record in Guardian Memory audit trail
        await recordGuardianMemory(supabase, {
          productId: product.id,
          actionType: 'physical_count_audit',
          physicalCount: newStockLevel,
          systemStockBefore: currentAvailable,
          systemStockAfter: newStockLevel,
          discrepancy: delta,
          actorName: actorName,
          notes: noteText,
        });

        toast({
          title: 'Stock Updated Successfully',
          description: `"${productName}" stock level set to ${newStockLevel} units (${delta >= 0 ? `+${delta}` : delta}).`,
        });
      } else {
        toast({
          title: 'No Change Made',
          description: `Stock level for "${productName}" remains ${currentAvailable}.`,
        });
      }

      onSuccess?.();
      onOpenChange(false);
    } catch (err: any) {
      console.error('Error adjusting stock:', err);
      toast({
        variant: 'destructive',
        title: 'Stock Adjustment Failed',
        description: err?.message || 'Failed to update stock quantity in inventory.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!product) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <Boxes className="h-5 w-5 text-primary" />
              Adjust Stock Level
            </DialogTitle>
            <DialogDescription className="text-sm">
              Manually change the inventory quantity for <strong>{productName}</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Current Stock Information Card */}
            <div className="rounded-lg border bg-muted/30 p-3 text-xs space-y-1">
              <div className="flex justify-between font-medium text-sm">
                <span>Current Available Stock:</span>
                <span className="font-bold text-foreground">{currentAvailable} units</span>
              </div>
              {(product.reservedStock || 0) > 0 && (
                <div className="flex justify-between text-amber-600 dark:text-amber-400">
                  <span>Reserved Stock (Active Orders):</span>
                  <span>{product.reservedStock} units</span>
                </div>
              )}
              {(product.packedStock || 0) > 0 && (
                <div className="flex justify-between text-blue-600 dark:text-blue-400">
                  <span>Packed Stock:</span>
                  <span>{product.packedStock} units</span>
                </div>
              )}
            </div>

            {/* Adjustment Method */}
            <div className="space-y-2">
              <label className="text-xs font-semibold block text-foreground">
                Adjustment Mode
              </label>
              <Select value={mode} onValueChange={(val: 'set' | 'relative') => setMode(val)}>
                <SelectTrigger className="w-full h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="set">Set New Total Quantity</SelectItem>
                  <SelectItem value="relative">Add or Subtract Quantity (+ / -)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Quantity Input */}
            {mode === 'set' ? (
              <div className="space-y-1.5">
                <label className="text-xs font-medium block">New Available Stock Count</label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  required
                  value={exactValue}
                  onChange={(e) => setExactValue(e.target.value)}
                  className="font-bold text-base"
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <label className="text-xs font-medium block">
                  Quantity to Add or Subtract (Use negative numbers to reduce)
                </label>
                <Input
                  type="number"
                  step="1"
                  required
                  value={relativeValue}
                  onChange={(e) => setRelativeValue(e.target.value)}
                  placeholder="e.g., 10 or -5"
                  className="font-bold text-base"
                />
              </div>
            )}

            {/* Calculated Preview */}
            <div className="rounded-md bg-secondary/50 p-3 text-xs flex justify-between items-center border">
              <div>
                <span className="text-muted-foreground">Resulting Available Stock:</span>
                <p className="font-bold text-sm text-foreground">{newStockLevel} units</p>
              </div>
              <div className="text-right">
                <span className="text-muted-foreground">Net Change:</span>
                <p
                  className={`font-semibold text-sm ${
                    delta > 0
                      ? 'text-green-600 dark:text-green-400'
                      : delta < 0
                      ? 'text-destructive'
                      : 'text-muted-foreground'
                  }`}
                >
                  {delta > 0 ? `+${delta}` : delta}
                </p>
              </div>
            </div>

            {/* Reason / Notes */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium block text-muted-foreground">
                Reason / Note for Stock Change (Optional)
              </label>
              <Textarea
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Stock count audit, Damaged items removed, Restocked manually"
                className="resize-none text-xs"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Stock Level
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
