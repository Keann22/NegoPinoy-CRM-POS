'use client';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { ArrowRight, History } from 'lucide-react';
import type { StockTransfer } from '@/types';

interface TransferHistoryProps {
  transfers: StockTransfer[];
}

export function TransferHistory({ transfers }: TransferHistoryProps) {
  if (transfers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 border rounded-lg bg-card text-center text-muted-foreground">
        <History className="h-10 w-10 text-muted-foreground/50 mb-2" />
        <p className="font-medium text-foreground">No transfer history recorded yet.</p>
        <p className="text-xs">Internal movements between Unit 1 and Unit 2 will appear here.</p>
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden bg-card">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow>
            <TableHead>Transfer #</TableHead>
            <TableHead>Date & Time</TableHead>
            <TableHead>Movement</TableHead>
            <TableHead>Items Moved</TableHead>
            <TableHead>Transferred By</TableHead>
            <TableHead>Notes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {transfers.map((tr) => {
            const totalQty = tr.items?.reduce((sum, i) => sum + i.quantity, 0) || 0;
            return (
              <TableRow key={tr.id}>
                <TableCell className="font-mono font-medium text-xs">
                  {tr.transfer_number}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {tr.created_at ? format(new Date(tr.created_at), 'MMM dd, yyyy h:mm a') : '-'}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5 text-xs font-medium">
                    <span className="text-muted-foreground">{tr.from_warehouse?.name || 'Unit 2'}</span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    <span className="text-foreground">{tr.to_warehouse?.name || 'Unit 1'}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="font-semibold">
                    {totalQty} pcs
                  </Badge>
                  {tr.items && tr.items.length > 0 && (
                    <div className="text-[11px] text-muted-foreground mt-1 max-w-xs truncate">
                      {tr.items.map((i: any) => `${i.products?.name || 'Item'} (${i.quantity})`).join(', ')}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {tr.created_by || 'Staff'}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground italic">
                  {tr.notes || '-'}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
