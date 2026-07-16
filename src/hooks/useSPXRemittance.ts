import { useState, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useSupabase } from '@/lib/supabase/hooks';
import ExcelJS from 'exceljs';

export type RemittanceCategory = 'success' | 'already_paid' | 'not_found' | 'error';

export type RemittanceResult = {
  trackingNumber: string;
  orderId?: string;
  codAmount: number;
  shippingFee: number;
  category: RemittanceCategory;
  message: string;
};

export function useSPXRemittance() {
  const supabase = useSupabase();
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<RemittanceResult[] | null>(null);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

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

      worksheet.eachRow((row) => {
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

      // Fetch existing SPX fee expenses so we never record the same courier fee twice
      const { data: existingFeeExpenses } = await supabase
        .from('expenses')
        .select('description')
        .ilike('description', 'SPX%Fee for Order #%');

      const feeAlreadyRecordedFor = new Set<string>();
      (existingFeeExpenses || []).forEach((e: any) => {
        const match = e.description?.match(/Order #(\w+)/);
        if (match) feeAlreadyRecordedFor.add(match[1]);
      });

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
        let totalAvailableCod = 0; // Real COD SPX collected, before capping to what the order still needs
        let totalShippingFee = 0;
        let totalProcessingFee = 0;
        const matchedTrackingNos: string[] = [];
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
            totalAvailableCod += availableCod;

            // If balanceNeeded is already 0, the down payment/balance was already recorded
            // through another payment (most often a manual entry logged before this file
            // arrived) — applying the full collected COD on top of that double-books it.
            // Only ever apply up to what's still actually owed.
            const codToApply = balanceNeeded > 0 ? Math.min(balanceNeeded, availableCod) : 0;

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

          const hasSpxPayment = order.payments?.some((p: any) => p.payment_method === 'SPX COD Remittance');
          // Real COD was reported for this tracking, but none of it got applied because the
          // down payment/balance was already covered by an existing payment — most likely a
          // manual entry logged before this remittance file arrived. Treat as already settled
          // instead of silently dropping it, so staff can still see it (and any fees still post).
          const alreadyCoveredElsewhere = totalAvailableCod > 0 && totalCod === 0;

          if (hasSpxPayment || order.status === 'Payment Received (COD)' || alreadyCoveredElsewhere) {
             let feeMessage = alreadyCoveredElsewhere
               ? 'Down payment/balance already recorded via another payment — SPX collection was not added again to avoid double counting.'
               : 'Order COD has already been synced or is fully paid.';
             const explicitShippingFee = Math.abs(totalShippingFee);
             const explicitProcessingFee = Math.abs(totalProcessingFee);

             if ((explicitShippingFee > 0 || explicitProcessingFee > 0) && !feeAlreadyRecordedFor.has(shortOrderId)) {
               try {
                 if (explicitShippingFee > 0) {
                   const { error: shipError } = await supabase
                     .from('expenses')
                     .insert({
                       amount: explicitShippingFee,
                       category: 'Shipping Fee',
                       expense_date: new Date().toISOString(),
                       description: `SPX Shipping Fee for Order #${shortOrderId}`
                     });
                   if (shipError) throw shipError;
                 }
                 if (explicitProcessingFee > 0) {
                   const { error: procError } = await supabase
                     .from('expenses')
                     .insert({
                       amount: explicitProcessingFee,
                       category: 'Processing Fee',
                       expense_date: new Date().toISOString(),
                       description: `SPX Courier Fee for Order #${shortOrderId}`
                     });
                   if (procError) throw procError;
                 }
                 feeAlreadyRecordedFor.add(shortOrderId);
                 feeMessage = 'Order already settled. Courier fee for this remittance was recorded as an expense.';
               } catch (err: any) {
                 feeMessage = `Order already settled, but failed to record courier fee: ${err.message || 'unknown error'}`;
               }
             }

             syncResults.push({
               trackingNumber: joinedTracking,
               orderId: shortOrderId,
               codAmount: totalAvailableCod,
               shippingFee: totalShippingFee + totalProcessingFee,
               category: 'already_paid',
               message: feeMessage
             });
             continue;
          }

          if (totalCod > 0 || totalShippingFee !== 0 || totalProcessingFee !== 0) {
            try {
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

              const finalShippingFee = Math.abs(totalShippingFee);
              let finalProcessingFee = Math.abs(totalProcessingFee);
              
              const excelHadNoDeductions = totalShippingFee === 0 && totalProcessingFee === 0;
              
              if (excelHadNoDeductions && totalCod > 0) {
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

              if (!feeAlreadyRecordedFor.has(shortOrderId)) {
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

                if (finalShippingFee > 0 || finalProcessingFee > 0) {
                  feeAlreadyRecordedFor.add(shortOrderId);
                }
              }

              syncResults.push({
                trackingNumber: joinedTracking,
                orderId: shortOrderId,
                codAmount: totalCod,
                shippingFee: -(finalShippingFee + finalProcessingFee),
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

  return {
    loading,
    results,
    fileInputRef,
    handleRemittanceUpload
  };
}
