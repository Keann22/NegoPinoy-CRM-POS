'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Target, Loader2 } from 'lucide-react';
import { useInventoryCountProgress } from '@/hooks/useInventoryCountProgress';
import { InventoryCountProgressCard } from './InventoryCountProgressCard';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InventoryCountProgressModal({ open, onOpenChange }: Props) {
  const { progress, loading, error } = useInventoryCountProgress(14);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold font-headline">
            <Target className="h-5 w-5 text-primary" /> Pag-usad ng Bilang at Tugma sa Shelf
          </DialogTitle>
          <DialogDescription>
            Pagsusuri kung ang physical count sa shelf ay tumutugma sa unallocated stock ng system.
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex justify-center p-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}

        {error && (
          <div className="p-4 rounded-md bg-destructive/10 text-destructive text-sm">
            {error}
          </div>
        )}

        {!loading && !error && progress && (
          <InventoryCountProgressCard progress={progress} />
        )}
      </DialogContent>
    </Dialog>
  );
}
