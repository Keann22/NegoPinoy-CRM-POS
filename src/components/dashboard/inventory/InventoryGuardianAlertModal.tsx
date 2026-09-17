'use client';

import { useState, useEffect } from 'react';
import { ShieldAlert, Package, ShoppingBag, ArrowRight, CheckCircle2, ChevronRight, ChevronLeft, AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useInventoryGuardian } from '@/hooks/useInventoryGuardian';
import { InventoryGuardianMemoryTimeline } from './InventoryGuardianMemoryTimeline';
import { InventoryGuardianDailyGoalCard, GoalCompletedModalView } from './InventoryGuardianDailyGoalCard';

export function InventoryGuardianAlertModal() {
  const {
    canAccess,
    anomalies,
    allAnomalies,
    dailyProgress,
    showAllBacklog,
    setShowAllBacklog,
    dismissAnomaly,
    resolvePhysicalCount,
    resolveBackfillPurchase,
    resolveBorrowStock,
    isModalOpen: open,
    closeModal
  } = useInventoryGuardian();

  const [currentIndex, setCurrentIndex] = useState(0);

  // Form states for current anomaly
  const [shelfCountInput, setShelfCountInput] = useState<string>('');
  const [backfillQtyInput, setBackfillQtyInput] = useState<string>('');
  const [backfillCostInput, setBackfillCostInput] = useState<string>('');
  const [supplierInput, setSupplierInput] = useState<string>('');
  const [notesInput, setNotesInput] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const currentAnomaly = anomalies[currentIndex];

  // Keep the carousel index in range as anomalies are resolved/dismissed.
  useEffect(() => {
    if (currentIndex > 0 && currentIndex > anomalies.length - 1) {
      setCurrentIndex(Math.max(0, anomalies.length - 1));
    }
  }, [anomalies.length, currentIndex]);

  // If every anomaly has been cleared while the modal is open (and goal not met), close it.
  useEffect(() => {
    if (open && anomalies.length === 0 && !dailyProgress?.isGoalMet) {
      closeModal();
    }
  }, [open, anomalies.length, dailyProgress?.isGoalMet, closeModal]);

  // Sync inputs when current anomaly changes
  useEffect(() => {
    if (currentAnomaly) {
      setShelfCountInput('');
      setBackfillQtyInput(String(Math.abs(currentAnomaly.currentStock)));
      setBackfillCostInput('');
      setSupplierInput('');
      setNotesInput('');
    }
  }, [currentAnomaly]);

  if (!canAccess) return null;

  // If daily goal is reached and no items left in today's queue
  if (open && anomalies.length === 0 && dailyProgress?.isGoalMet && !showAllBacklog) {
    return (
      <Dialog open={open} onOpenChange={(o) => { if (!o) closeModal(); }}>
        <DialogContent className="max-w-xl">
          <GoalCompletedModalView
            dailyProgress={dailyProgress}
            onViewAllBacklog={() => setShowAllBacklog(true)}
            onClose={closeModal}
          />
        </DialogContent>
      </Dialog>
    );
  }

  if (!currentAnomaly) return null;

  const handleSnooze = () => {
    // closeModal already records the 15-min snooze timestamp.
    closeModal();
  };

  const handleNext = () => {
    if (currentIndex < anomalies.length - 1) {
      setCurrentIndex(prev => prev + 1);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    }
  };

  const handlePhysicalCountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shelfCountInput || isNaN(Number(shelfCountInput))) return;
    setIsSubmitting(true);
    try {
      await resolvePhysicalCount(currentAnomaly.productId, Number(shelfCountInput), notesInput);
      // Index is kept in range by the clamp effect after the list shrinks.
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBackfillSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!backfillQtyInput || isNaN(Number(backfillQtyInput))) return;
    setIsSubmitting(true);
    try {
      await resolveBackfillPurchase(
        currentAnomaly.productId,
        Number(backfillQtyInput),
        Number(backfillCostInput) || 0,
        supplierInput || 'Unrecorded Purchase'
      );
      // Index is kept in range by the clamp effect after the list shrinks.
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBorrowSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await resolveBorrowStock(
        currentAnomaly.productId,
        currentAnomaly.unfulfilledQty || 1,
        currentAnomaly.details?.orderId || undefined,
        notesInput || 'Borrowed to fulfill order'
      );
      // Index is kept in range by the clamp effect after the list shrinks.
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) closeModal(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <DialogTitle className="text-xl font-bold">Inventory Guardian Alert</DialogTitle>
            </div>
            <Badge variant="outline" className="text-xs">
              {showAllBacklog ? `Backlog ${currentIndex + 1} of ${anomalies.length}` : `Today's Item ${currentIndex + 1} of ${anomalies.length}`}
            </Badge>
          </div>
          <DialogDescription className="text-sm pt-1">
            The Agentic Watchdog detected a discrepancy in physical stocks. Choose a 1-click option to fix it.
          </DialogDescription>
        </DialogHeader>

        {/* Daily 5-Product Goal & Progress Banner */}
        {dailyProgress && (
          <InventoryGuardianDailyGoalCard
            dailyProgress={dailyProgress}
            showAllBacklog={showAllBacklog}
            onToggleShowAllBacklog={setShowAllBacklog}
            onClose={closeModal}
          />
        )}

        {/* Product Anomaly Card */}
        <div className="p-4 rounded-lg border bg-muted/30 space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-semibold text-base">{currentAnomaly.productName}</h3>
              {currentAnomaly.sku && (
                <p className="text-xs text-muted-foreground font-mono">SKU: {currentAnomaly.sku}</p>
              )}
            </div>
            <Badge
              variant={currentAnomaly.severity === 'high' ? 'destructive' : 'secondary'}
              className="capitalize"
            >
              {currentAnomaly.type.replace('_', ' ')}
            </Badge>
          </div>

          <div className="grid grid-cols-3 gap-2 py-2 border-y text-center">
            <div>
              <p className="text-xs text-muted-foreground">Current Ledger</p>
              <p className="text-lg font-bold text-red-600 dark:text-red-400">{currentAnomaly.currentStock}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Open Orders</p>
              <p className="text-lg font-bold">{currentAnomaly.unfulfilledQty} unit(s)</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Est. Physical Shelf</p>
              <p className="text-lg font-bold text-amber-600">Needs Verification</p>
            </div>
          </div>

          <div className="p-3 bg-background rounded border text-sm text-foreground/90 space-y-1">
            <p className="font-medium flex items-center gap-1.5 text-amber-800 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              What Happened:
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">{currentAnomaly.description}</p>
          </div>

          {/* Memory Context Banner */}
          {currentAnomaly.memoryContext?.hasMemoryConflict ? (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/50 rounded border border-amber-300 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 space-y-1">
              <div className="flex items-center gap-1.5 font-semibold text-amber-800 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                <span>Conflict with Verified Memory</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                Staff previously verified <strong>{currentAnomaly.memoryContext.lastVerifiedCount}</strong> units physically on shelf
                {currentAnomaly.memoryContext.lastVerifiedAt && ` on ${new Date(currentAnomaly.memoryContext.lastVerifiedAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}`}
                {currentAnomaly.memoryContext.lastVerifiedBy && ` by ${currentAnomaly.memoryContext.lastVerifiedBy}`}. Check if the item was misplaced or in reserve before ordering more.
              </p>
            </div>
          ) : currentAnomaly.memoryContext?.lastVerifiedCount !== undefined && currentAnomaly.memoryContext?.lastVerifiedCount !== null ? (
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground bg-muted/40 px-2.5 py-1.5 rounded border">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
              <span>
                Last physically verified: <strong>{currentAnomaly.memoryContext.lastVerifiedCount}</strong> units
                {currentAnomaly.memoryContext.lastVerifiedAt && ` (${new Date(currentAnomaly.memoryContext.lastVerifiedAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })})`}
                {currentAnomaly.memoryContext.lastVerifiedBy && ` by ${currentAnomaly.memoryContext.lastVerifiedBy}`}
              </span>
            </div>
          ) : null}
        </div>

        {/* Audit & Memory History Timeline */}
        <InventoryGuardianMemoryTimeline productId={currentAnomaly.productId} />

        {/* 1-Click Fix Options */}
        <Tabs defaultValue="shelf_count" className="w-full">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="shelf_count" className="text-xs flex items-center gap-1">
              <Package className="h-3.5 w-3.5" /> Set Shelf Count
            </TabsTrigger>
            <TabsTrigger value="backfill" className="text-xs flex items-center gap-1">
              <ShoppingBag className="h-3.5 w-3.5" /> Backfill Purchase
            </TabsTrigger>
            <TabsTrigger value="borrow" className="text-xs flex items-center gap-1">
              <ArrowRight className="h-3.5 w-3.5" /> Borrowed Stock
            </TabsTrigger>
          </TabsList>

          {/* Tab 1: Physical Count on Shelf */}
          <TabsContent value="shelf_count" className="space-y-3 pt-2">
            <form onSubmit={handlePhysicalCountSubmit} className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">How many units are physically on the shelf right now?</label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    min="0"
                    placeholder="e.g. 5"
                    value={shelfCountInput}
                    onChange={e => setShelfCountInput(e.target.value)}
                    required
                    className="h-9"
                    autoFocus
                  />
                  <Button type="submit" disabled={isSubmitting || !shelfCountInput} className="h-9 shrink-0 gap-1.5">
                    <CheckCircle2 className="h-4 w-4" />
                    {isSubmitting ? 'Updating...' : 'Set Shelf Count'}
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  The AI will automatically adjust the ledger and account for your active orders without negative math.
                </p>
              </div>
            </form>
          </TabsContent>

          {/* Tab 2: Backfill Purchase */}
          <TabsContent value="backfill" className="space-y-3 pt-2">
            <form onSubmit={handleBackfillSubmit} className="space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-xs font-semibold">Quantity Purchased</label>
                  <Input
                    type="number"
                    min="1"
                    value={backfillQtyInput}
                    onChange={e => setBackfillQtyInput(e.target.value)}
                    required
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold">Unit Cost (₱)</label>
                  <Input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={backfillCostInput}
                    onChange={e => setBackfillCostInput(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <Input
                  placeholder="Supplier name (optional)"
                  value={supplierInput}
                  onChange={e => setSupplierInput(e.target.value)}
                  className="h-9 text-xs"
                />
                <Button type="submit" disabled={isSubmitting || !backfillQtyInput} className="h-9 shrink-0">
                  {isSubmitting ? 'Saving...' : 'Record Purchase'}
                </Button>
              </div>
            </form>
          </TabsContent>

          {/* Tab 3: Borrow Stock */}
          <TabsContent value="borrow" className="space-y-3 pt-2">
            <form onSubmit={handleBorrowSubmit} className="space-y-2.5">
              <p className="text-xs text-muted-foreground">
                Mark that units were borrowed from reserve/sister inventory to pack an order. Keeps the item on Procurement for replenishment.
              </p>
              <div className="flex gap-2">
                <Input
                  placeholder="Notes (e.g. Borrowed from branch B, return next week)"
                  value={notesInput}
                  onChange={e => setNotesInput(e.target.value)}
                  className="h-9 text-xs"
                />
                <Button type="submit" disabled={isSubmitting} variant="secondary" className="h-9 shrink-0">
                  {isSubmitting ? 'Marking...' : 'Confirm Borrowed'}
                </Button>
              </div>
            </form>
          </TabsContent>
        </Tabs>

        {/* Footer Navigation */}
        <div className="flex items-center justify-between pt-2 border-t mt-2">
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={handlePrev} disabled={currentIndex === 0} className="h-8 w-8 p-0">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={handleNext} disabled={currentIndex >= anomalies.length - 1} className="h-8 w-8 p-0">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => dismissAnomaly(currentAnomaly.id)} className="text-xs text-muted-foreground">
              Skip this Item
            </Button>
            <Button variant="outline" size="sm" onClick={handleSnooze} className="text-xs">
              Remind Me in 15 mins
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
