'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Package, ShoppingCart, MessageSquare, ExternalLink, AlertTriangle } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useUserProfile } from '@/hooks/useUserProfile';

type NotificationContext = {
  order: {
    id: string;
    shortId: string;
    status: string;
    customerName: string;
    salesPersonName: string | null;
    orderDate: string | null;
    totalAmount: number | null;
    amountPaid: number | null;
    balanceDue: number | null;
    items: { name: string; quantity: number; unitPrice: number }[];
  } | null;
  product: {
    id: string;
    name: string;
    sku: string | null;
    variantName: string | null;
    stockLevel: number | null;
    sellingPrice: number | null;
    supplierName: string | null;
  } | null;
  thread: {
    source: 'procurement_issue' | 'order_issue';
    status: string | null;
    messages: { senderName: string; senderRole: string | null; message: string; createdAt: string }[];
  } | null;
};

interface NotificationDetailsDialogProps {
  notification: any | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Opens the full, editable order card (reply/notes) for a resolved order. */
  onOpenOrder: (orderId: string) => void;
}

const SOURCE_LABELS: Record<string, string> = {
  staff_message: 'Staff message',
  order: 'Order update',
  inventory: 'Inventory',
  procurement: 'Procurement',
};

const peso = (n: number | null | undefined) =>
  n == null ? '—' : `₱${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function NotificationDetailsDialog({
  notification,
  open,
  onOpenChange,
  onOpenOrder,
}: NotificationDetailsDialogProps) {
  const { userProfile } = useUserProfile();
  const [context, setContext] = useState<NotificationContext | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!open || !notification) {
      setContext(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setContext(null);

    const userName = userProfile
      ? `${userProfile.firstName} ${userProfile.lastName}`.trim()
      : '';

    fetch('/api/notifications/context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notification, userName }),
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Failed to load details'))))
      .then((body) => {
        if (!cancelled) setContext(body.context || null);
      })
      .catch((err) => {
        console.error('Error loading notification details:', err);
        if (!cancelled) setContext(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, notification, userProfile]);

  if (!notification) return null;

  const { order, product, thread } = context || {};
  // The bell message is truncated to 140 chars + '...'; the thread carries the
  // full text, so prefer the latest thread message when we have it.
  const fullMessage =
    thread?.messages?.length ? thread.messages[thread.messages.length - 1].message : notification.message;
  const sourceLabel = SOURCE_LABELS[notification.source] || notification.source || 'Notification';
  const hasContext = !!(order || product || (thread && thread.messages.length));
  const rawLink = notification.link && notification.link !== '/dashboard' ? notification.link : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="pr-6">{notification.title}</DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="font-normal">{sourceLabel}</Badge>
            <span className="text-xs">{new Date(notification.created_at).toLocaleString()}</span>
          </DialogDescription>
        </DialogHeader>

        {/* The message itself, untruncated */}
        <div className="rounded-md border bg-muted/40 p-3 text-sm whitespace-pre-wrap">
          {fullMessage}
        </div>

        {isLoading && (
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-16 w-full" />
          </div>
        )}

        {/* Product context (procurement / product notes) */}
        {product && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Package className="h-4 w-4 text-muted-foreground" /> Product
            </div>
            <div className="rounded-md border p-3 text-sm space-y-1">
              <div className="font-medium">{product.name}</div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {product.sku && <span>SKU: {product.sku}</span>}
                {product.supplierName && <span>Supplier: {product.supplierName}</span>}
                {product.sellingPrice != null && <span>Price: {peso(product.sellingPrice)}</span>}
              </div>
              {product.stockLevel != null && (
                <div className="pt-1">
                  <Badge
                    variant={product.stockLevel <= 0 ? 'destructive' : 'secondary'}
                    className="font-normal"
                  >
                    {product.stockLevel <= 0 && <AlertTriangle className="h-3 w-3 mr-1" />}
                    Stock: {product.stockLevel}
                    {product.stockLevel < 0 ? ' (oversold)' : ''}
                  </Badge>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Conversation history when the notification came from a thread */}
        {thread && thread.messages.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <MessageSquare className="h-4 w-4 text-muted-foreground" /> Conversation
              {thread.status && (
                <Badge variant="outline" className="ml-auto font-normal capitalize">{thread.status}</Badge>
              )}
            </div>
            <div className="space-y-2">
              {thread.messages.map((m, i) => (
                <div key={i} className="rounded-md border p-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{m.senderName}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(m.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="whitespace-pre-wrap">{m.message}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Related order */}
        {order && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <ShoppingCart className="h-4 w-4 text-muted-foreground" /> Related order
            </div>
            <div className="rounded-md border p-3 text-sm space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-medium">Order #{order.shortId}</span>
                <Badge variant="outline" className="font-normal">{order.status}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>Customer: {order.customerName}</span>
                {order.salesPersonName && <span>Rep: {order.salesPersonName}</span>}
                <span>Total: {peso(order.totalAmount)}</span>
                <span>Balance: {peso(order.balanceDue)}</span>
              </div>
              {order.items.length > 0 && (
                <div className="border-t pt-2 space-y-0.5">
                  {order.items.map((it, i) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className="truncate pr-2">{it.name}</span>
                      <span className="text-muted-foreground whitespace-nowrap">
                        {it.quantity} × {peso(it.unitPrice)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <Button
                size="sm"
                className="w-full mt-1"
                onClick={() => {
                  onOpenChange(false);
                  onOpenOrder(order.id);
                }}
              >
                Open full order card
              </Button>
            </div>
          </div>
        )}

        {/* Nothing extra resolved — still show the raw destination if any */}
        {!isLoading && !hasContext && (
          <div className="text-sm text-muted-foreground">
            No extra details are linked to this notification.
            {rawLink && (
              <>
                <Separator className="my-2" />
                <Button asChild variant="outline" size="sm">
                  <Link href={rawLink}>
                    <ExternalLink className="h-3 w-3 mr-1" /> Open linked page
                  </Link>
                </Button>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
