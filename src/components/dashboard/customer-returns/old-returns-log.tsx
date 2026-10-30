'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fetchOldReturnsLog, type OldReturnRecord } from '@/hooks/useCustomerReturns';

const TYPE_LABEL: Record<string, string> = { restock: 'Restock', exchange: 'Exchange', writeoff: 'Write-off' };
const phDate = (iso: string) =>
  new Date(iso).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' });

/** The log from the old "Process return" button (before return cases). Read-only. */
export function OldReturnsLog() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<OldReturnRecord[] | null>(null);

  const toggle = async () => {
    setOpen((o) => !o);
    if (rows === null) {
      try { setRows(await fetchOldReturnsLog()); } catch { setRows([]); }
    }
  };

  return (
    <div className="border-t pt-3">
      <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={toggle}>
        Old returns log (before return cases) {open ? <ChevronUp className="ml-1 h-3 w-3" /> : <ChevronDown className="ml-1 h-3 w-3" />}
      </Button>
      {open && (
        rows === null ? (
          <div className="flex justify-center p-4"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : rows.length === 0 ? (
          <p className="p-2 text-xs text-muted-foreground">Nothing in the old log.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-xs">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap gap-x-2">
                <span className="text-muted-foreground">{phDate(r.created_at)}</span>
                <Link href={`/dashboard/orders/${r.order_id}`} className="font-mono text-primary hover:underline">#{r.order_id.slice(0, 7).toUpperCase()}</Link>
                <span>{r.quantity}× {r.product_name || 'Unknown product'}</span>
                <span className="text-muted-foreground">{TYPE_LABEL[r.return_type] || r.return_type}{r.notes ? ` · ${r.notes}` : ''}</span>
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
}
