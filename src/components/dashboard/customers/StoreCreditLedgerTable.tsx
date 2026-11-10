'use client';

import { format } from 'date-fns';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

export interface StoreCreditEntry {
  id: string;
  amount: number;
  balance_after: number | null;
  reason: string;
  order_id: string | null;
  created_by_name: string | null;
  created_at: string;
}

interface StoreCreditLedgerTableProps {
  entries: StoreCreditEntry[];
}

const REASON_LABELS: Record<string, string> = {
  opening_balance: 'Opening Balance',
  overpayment: 'Overpayment Added',
  used_on_order: 'Used on Order',
  returned_on_cancel: 'Returned on Cancel',
  return_refund: 'Customer Return Credit',
  bus_sf: 'Bus SF Deducted',
  edit_refund: 'Order Edit Excess',
  manual: 'Manual Adjustment',
};

export function StoreCreditLedgerTable({ entries }: StoreCreditLedgerTableProps) {
  if (!entries || entries.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Store Credit Ledger</CardTitle>
        <CardDescription>Full history of credits added and spent for this customer.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Order</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Balance After</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => {
              const amt = Number(entry.amount || 0);
              const isPositive = amt > 0;
              return (
                <TableRow key={entry.id}>
                  <TableCell>{entry.created_at ? format(new Date(entry.created_at), 'PPP p') : 'N/A'}</TableCell>
                  <TableCell>
                    <Badge variant={isPositive ? 'secondary' : 'outline'}>
                      {REASON_LABELS[entry.reason] || entry.reason}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {entry.order_id ? (
                      <Link href={`/dashboard/orders/${entry.order_id}`} className="font-mono text-xs text-primary hover:underline">
                        #{entry.order_id.slice(0, 7).toUpperCase()}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell className={`text-right font-medium ${isPositive ? 'text-emerald-600' : 'text-foreground'}`}>
                    {isPositive ? '+' : ''}₱{amt.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground font-mono text-xs">
                    {entry.balance_after != null ? `₱${Number(entry.balance_after).toFixed(2)}` : '—'}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
