'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSupabase } from '@/lib/supabase/hooks';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Activity } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';
import { OrderTrailDialog } from '@/components/dashboard/order-trail-dialog';

interface StaffRequestDialogProps {
  productId?: string;
  productName: string;
  isOpen: boolean;
  onClose: () => void;
  staffRequestedQty: number;
  requestedByName: string | null;
  sourceOrders: any[];
}

export function StaffRequestDialog({
  productId,
  productName,
  isOpen,
  onClose,
  staffRequestedQty,
  requestedByName,
  sourceOrders
}: StaffRequestDialogProps) {
  const supabase = useSupabase();
  const [trailOrderId, setTrailOrderId] = useState<string | null>(null);
  const [pickerReports, setPickerReports] = useState<Map<string, { createdAt: string; reportedByName?: string }>>(new Map());

  useEffect(() => {
    if (!isOpen || !supabase || !sourceOrders || sourceOrders.length === 0) return;
    const orderIds = sourceOrders.map((o: any) => o.orderId).filter(Boolean);
    if (orderIds.length === 0) return;

    async function fetchPickerReports() {
      try {
        let targetProductIds: string[] = [];
        if (productId) {
          const { data: family } = await supabase
            .from('products')
            .select('id')
            .or(`id.eq.${productId},parent_id.eq.${productId}`);
          targetProductIds = (family || []).map((f: any) => f.id);
        }

        const itemReportMap = new Map<string, { createdAt: string; reportedByName?: string }>();
        const orderReportMap = new Map<string, { createdAt: string; reportedByName?: string }>();

        const { data: issuesData } = await supabase
          .from('order_issues')
          .select('order_id, product_id, created_at, reported_by_name')
          .in('order_id', orderIds)
          .order('created_at', { ascending: false });

        if (issuesData) {
          issuesData.forEach((issue: any) => {
            const key = `${issue.order_id}-${issue.product_id}`;
            if (!itemReportMap.has(key)) {
              itemReportMap.set(key, {
                createdAt: issue.created_at,
                reportedByName: issue.reported_by_name || undefined,
              });
            }
            if (!orderReportMap.has(issue.order_id)) {
              orderReportMap.set(issue.order_id, {
                createdAt: issue.created_at,
                reportedByName: issue.reported_by_name || undefined,
              });
            }
          });
        }

        const { data: logsData } = await supabase
          .from('order_logs')
          .select('order_id, status, user_name, created_at')
          .in('order_id', orderIds)
          .eq('status', 'Picked (with issue)')
          .order('created_at', { ascending: false });

        if (logsData) {
          logsData.forEach((log: any) => {
            const existing = orderReportMap.get(log.order_id);
            if (!existing || new Date(log.created_at).getTime() > new Date(existing.createdAt).getTime()) {
              orderReportMap.set(log.order_id, {
                createdAt: log.created_at,
                reportedByName: log.user_name || undefined,
              });
            }
          });
        }

        const finalMap = new Map<string, { createdAt: string; reportedByName?: string }>();
        sourceOrders.forEach((order: any) => {
          let report: { createdAt: string; reportedByName?: string } | undefined;
          if (targetProductIds.length > 0) {
            for (const tid of targetProductIds) {
              const candidate = itemReportMap.get(`${order.orderId}-${tid}`);
              if (candidate) {
                if (!report || new Date(candidate.createdAt).getTime() > new Date(report.createdAt).getTime()) {
                  report = candidate;
                }
              }
            }
          }
          if (!report) {
            report = orderReportMap.get(order.orderId);
          }
          if (report) {
            finalMap.set(order.orderId, report);
          }
        });

        setPickerReports(finalMap);
      } catch (err) {
        console.error('Failed to fetch picker reports for staff request', err);
      }
    }

    fetchPickerReports();
  }, [isOpen, supabase, sourceOrders, productId]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Staff Request Details</DialogTitle>
          <DialogDescription>
            {requestedByName ? (
              <>Requested by <span className="font-semibold text-foreground">{requestedByName}</span> for <span className="font-semibold text-foreground">{productName}</span></>
            ) : (
              <>Requests for <span className="font-semibold text-foreground">{productName}</span></>
            )}
            {' '}(Total: {staffRequestedQty})
          </DialogDescription>
        </DialogHeader>

        {!sourceOrders || sourceOrders.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground italic">
            Manually added. No customer order linked.
          </div>
        ) : (
          <ScrollArea className="max-h-[60vh]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Age / Reported</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Order ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead className="text-right">Trail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sourceOrders.map((order, idx) => {
                  const report = pickerReports.get(order.orderId);
                  return (
                    <TableRow key={idx}>
                      <TableCell className="align-top">
                        {order.orderDate ? (
                          <div className="space-y-1.5">
                            <div>
                              <span className="font-medium text-destructive">
                                {formatDistanceToNow(new Date(order.orderDate))} ago
                              </span>
                              <div className="text-xs text-muted-foreground">
                                Ordered: {format(new Date(order.orderDate), 'MMM d, yyyy')}
                              </div>
                            </div>
                            {report?.createdAt && (
                              <div className="pt-1.5 border-t border-border/60 text-xs">
                                <span className="font-semibold text-amber-700 dark:text-amber-400 block">
                                  Reported by picker:
                                </span>
                                <span className="font-medium text-foreground block">
                                  {format(new Date(report.createdAt), 'MMM d, yyyy h:mm a')}
                                </span>
                                <span className="text-[11px] text-muted-foreground block">
                                  ({formatDistanceToNow(new Date(report.createdAt))} ago{report.reportedByName ? ` • ${report.reportedByName}` : ''})
                                </span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </TableCell>
                      <TableCell className="align-top font-medium">
                        {order.customerId ? (
                          <Link href={`/dashboard/customers/${order.customerId}`} className="text-primary hover:underline">
                            {order.customerName}
                          </Link>
                        ) : (
                          order.customerName
                        )}
                        {order.paymentType && (
                          <div className="text-xs text-muted-foreground font-normal mt-0.5">{order.paymentType}</div>
                        )}
                      </TableCell>
                      <TableCell className="align-top font-mono text-sm">
                        <Link href={`/dashboard/orders/${order.orderId}`} className="font-semibold text-primary hover:underline">
                          {order.shortOrderId}
                        </Link>
                      </TableCell>
                      <TableCell className="align-top">
                        {order.status ? (
                          <Badge variant={order.status === 'Pending Payment' ? 'destructive' : 'secondary'}>
                            {order.status}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </TableCell>
                      <TableCell className="align-top text-right font-bold text-lg">{order.quantity}</TableCell>
                      <TableCell className="align-top text-right">
                        {order.orderId ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setTrailOrderId(order.orderId)}
                          >
                            <Activity className="mr-2 h-4 w-4" /> View Trail
                          </Button>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </ScrollArea>
        )}
      </DialogContent>

      {trailOrderId && (
        <OrderTrailDialog
          open={!!trailOrderId}
          onOpenChange={(open) => !open && setTrailOrderId(null)}
          orderId={trailOrderId}
        />
      )}
    </Dialog>
  );
}
