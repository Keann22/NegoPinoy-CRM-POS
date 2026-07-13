import { useState, useEffect } from 'react';
import { useSupabase } from '@/lib/supabase/hooks';
import { useToast } from '@/hooks/use-toast';
import { useUserProfile } from '@/hooks/useUserProfile';
import { resolveOpenOrderIssues } from '@/lib/services/order-issues-service';

export type OrderItem = {
  id: string;
  product_name: string;
  quantity: number;
};

export type BoxData = {
  id: string;
  name: string;
  length: string;
  width: string;
  height: string;
  weight: string;
  items: Record<string, number>; // itemId -> qty in this box
};

export function usePacker() {
  const supabase = useSupabase();
  const { toast } = useToast();
  const [scanner, setScanner] = useState<any>(null);
  const [scanning, setScanning] = useState(false);
  const [scannedOrderId, setScannedOrderId] = useState<string | null>(null);
  const [orderDetails, setOrderDetails] = useState<any>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const { userProfile } = useUserProfile();

  const [boxes, setBoxes] = useState<BoxData[]>([]);

  const startScanner = async () => {
    setScanning(true);
    setScannedOrderId(null);
    setOrderDetails(null);
    setOrderItems([]);
    setBoxes([]);
    setWarnings([]);

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
        .select('id, status, customer_id, sales_person_name, customers(full_name), order_items(id, product_name, quantity, product_id)')
        .eq('id', orderId)
        .single();
        
      if (error) throw error;
      
      if (!data) {
        toast({ title: 'Order not found', description: 'Invalid QR code.', variant: 'destructive' });
        setScannedOrderId(null);
        return;
      }

      setOrderDetails(data);
      const items = data.order_items || [];
      setOrderItems(items);

      const initialItems: Record<string, number> = {};
      items.forEach((item: any) => {
        initialItems[item.id] = item.quantity;
      });

      setBoxes([
        {
          id: 'box-1',
          name: 'Box 1',
          length: '',
          width: '',
          height: '',
          weight: '',
          items: initialItems
        }
      ]);

      const newWarnings: string[] = [];

      if (data.status === 'On-Hold') {
        newWarnings.push('This order is ON-HOLD. Do not pack unless resolved.');
      }

      const { data: pickLog } = await supabase
        .from('order_logs')
        .select('snapshot_data')
        .eq('order_id', orderId)
        .in('status', ['Picked', 'Picked (with issue)'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (pickLog?.snapshot_data?.items) {
        const pickedItems: { product_name: string; quantity: number; product_id: string }[] = pickLog.snapshot_data.items;
        const currentItems = data.order_items || [];

        const pickedMap = new Map<string, { name: string; qty: number }>();
        for (const item of pickedItems) {
          pickedMap.set(item.product_id, { name: item.product_name, qty: item.quantity });
        }
        const currentMap = new Map<string, { name: string; qty: number }>();
        for (const item of currentItems) {
          currentMap.set(item.product_id, { name: item.product_name, qty: item.quantity });
        }

        const changes: string[] = [];

        for (const [pid, cur] of Array.from(currentMap.entries())) {
          const picked = pickedMap.get(pid);
          if (!picked) {
            changes.push(`ADDED: ${cur.name} (×${cur.qty})`);
          } else if (cur.qty > picked.qty) {
            changes.push(`INCREASED: ${cur.name} (${picked.qty} → ${cur.qty})`);
          }
        }

        for (const [pid, picked] of Array.from(pickedMap.entries())) {
          const cur = currentMap.get(pid);
          if (!cur) {
            changes.push(`REMOVED: ${picked.name} (was ×${picked.qty})`);
          } else if (cur.qty < picked.qty) {
            changes.push(`DECREASED: ${cur.name} (${picked.qty} → ${cur.qty})`);
          }
        }

        if (changes.length > 0) {
          newWarnings.push(`This order was EDITED after picking. Changes detected:\n${changes.join('\n')}`);
        }
      }

      setWarnings(newWarnings);

      if (['Packed', 'For Shipping', 'For Pick-up'].includes(data.status)) {
        toast({ 
          title: 'Already Processed', 
          description: `This order is already marked as ${data.status} and cannot be packed again.`, 
          variant: 'destructive' 
        });
        setScannedOrderId(null);
        return;
      }

    } catch (err) {
      console.error(err);
      toast({ title: 'Error', description: 'Failed to fetch order details.', variant: 'destructive' });
      setScannedOrderId(null);
    } finally {
      setLoading(false);
    }
  };

  const handleAddBox = () => {
    const newBoxId = `box-${boxes.length + 1}`;
    setBoxes([...boxes, {
      id: newBoxId,
      name: `Box ${boxes.length + 1}`,
      length: '', width: '', height: '', weight: '',
      items: {}
    }]);
  };

  const handleRemoveBox = (boxId: string) => {
    if (boxes.length <= 1) return;
    const boxToRemove = boxes.find(b => b.id === boxId);
    const newBoxes = boxes.filter(b => b.id !== boxId);
    
    if (boxToRemove) {
      Object.entries(boxToRemove.items).forEach(([itemId, qty]) => {
        if (qty > 0) {
          newBoxes[0].items[itemId] = (newBoxes[0].items[itemId] || 0) + qty;
        }
      });
    }
    setBoxes(newBoxes);
  };

  const handleItemQtyChange = (boxId: string, itemId: string, newQty: number) => {
    if (newQty < 0) return;

    const itemTotal = orderItems.find(i => i.id === itemId)?.quantity || 0;

    let qtyInOtherBoxes = 0;
    boxes.forEach(b => {
      if (b.id !== boxId) {
        qtyInOtherBoxes += (b.items[itemId] || 0);
      }
    });

    const maxAllowed = itemTotal - qtyInOtherBoxes;
    const finalQty = Math.min(newQty, maxAllowed);

    setBoxes(boxes.map(b => {
      if (b.id === boxId) {
        return {
          ...b,
          items: {
            ...b.items,
            [itemId]: finalQty
          }
        };
      }
      return b;
    }));
  };

  const handleBoxDimensionChange = (boxId: string, field: 'length' | 'width' | 'height' | 'weight', value: string) => {
    setBoxes(boxes.map(b => {
      if (b.id === boxId) {
        return { ...b, [field]: value };
      }
      return b;
    }));
  };

  const handlePackOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !scannedOrderId) return;
    
    if (orderDetails?.status === 'On-Hold' || orderDetails?.status?.includes('issue')) {
      toast({ title: 'Cannot Proceed', description: 'Please resolve the issue before packing.', variant: 'destructive' });
      return;
    }

    if (orderDetails?.status !== 'Photo') {
      toast({
        title: 'Second Check Required',
        description: `This order hasn't gone through Second Check (Photo) yet — current status: "${orderDetails?.status}". A checker must scan and verify it before it can be packed.`,
        variant: 'destructive'
      });
      return;
    }

    for (const item of orderItems) {
      let assignedQty = 0;
      boxes.forEach(b => {
        assignedQty += (b.items[item.id] || 0);
      });
      if (assignedQty !== item.quantity) {
        toast({ variant: 'destructive', title: 'Items unassigned', description: `You have not assigned all quantities of ${item.product_name} into a box.` });
        return;
      }
    }

    for (const box of boxes) {
      if (!box.length || !box.width || !box.height || !box.weight) {
        toast({ variant: 'destructive', title: 'Missing dimensions', description: `Please fill in all dimensions and weight for ${box.name}.` });
        return;
      }
    }

    setLoading(true);

    try {
      const boxesConfig = boxes.map(b => {
        const assignedItems = orderItems.map(oi => ({
          id: oi.id,
          product_name: oi.product_name,
          quantity: b.items[oi.id] || 0
        })).filter(oi => oi.quantity > 0);

        return {
          id: b.id,
          name: b.name,
          length: Number(b.length),
          width: Number(b.width),
          height: Number(b.height),
          weight: Number(b.weight),
          items: assignedItems
        };
      });

      const { error } = await supabase
        .from('orders')
        .update({
          status: 'Packed',
          packed_at: new Date().toISOString(),
          boxes_config: boxesConfig,
          package_length: Number(boxes[0].length) || null,
          package_width: Number(boxes[0].width) || null,
          package_height: Number(boxes[0].height) || null,
          package_weight: Number(boxes[0].weight) || null,
        })
        .eq('id', scannedOrderId);

      if (error) throw error;

      await resolveOpenOrderIssues(supabase, scannedOrderId);

      const userName = userProfile ? `${userProfile.firstName} ${userProfile.lastName}`.trim() : 'Unknown Staff';
      await supabase.from('order_logs').insert({
        order_id: scannedOrderId,
        status: 'Packed',
        user_name: userName
      });

      if (orderDetails?.sales_person_name) {
        await supabase.from('notifications').insert({
          sales_person_name: orderDetails.sales_person_name,
          title: 'Order Packed',
          message: `Order #${scannedOrderId.substring(0, 7).toUpperCase()} for ${orderDetails.customers?.full_name || 'Unknown'} has been packed and is ready for verification.`,
          link: '/dashboard/packed-orders'
        });
      }

      toast({
        title: 'Success!',
        description: 'Order has been marked as packed.',
        variant: 'default'
      });

      setScannedOrderId(null);
      setOrderDetails(null);
      setBoxes([]);

    } catch (err) {
      console.error(err);
      toast({ title: 'Error', description: 'Failed to update order.', variant: 'destructive' });
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
    loading,
    warnings,
    boxes,
    startScanner,
    stopScanner,
    handleAddBox,
    handleRemoveBox,
    handleItemQtyChange,
    handleBoxDimensionChange,
    handlePackOrder
  };
}
