'use client';

import { useState, useEffect } from 'react';
import { useSupabase } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Loader2, Package, ScanLine, X, Check } from 'lucide-react';

export default function PackerApp() {
  const supabase = useSupabase();
  const { toast } = useToast();
  const [scanner, setScanner] = useState<any>(null);
  const [scanning, setScanning] = useState(false);
  const [scannedOrderId, setScannedOrderId] = useState<string | null>(null);
  const [orderDetails, setOrderDetails] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // Form State
  const [length, setLength] = useState('');
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');

  const startScanner = async () => {
    setScanning(true);
    setScannedOrderId(null);
    setOrderDetails(null);
    setLength('');
    setWidth('');
    setHeight('');
    setWeight('');

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
        .select('id, status, customer_id, customers(full_name)')
        .eq('id', orderId)
        .single();
        
      if (error) throw error;
      
      if (!data) {
        toast({ title: 'Order not found', description: 'Invalid QR code.', variant: 'destructive' });
        setScannedOrderId(null);
        return;
      }

      setOrderDetails(data);

      if (data.status === 'Packed') {
        toast({ title: 'Already Packed', description: 'This order is already marked as packed.', variant: 'default' });
      }

    } catch (err) {
      console.error(err);
      toast({ title: 'Error', description: 'Failed to fetch order details.', variant: 'destructive' });
      setScannedOrderId(null);
    } finally {
      setLoading(false);
    }
  };

  const handlePackOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !scannedOrderId) return;
    setLoading(true);

    try {
      const { error } = await supabase
        .from('orders')
        .update({
          status: 'Packed',
          package_length: Number(length) || null,
          package_width: Number(width) || null,
          package_height: Number(height) || null,
          package_weight: Number(weight) || null,
        })
        .eq('id', scannedOrderId);

      if (error) throw error;

      toast({
        title: 'Success!',
        description: 'Order has been marked as packed.',
        variant: 'default'
      });

      setScannedOrderId(null);
      setOrderDetails(null);
      setLength('');
      setWidth('');
      setHeight('');
      setWeight('');

    } catch (err) {
      console.error(err);
      toast({ title: 'Error', description: 'Failed to update order.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full max-w-md mx-auto p-4 space-y-4">
      <div className="text-center mb-4">
        <h1 className="text-2xl font-bold font-headline flex items-center justify-center gap-2">
          <Package className="h-6 w-6 text-primary" />
          Packer App
        </h1>
        <p className="text-muted-foreground text-sm">Scan packing slips to process orders.</p>
      </div>

      {!scanning && !scannedOrderId && (
        <Card className="shadow-md border-primary/20">
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
        <Card>
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
        <Card className="border-primary/50 shadow-lg">
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
            <form onSubmit={handlePackOrder} className="space-y-4">
              
              <div className="bg-muted/50 p-4 rounded-lg space-y-3 mb-6">
                <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Package Dimensions (cm)</h3>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="length">Length</Label>
                    <Input id="length" type="number" step="0.1" value={length} onChange={e => setLength(e.target.value)} placeholder="0" required />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="width">Width</Label>
                    <Input id="width" type="number" step="0.1" value={width} onChange={e => setWidth(e.target.value)} placeholder="0" required />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="height">Height</Label>
                    <Input id="height" type="number" step="0.1" value={height} onChange={e => setHeight(e.target.value)} placeholder="0" required />
                  </div>
                </div>
              </div>

              <div className="bg-muted/50 p-4 rounded-lg space-y-3">
                <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Package Weight</h3>
                <div className="space-y-1">
                  <Label htmlFor="weight">Actual Weight (kg)</Label>
                  <Input id="weight" type="number" step="0.01" value={weight} onChange={e => setWeight(e.target.value)} placeholder="0.00" required />
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setScannedOrderId(null)}>
                  Cancel
                </Button>
                <Button type="submit" className="flex-1" disabled={loading}>
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
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
