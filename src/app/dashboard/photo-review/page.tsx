'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { format, differenceInDays } from 'date-fns';
import { Search, StickyNote } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { useSupabase } from '@/lib/supabase/hooks';
import { PhotoReviewNoteDialog } from '@/components/dashboard/photo-review-note-dialog';
import { latestReviewFinding, type PhotoReviewOrder } from '@/lib/photo-review';
import orderIds from './order-ids.json';

// Snapshot of the 104 orders that were in Photo status on Oct 9, 2026.
// The list is fixed so an order stays visible here even after it is cancelled or completed.
const ORDER_IDS = orderIds as string[];
const CHUNK_SIZE = 50;

const chunk = <T,>(arr: T[], size: number) =>
  Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, (i + 1) * size));

const peso = (n: number) => `₱${(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function PhotoReviewPage() {
  const supabase = useSupabase();
  const [orders, setOrders] = useState<PhotoReviewOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [noteOrder, setNoteOrder] = useState<PhotoReviewOrder | null>(null);

  const loadOrders = useCallback(async () => {
    if (!supabase) return;
    try {
      const idChunks = chunk(ORDER_IDS, CHUNK_SIZE);
      const [orderResults, logResults] = await Promise.all([
        Promise.all(idChunks.map(ids => supabase
          .from('orders')
          .select('id, customer_id, status, order_date, total_amount, balance_due, sales_person_name, notes, customers(full_name), order_items(quantity, product_name)')
          .in('id', ids))),
        Promise.all(idChunks.map(ids => supabase
          .from('order_logs')
          .select('order_id, created_at')
          .eq('status', 'Photo')
          .in('order_id', ids))),
      ]);

      const photoSince = new Map<string, string>();
      for (const { data } of logResults) {
        for (const log of data || []) {
          const prev = photoSince.get(log.order_id);
          if (!prev || log.created_at > prev) photoSince.set(log.order_id, log.created_at);
        }
      }

      const rows: PhotoReviewOrder[] = [];
      for (const { data, error } of orderResults) {
        if (error) throw error;
        for (const o of (data || []) as any[]) {
          const items = (o.order_items || []).map((i: any) => ({ name: i.product_name || 'Unknown product', quantity: i.quantity || 0 }));
          rows.push({
            id: o.id,
            customerId: o.customer_id,
            customerName: o.customers?.full_name || 'Unknown Customer',
            status: o.status,
            orderDate: o.order_date,
            photoSince: photoSince.get(o.id) || null,
            totalAmount: o.total_amount || 0,
            balanceDue: o.balance_due || 0,
            salesPersonName: o.sales_person_name || '',
            notes: o.notes || '',
            items,
            units: items.reduce((sum: number, i: { quantity: number }) => sum + i.quantity, 0),
          });
        }
      }
      rows.sort((a, b) => new Date(a.orderDate).getTime() - new Date(b.orderDate).getTime());
      setOrders(rows);
    } catch (err) {
      console.error('Photo review fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  const handleNoteSaved = (orderId: string, updatedNotes: string) => {
    setOrders(prev => prev.map(o => (o.id === orderId ? { ...o, notes: updatedNotes } : o)));
  };

  const searched = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return orders;
    return orders.filter(o => o.id.toLowerCase().includes(q) || o.customerName.toLowerCase().includes(q));
  }, [orders, searchQuery]);

  const pending = searched.filter(o => !latestReviewFinding(o.notes));
  const reviewed = searched.filter(o => !!latestReviewFinding(o.notes));
  const visible = activeTab === 'pending' ? pending : activeTab === 'reviewed' ? reviewed : searched;

  const reviewedTotal = orders.filter(o => !!latestReviewFinding(o.notes)).length;
  const progress = orders.length ? Math.round((reviewedTotal / orders.length) * 100) : 0;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="font-headline">Photo Orders Review</CardTitle>
          <CardDescription>
            These {ORDER_IDS.length} orders were stuck in the Photo stage. For each one, add a note saying what really happened to it
            (should be cancelled, already shipped, still waiting, etc.). The note is saved on the order itself.
          </CardDescription>
          <div className="flex items-center gap-3 pt-2">
            <Progress value={progress} className="h-2 max-w-sm" />
            <span className="text-sm text-muted-foreground whitespace-nowrap">
              <strong className="text-foreground">{reviewedTotal}</strong> of {orders.length || ORDER_IDS.length} reviewed
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-4 mb-4">
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search order ID or customer..."
                className="pl-8"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="all">
                  All <Badge variant="secondary" className="ml-2 bg-background">{searched.length}</Badge>
                </TabsTrigger>
                <TabsTrigger value="pending">
                  To Review <Badge variant="secondary" className="ml-2 bg-background">{pending.length}</Badge>
                </TabsTrigger>
                <TabsTrigger value="reviewed">
                  Reviewed <Badge variant="secondary" className="ml-2 bg-background">{reviewed.length}</Badge>
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order ID</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Order Date</TableHead>
                <TableHead>In Photo Since</TableHead>
                <TableHead className="text-right">Units</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status Now</TableHead>
                <TableHead className="min-w-[280px]">Notes</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 9 }).map((__, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
                  ))}
                </TableRow>
              ))}
              {!isLoading && visible.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                    {activeTab === 'pending' && orders.length > 0 && !searchQuery ? 'All orders have been reviewed.' : 'No orders found.'}
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && visible.map(order => {
                const finding = latestReviewFinding(order.notes);
                const daysInPhoto = order.photoSince ? differenceInDays(new Date(), new Date(order.photoSince)) : null;
                return (
                  <TableRow key={order.id} className="align-top">
                    <TableCell className="font-mono text-sm">
                      <Link href={`/dashboard/orders/${order.id}`} target="_blank" className="font-semibold text-primary hover:underline">
                        {order.id.split('-')[0].toUpperCase()}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{order.customerName}</div>
                      {order.salesPersonName && <div className="text-xs text-muted-foreground">Sales: {order.salesPersonName}</div>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{format(new Date(order.orderDate), 'MMM d, yyyy')}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {order.photoSince ? (
                        <div className="flex flex-col">
                          <span>{format(new Date(order.photoSince), 'MMM d, yyyy')}</span>
                          <span className={daysInPhoto !== null && daysInPhoto > 14 ? 'text-amber-600 text-xs font-semibold' : 'text-xs text-muted-foreground'}>
                            {daysInPhoto} days ago
                          </span>
                        </div>
                      ) : '-'}
                    </TableCell>
                    <TableCell className="text-right">{order.units}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <div>{peso(order.totalAmount)}</div>
                      {order.balanceDue > 0 && <div className="text-xs text-destructive">Bal: {peso(order.balanceDue)}</div>}
                    </TableCell>
                    <TableCell>
                      <Badge variant={order.status === 'Photo' ? 'secondary' : 'default'}>{order.status}</Badge>
                    </TableCell>
                    <TableCell>
                      {finding && <Badge variant="outline" className="mb-1 border-emerald-600 text-emerald-700">{finding}</Badge>}
                      {order.notes
                        ? <p className="text-sm whitespace-pre-wrap break-words max-h-40 overflow-y-auto">{order.notes}</p>
                        : <span className="text-sm text-muted-foreground">No notes yet</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant={finding ? 'outline' : 'default'} size="sm" onClick={() => setNoteOrder(order)}>
                        <StickyNote className="h-4 w-4 mr-1" /> {finding ? 'Add another' : 'Add note'}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <PhotoReviewNoteDialog
        order={noteOrder}
        open={!!noteOrder}
        onOpenChange={(open) => !open && setNoteOrder(null)}
        onSaved={handleNoteSaved}
      />
    </>
  );
}
