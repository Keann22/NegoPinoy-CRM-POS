'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSupabase } from '@/lib/supabase/hooks';
import { Bell, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useUserProfile } from '@/hooks/useUserProfile';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import Link from 'next/link';
import { OverdueOrderDialog } from '@/components/dashboard/orders/overdue-order-dialog';
import { UNFULFILLED_STATUSES } from '@/lib/services/procurement-service';
import type { Order, OrderStatus } from '@/types';

type OrderRef = { kind: 'id' | 'prefix'; value: string };

/**
 * Pulls an order reference out of a notification, if it has one:
 * either a full order UUID in the link (/dashboard/orders/<uuid>) or the
 * short "Order #XXXXXXX" id (first 7 hex chars of the UUID) in the text.
 */
function extractOrderRef(notif: any): OrderRef | null {
  const uuidMatch = String(notif.link || '').match(
    /\/dashboard\/orders\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
  );
  if (uuidMatch) return { kind: 'id', value: uuidMatch[1] };

  const shortMatch = `${notif.title || ''} ${notif.message || ''}`.match(/Order #([0-9A-Fa-f]{7})/);
  if (shortMatch) return { kind: 'prefix', value: shortMatch[1].toLowerCase() };

  return null;
}

export function NotificationBell() {
  const supabase = useSupabase();
  const { userProfile } = useUserProfile();
  const { toast } = useToast();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [selectedCustomerName, setSelectedCustomerName] = useState('');

  const fetchNotifications = useCallback(async () => {
    if (!supabase || !userProfile?.firstName) return;

    const fullName = `${userProfile.firstName} ${userProfile.lastName}`.trim();

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('sales_person_name', fullName)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      console.error('Error fetching notifications:', error);
      return;
    }

    setNotifications(data || []);
    setUnreadCount(data?.filter(n => !n.is_read).length || 0);
  }, [supabase, userProfile]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    // Request Desktop Notification Permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    if (!supabase || !userProfile?.firstName) return;

    const fullName = `${userProfile.firstName} ${userProfile.lastName}`.trim();

    // Guard against a duplicate subscription on the same topic (e.g. React Strict
    // Mode's double-invoke in dev), which throws when .on() is called on a channel
    // that's already past .subscribe().
    supabase.getChannels()
      .filter(c => c.topic === 'realtime:notifications-channel')
      .forEach(c => supabase.removeChannel(c));

    const channel = supabase
      .channel('notifications-channel')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `sales_person_name=eq.${fullName}`,
        },
        (payload) => {
          const newNotif = payload.new;
          
          setNotifications(prev => [newNotif, ...prev].slice(0, 20));
          setUnreadCount(prev => prev + 1);

          // Standard In-App Toast
          toast({
            title: newNotif.title,
            description: newNotif.message,
          });

          // Desktop System Notification
          if ('Notification' in window && Notification.permission === 'granted') {
            const sysNotif = new Notification(newNotif.title, {
              body: newNotif.message,
              icon: '/icon.png', // Add your app icon path if you have one
            });
            
            sysNotif.onclick = () => {
              window.focus();
              sysNotif.close();
            };
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, userProfile?.id, userProfile?.firstName, userProfile?.lastName, toast]);

  const markAsRead = async (id: string) => {
    if (!supabase) return;
    
    // Optimistic update
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));

    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
  };

  const markAllAsRead = async () => {
    if (!supabase || !userProfile?.firstName) return;

    const fullName = `${userProfile.firstName} ${userProfile.lastName}`.trim();

    // Optimistic update
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnreadCount(0);

    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('sales_person_name', fullName)
      .eq('is_read', false);
  };

  // Opens the same order card pop-up used by the Overdue Orders section,
  // instead of navigating away, for notifications that reference an order.
  const openOrderFromNotification = async (ref: OrderRef) => {
    if (!supabase) return;

    let query = supabase.from('orders').select('*');
    if (ref.kind === 'id') {
      query = query.eq('id', ref.value);
    } else {
      // A 7-hex-char prefix of the UUID. PostgREST rejects `id::text` cast
      // filters (404), but uuids compare bytewise, so a prefix match is just a
      // range check over the 8th hex digit: [prefix0-000..., prefixf-fff...]
      query = query
        .gte('id', `${ref.value}0-0000-0000-0000-000000000000`)
        .lte('id', `${ref.value}f-ffff-ffff-ffff-ffffffffffff`);
    }

    const { data: orderRow, error } = await query.limit(1).maybeSingle();

    if (error || !orderRow) {
      console.error('Failed to load order for notification:', error);
      toast({
        title: 'Order not found',
        description: 'Could not find the order referenced by this notification.',
        variant: 'destructive',
      });
      return;
    }

    let customerName = 'Unknown Customer';
    if (orderRow.customer_id) {
      const { data: customer } = await supabase
        .from('customers')
        .select('full_name')
        .eq('id', orderRow.customer_id)
        .maybeSingle();
      if (customer?.full_name) customerName = customer.full_name;
    }

    setSelectedCustomerName(customerName);
    setSelectedOrder({
      ...orderRow,
      customerId: orderRow.customer_id,
      orderDate: orderRow.order_date,
      totalAmount: orderRow.total_amount,
      amountPaid: orderRow.amount_paid,
      balanceDue: orderRow.balance_due,
      orderStatus: orderRow.status as OrderStatus,
      paymentType: orderRow.payment_method,
      installmentMonths: orderRow.installment_months,
      monthlyPayment: orderRow.monthly_payment,
      salesPersonName: orderRow.sales_person_name,
      totalDiscount: orderRow.total_discount,
    });
  };

  /**
   * Fallback for staff-message notifications that carry no order reference at
   * all (e.g. product-level discrepancy reports created before per-recipient
   * order links existed): find the matching order_issue_messages row by sender +
   * message text, then resolve its issue to an order — directly via order_id,
   * or via product_id → the user's own (else oldest) unfulfilled order
   * containing that product.
   */
  const resolveStaffMessageOrder = async (notif: any) => {
    if (!supabase) return;
    try {
      const senderName = String(notif.title || '').match(/^New message from (.+)$/)?.[1];
      // Bell messages are truncated to 140 chars + '...' — match on the prefix
      const messagePrefix = String(notif.message || '').replace(/\.\.\.$/, '');
      if (!messagePrefix.trim()) throw new Error('Empty notification message');

      let query = supabase
        .from('order_issue_messages')
        .select('created_at, order_issues!inner(order_id, product_id)')
        .ilike('message', `${messagePrefix.replace(/([%_\\])/g, '\\$1')}%`)
        .order('created_at', { ascending: false })
        .limit(5);
      if (senderName) query = query.eq('sender_name', senderName);

      const { data: candidates, error } = await query;
      if (error) throw error;

      // Same text can be posted more than once — take the row closest in time
      // to when this notification was created
      const notifTime = new Date(notif.created_at).getTime();
      const best = (candidates || []).sort(
        (a: any, b: any) =>
          Math.abs(new Date(a.created_at).getTime() - notifTime) -
          Math.abs(new Date(b.created_at).getTime() - notifTime)
      )[0] as any;

      if (best?.order_issues?.order_id) {
        return openOrderFromNotification({ kind: 'id', value: best.order_issues.order_id });
      }

      if (best?.order_issues?.product_id) {
        const { data: rows, error: itemsError } = await supabase
          .from('order_items')
          .select('orders!inner(id, order_date, status, sales_person_name)')
          .eq('product_id', best.order_issues.product_id)
          .in('orders.status', UNFULFILLED_STATUSES);
        if (itemsError) throw itemsError;

        const openOrders = (rows || [])
          .map((r: any) => r.orders)
          .filter(Boolean)
          .sort((a: any, b: any) => new Date(a.order_date).getTime() - new Date(b.order_date).getTime());

        const fullName = userProfile ? `${userProfile.firstName} ${userProfile.lastName}`.trim() : '';
        const target = openOrders.find((o: any) => o.sales_person_name === fullName) || openOrders[0];
        if (target) {
          return openOrderFromNotification({ kind: 'id', value: target.id });
        }
      }

      toast({
        title: 'No related order',
        description: 'This message is not tied to a specific order.',
      });
    } catch (err) {
      console.error('Failed to resolve order for staff-message notification:', err);
      toast({
        title: 'Could not open order',
        description: 'No order could be found for this notification.',
        variant: 'destructive',
      });
    }
  };

  const deleteNotification = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!supabase) return;

    const notif = notifications.find(n => n.id === id);
    if (notif && !notif.is_read) {
        setUnreadCount(prev => Math.max(0, prev - 1));
    }
    setNotifications(prev => prev.filter(n => n.id !== id));
    
    await supabase.from('notifications').delete().eq('id', id);
  };

  return (
    <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className="relative ml-auto h-8 w-8 bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent/80 hover:text-sidebar-accent-foreground">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <Badge className="absolute -top-2 -right-2 h-5 w-5 flex items-center justify-center p-0 text-[10px] bg-red-500 hover:bg-red-600">
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
          <span className="sr-only">Toggle notifications</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between px-2 py-1.5">
          <DropdownMenuLabel className="p-0">Notifications</DropdownMenuLabel>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={markAllAsRead} className="h-auto px-2 py-1 text-xs">
              Mark all read
            </Button>
          )}
        </div>
        <DropdownMenuSeparator />
        {notifications.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            No notifications yet.
          </div>
        ) : (
          notifications.map(notif => (
            <DropdownMenuItem
              key={notif.id}
              className="flex flex-col items-start gap-1 p-3 cursor-pointer relative group"
              onClick={(e) => {
                markAsRead(notif.id);
                const orderRef = extractOrderRef(notif);
                if (orderRef) {
                  // Show the order card pop-up instead of navigating away
                  e.preventDefault();
                  openOrderFromNotification(orderRef);
                } else if (notif.source === 'staff_message') {
                  // Older staff-message notifications carry no order reference —
                  // resolve one from the issue thread instead of navigating
                  e.preventDefault();
                  resolveStaffMessageOrder(notif);
                }
              }}
              asChild
            >
              <Link href={notif.link || '#'}>
                <div className="flex w-full justify-between items-start">
                  <span className={`font-semibold text-sm ${notif.is_read ? 'text-muted-foreground' : 'text-foreground'}`}>
                    {notif.title}
                  </span>
                  {!notif.is_read && <span className="h-2 w-2 rounded-full bg-blue-500 mt-1 flex-shrink-0" />}
                </div>
                <span className={`text-xs ${notif.is_read ? 'text-muted-foreground/70' : 'text-muted-foreground'}`}>
                  {notif.message}
                </span>
                <span className="text-[10px] text-muted-foreground/50 mt-1">
                  {new Date(notif.created_at).toLocaleString()}
                </span>
                <Button 
                    variant="ghost" 
                    size="icon" 
                    className="absolute right-2 top-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-600 hover:bg-red-50"
                    onClick={(e) => deleteNotification(e, notif.id)}
                >
                    <Trash2 className="h-3 w-3" />
                </Button>
              </Link>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>

    <OverdueOrderDialog
      variant="notification"
      order={selectedOrder}
      customerName={selectedCustomerName}
      open={!!selectedOrder}
      onOpenChange={(open) => !open && setSelectedOrder(null)}
      onOrderUpdated={() => {
        // Re-fetch the order so the dialog reflects freshly added notes
        if (selectedOrder) openOrderFromNotification({ kind: 'id', value: selectedOrder.id });
      }}
    />
    </>
  );
}
