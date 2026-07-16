'use client';

import { useEffect, useState } from 'react';
import { useSupabase } from '@/lib/supabase/hooks';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2 } from 'lucide-react';
import { format } from 'date-fns';

type DiscrepancyLog = {
  id: string;
  product_id: string;
  quantity_change: number;
  reason: string;
  timestamp: string;
  product: { name: string; variant_name?: string };
};

export function DiscrepancyReport() {
  const supabase = useSupabase();
  const [logs, setLogs] = useState<DiscrepancyLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!supabase) return;
    const fetchLogs = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('inventory_movements')
          .select(`
            id, quantity_change, reason, timestamp,
            product:products (name, variant_name)
          `)
          .eq('movement_type', 'adjustment')
          .ilike('reason', '%Procurement Auto-Adjustment%')
          .order('timestamp', { ascending: false })
          .limit(100);

        if (error) throw error;
        setLogs(data as any || []);
      } catch (err) {
        console.error('Error fetching discrepancies:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchLogs();
  }, [supabase]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Inventory Auto-Adjustments Audit</CardTitle>
        <CardDescription>
          Logs of all automatic inventory adjustments triggered by Procurement Requests (Option C). Large frequent adjustments may indicate shrinkage or theft.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Adjustment</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      No auto-adjustments logged yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap">
                        {format(new Date(log.timestamp), 'MMM d, yyyy h:mm a')}
                      </TableCell>
                      <TableCell>
                        {log.product?.name}
                        {log.product?.variant_name && ` - ${log.product.variant_name}`}
                      </TableCell>
                      <TableCell className="text-right font-bold text-destructive">
                        {log.quantity_change > 0 ? `+${log.quantity_change}` : log.quantity_change}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {log.reason}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
