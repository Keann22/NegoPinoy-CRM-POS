import { useState, useEffect } from 'react';
import { useSupabase } from '@/lib/supabase/hooks';
import { useToast } from '@/hooks/use-toast';
import { useUserProfile } from '@/hooks/useUserProfile';
import { resolveOpenOrderIssues } from '@/lib/services/order-issues-service';

export type OrderItem = {
  id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  images?: string[] | null;
};

export function usePicker() {
  const supabase = useSupabase();
  const { toast } = useToast();
  const { userProfile } = useUserProfile();
  const [scanner, setScanner] = useState<any>(null);
  const [scanning, setScanning] = useState(false);
  const [scannedOrderId, setScannedOrderId] = useState<string | null>(null);
  const [orderDetails, setOrderDetails] = useState<any>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [outOfStockQty, setOutOfStockQty] = useState<Map<string, number>>(new Map());
  const [qtyDrafts, setQtyDrafts] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(false);
  const [viewingPhotoItem, setViewingPhotoItem] = useState<OrderItem | null>(null);

  const startScanner = async () => {
    setScanning(true);
    setScannedOrderId(null);
    setOrderDetails(null);
    setOrderItems([]);
    setOutOfStockQty(new Map());
    setQtyDrafts(new Map());
    setViewingPhotoItem(null);

    const { Html5QrcodeScanner } = await import('html5-qrcode');

    setTimeout(() => {
      const newScanner = new Html5QrcodeScanner(
        "reader",
        { fps: 10, qrbox: { width: 250, height: 250 } },
        /* verbose= */ false
      );
      
      newScanner.render(
        (decodedText) => {
          newScanner.clear();
          setScanning(false);
          handleScanSuccess(decodedText);
        },
        () => {
          // ignore background errors
        }
      );
      setScanner(newScanner);
    }, 100);
  };

  const stopScanner = () => {
    if (scanner) {
      scanner.clear().catch(console.error);
      setScanner(null);
    }
    setScanning(false);
  };

  useEffect(() => {
    return () => {
      if (scanner) {
        scanner.clear().catch(console.error);
      }
    };
  }, [scanner]);

  const handleScanSuccess = async (orderId: string) => {
    if (!supabase) return;
    setLoading(true);
    setScannedOrderId(orderId);
    
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('id, status, customer_id, sales_person_name, customers(full_name), order_items(id, product_id, product_name, quantity, products(images))')
        .eq('id', orderId)
        .single();

      if (error) throw error;

      if (!data) {
        toast({ title: 'Order not found', description: 'Invalid QR code.', variant: 'destructive' });
        setScannedOrderId(null);
        return;
      }

      setOrderDetails(data);
      const items = (data.order_items || []).map((item: any) => ({
        id: item.id,
        product_id: item.product_id,
        product_name: item.product_name,
        quantity: item.quantity,
        images: item.products?.images ?? null
      }));
      setOrderItems(items);

      if (['Picked', 'Picked (with issue)', 'Photo', 'Packed', 'For Shipping', 'For Pick-up'].includes(data.status)) {
        toast({ 
          title: 'Already Picked', 
          description: `This order is marked as ${data.status}.`, 
          variant: 'default' 
        });
      }

    } catch (err) {
      console.error(err);
      toast({ title: 'Error', description: 'Failed to fetch order details.', variant: 'destructive' });
      setScannedOrderId(null);
    } finally {
      setLoading(false);
    }
  };

  const toggleOutOfStock = (itemId: string, fullQty: number) => {
    const nextQty = new Map(outOfStockQty);
    const nextDrafts = new Map(qtyDrafts);
    if (nextQty.has(itemId)) {
      nextQty.delete(itemId);
      nextDrafts.delete(itemId);
    } else {
      nextQty.set(itemId, fullQty);
      nextDrafts.set(itemId, String(fullQty));
    }
    setOutOfStockQty(nextQty);
    setQtyDrafts(nextDrafts);
  };

  const handleQtyDraftChange = (itemId: string, rawValue: string) => {
    const nextDrafts = new Map(qtyDrafts);
    nextDrafts.set(itemId, rawValue);
    setQtyDrafts(nextDrafts);

    const parsed = parseInt(rawValue, 10);
    if (!isNaN(parsed) && parsed > 0) {
      const nextQty = new Map(outOfStockQty);
      nextQty.set(itemId, parsed);
      setOutOfStockQty(nextQty);
    }
  };

  const commitOutOfStockQty = (itemId: string, fullQty: number) => {
    const clamped = Math.min(Math.max(1, outOfStockQty.get(itemId) || 1), fullQty);
    const nextQty = new Map(outOfStockQty);
    nextQty.set(itemId, clamped);
    setOutOfStockQty(nextQty);
    const nextDrafts = new Map(qtyDrafts);
    nextDrafts.set(itemId, String(clamped));
    setQtyDrafts(nextDrafts);
  };

  const handleSubmitPicking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !scannedOrderId) return;
    
    setLoading(true);

    try {
      const hasIssues = outOfStockQty.size > 0;
      const newStatus = hasIssues ? 'Picked (with issue)' : 'Picked';

      const { error: orderError } = await supabase
        .from('orders')
        .update({ status: newStatus })
        .eq('id', scannedOrderId);

      if (orderError) throw orderError;

      // Whatever was flagged on an earlier pick attempt for this order is
      // stale now — clear it before any new issues (below) get inserted, so
      // the Missing Items list reflects only this attempt's results instead
      // of accumulating every past attempt (clean or partial re-pick alike).
      await resolveOpenOrderIssues(supabase, scannedOrderId);

      const userName = userProfile ? `${userProfile.firstName} ${userProfile.lastName}`.trim() : 'Unknown Staff';

      const itemSnapshot = orderItems.map(item => ({
        id: item.id,
        product_id: item.product_id,
        product_name: item.product_name,
        quantity: item.quantity
      }));
      await supabase.from('order_logs').insert({
        order_id: scannedOrderId,
        status: newStatus,
        user_name: userName,
        snapshot_data: { items: itemSnapshot }
      });

      if (hasIssues) {
        const issuesToInsert = [];
        const procurementRequests = [];

        for (const [itemId, missingQty] of Array.from(outOfStockQty.entries())) {
          const item = orderItems.find(i => i.id === itemId);
          if (item) {
            issuesToInsert.push({
              order_id: scannedOrderId,
              product_id: item.product_id,
              status: 'open',
              reported_by_name: userName,
              out_of_stock_qty: missingQty
            });
            procurementRequests.push({
              productId: item.product_id,
              requestedQty: missingQty,
              orderId: scannedOrderId
            });
          }
        }

        if (issuesToInsert.length > 0) {
          const { data: insertedIssues, error: issuesErr } = await supabase
            .from('order_issues')
            .insert(issuesToInsert)
            .select('id, product_id');
          
          if (issuesErr) console.error("Error inserting order issues:", issuesErr);
          
          if (insertedIssues && insertedIssues.length > 0) {
            const initialMessages = insertedIssues.map(issue => {
              const item = orderItems.find(i => i.product_id === issue.product_id);
              const productName = item ? item.product_name : 'this item';
              const missingQty = item ? outOfStockQty.get(item.id) : undefined;
              const qtyNote = item && missingQty && missingQty < item.quantity
                ? ` (${missingQty} of ${item.quantity} units)`
                : '';
              return {
                issue_id: issue.id,
                sender_role: 'picker',
                sender_name: userName,
                message: `Picker reported ${productName} as out of stock${qtyNote}.`
              };
            });
            
            const { error: msgErr } = await supabase
              .from('order_issue_messages')
              .insert(initialMessages);
              
            if (msgErr) console.error("Error inserting issue messages:", msgErr);
          }

          const procRes = await fetch('/api/inventory/procurement-request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ requests: procurementRequests, requestedByName: userName })
          });
          if (!procRes.ok) {
            const procErr = await procRes.json().catch(() => ({}));
            console.error('Failed to create procurement draft:', procErr.error || procRes.statusText);
            toast({
              title: 'Warning',
              description: 'Issue reported, but the procurement request failed to save. Please notify management.',
              variant: 'destructive'
            });
          }

          if (orderDetails?.sales_person_name) {
            await supabase.from('notifications').insert({
              sales_person_name: orderDetails.sales_person_name,
              title: 'Order Issue Reported',
              message: `Order #${scannedOrderId.substring(0, 7).toUpperCase()} has out-of-stock items reported by ${userName}.`,
              link: '/dashboard'
            });
          }
        }
      }

      toast({
        title: 'Success!',
        description: `Order marked as ${newStatus}.`,
        variant: 'default'
      });

      setScannedOrderId(null);
      setOrderDetails(null);
      setOutOfStockQty(new Map());
      setQtyDrafts(new Map());

    } catch (err) {
      console.error(err);
      toast({ title: 'Error', description: 'Failed to submit picking result.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return {
    scanner,
    scanning,
    scannedOrderId,
    setScannedOrderId,
    orderDetails,
    orderItems,
    outOfStockQty,
    qtyDrafts,
    loading,
    viewingPhotoItem,
    setViewingPhotoItem,
    startScanner,
    stopScanner,
    toggleOutOfStock,
    handleQtyDraftChange,
    commitOutOfStockQty,
    handleSubmitPicking
  };
}
