'use client';

import { PackageX } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { SUPPLIER_FLAG_HINTS, SUPPLIER_FLAG_LABELS, needsAgreement } from '@/lib/supplier-stock/supplier-flag-rules';
import type { SupplierFlag } from '@/types/supplier-stock.types';

const peso = (n: number) => `₱${n.toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;

/**
 * New / Edit Order: shown under a line whose item is out at the supplier. The
 * agent tells the customer and ticks that they agree; a stopped item can only
 * be sold up to what's left.
 */
export function SupplierFlagLineNotice({
  flag, addedQty, checked, onCheckedChange,
}: {
  flag: SupplierFlag;
  /** Pieces this order adds (0 for a line already saved on the order). */
  addedQty: number;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  const stop = flag.status === 'stop_selling';
  const tooMany = stop && addedQty > flag.freeToSell;
  return (
    <div className={`mt-1 space-y-1 rounded-md border p-2 text-xs ${tooMany ? 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/40' : 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40'}`}>
      <p className="flex items-center gap-1 font-semibold">
        <PackageX className="h-3.5 w-3.5 shrink-0" /> {SUPPLIER_FLAG_LABELS[flag.status]}
      </p>
      <p>{SUPPLIER_FLAG_HINTS[flag.status]}</p>
      {flag.altProductName && <p>We can get: <span className="font-semibold">{flag.altProductName}</span></p>}
      {flag.newPrice != null && <p>New price: <span className="font-semibold">{peso(flag.newPrice)}</span></p>}
      {flag.note && <p className="break-words">“{flag.note}”</p>}
      {stop && (
        <p className={tooMany ? 'font-semibold text-red-700 dark:text-red-400' : ''}>
          {flag.freeToSell > 0 ? `Only ${flag.freeToSell} left to sell.` : 'None left to sell.'}
        </p>
      )}
      {addedQty > 0 && needsAgreement(flag.status) && (
        <label className="flex cursor-pointer items-center gap-2 pt-0.5 font-medium">
          <Checkbox checked={checked} onCheckedChange={(v) => onCheckedChange(v === true)} />
          Customer knows and agrees
        </label>
      )}
    </div>
  );
}
