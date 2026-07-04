'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ImageIcon } from 'lucide-react';

export type ProductPhotoTarget = {
  product_name: string;
  images?: string[] | null;
} | null;

interface ProductPhotoDialogProps {
  product: ProductPhotoTarget;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProductPhotoDialog({ product, open, onOpenChange }: ProductPhotoDialogProps) {
  const images = (product?.images || []).filter(img => img && !img.includes('placehold.co'));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{product?.product_name || 'Product Photo'}</DialogTitle>
          <DialogDescription>Reference photo for this item.</DialogDescription>
        </DialogHeader>

        {images.length > 0 ? (
          <div className="flex gap-2 overflow-x-auto pb-2">
            {images.map((img, i) => (
              <div key={i} className="relative w-full aspect-square shrink-0 rounded-md overflow-hidden border bg-muted">
                <img src={img} alt={`${product?.product_name} ${i + 1}`} className="w-full h-full object-contain" />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
            <ImageIcon className="h-10 w-10 opacity-50" />
            <p className="text-sm">No photo available for this product.</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
