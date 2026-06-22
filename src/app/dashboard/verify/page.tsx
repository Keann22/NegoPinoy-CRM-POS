'use client';

import { useState, useEffect } from 'react';
import { useSupabase } from '@/lib/supabase/hooks';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Loader2, ShieldCheck, ScanLine, X, Check, AlertTriangle, Info, AlertCircle } from 'lucide-react';
import { useUserProfile } from '@/hooks/useUserProfile';

type OrderItem = {
  id: string;
  product_id: string;
  product_name: string;
  quantity: number;
};

export default function VerifyApp() {
  const supabase = useSupabase();
  const { toast } = useToast();
  const { userProfile } = useUserProfile();
  const [scanner, setScanner] = useState<any>(null);
  const [scanning, setScanning] = useState(false);
  const [scannedOrderId, setScannedOrderId] = useState<string | null>(null);
  const [orderDetails, setOrderDetails] = useState<any>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);

  const startScanner = async () => {
    setScanning(true);
    setScannedOrderId(null);
    setOrderDetails(null);
    setOrderItems([]);
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
    setWarnings([]);
    
    try {
      // Fetch order details
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

      const newWarnings: string[] = [];

      // Check if order is On-Hold
      if (data.status === 'On-Hold') {
        newWarnings.push('This order is ON-HOLD. Do not proceed unless resolved.');
      }



      setWarnings(newWarnings);

      if (['Photo', 'Packed', 'For Shipping', 'For Pick-up'].includes(data.status)) {
        toast({ 
          title: 'Already Verified', 
          description: `This order is already marked as ${data.status}.`, 
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

  const handleConfirmCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !scannedOrderId) return;
    
    if (orderDetails?.status === 'On-Hold' || orderDetails?.status?.includes('issue')) {
      toast({ title: 'Cannot Proceed', description: 'Please resolve the issue before submitting.', variant: 'destructive' });
      return;
    }

    setLoading(true);

    try {
      const newStatus = 'Photo'; // Represents Second Check / Photo Stage

      // 1. Update order status
      const { error: orderError } = await supabase
        .from('orders')
        .update({ status: newStatus })
        .eq('id', scannedOrderId);

      if (orderError) throw orderError;

      const userName = userProfile ? `${userProfile.firstName} ${userProfile.lastName}`.trim() : 'Unknown Staff';

      // 2. Insert into order_logs
      await supabase.from('order_logs').insert({
        order_id: scannedOrderId,
        status: newStatus,
        user_name: userName
      });

      toast({
        title: 'Success!',
        description: `Order verified and marked as Second Check (Photo).`,
        variant: 'default'
      });

      setScannedOrderId(null);
      setOrderDetails(null);
      setWarnings([]);

    } catch (err) {
      console.error(err);
      toast({ title: 'Error', description: 'Failed to submit verification result.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full max-w-2xl mx-auto p-4 space-y-4">
      <div className="text-center mb-4">
        <h1 className="text-2xl font-bold font-headline flex items-center justify-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary" />
          Second Check (Verify)
        </h1>
        <p className="text-muted-foreground text-sm">Scan order QR to verify items before packing.</p>
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
              <Badge variant={orderDetails.status === 'On-Hold' ? 'destructive' : 'default'}>
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

            {!warnings.length && (
              <div className="mb-6 bg-emerald-50 border border-emerald-100 text-emerald-800 p-4 rounded-md flex items-center gap-3">
                <Check className="h-6 w-6 text-emerald-500" />
                <p className="text-sm font-medium">No recent changes detected since picking.</p>
              </div>
            )}

            <form onSubmit={handleConfirmCheck} className="space-y-6">
              
              <div className="space-y-4">
                <div className="flex justify-between items-center border-b pb-2">
                  <h3 className="font-semibold text-lg text-slate-800">Final Order Items Review</h3>
                </div>

                <div className="border rounded-md overflow-hidden">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-muted/50 border-b">
                      <tr>
                        <th className="p-3 font-medium text-muted-foreground">Item Name</th>
                        <th className="p-3 font-medium text-muted-foreground text-center w-24">Qty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orderItems.map(item => (
                        <tr key={item.id} className="border-b last:border-0">
                          <td className="p-3">
                            <span className="font-medium text-slate-800">{item.product_name}</span>
                          </td>
                          <td className="p-3 text-center">
                            <span className="font-bold text-lg">{item.quantity}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {orderDetails?.status?.includes('issue') && (
                <div className="bg-destructive/10 text-destructive border border-destructive/20 rounded-md p-4 space-y-2 mb-4">
                  <div className="font-semibold flex items-center gap-2"><AlertCircle className="w-5 h-5"/> Unresolved Issue</div>
                  <p className="text-sm">This order has an open issue. Please resolve it on the dashboard before submitting verification.</p>
                </div>
              )}

              <div className="pt-4 flex gap-3 border-t mt-6">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setScannedOrderId(null)}>
                  Cancel
                </Button>
                <Button type="submit" className="flex-1" disabled={loading || orderDetails?.status === 'On-Hold' || orderDetails?.status?.includes('issue')}>
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                  Confirm Checked (Photo)
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
