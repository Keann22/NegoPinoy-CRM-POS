'use client';

import Link from 'next/link';
import { PackageX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SupplierFlagBadge } from './supplier-flag-badge';
import type { SupplierFlag } from '@/types/supplier-stock.types';

interface FlaggedItem {
  productId: string;
  productName: string;
  needToBuyQty?: number;
}

/**
 * Procurement Sheet: items out at the supplier, kept apart from Need to Buy.
 * They come back to their supplier group on the check-again date.
 */
export function SupplierFlaggedSection({
  items, onEdit,
}: {
  items: { item: FlaggedItem; flag: SupplierFlag }[];
  onEdit: (item: FlaggedItem) => void;
}) {
  if (items.length === 0) return null;
  return (
    <details className="overflow-hidden rounded-lg border border-amber-300 shadow-sm dark:border-amber-800">
      <summary className="flex cursor-pointer items-center gap-2 bg-amber-50 px-4 py-3 font-bold text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
        <PackageX className="h-5 w-5" /> Out at supplier ({items.length})
        <span className="text-xs font-normal text-amber-800/80 dark:text-amber-300/80">not in Need to Buy until the check-again date</span>
        <Link href="/dashboard/inventory/supplier-stock" className="ml-auto text-xs font-medium text-primary hover:underline">
          Open the list
        </Link>
      </summary>
      <ul className="divide-y">
        {items.map(({ item, flag }) => (
          <li key={item.productId} className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm">
            <div className="min-w-0 flex-1">
              <p className="font-medium break-words">{item.productName}</p>
              <div className="flex flex-wrap items-center gap-2">
                <SupplierFlagBadge flag={flag} showCheck />
                {flag.note && <span className="text-xs text-muted-foreground break-words">“{flag.note}”</span>}
              </div>
            </div>
            {item.needToBuyQty ? <span className="text-xs text-muted-foreground">{item.needToBuyQty} waiting</span> : null}
            <Button size="sm" variant="outline" onClick={() => onEdit(item)}>Change / Back in stock</Button>
          </li>
        ))}
      </ul>
    </details>
  );
}
