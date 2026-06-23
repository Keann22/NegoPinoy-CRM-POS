'use client';

import { useState, useEffect } from 'react';
import { useSupabase } from '@/lib/supabase/hooks';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Loader2, ClipboardList, ScanLine, X, Check, AlertCircle } from 'lucide-react';
import { useUserProfile } from '@/hooks/useUserProfile';
import { Checkbox } from '@/components/ui/checkbox';

type OrderItem = {
  id: string;
  product_id: string;
  product_name: string;
  quantity: number;
};

export default function PickerApp() {
  const supabase = useSupabase();
  const { toast } = useToast();
  const { userProfile } = useUserProfile();
  const [scanner, setScanner] = useState<any>(null);
  const [scanning, setScanning] = useState(false);
  const [scannedOrderId, setScannedOrderId] = useState<string | null>(null);
  const [orderDetails, setOrderDetails] = useState<any>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [outOfStockItems, setOutOfStockItems] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const startScanner = async () => {
    setScanning(true);
    setScannedOrderId(null);
    setOrderDetails(null);
    setOrderItems([]);
    setOutOfStockItems(new Set());

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
        .select('id, status, customer_id, sales_person_name, customers(full_name), order_items(id, product_id, product_name, quantity)')
        .eq('id', orderId)
        .single();
        
      if (error) throw error;
      
      if (!data) {
        toast({ title: 'Order not found', description: 'Invalid QR code.', variant: 'destructive' });
        setScannedOrderId(null);
        return;
      }

      setOrderDetails(data);
      setOrderItems(data.order_items || []);

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

  const toggleOutOfStock = (itemId: string) => {
    const nextSet = new Set(outOfStockItems);
    if (nextSet.has(itemId)) {
      nextSet.delete(itemId);
    } else {
      nextSet.add(itemId);
    }
    setOutOfStockItems(nextSet);
  };

  const handleSubmitPicking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !scannedOrderId) return;
    
    setLoading(true);

    try {
      const hasIssues = outOfStockItems.size > 0;
      const newStatus = hasIssues ? 'Picked (with issue)' : 'Picked';

      // 1. Update order status
      const { error: orderError } = await supabase
        .from('orders')
        .update({ status: newStatus })
        .eq('id', scannedOrderId);

      if (orderError) throw orderError;

      const userName = userProfile ? `${userProfile.firstName} ${userProfile.lastName}`.trim() : 'Unknown Staff';

      // 2. Insert into order_logs with item snapshot
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

      // 3. Handle Issues if any
      if (hasIssues) {
        const issuesToInsert = [];
        const procurementRequests = [];

        for (const itemId of Array.from(outOfStockItems)) {
          const item = orderItems.find(i => i.id === itemId);
          if (item) {
            issuesToInsert.push({
              order_id: scannedOrderId,
              product_id: item.product_id,
              status: 'open',
              reported_by_name: userName
            });
            procurementRequests.push({
              productId: item.product_id,
              requestedQty: item.quantity
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
              return {
                issue_id: issue.id,
                sender_role: 'picker',
                sender_name: userName,
                message: `Picker reported ${productName} as out of stock.`
              };
            });
            
            const { error: msgErr } = await supabase
              .from('order_issue_messages')
              .insert(initialMessages);
              
            if (msgErr) console.error("Error inserting issue messages:", msgErr);
          }

          // Auto-submit to procurement
          await fetch('/api/inventory/procurement-request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ requests: procurementRequests })
          });

          // Notify Sales Agent
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
      setOutOfStockItems(new Set());

    } catch (err) {
      console.error(err);
      toast({ title: 'Error', description: 'Failed to submit picking result.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full max-w-2xl mx-auto p-4 space-y-4">
      <div className="text-center mb-4">
        <h1 className="text-2xl font-bold font-headline flex items-center justify-center gap-2">
          <ClipboardList className="h-6 w-6 text-primary" />
          Picker App
        </h1>
        <p className="text-muted-foreground text-sm">Scan order QR to pick items.</p>
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
            <p className="text-center text-sm text-muted-foreground mt-4">Point your camera at the unified QR code on the order slip.</p>
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
              <Badge variant={orderDetails.status.includes('issue') ? 'destructive' : 'default'}>
                {orderDetails.status}
              </Badge>
            </CardTitle>
            <CardDescription className="text-base text-foreground font-medium">
              {orderDetails.customers?.full_name || 'Unknown Customer'}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmitPicking} className="space-y-6">
              
              <div className="space-y-4">
                <div className="flex justify-between items-center border-b pb-2">
                  <h3 className="font-semibold text-lg text-slate-800">Order Items</h3>
                </div>

                <div className="border rounded-md overflow-hidden">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-muted/50 border-b">
                      <tr>
                        <th className="p-3 font-medium text-muted-foreground">Item Name</th>
                        <th className="p-3 font-medium text-muted-foreground text-center">Qty</th>
                        <th className="p-3 font-medium text-muted-foreground text-center">Out of Stock</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orderItems.map(item => (
                        <tr key={item.id} className={`border-b last:border-0 ${outOfStockItems.has(item.id) ? 'bg-red-50' : ''}`}>
                          <td className="p-3">
                            <span className="font-medium text-slate-800">{item.product_name}</span>
                          </td>
                          <td className="p-3 text-center">
                            <span className="font-bold">{item.quantity}</span>
                          </td>
                          <td className="p-3 text-center">
                            <Checkbox 
                              checked={outOfStockItems.has(item.id)}
                              onCheckedChange={() => toggleOutOfStock(item.id)}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {outOfStockItems.size > 0 && (
                <div className="bg-red-50 text-red-800 p-3 rounded-md flex items-start gap-2 text-sm">
                  <AlertCircle className="h-5 w-5 shrink-0 text-red-500 mt-0.5" />
                  <p>
                    <strong>Warning:</strong> You have marked some items as out of stock. Submitting will flag this order with an issue, notify the sales agent, and automatically request procurement for these items.
                  </p>
                </div>
              )}

              <div className="pt-4 flex gap-3 border-t mt-6">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setScannedOrderId(null)}>
                  Cancel
                </Button>
                <Button type="submit" className="flex-1" variant={outOfStockItems.size > 0 ? "destructive" : "default"} disabled={loading}>
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                  Submit Picking
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
