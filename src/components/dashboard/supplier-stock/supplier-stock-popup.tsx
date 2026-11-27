'use client';

import { PackageX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { usePopupSnooze } from '@/hooks/usePopupSnooze';
import { useSupplierPrompts } from '@/hooks/useSupplierFlags';
import { SupplierPromptCard } from './supplier-prompt-card';

/**
 * Orders waiting on an item we can't get from the supplier (owner, 2026-11-20).
 * Sales agents don't watch the bell, so this pops up on every page for the
 * order's agent (owners too after 3 days). It can be minimized but comes back
 * every 30 minutes until each order is answered.
 */
export function SupplierStockPopup() {
  const { prompts, busyKey, reload, answer, openOrder } = useSupplierPrompts({
    onBeforeNavigate: () => setMinimized(true),
  });
  const { minimized, setMinimized } = usePopupSnooze('supplier-stock', reload);

  if (prompts.length === 0) return null;

  // "Later": nothing on screen until the 30 minutes are up (owner, 2026-11-23:
  // the corner button covered the menu and felt like the pop-up never left).
  if (minimized) return null;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) setMinimized(true); }}>
      <DialogContent
        className="max-h-[90vh] max-w-lg overflow-y-auto"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
            <PackageX className="h-5 w-5" /> Out at supplier: ask the customer
          </DialogTitle>
          <DialogDescription>We can&apos;t buy these items right now. Ask each customer, then answer here. Paid orders are first.</DialogDescription>
        </DialogHeader>
        <ul className="space-y-3">
          {prompts.map((p) => (
            <SupplierPromptCard key={p.key} p={p} busy={busyKey === p.key} onAnswer={answer} onOpenOrder={openOrder} />
          ))}
        </ul>
        <Button variant="ghost" className="w-full" onClick={() => setMinimized(true)}>Later (comes back in 30 minutes)</Button>
      </DialogContent>
    </Dialog>
  );
}
