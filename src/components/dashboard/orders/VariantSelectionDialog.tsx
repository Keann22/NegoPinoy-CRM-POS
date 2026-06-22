'use client';

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import type { Product } from '@/lib/schemas/order';

interface VariantOption {
  id: string;
  name: string;
  variant_name?: string;
  stock_level: number;
  selling_price: number;
  initial_unit_cost?: number;
  stock_batches?: { unitCost: number }[];
}

interface VariantSelectionDialogProps {
  parentProduct: Product | null;
  options: VariantOption[];
  existingProductIds: string[];
  onSelect: (variant: { productId: string; productName: string; quantity: number; costPriceAtSale: number; sellingPriceAtSale: number; discount: number }) => void;
  onClose: () => void;
}

/**
 * VariantSelectionDialog
 * Displays a list of product variants when a parent product is selected in the order form.
 * Extracted from order-dialog.tsx to keep that file under 400 lines.
 */
export function VariantSelectionDialog({
  parentProduct, options, existingProductIds, onSelect, onClose,
}: VariantSelectionDialogProps) {
  const { toast } = useToast();

  return (
    <Dialog open={!!parentProduct} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Select Variant for {parentProduct?.name}</DialogTitle>
          <DialogDescription>Choose a variant to add to the order.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 py-4">
          {options.map((v) => (
            <Button
              key={v.id}
              variant="outline"
              className="justify-between h-auto py-3"
              onClick={() => {
                if (existingProductIds.includes(v.id)) {
                  toast({
                    variant: 'default',
                    title: 'Variant already in order',
                    description: `${v.variant_name} is already in this order. You can adjust the quantity above.`,
                  });
                } else {
                  const costPriceAtSale = v.stock_batches?.length ? v.stock_batches[0].unitCost : (v.initial_unit_cost || 0);
                  onSelect({
                    productId: v.id,
                    productName: v.name,
                    quantity: 1,
                    costPriceAtSale,
                    sellingPriceAtSale: v.selling_price,
                    discount: 0,
                  });
                }
                onClose();
              }}
            >
              <span>{v.variant_name || v.name}</span>
              <div className="flex gap-4">
                <span className="text-muted-foreground text-sm font-normal">Stock: {v.stock_level}</span>
                <span>₱{(v.selling_price || 0).toFixed(2)}</span>
              </div>
            </Button>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
