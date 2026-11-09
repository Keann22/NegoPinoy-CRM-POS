'use client';

import type { Dispatch, SetStateAction } from 'react';
import { AlertTriangle, ChevronDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import type { UnrecordedRow, SupplierOption } from '@/types';

type UnrecordedPurchasesBannerProps = {
  unrecorded: UnrecordedRow[];
  showUnrecorded: boolean;
  setShowUnrecorded: Dispatch<SetStateAction<boolean>>;
  canSeeSuppliers: boolean;
  canSeeCosts: boolean;
  supplierOptions: SupplierOption[];
  drafts: Record<string, { supplierId: string; unitCost: string; receivedQty: string; receivedAt: string }>;
  setDrafts: Dispatch<SetStateAction<Record<string, { supplierId: string; unitCost: string; receivedQty: string; receivedAt: string }>>>;
  savingId: string | null;
  handleRecord: (row: UnrecordedRow) => Promise<void>;
  peso: (n: number) => string;
  handleRecordAllReady: () => Promise<void>;
  savingAll: boolean;
  readyToRecordCount: number;
};

export function UnrecordedPurchasesBanner({
  unrecorded,
  showUnrecorded,
  setShowUnrecorded,
  canSeeSuppliers,
  canSeeCosts,
  supplierOptions,
  drafts,
  setDrafts,
  savingId,
  handleRecord,
  peso,
  handleRecordAllReady,
  savingAll,
  readyToRecordCount,
}: UnrecordedPurchasesBannerProps) {
  if (unrecorded.length === 0) return null;

  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-amber-900">
            {unrecorded.length} received {unrecorded.length === 1 ? 'item is' : 'items are'} missing a supplier or cost
          </p>
          <p className="text-sm text-amber-800 mt-1">
            {unrecorded.reduce((acc, u) => acc + u.receivedQty, 0).toLocaleString()} pcs were taken into stock without going
            through the Buy flow, so no supplier and no price was ever attached. They are counted as ₱0 in inventory and do not
            appear anywhere in this report. This list covers <span className="font-semibold">all dates</span>, not just the
            selected range.
          </p>
          <div className="flex flex-wrap items-center gap-3 mt-2">
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 text-amber-900"
              onClick={() => setShowUnrecorded(v => !v)}
            >
              {showUnrecorded ? 'Hide' : 'Show'} the {unrecorded.length} {unrecorded.length === 1 ? 'item' : 'items'}
              <ChevronDown className={`ml-1 h-4 w-4 transition-transform ${showUnrecorded ? 'rotate-180' : ''}`} />
            </Button>

            {canSeeCosts && readyToRecordCount > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="bg-white border-amber-400 text-amber-900 hover:bg-amber-100 font-semibold ml-auto"
                onClick={handleRecordAllReady}
                disabled={savingAll}
              >
                {savingAll ? (
                  <>
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    Saving...
                  </>
                ) : (
                  `Auto-save ${readyToRecordCount} with known price`
                )}
              </Button>
            )}
          </div>

          {showUnrecorded && (
            <div className="max-h-[420px] overflow-y-auto overflow-x-auto mt-3 rounded-md border border-amber-200 bg-white">
              <Table>
                <TableHeader className="sticky top-0 bg-white z-10">
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Received</TableHead>
                    {canSeeSuppliers && <TableHead className="min-w-[180px]">Supplier</TableHead>}
                    <TableHead className="w-[120px]">Unit Cost (₱)</TableHead>
                    <TableHead className="w-[150px]">Received On</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unrecorded.map(u => {
                    const draft = drafts[u.id] || { supplierId: '', unitCost: '', receivedQty: String(u.receivedQty), receivedAt: '' };
                    return (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium">
                          {u.productName}
                          {u.requestedByName && (
                            <span className="block text-xs text-muted-foreground">req. {u.requestedByName}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <input
                            type="number"
                            inputMode="numeric"
                            className={`w-[80px] border p-2 rounded-md text-sm text-right ${Number(draft.receivedQty) !== u.receivedQty ? 'border-blue-500 font-semibold' : u.receivedQty > u.expectedQty ? 'border-amber-400' : ''}`}
                            value={draft.receivedQty}
                            onChange={e => setDrafts(prev => ({ ...prev, [u.id]: { ...draft, receivedQty: e.target.value } }))}
                          />
                          {u.receivedQty > u.expectedQty && (
                            <span className="block text-xs text-amber-700 mt-1">
                              {u.expectedQty} expected
                            </span>
                          )}
                        </TableCell>
                        {canSeeSuppliers && (
                          <TableCell>
                            <select
                              className={`w-full border p-2 rounded-md bg-white text-sm ${u.missingSupplier && !draft.supplierId ? 'border-amber-400' : ''}`}
                              value={draft.supplierId}
                              onChange={e => setDrafts(prev => ({ ...prev, [u.id]: { ...draft, supplierId: e.target.value } }))}
                            >
                              <option value="">-- Select supplier --</option>
                              {supplierOptions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                          </TableCell>
                        )}
                        <TableCell>
                          <input
                            type="number"
                            inputMode="decimal"
                            placeholder="0.00"
                            className={`w-full border p-2 rounded-md text-sm ${u.missingCost && !(Number(draft.unitCost) > 0) ? 'border-amber-400' : ''}`}
                            value={draft.unitCost}
                            onChange={e => setDrafts(prev => ({ ...prev, [u.id]: { ...draft, unitCost: e.target.value } }))}
                          />
                          {canSeeSuppliers && u.costSource && (
                            <span className="block text-xs text-muted-foreground mt-1">
                              {u.costSource}
                              {u.costSourceDate && ` · ${format(new Date(u.costSourceDate), 'MMM d')}`}
                            </span>
                          )}
                          {u.costConflict && (
                            <span className="block text-xs text-amber-700 mt-1">
                              price book says {peso(u.costConflict.bookCost)} — check which is right
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <input
                            type="date"
                            className={`w-full border p-2 rounded-md text-sm ${!draft.receivedAt ? 'border-amber-400' : ''}`}
                            value={draft.receivedAt}
                            onChange={e => setDrafts(prev => ({ ...prev, [u.id]: { ...draft, receivedAt: e.target.value } }))}
                          />
                          <span className="block text-xs text-muted-foreground mt-1">
                            {u.receivedAt ? 'from the stock receipt' : 'no receipt found — please set'}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{u.source}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            onClick={() => handleRecord(u)}
                            disabled={savingId === u.id || savingAll}
                          >
                            {savingId === u.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
