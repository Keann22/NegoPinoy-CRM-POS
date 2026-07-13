'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';

type ReturnRecord = {
  id: string;
  order_id: string;
  product_name: string | null;
  quantity: number;
  return_type: 'restock' | 'exchange' | 'writeoff';
  reason_code: string | null;
  notes: string | null;
  processed_by: string | null;
  created_at: string;
};

const TYPE_LABEL: Record<ReturnRecord['return_type'], string> = {
  restock: 'Restock',
  exchange: 'Exchange',
  writeoff: 'Write-off',
};

const TYPE_VARIANT: Record<ReturnRecord['return_type'], 'default' | 'secondary' | 'destructive'> = {
  restock: 'default',
  exchange: 'secondary',
  writeoff: 'destructive',
};

export default function ReturnsPage() {
  const [returns, setReturns] = useState<ReturnRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch('/api/inventory/returns')
      .then(res => res.json())
      .then(data => setReturns(data.returns || []))
      .catch(err => console.error('Error fetching returns:', err))
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-headline">Returns</CardTitle>
        <CardDescription>
          Every processed return, including exchanges and write-offs that don&apos;t appear in Inventory History since they don&apos;t change stock.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Order</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Quantity</TableHead>
                <TableHead>Disposition</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead>Processed By</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-10" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  </TableRow>
                ))
              ) : returns.length > 0 ? (
                returns.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">{format(new Date(r.created_at), 'MMM d, yyyy h:mm a')}</TableCell>
                    <TableCell className="font-mono text-xs">
                      <Link href={`/dashboard/orders/${r.order_id}`} className="font-semibold text-primary hover:underline">
                        #{r.order_id.slice(0, 7).toUpperCase()}
                      </Link>
                    </TableCell>
                    <TableCell className="font-medium">{r.product_name || 'Unknown Product'}</TableCell>
                    <TableCell>{r.quantity}</TableCell>
                    <TableCell><Badge variant={TYPE_VARIANT[r.return_type]}>{TYPE_LABEL[r.return_type]}</Badge></TableCell>
                    <TableCell>{r.reason_code || '-'}</TableCell>
                    <TableCell className="text-muted-foreground">{r.notes || '-'}</TableCell>
                    <TableCell>{r.processed_by || '-'}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center">No returns recorded yet.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
