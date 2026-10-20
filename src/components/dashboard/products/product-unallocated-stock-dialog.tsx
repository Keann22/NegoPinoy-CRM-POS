'use client';

import { useEffect, useState } from 'react';
import { EditUnallocatedStockDialog } from '@/components/dashboard/procurement/edit-unallocated-stock-dialog';
import { useToast } from '@/hooks/use-toast';
import type { FormattedProduct } from '@/types';

interface ProductUnallocatedStockDialogProps {
  product: FormattedProduct | null;
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * The Products page's "Adjust Stock". It edits the same Unallocated number as the
 * Procurement Sheet and Print List (free pieces on the shelf), not raw stock_level:
 * stock_level already has open orders netted out, so typing a shelf count into it
 * silently double-counts lay-aways and pending orders.
 */
export function ProductUnallocatedStockDialog({ product, onClose, onSuccess }: ProductUnallocatedStockDialogProps) {
  const { toast } = useToast();
  const [item, setItem] = useState<any | null>(null);

  useEffect(() => {
    setItem(null);
    if (!product) return;
    let cancelled = false;
    const productName = product.variantName
      ? `${product.parentName ? product.parentName + ' — ' : ''}${product.variantName}`
      : product.name;

    (async () => {
      try {
        const res = await fetch(`/api/inventory/unallocated-stock?productId=${product.id}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load unallocated stock');
        if (cancelled) return;
        if (data.item.isBundle) {
          toast({
            title: 'Bundles hold no stock',
            description: 'Adjust the stock of its component products instead.',
          });
          onClose();
          return;
        }
        setItem({
          productId: product.id,
          productName,
          unallocatedStock: data.item.unallocatedStock,
          lastEditedAt: data.item.lastEditedAt,
          lastEditedBy: data.item.lastEditedBy,
          manualAdjustmentCount: data.item.manualAdjustmentCount,
        });
      } catch (err: any) {
        if (cancelled) return;
        toast({ variant: 'destructive', title: 'Could not load stock', description: err?.message });
        onClose();
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id]);

  return (
    <EditUnallocatedStockDialog
      item={item}
      isOpen={!!item}
      onClose={onClose}
      onSuccess={onSuccess}
    />
  );
}
