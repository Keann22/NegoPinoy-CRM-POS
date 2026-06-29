'use client';

import { useState, useRef, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Upload, Truck, AlertCircle, CheckCircle2, ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useSupabase } from '@/lib/supabase/hooks';
import ExcelJS from 'exceljs';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type SyncCategory = 'success' | 'already_updated' | 'partial_match' | 'not_found' | 'error';

type SyncResult = {
  orderId: string;
  trackingNumber: string;
  originalStatus: string;
  newStatus: string;
  category: SyncCategory;
  message: string;
};

export default function CourierSyncPage() {
  const router = useRouter();
  const supabase = useSupabase();
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SyncResult[] | null>(null);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { userProfile } = useUserProfile();

  const canSyncCourier = useMemo(() => {
    return userProfile?.roles?.some(r => ['Admin', 'Owner', 'Inventory'].includes(r));
  }, [userProfile]);

  const mapCourierStatus = (rawStatus: string): string => {
    const s = rawStatus.toLowerCase().trim();
    if (s.includes('transit') || s === 'shipped') return 'Shipped';
    if (s.includes('deliver') || s.includes('complet') || s.includes('success')) return 'Completed';
    if (s.includes('return') || s.includes('rts') || s.includes('cancel') || s.includes('fail')) return 'Returned';
    if (s.includes('pick') || s.includes('for pick-up')) return 'For Pick-up';
    if (s.includes('ship') || s.includes('pend')) return 'For Shipping';
    return ''; // Unknown
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !supabase) return;

    setLoading(true);
    setResults(null);
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await file.arrayBuffer());
      const worksheet = workbook.worksheets[0];

      let orderCol = -1;
      let trackingCol = -1;
      let statusCol = -1;
      let deliveryCol = -1;
      let headersFound = false;

      // Locate columns
      worksheet.eachRow((row, rowNumber) => {
        if (!headersFound) {
          row.eachCell((cell, colNumber) => {
            const val = cell.value?.toString().toLowerCase().trim() || '';
            
            if (orderCol === -1 && (val === 'order number' || val === 'customer reference no.' || val === 'order id' || val === 'reference no.')) {
              orderCol = colNumber;
            } else if (trackingCol === -1 && (val === 'tracking no.' || val === 'tracking number')) {
              trackingCol = colNumber;
            } else if (statusCol === -1 && (val === 'status' || val === 'tracking status' || val === 'delivery status' || val === 'courier status')) {
              statusCol = colNumber;
            } else if (deliveryCol === -1 && (val === 'delivery date' || val === 'date delivered' || val === 'completed time' || val === 'delivered date' || val === 'time of delivery')) {
              deliveryCol = colNumber;
            }
          });

          if (orderCol !== -1 && trackingCol !== -1 && statusCol !== -1) {
            headersFound = true;
          }
          return;
        }
      });

      if (!headersFound) {
        toast({
          variant: 'destructive',
          title: 'Invalid File Format',
          description: 'Could not find required columns: Order Number, Tracking Number, and Status.'
        });
        setLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      // Fetch all orders to match against
      const { data: allOrders, error: fetchError } = await supabase
        .from('orders')
        .select('id, status, tracking_number, payment_method, balance_due, next_due_date');

      if (fetchError) throw fetchError;

      const orderMap = new Map();
      allOrders?.forEach(o => {
        // Map by full UUID
        orderMap.set(o.id.toLowerCase(), o);
        // Map by short 8-char prefix
        const uuidPrefix = o.id.split('-')[0].toLowerCase();
        orderMap.set(uuidPrefix, o);
        orderMap.set(`order #${uuidPrefix}`, o);
        orderMap.set(`order#${uuidPrefix}`, o);
        
        // Map by short 7-char prefix (which is commonly used in the UI)
        const shortId = o.id.substring(0, 7).toLowerCase();
        orderMap.set(shortId, o);
        orderMap.set(`order #${shortId}`, o);
        orderMap.set(`order#${shortId}`, o);
      });

      const syncResults: SyncResult[] = [];
      const updatePromises: PromiseLike<any>[] = [];

      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1 || (!headersFound && rowNumber < 5)) return; // Skip headers

        const rawOrderId = row.getCell(orderCol).value?.toString().trim();
        const rawTracking = row.getCell(trackingCol).value?.toString().trim() || '';
        const rawStatus = row.getCell(statusCol).value?.toString().trim() || '';

        if (!rawOrderId) return; // Empty row

        const cleanOrderId = rawOrderId.replace(/-b\d+$/i, '').toLowerCase(); // handle -B1 splits
        const matchedOrder = orderMap.get(cleanOrderId) || orderMap.get(rawOrderId.toLowerCase());

        if (!matchedOrder) {
          // Check for partial match (e.g. matching by tracking number instead)
          const partialMatch = rawTracking ? allOrders?.find(o => o.tracking_number?.includes(rawTracking)) : null;
          
          if (partialMatch) {
              syncResults.push({
                orderId: rawOrderId,
                trackingNumber: rawTracking,
                originalStatus: 'N/A',
                newStatus: 'N/A',
                category: 'partial_match',
                message: `Order ID not found, but tracking number matches Order #${partialMatch.id.substring(0,7).toUpperCase()}`
              });
          } else {
              syncResults.push({
                orderId: rawOrderId,
                trackingNumber: rawTracking,
                originalStatus: 'N/A',
                newStatus: 'N/A',
                category: 'not_found',
                message: 'Failed to find matching order ID or tracking number.'
              });
          }
          return;
        }

        const systemStatus = mapCourierStatus(rawStatus);
        
        if (!systemStatus) {
            syncResults.push({
                orderId: rawOrderId,
                trackingNumber: rawTracking,
                originalStatus: matchedOrder.status,
                newStatus: rawStatus,
                category: 'error',
                message: `Unknown courier status: "${rawStatus}". Could not map to system status.`
            });
            return;
        }

        if (matchedOrder.status === 'Payment Received (COD)') {
            syncResults.push({
                orderId: matchedOrder.id.substring(0,7).toUpperCase(),
                trackingNumber: rawTracking,
                originalStatus: matchedOrder.status,
                newStatus: systemStatus,
                category: 'already_updated',
                message: 'Order is already marked as Payment Received (COD). Skipping update.'
            });
            return;
        }

        // Check if we need to update due date even if status hasn't changed
        const needsDueDateUpdate = (systemStatus === 'Completed' || matchedOrder.status === 'Completed') 
            && (matchedOrder.payment_method === 'Installment' || matchedOrder.payment_method === 'Lay-away') 
            && matchedOrder.balance_due > 0 
            && !matchedOrder.next_due_date;

        if (matchedOrder.status === systemStatus && !needsDueDateUpdate) {
            syncResults.push({
                orderId: matchedOrder.id.substring(0,7).toUpperCase(),
                trackingNumber: rawTracking,
                originalStatus: matchedOrder.status,
                newStatus: systemStatus,
                category: 'already_updated',
                message: 'Status is already up to date.'
            });
            return;
        }

        // Merge tracking numbers
        let newTracking = matchedOrder.tracking_number || '';
        if (rawTracking && !newTracking.includes(rawTracking)) {
            newTracking = newTracking ? `${newTracking}, ${rawTracking}` : rawTracking;
        }

        const updatePayload: any = {
            tracking_number: newTracking,
            status: systemStatus
        };

        if (['Shipped', 'Completed', 'Payment Received (COD)'].includes(systemStatus)) {
            updatePayload.completed_at = new Date().toISOString();
        }

        if (systemStatus === 'Completed' && (matchedOrder.payment_method === 'Installment' || matchedOrder.payment_method === 'Lay-away') && matchedOrder.balance_due > 0) {
            let deliveryDateStr = '';
            if (deliveryCol !== -1) {
                const cell = row.getCell(deliveryCol);
                if (cell.type === 4 && cell.value instanceof Date) {
                    deliveryDateStr = cell.value.toISOString();
                } else if (cell.value) {
                    const parsedDate = new Date(cell.value.toString());
                    if (!isNaN(parsedDate.getTime())) {
                        deliveryDateStr = parsedDate.toISOString();
                    }
                }
            }
            if (deliveryDateStr) {
                updatePayload.next_due_date = deliveryDateStr;
            }
        }

        const updatePromise = supabase
            .from('orders')
            .update(updatePayload)
            .eq('id', matchedOrder.id)
            .then(({ error }) => {
                if (error) {
                    syncResults.push({
                        orderId: matchedOrder.id.substring(0,7).toUpperCase(),
                        trackingNumber: newTracking,
                        originalStatus: matchedOrder.status,
                        newStatus: systemStatus,
                        category: 'error',
                        message: error.message
                    });
                } else {
                    syncResults.push({
                        orderId: matchedOrder.id.substring(0,7).toUpperCase(),
                        trackingNumber: newTracking,
                        originalStatus: matchedOrder.status,
                        newStatus: systemStatus,
                        category: 'success',
                        message: 'Updated successfully.'
                    });
                }
            });
            
        updatePromises.push(updatePromise);
      });

      await Promise.all(updatePromises);
      
      setResults(syncResults);
      
      const successes = syncResults.filter(r => r.category === 'success').length;
      const alreadyUpdated = syncResults.filter(r => r.category === 'already_updated').length;
      
      toast({
        title: 'Courier Sync Complete',
        description: `Successfully updated ${successes} records. ${alreadyUpdated} were already up to date.`,
      });

    } catch (err: any) {
      console.error('Error parsing courier sync file:', err);
      toast({
        variant: 'destructive',
        title: 'Sync Failed',
        description: err.message || 'An error occurred while processing the file.',
      });
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  if (!canSyncCourier) {
    return (
      <Card className="m-6 border-destructive/20 bg-destructive/5">
        <CardHeader>
          <CardTitle className="text-destructive">Access Denied</CardTitle>
          <CardDescription>You do not have permission to access Courier Sync.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const successes = results?.filter(r => r.category === 'success') || [];
  const alreadyUpdated = results?.filter(r => r.category === 'already_updated') || [];
  const partialMatches = results?.filter(r => r.category === 'partial_match') || [];
  const notFound = results?.filter(r => r.category === 'not_found') || [];
  const errors = results?.filter(r => r.category === 'error') || [];

  return (
    <div className="space-y-6">
      <Button variant="outline" onClick={() => router.push('/dashboard/orders')}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Orders
      </Button>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <CardTitle className="font-headline text-2xl flex items-center gap-2">
                <Truck className="h-6 w-6" />
                Courier Bulk Sync
              </CardTitle>
              <CardDescription>
                Upload an Excel file containing tracking numbers and statuses to bulk update your orders.
              </CardDescription>
            </div>
            <div>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept=".xlsx, .xls"
                className="hidden"
              />
              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <Upload className="mr-2 h-4 w-4" />
                {loading ? 'Processing...' : 'Upload Sync File'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!results ? (
            <div className="grid gap-6 md:grid-cols-3 mt-4">
              <Card className="bg-muted/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">1. Prepare File</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Ensure your Excel file has headers for <strong>Order Number</strong>, <strong>Tracking Number</strong>, and <strong>Status</strong>.
                  </p>
                </CardContent>
              </Card>
              <Card className="bg-muted/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">2. Upload File</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Click the green upload button and select your Excel sheet. The system will process it row by row.
                  </p>
                </CardContent>
              </Card>
              <Card className="bg-muted/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">3. Review Results</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    A report will be generated showing which orders successfully updated and which ones had errors.
                  </p>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Tabs defaultValue={successes.length > 0 ? "success" : "already_updated"} className="w-full mt-4">
              <TabsList className="grid w-full grid-cols-2 md:grid-cols-5 h-auto mb-6">
                <TabsTrigger value="success" className="py-2 data-[state=active]:bg-emerald-100 data-[state=active]:text-emerald-700">
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Successful ({successes.length})
                </TabsTrigger>
                <TabsTrigger value="already_updated" className="py-2">
                  Already Updated ({alreadyUpdated.length})
                </TabsTrigger>
                <TabsTrigger value="partial_match" className="py-2 data-[state=active]:bg-yellow-100 data-[state=active]:text-yellow-700">
                  <AlertCircle className="h-4 w-4 mr-2" />
                  Partial Match ({partialMatches.length})
                </TabsTrigger>
                <TabsTrigger value="not_found" className="py-2 data-[state=active]:bg-destructive/20 data-[state=active]:text-destructive">
                  Not Found ({notFound.length})
                </TabsTrigger>
                <TabsTrigger value="errors" className="py-2 data-[state=active]:bg-destructive/20 data-[state=active]:text-destructive">
                  Errors ({errors.length})
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="success">
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order ID</TableHead>
                        <TableHead>Tracking</TableHead>
                        <TableHead>Previous Status</TableHead>
                        <TableHead>New Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {successes.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                            No successful updates.
                          </TableCell>
                        </TableRow>
                      ) : (
                        successes.map((res, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-medium font-mono">{res.orderId}</TableCell>
                            <TableCell>{res.trackingNumber}</TableCell>
                            <TableCell><Badge variant="secondary">{res.originalStatus}</Badge></TableCell>
                            <TableCell><Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">{res.newStatus}</Badge></TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              <TabsContent value="already_updated">
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order ID</TableHead>
                        <TableHead>Tracking</TableHead>
                        <TableHead>Current Status</TableHead>
                        <TableHead>Message</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {alreadyUpdated.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                            No already updated orders found.
                          </TableCell>
                        </TableRow>
                      ) : (
                        alreadyUpdated.map((res, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-medium font-mono">{res.orderId}</TableCell>
                            <TableCell>{res.trackingNumber}</TableCell>
                            <TableCell><Badge variant="outline">{res.originalStatus}</Badge></TableCell>
                            <TableCell className="text-muted-foreground">{res.message}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
              
              <TabsContent value="partial_match">
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Excel Order ID</TableHead>
                        <TableHead>Tracking</TableHead>
                        <TableHead>Match Details</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {partialMatches.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                            No partial matches found.
                          </TableCell>
                        </TableRow>
                      ) : (
                        partialMatches.map((res, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-medium font-mono text-muted-foreground">{res.orderId}</TableCell>
                            <TableCell>{res.trackingNumber}</TableCell>
                            <TableCell className="text-yellow-600 font-medium">{res.message}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              <TabsContent value="not_found">
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order ID</TableHead>
                        <TableHead>Tracking</TableHead>
                        <TableHead>Error Message</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {notFound.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                            No missing orders found. Great job!
                          </TableCell>
                        </TableRow>
                      ) : (
                        notFound.map((res, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-medium font-mono">{res.orderId}</TableCell>
                            <TableCell>{res.trackingNumber}</TableCell>
                            <TableCell className="text-destructive">{res.message}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              <TabsContent value="errors">
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order ID</TableHead>
                        <TableHead>Tracking</TableHead>
                        <TableHead>Error Message</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {errors.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                            No processing errors found.
                          </TableCell>
                        </TableRow>
                      ) : (
                        errors.map((res, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-medium font-mono">{res.orderId}</TableCell>
                            <TableCell>{res.trackingNumber}</TableCell>
                            <TableCell className="text-destructive">{res.message}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
