import { useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveOpenOrderIssues } from '@/lib/services/order-issues-service';
import type { OrderItem, PickGroup, PickRow } from './types';

export function usePickerData(
  supabase: SupabaseClient | null,
  toast: any,
  userProfile: any,
  setScannedOrderId: (id: string | null) => void,
  scannedOrderId: string | null
) {
  const [orderDetails, setOrderDetails] = useState<any>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [pickGroups, setPickGroups] = useState<PickGroup[]>([]);
  const [outOfStockQty, setOutOfStockQty] = useState<Map<string, number>>(new Map());
  const [qtyDrafts, setQtyDrafts] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(false);
  const [viewingPhotoItem, setViewingPhotoItem] = useState<OrderItem | null>(null);

  const resetData = () => {
    setOrderDetails(null);
    setOrderItems([]);
    setPickGroups([]);
    setOutOfStockQty(new Map());
    setQtyDrafts(new Map());
    setViewingPhotoItem(null);
  };

  const handleScanSuccess = async (orderId: string) => {
    if (!supabase) return;
    setLoading(true);
    setScannedOrderId(orderId);
    resetData();

    try {
      const { data, error } = await supabase
        .from('orders')
        .select('id, status, customer_id, sales_person_name, customers(full_name), order_items(id, product_id, product_name, quantity, products(images, assembly_recipe))')
        .eq('id', orderId)
        .single();

      if (error) throw error;

      if (!data) {
        toast({ title: 'Order not found', description: 'Invalid QR code.', variant: 'destructive' });
        setScannedOrderId(null);
        return;
      }

      setOrderDetails(data);
      const rawItems = (data.order_items || []) as any[];
      const items = rawItems.map((item: any) => ({
        id: item.id,
        product_id: item.product_id,
        product_name: item.product_name,
        quantity: item.quantity,
        images: item.products?.images ?? null
      }));
      setOrderItems(items);

      const missingNameIds = new Set<string>();
      for (const item of rawItems) {
        const recipe = Array.isArray(item.products?.assembly_recipe) ? item.products.assembly_recipe : [];
        for (const comp of recipe) {
          const compId = comp.productId || comp.component_id;
          if (compId && !comp.productName) missingNameIds.add(compId);
        }
      }

      const nameMap = new Map<string, string>();
      if (missingNameIds.size > 0) {
        const { data: compProducts } = await supabase
          .from('products')
          .select('id, name, variant_name')
          .in('id', Array.from(missingNameIds));
        for (const p of (compProducts || []) as any[]) {
          const display = p.variant_name && !p.name?.includes(p.variant_name)
            ? `${p.name} [${p.variant_name}]`
            : p.name;
          nameMap.set(p.id, display);
        }
      }

      const groups: PickGroup[] = rawItems.map((item: any) => {
        const recipe = Array.isArray(item.products?.assembly_recipe) ? item.products.assembly_recipe : [];
        if (recipe.length > 0) {
          const rows: PickRow[] = recipe.map((comp: any) => {
            const compId = comp.productId || comp.component_id;
            const compQty = (comp.quantity || 1) * item.quantity;
            return {
              key: `${item.id}::${compId}`,
              orderItemId: item.id,
              productId: compId,
              productName: comp.productName || nameMap.get(compId) || 'Component',
              quantity: compQty,
              isComponent: true,
              setName: item.product_name,
            };
          });
          return {
            orderItemId: item.id,
            productName: item.product_name,
            quantity: item.quantity,
            images: item.products?.images ?? null,
            isSet: true,
            rows,
          };
        }
        return {
          orderItemId: item.id,
          productName: item.product_name,
          quantity: item.quantity,
          images: item.products?.images ?? null,
          isSet: false,
          rows: [{
            key: item.id,
            orderItemId: item.id,
            productId: item.product_id,
            productName: item.product_name,
            quantity: item.quantity,
            isComponent: false,
          }],
        };
      });
      setPickGroups(groups);

      // Pre-populate any existing out-of-stock issues so the picker doesn't
      // accidentally resolve them by forgetting to re-flag them.
      const { data: existingIssues } = await supabase
        .from('order_issues')
        .select('product_id, out_of_stock_qty')
        .eq('order_id', orderId)
        .eq('status', 'open');

      const nextQty = new Map<string, number>();
      const nextDrafts = new Map<string, string>();

      if (existingIssues && existingIssues.length > 0) {
        const flatRows = groups.flatMap((g: PickGroup) => g.rows);
        for (const issue of existingIssues) {
          const matchingRow = flatRows.find((r: PickRow) => r.productId === issue.product_id);
          if (matchingRow) {
            nextQty.set(matchingRow.key, issue.out_of_stock_qty);
            nextDrafts.set(matchingRow.key, String(issue.out_of_stock_qty));
          }
        }
      }
      setOutOfStockQty(nextQty);
      setQtyDrafts(nextDrafts);

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

  const toggleOutOfStock = (rowKey: string, fullQty: number) => {
    const nextQty = new Map(outOfStockQty);
    const nextDrafts = new Map(qtyDrafts);
    if (nextQty.has(rowKey)) {
      nextQty.delete(rowKey);
      nextDrafts.delete(rowKey);
    } else {
      nextQty.set(rowKey, fullQty);
      nextDrafts.set(rowKey, String(fullQty));
    }
    setOutOfStockQty(nextQty);
    setQtyDrafts(nextDrafts);
  };

  const handleQtyDraftChange = (rowKey: string, rawValue: string) => {
    const nextDrafts = new Map(qtyDrafts);
    nextDrafts.set(rowKey, rawValue);
    setQtyDrafts(nextDrafts);

    const parsed = parseInt(rawValue, 10);
    if (!isNaN(parsed) && parsed > 0) {
      const nextQty = new Map(outOfStockQty);
      nextQty.set(rowKey, parsed);
      setOutOfStockQty(nextQty);
    }
  };

  const commitOutOfStockQty = (rowKey: string, fullQty: number) => {
    const clamped = Math.min(Math.max(1, outOfStockQty.get(rowKey) || 1), fullQty);
    const nextQty = new Map(outOfStockQty);
    nextQty.set(rowKey, clamped);
    setOutOfStockQty(nextQty);
    const nextDrafts = new Map(qtyDrafts);
    nextDrafts.set(rowKey, String(clamped));
    setQtyDrafts(nextDrafts);
  };

  const handleSubmitPicking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !scannedOrderId) return;

    setLoading(true);

    try {
      const flatRows = pickGroups.flatMap(g => g.rows);
      const flaggedRows = flatRows.filter(r => outOfStockQty.has(r.key));
      const hasIssues = flaggedRows.length > 0;
      const newStatus = hasIssues ? 'Picked (with issue)' : 'Picked';

      const { error: orderError } = await supabase
        .from('orders')
        .update({ status: newStatus })
        .eq('id', scannedOrderId);

      if (orderError) throw orderError;

      const userName = userProfile ? `${userProfile.firstName} ${userProfile.lastName}`.trim() : 'Unknown Staff';

      await resolveOpenOrderIssues(supabase, scannedOrderId, userName, !hasIssues);

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
        const missingQtyFor = (r: PickRow) => outOfStockQty.get(r.key) ?? r.quantity;

        const issuesToInsert = flaggedRows.map(r => ({
          order_id: scannedOrderId,
          product_id: r.productId,
          status: 'open',
          reported_by_name: userName,
          out_of_stock_qty: missingQtyFor(r)
        }));

        const procurementRequests = flaggedRows.map(r => ({
          productId: r.productId,
          requestedQty: missingQtyFor(r),
          orderId: scannedOrderId
        }));

        const { data: insertedIssues, error: issuesErr } = await supabase
          .from('order_issues')
          .insert(issuesToInsert)
          .select('id');

        if (issuesErr) console.error("Error inserting order issues:", issuesErr);

        if (insertedIssues && insertedIssues.length > 0) {
          const initialMessages = insertedIssues.map((issue, idx) => {
            const r = flaggedRows[idx];
            const missingQty = missingQtyFor(r);
            const qtyNote = missingQty < r.quantity
              ? ` (${missingQty} of ${r.quantity} units)`
              : '';
            const label = r.isComponent
              ? `${r.productName} (part of set ${r.setName})`
              : r.productName;
            return {
              issue_id: issue.id,
              sender_role: 'picker',
              sender_name: userName,
              message: `Picker reported ${label} as out of stock${qtyNote}.`
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

        const hasWholeItemShortage = flaggedRows.some(r => !r.isComponent);
        if (hasWholeItemShortage && orderDetails?.sales_person_name) {
          await supabase.from('notifications').insert({
            sales_person_name: orderDetails.sales_person_name,
            title: 'Order Issue Reported',
            message: `Order #${scannedOrderId.substring(0, 7).toUpperCase()} has out-of-stock items reported by ${userName}.`,
            link: '/dashboard'
          });
        }
      }

      toast({
        title: 'Success!',
        description: `Order marked as ${newStatus}.`,
        variant: 'default'
      });

      setScannedOrderId(null);
      resetData();

    } catch (err) {
      console.error(err);
      toast({ title: 'Error', description: 'Failed to submit picking result.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return {
    orderDetails,
    orderItems,
    pickGroups,
    outOfStockQty,
    qtyDrafts,
    loading,
    viewingPhotoItem,
    setViewingPhotoItem,
    handleScanSuccess,
    toggleOutOfStock,
    handleQtyDraftChange,
    commitOutOfStockQty,
    handleSubmitPicking
  };
}
