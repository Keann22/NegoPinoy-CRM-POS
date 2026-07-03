'use client';

import { useState, useEffect } from 'react';
import { useSupabase } from '@/lib/supabase/hooks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Loader2, Package, ScanLine, X, Check, Plus, Trash2, AlertTriangle, AlertCircle } from 'lucide-react';
import { useUserProfile } from '@/hooks/useUserProfile';

type OrderItem = {
  id: string;
  product_name: string;
  quantity: number;
};

type BoxData = {
  id: string;
  name: string;
  length: string;
  width: string;
  height: string;
  weight: string;
  items: Record<string, number>; // itemId -> qty in this box
};

export default function PackerApp() {
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
        (error) => {
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

      // Initialize Box 1
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

      // Check if order is On-Hold
      if (data.status === 'On-Hold') {
        newWarnings.push('This order is ON-HOLD. Do not pack unless resolved.');
      }

      // Check if order was edited since picked by comparing item snapshot
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
    // Move items from removed box back to box 1
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
    // Prevent negative quantities
    if (newQty < 0) return;

    // Find the total quantity required for this item
    const itemTotal = orderItems.find(i => i.id === itemId)?.quantity || 0;

    // Calculate how much is currently assigned to OTHER boxes
    let qtyInOtherBoxes = 0;
    boxes.forEach(b => {
      if (b.id !== boxId) {
        qtyInOtherBoxes += (b.items[itemId] || 0);
      }
    });

    // The new quantity cannot exceed what's remaining
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
    
    // Validate that ALL items are fully assigned to boxes
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

    // Validate that all boxes have dimensions and weight
    for (const box of boxes) {
      if (!box.length || !box.width || !box.height || !box.weight) {
        toast({ variant: 'destructive', title: 'Missing dimensions', description: `Please fill in all dimensions and weight for ${box.name}.` });
        return;
      }
    }

    setLoading(true);

    try {
      // Build boxes_config JSON
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
          // We can leave package_* null or set to first box for legacy support
          package_length: Number(boxes[0].length) || null,
          package_width: Number(boxes[0].width) || null,
          package_height: Number(boxes[0].height) || null,
          package_weight: Number(boxes[0].weight) || null,
        })
        .eq('id', scannedOrderId);

      if (error) throw error;

      // Packing confirms every item was physically available, so any
      // out-of-stock issue reported earlier for this order is resolved by now.
      await supabase
        .from('order_issues')
        .update({ status: 'resolved' })
        .eq('order_id', scannedOrderId)
        .eq('status', 'open');

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

  return (
    <div className="flex flex-col h-full max-w-2xl mx-auto p-4 space-y-4">
      <div className="text-center mb-4">
        <h1 className="text-2xl font-bold font-headline flex items-center justify-center gap-2">
          <Package className="h-6 w-6 text-primary" />
          Packer App
        </h1>
        <p className="text-muted-foreground text-sm">Scan packing slips to process orders.</p>
      </div>

      {!scanning && !scannedOrderId && (
        <Card className="shadow-md border-primary/20 max-w-md mx-auto w-full">
          <CardContent className="flex flex-col items-center justify-center p-8 space-y-4">
            <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center">
              <ScanLine className="h-12 w-12 text-primary" />
            </div>
            <Button size="lg" className="w-full text-lg h-14" onClick={startScanner}>
              Tap to Scan Order
            </Button>
          </CardContent>
        </Card>
      )}

      {scanning && (
        <Card className="max-w-md mx-auto w-full">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle>Scanning...</CardTitle>
            <Button variant="ghost" size="icon" onClick={stopScanner}><X className="h-4 w-4" /></Button>
          </CardHeader>
          <CardContent>
            <div id="reader" className="w-full rounded overflow-hidden"></div>
            <p className="text-center text-sm text-muted-foreground mt-4">Point your camera at the QR code on the packing slip.</p>
          </CardContent>
        </Card>
      )}

      {loading && !orderDetails && (
        <div className="flex justify-center p-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {scannedOrderId && orderDetails && (
        <Card className="border-primary/50 shadow-lg w-full">
          <CardHeader className="bg-primary/5 pb-4">
            <CardTitle className="flex justify-between items-center">
              <span>Order #{scannedOrderId.substring(0, 7).toUpperCase()}</span>
              <Badge variant={orderDetails.status === 'Packed' ? 'secondary' : 'default'}>
                {orderDetails.status}
              </Badge>
            </CardTitle>
            <CardDescription className="text-base text-foreground font-medium">
              {orderDetails.customers?.full_name || 'Unknown Customer'}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            
            {warnings.length > 0 && (
              <div className="mb-6 space-y-3">
                {warnings.map((warn, idx) => (
                  <div key={idx} className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-md flex items-start gap-3">
                    <AlertTriangle className="h-6 w-6 shrink-0 text-amber-500 mt-0.5" />
                    <div>
                      <p className="font-bold text-amber-900">Attention Required</p>
                      <p className="text-sm mt-1">{warn}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <form onSubmit={handlePackOrder} className="space-y-6">
              
              <div className="space-y-4">
                <div className="flex justify-between items-center border-b pb-2">
                  <h3 className="font-semibold text-lg text-slate-800">Box Configuration</h3>
                  <Button type="button" variant="outline" size="sm" onClick={handleAddBox}>
                    <Plus className="h-4 w-4 mr-1" /> Add Box
                  </Button>
                </div>

                {/* Items Allocation Table */}
                <div className="border rounded-md overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 border-b">
                      <tr>
                        <th className="text-left p-3 font-medium text-muted-foreground w-1/3">Item Name</th>
                        <th className="text-center p-3 font-medium text-muted-foreground w-16">Total</th>
                        {boxes.map(box => (
                          <th key={box.id} className="text-center p-3 font-medium text-muted-foreground">
                            {box.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {orderItems.map(item => {
                        let assignedQty = 0;
                        boxes.forEach(b => { assignedQty += (b.items[item.id] || 0); });
                        const isFullyAssigned = assignedQty === item.quantity;

                        return (
                          <tr key={item.id} className="border-b last:border-0">
                            <td className="p-3">
                              <span className="font-medium text-slate-800">{item.product_name}</span>
                            </td>
                            <td className="p-3 text-center">
                              <span className={`font-bold ${isFullyAssigned ? 'text-emerald-600' : 'text-red-500'}`}>
                                {assignedQty}/{item.quantity}
                              </span>
                            </td>
                            {boxes.map(box => (
                              <td key={box.id} className="p-2 text-center">
                                <Input 
                                  type="number" 
                                  min="0"
                                  className="w-16 h-8 text-center mx-auto"
                                  value={box.items[item.id] || 0}
                                  onChange={(e) => handleItemQtyChange(box.id, item.id, parseInt(e.target.value) || 0)}
                                />
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Box Dimensions Inputs */}
                <div className="space-y-4 mt-6">
                  {boxes.map((box, index) => (
                    <div key={box.id} className="bg-slate-50 border p-4 rounded-lg relative">
                      {boxes.length > 1 && (
                        <Button 
                          type="button" 
                          variant="ghost" 
                          size="icon" 
                          className="absolute right-2 top-2 text-red-500 hover:bg-red-50 hover:text-red-600"
                          onClick={() => handleRemoveBox(box.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                      
                      <h4 className="font-bold text-slate-700 mb-3">{box.name} Dimensions & Weight</h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Length (cm)</Label>
                          <Input type="number" step="0.1" value={box.length} onChange={e => handleBoxDimensionChange(box.id, 'length', e.target.value)} required />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Width (cm)</Label>
                          <Input type="number" step="0.1" value={box.width} onChange={e => handleBoxDimensionChange(box.id, 'width', e.target.value)} required />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Height (cm)</Label>
                          <Input type="number" step="0.1" value={box.height} onChange={e => handleBoxDimensionChange(box.id, 'height', e.target.value)} required />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Weight (kg)</Label>
                          <Input type="number" step="0.01" value={box.weight} onChange={e => handleBoxDimensionChange(box.id, 'weight', e.target.value)} required />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

              </div>

              {orderDetails?.status?.includes('issue') && (
                <div className="bg-destructive/10 text-destructive border border-destructive/20 rounded-md p-4 space-y-2 mb-4">
                  <div className="font-semibold flex items-center gap-2"><AlertCircle className="w-5 h-5"/> Unresolved Issue</div>
                  <p className="text-sm">This order has an open issue. Please resolve it on the dashboard before submitting verification.</p>
                </div>
              )}

              <div className="pt-6 flex gap-3 border-t mt-6">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setScannedOrderId(null)}>
                  Cancel
                </Button>
                <Button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white" disabled={loading || orderDetails?.status === 'On-Hold' || orderDetails?.status?.includes('issue')}>
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Package className="mr-2 h-4 w-4" />}
                  Confirm Packed
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
