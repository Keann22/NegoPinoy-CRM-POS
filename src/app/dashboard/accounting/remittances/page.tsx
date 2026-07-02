'use client';

import { useState, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload, FileText, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useSupabase } from '@/lib/supabase/hooks';
import ExcelJS from 'exceljs';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useMemo } from 'react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from '@/components/ui/badge';
import { AlertCircle, ArrowLeft } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type RemittanceCategory = 'success' | 'already_paid' | 'not_found' | 'error';

type RemittanceResult = {
  trackingNumber: string;
  orderId?: string;
  codAmount: number;
  shippingFee: number;
  category: RemittanceCategory;
  message: string;
};

export default function SPXRemittancesPage() {
  const supabase = useSupabase();
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<RemittanceResult[] | null>(null);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { userProfile } = useUserProfile();
  const [activeTab, setActiveTab] = useState('success');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const isManagement = useMemo(() => {
    return userProfile?.roles?.some(r => ['Admin', 'Owner'].includes(r));
  }, [userProfile]);

  const handleRemittanceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !supabase) return;

    setLoading(true);
    setResults(null);
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await file.arrayBuffer());
      const worksheet = workbook.worksheets[0];

      // We need to collect COD amounts and Shipping Fees per tracking number
      const trackingData: Record<string, { cod: number, shippingFee: number, processingFee: number }> = {};

      let headersFound = false;
      let trackingCol = -1;
      let typeCol = -1;
      let amountCol = -1;

      worksheet.eachRow((row, rowNumber) => {
        if (!headersFound) {
          row.eachCell((cell, colNumber) => {
            const val = cell.value?.toString().toLowerCase().trim() || '';
            if (val === 'tracking number') trackingCol = colNumber;
            else if (val === 'transaction type') typeCol = colNumber;
            else if (val.includes('transaction amount')) amountCol = colNumber;
          });

          if (trackingCol !== -1 && typeCol !== -1 && amountCol !== -1) {
            headersFound = true;
          }
          return;
        }

        const trackingNo = row.getCell(trackingCol).value?.toString().trim();
        const type = row.getCell(typeCol).value?.toString().toLowerCase().trim() || '';
        const amount = parseFloat(row.getCell(amountCol).value?.toString().replace(/,/g, '') || '0');

        if (trackingNo && type) {
          if (!trackingData[trackingNo]) {
            trackingData[trackingNo] = { cod: 0, shippingFee: 0, processingFee: 0 };
          }
          if (type.includes('cod')) {
            trackingData[trackingNo].cod += amount;
          } else if (type.includes('shipping fee')) {
            trackingData[trackingNo].shippingFee += amount;
          } else if (amount < 0) {
            trackingData[trackingNo].processingFee += amount;
          }
        }
      });

      if (!headersFound || Object.keys(trackingData).length === 0) {
        toast({
          variant: 'destructive',
          title: 'Invalid File Format',
          description: 'Could not find the expected columns (Tracking Number, Transaction Type, Transaction Amount).'
        });
        setLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      // Fetch all orders that might match, including their payments to check for duplicates
      const { data: allOrders, error: fetchError } = await supabase
        .from('orders')
        .select('id, tracking_number, balance_due, amount_paid, status, total_amount, payment_method, installment_months, monthly_payment, payments(id, payment_method, amount)')
        .not('tracking_number', 'is', null);

      if (fetchError) throw fetchError;

      const syncResults: RemittanceResult[] = [];
      const processedTracking = new Set<string>();

      for (const order of allOrders || []) {
        if (!order.tracking_number) continue;

        // An order can have multiple tracking numbers split by comma, slash, or space
        const trackingList = order.tracking_number
          .split(/[\s,\/]+/)
          .map((t: string) => t.trim())
          .filter(Boolean);
        let totalCod = 0;
        let totalShippingFee = 0;
        let totalProcessingFee = 0;
        let matchedTrackingNos: string[] = [];
        let matched = false;

        for (const t of trackingList) {
          if (trackingData[t]) {
            // Determine how much COD should be applied to the order balance
            let balanceNeeded = 0;
            if (order.payment_method === 'Installment' || order.payment_method === 'Lay-away') {
              const expectedDownpayment = (order.total_amount || 0) - ((order.installment_months || 0) * (order.monthly_payment || 0));
              balanceNeeded = Math.max(0, expectedDownpayment - (order.amount_paid || 0));
            } else {
              balanceNeeded = Math.max(0, (order.balance_due || 0) - totalCod);
            }
            
            const availableCod = trackingData[t].cod;
            
            // If this is the last order or the only order, we might want to dump the excess COD here, 
            // but to be safe, we just take what we need unless the balance is 0 and we have excess.
            // Actually, we'll take up to balanceNeeded, and if there's still COD left, we leave it in trackingData[t] for the next matched order.
            // If balanceNeeded is 0 (already paid), we take 0.
            let codToApply = 0;
            if (balanceNeeded > 0) {
                codToApply = Math.min(balanceNeeded, availableCod);
            } else if (order.status !== 'Payment Received (COD)' && availableCod > 0) {
                // If it needs payment but balance is 0? That shouldn't happen.
                // Just in case, if it's the only order, we might overpay, but let's stick to balanceNeeded.
                codToApply = availableCod; // Take it all if we somehow don't know the balance
            }

            // Take all the shipping and processing fees on the first order that matches.
            // Do NOT add excessCod to shippingFee — the Excel file rows are already the source of truth.
            const shippingFeeToApply = trackingData[t].shippingFee;
            const processingFeeToApply = trackingData[t].processingFee;

            totalCod += codToApply;
            totalShippingFee += shippingFeeToApply;
            totalProcessingFee += processingFeeToApply;

            // Deduct what we took so the next order sharing this tracking gets the remainder
            trackingData[t].cod -= codToApply;
            trackingData[t].shippingFee = 0;
            trackingData[t].processingFee = 0;

            matchedTrackingNos.push(t);
            processedTracking.add(t);
            matched = true;
          }
        }

        if (matched) {
          const joinedTracking = matchedTrackingNos.join(', ');
          const shortOrderId = order.id.substring(0, 7).toUpperCase();

          // Check if already fully paid or if we should skip to prevent duplicate syncing
          // We look for an existing SPX COD Remittance payment for this order
          const hasSpxPayment = order.payments?.some((p: any) => p.payment_method === 'SPX COD Remittance');

          if (
            hasSpxPayment ||
            order.status === 'Payment Received (COD)'
          ) {
             syncResults.push({
               trackingNumber: joinedTracking,
               orderId: shortOrderId,
               codAmount: totalCod,
               shippingFee: totalShippingFee + totalProcessingFee,
               category: 'already_paid',
               message: 'Order COD has already been synced or is fully paid.'
             });
             continue;
          }

          if (totalCod > 0 || totalShippingFee !== 0 || totalProcessingFee !== 0) {
            try {
              // Update order and payments only if COD was actually collected
              if (totalCod > 0) {
                const newAmountPaid = (order.amount_paid || 0) + totalCod;
                const newBalanceDue = Math.max(0, (order.balance_due || 0) - totalCod);
                const { error: orderError } = await supabase
                  .from('orders')
                  .update({
                    amount_paid: newAmountPaid,
                    balance_due: newBalanceDue,
                    status: newBalanceDue <= 0 ? 'Payment Received (COD)' : order.status
                  })
                  .eq('id', order.id);

                if (orderError) throw orderError;

                // Insert payment
                const { error: paymentError } = await supabase
                  .from('payments')
                  .insert({
                    order_id: order.id,
                    amount: totalCod,
                    payment_date: new Date().toISOString(),
                    payment_method: 'SPX COD Remittance',
                    notes: `Auto-synced from SPX Remittance file`,
                    status: 'Verified'
                  });

                if (paymentError) throw paymentError;
              }

              // The Excel file already contains both the COD row (+) and the total deduction row (-)
              // which covers shipping fee + COD fee + valuation charge combined.
              // We ONLY add a hidden fee if the Excel had NO explicit negative charge row at all.
              let finalShippingFee = Math.abs(totalShippingFee);
              let finalProcessingFee = Math.abs(totalProcessingFee);
              
              // Only try to calculate the hidden fee if the Excel file provided NO deduction row
              // (i.e. processingFee and shippingFee from Excel were both zero)
              const excelHadNoDeductions = totalShippingFee === 0 && totalProcessingFee === 0;
              
              if (excelHadNoDeductions && totalCod > 0) {
                // The Excel file only had the positive COD row. No deduction rows were listed.
                // We know SPX charges approx 1.6% total (1% valuation + ~0.5% COD fee) as a hidden fee.
                // Calculate it as: expected collection amount minus the net remittance from SPX.
                let expectedCollectionAmount = 0;
                if (order.payment_method === 'Installment' || order.payment_method === 'Lay-away') {
                  const expectedDownpayment = (order.total_amount || 0) - ((order.installment_months || 0) * (order.monthly_payment || 0));
                  expectedCollectionAmount = Math.max(0, expectedDownpayment - (order.amount_paid || 0));
                } else {
                  expectedCollectionAmount = order.balance_due || 0;
                }
                
                if (expectedCollectionAmount > 0 && totalCod < expectedCollectionAmount) {
                  finalProcessingFee = expectedCollectionAmount - totalCod;
                }
              }


              // Insert explicit Shipping Fee
              if (finalShippingFee > 0) {
                const { error: shipError } = await supabase
                  .from('expenses')
                  .insert({
                    amount: finalShippingFee,
                    category: 'Shipping Fee',
                    expense_date: new Date().toISOString(),
                    description: `SPX Shipping Fee for Order #${shortOrderId}`
                  });
                if (shipError) throw shipError;
              }

              // Insert Processing/Courier Fee
              if (finalProcessingFee > 0) {
                const { error: procError } = await supabase
                  .from('expenses')
                  .insert({
                    amount: finalProcessingFee,
                    category: 'Processing Fee',
                    expense_date: new Date().toISOString(),
                    description: `SPX Courier Fee for Order #${shortOrderId}`
                  });
                if (procError) throw procError;
              }

              syncResults.push({
                trackingNumber: joinedTracking,
                orderId: shortOrderId,
                codAmount: totalCod,
                shippingFee: -(finalShippingFee + finalProcessingFee), // Store total deductions as negative for display consistency
                category: 'success',
                message: totalCod > 0 ? 'Payment verified and expenses recorded.' : 'Courier fee deducted for zero-COD order.'
              });

            } catch (err: any) {
              syncResults.push({
                trackingNumber: joinedTracking,
                orderId: shortOrderId,
                codAmount: totalCod,
                shippingFee: totalShippingFee,
                category: 'error',
                message: err.message || 'Database error occurred.'
              });
            }
          }
        }
      }

      // Check for any tracking numbers in the excel that weren't found in any order
      for (const t of Object.keys(trackingData)) {
        if (!processedTracking.has(t)) {
          syncResults.push({
            trackingNumber: t,
            codAmount: trackingData[t].cod,
            shippingFee: trackingData[t].shippingFee,
            category: 'not_found',
            message: 'Tracking number not found on any order in the database.'
          });
        }
      }

      setResults(syncResults);
      const successesCount = syncResults.filter(r => r.category === 'success').length;
      setActiveTab(successesCount > 0 ? 'success' : 'already_paid');
      setCurrentPage(1);

      const successes = syncResults.filter(r => r.category === 'success').length;
      toast({
        title: 'Remittance Synced',
        description: `Successfully processed ${successes} payments.`,
      });

    } catch (err: any) {
      console.error('Error processing remittance:', err);
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

  if (!isManagement) {
    return (
      <Card className="m-6 border-destructive/20 bg-destructive/5">
        <CardHeader>
          <CardTitle className="text-destructive">Access Denied</CardTitle>
          <CardDescription>You do not have permission to access SPX remittances.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const successes = results?.filter(r => r.category === 'success') || [];
  const alreadyPaid = results?.filter(r => r.category === 'already_paid') || [];
  const notFound = results?.filter(r => r.category === 'not_found') || [];
  const errors = results?.filter(r => r.category === 'error') || [];

  const getPaginated = (data: RemittanceResult[]) => data.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const paginatedSuccesses = getPaginated(successes);
  const paginatedAlreadyPaid = getPaginated(alreadyPaid);
  const paginatedNotFound = getPaginated(notFound);
  const paginatedErrors = getPaginated(errors);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <CardTitle className="font-headline text-2xl flex items-center gap-2">
                <FileText className="h-6 w-6" />
                SPX Remittances
              </CardTitle>
              <CardDescription>
                Upload your SPX financial transaction list to automatically sync COD payments, deduct courier fees, and update order statuses.
              </CardDescription>
            </div>
            <div>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleRemittanceUpload}
                accept=".xlsx, .xls"
                className="hidden"
              />
              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <Upload className="mr-2 h-4 w-4" />
                {loading ? 'Processing...' : 'Upload Remittance File'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!results ? (
            <div className="grid gap-6 md:grid-cols-3 mt-4">
              <Card className="bg-muted/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">1. Export from SPX</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Go to your Shopee Xpress or courier portal and download the "Account Transaction List" Excel file that contains your COD collections and shipping fees.
                  </p>
                </CardContent>
              </Card>
              <Card className="bg-muted/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">2. Upload File</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Click the green "Upload Remittance File" button above and select your downloaded Excel file.
                  </p>
                </CardContent>
              </Card>
              <Card className="bg-muted/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">3. Auto Sync</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    The system will automatically match tracking numbers, update customer balances to zero, log the COD payments, and record courier fees as expenses.
                  </p>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Tabs 
              value={activeTab} 
              onValueChange={(val) => { setActiveTab(val); setCurrentPage(1); }} 
              className="w-full mt-4"
            >
              <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 h-auto mb-6">
                <TabsTrigger value="success" className="py-2 data-[state=active]:bg-emerald-100 data-[state=active]:text-emerald-700">
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Processed ({successes.length})
                </TabsTrigger>
                <TabsTrigger value="already_paid" className="py-2">
                  Already Paid ({alreadyPaid.length})
                </TabsTrigger>
                <TabsTrigger value="not_found" className="py-2 data-[state=active]:bg-yellow-100 data-[state=active]:text-yellow-700">
                  <AlertCircle className="h-4 w-4 mr-2" />
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
                        <TableHead>Tracking No.</TableHead>
                        <TableHead>Order ID</TableHead>
                        <TableHead className="text-right">COD Collected</TableHead>
                        <TableHead className="text-right">Courier Fee</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedSuccesses.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                            No processed payments.
                          </TableCell>
                        </TableRow>
                      ) : (
                        paginatedSuccesses.map((res, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-medium">{res.trackingNumber}</TableCell>
                            <TableCell className="font-mono text-muted-foreground">{res.orderId}</TableCell>
                            <TableCell className="text-right text-emerald-600 font-medium">₱{res.codAmount.toLocaleString()}</TableCell>
                            <TableCell className="text-right text-destructive font-medium">₱{Math.abs(res.shippingFee).toLocaleString()}</TableCell>
                            <TableCell><Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Success</Badge></TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              <TabsContent value="already_paid">
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tracking No.</TableHead>
                        <TableHead>Order ID</TableHead>
                        <TableHead className="text-right">COD Collected</TableHead>
                        <TableHead className="text-right">Courier Fee</TableHead>
                        <TableHead>Message</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedAlreadyPaid.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                            No skipped payments found.
                          </TableCell>
                        </TableRow>
                      ) : (
                        paginatedAlreadyPaid.map((res, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-medium">{res.trackingNumber}</TableCell>
                            <TableCell className="font-mono text-muted-foreground">{res.orderId}</TableCell>
                            <TableCell className="text-right font-medium">₱{res.codAmount.toLocaleString()}</TableCell>
                            <TableCell className="text-right text-destructive font-medium">₱{Math.abs(res.shippingFee).toLocaleString()}</TableCell>
                            <TableCell className="text-muted-foreground">{res.message}</TableCell>
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
                        <TableHead>Tracking No.</TableHead>
                        <TableHead className="text-right">COD Collected</TableHead>
                        <TableHead className="text-right">Courier Fee</TableHead>
                        <TableHead>Error Message</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedNotFound.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                            All tracking numbers matched! Great job!
                          </TableCell>
                        </TableRow>
                      ) : (
                        paginatedNotFound.map((res, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-medium">{res.trackingNumber}</TableCell>
                            <TableCell className="text-right font-medium">₱{res.codAmount.toLocaleString()}</TableCell>
                            <TableCell className="text-right text-destructive font-medium">₱{Math.abs(res.shippingFee).toLocaleString()}</TableCell>
                            <TableCell className="text-yellow-600 font-medium">{res.message}</TableCell>
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
                        <TableHead>Tracking No.</TableHead>
                        <TableHead>Order ID</TableHead>
                        <TableHead>Error Message</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedErrors.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                            No database errors encountered.
                          </TableCell>
                        </TableRow>
                      ) : (
                        paginatedErrors.map((res, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-medium">{res.trackingNumber}</TableCell>
                            <TableCell className="font-mono text-muted-foreground">{res.orderId}</TableCell>
                            <TableCell className="text-destructive font-medium">{res.message}</TableCell>
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
        {results && (
          <CardFooter className="flex flex-col sm:flex-row items-center justify-between border-t p-6 gap-4">
            <div className="text-sm text-muted-foreground">
              {(() => {
                const activeData = activeTab === 'success' ? successes : activeTab === 'already_paid' ? alreadyPaid : activeTab === 'not_found' ? notFound : errors;
                const startIndex = activeData.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0;
                const endIndex = Math.min(currentPage * itemsPerPage, activeData.length);
                return `Showing ${startIndex}-${endIndex} of ${activeData.length} records`;
              })()}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
              >
                Previous
              </Button>
              <div className="text-sm font-medium mx-2">
                Page {currentPage} of {Math.max(1, Math.ceil((activeTab === 'success' ? successes.length : activeTab === 'already_paid' ? alreadyPaid.length : activeTab === 'not_found' ? notFound.length : errors.length) / itemsPerPage))}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const total = Math.ceil((activeTab === 'success' ? successes.length : activeTab === 'already_paid' ? alreadyPaid.length : activeTab === 'not_found' ? notFound.length : errors.length) / itemsPerPage);
                  setCurrentPage(p => Math.min(total, p + 1));
                }}
                disabled={currentPage >= Math.ceil((activeTab === 'success' ? successes.length : activeTab === 'already_paid' ? alreadyPaid.length : activeTab === 'not_found' ? notFound.length : errors.length) / itemsPerPage)}
              >
                Next
              </Button>
            </div>
          </CardFooter>
        )}
      </Card>
    </div>
  );
}
