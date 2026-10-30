import { useState, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useSupabase } from '@/lib/supabase/hooks';
import type { RemittanceCategory, RemittanceResult } from '@/types/accounting.types';
import {
  parseSPXRemittanceWorkbook,
  fetchAllOrdersWithTracking,
  fetchRecordedSPXFeeOrders,
  runWithConcurrency,
  type MatchedOrderWork
} from '@/lib/services/spx-remittance-service';

export type { RemittanceCategory, RemittanceResult };

export function useSPXRemittance() {
  const supabase = useSupabase();
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [results, setResults] = useState<RemittanceResult[] | null>(null);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleRemittanceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !supabase) return;

    setLoading(true);
    setStatusText('Reading Excel file...');
    setResults(null);

    try {
      const fileBuffer = await file.arrayBuffer();
      const trackingData = await parseSPXRemittanceWorkbook(fileBuffer);

      if (trackingData.size === 0) {
        toast({
          variant: 'destructive',
          title: 'Invalid File Format',
          description: 'Could not find the expected columns (Tracking Number, Transaction Type, Transaction Amount) or valid tracking records.'
        });
        setLoading(false);
        setStatusText(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      setStatusText('Fetching orders from database...');
      const allOrders = await fetchAllOrdersWithTracking(supabase, (count) => {
        setStatusText(`Fetching orders (${count} loaded)...`);
      });

      setStatusText('Checking recorded courier expenses...');
      const feeAlreadyRecordedFor = await fetchRecordedSPXFeeOrders(supabase);

      setStatusText('Matching tracking numbers with orders...');
      const processedTracking = new Set<string>();
      const workList: MatchedOrderWork[] = [];

      for (const order of allOrders) {
        if (!order.tracking_number) continue;

        const trackingList = order.tracking_number
          .split(/[\s,\/]+/)
          .map((t: string) => t.trim().toUpperCase())
          .filter(Boolean);

        let totalCod = 0;
        let totalAvailableCod = 0;
        let totalShippingFee = 0;
        let totalProcessingFee = 0;
        const matchedTrackingNos: string[] = [];
        let matched = false;

        for (const t of trackingList) {
          if (trackingData.has(t)) {
            const item = trackingData.get(t)!;

            let balanceNeeded = 0;
            if (order.payment_method === 'Installment' || order.payment_method === 'Lay-away') {
              const expectedDownpayment = (order.total_amount || 0) - ((order.installment_months || 0) * (order.monthly_payment || 0));
              balanceNeeded = Math.max(0, expectedDownpayment - (order.amount_paid || 0));
            } else {
              balanceNeeded = Math.max(0, (order.balance_due || 0) - totalCod);
            }

            const availableCod = item.cod;
            totalAvailableCod += availableCod;

            const codToApply = balanceNeeded > 0 ? Math.min(balanceNeeded, availableCod) : 0;
            const shippingFeeToApply = item.shippingFee;
            const processingFeeToApply = item.processingFee;

            totalCod += codToApply;
            totalShippingFee += shippingFeeToApply;
            totalProcessingFee += processingFeeToApply;

            item.cod -= codToApply;
            item.shippingFee = 0;
            item.processingFee = 0;

            matchedTrackingNos.push(item.originalTrackingNo || t);
            processedTracking.add(t);
            matched = true;
          }
        }

        if (matched) {
          const joinedTracking = matchedTrackingNos.join(', ');
          const shortOrderId = order.id.substring(0, 7).toUpperCase();
          const hasSpxPayment = order.payments?.some((p: any) => p.payment_method === 'SPX COD Remittance');
          const alreadyCoveredElsewhere = totalAvailableCod > 0 && totalCod === 0;
          const isAlreadySettled = Boolean(hasSpxPayment || order.status === 'Payment Received (COD)' || alreadyCoveredElsewhere);

          let settledMessage = 'Order COD has already been synced or is fully paid.';
          if (alreadyCoveredElsewhere) {
            settledMessage = 'Down payment/balance already recorded via another payment — SPX collection was not added again to avoid double counting.';
          }

          workList.push({
            order,
            joinedTracking,
            shortOrderId,
            totalCod,
            totalAvailableCod,
            totalShippingFee,
            totalProcessingFee,
            isAlreadySettled,
            settledMessage
          });
        }
      }

      setStatusText(`Processing ${workList.length} matched orders...`);

      const syncResults: RemittanceResult[] = await runWithConcurrency(
        workList,
        6,
        async (work) => {
          const { order, joinedTracking, shortOrderId, totalCod, totalAvailableCod, totalShippingFee, totalProcessingFee } = work;

          if (work.isAlreadySettled) {
            let feeMessage = work.settledMessage;
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

            return {
              trackingNumber: joinedTracking,
              orderId: shortOrderId,
              codAmount: totalAvailableCod,
              shippingFee: totalShippingFee + totalProcessingFee,
              category: 'already_paid' as const,
              message: feeMessage
            };
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
                    notes: 'Auto-synced from SPX Remittance file',
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

              return {
                trackingNumber: joinedTracking,
                orderId: shortOrderId,
                codAmount: totalCod,
                shippingFee: -(finalShippingFee + finalProcessingFee),
                category: 'success' as const,
                message: totalCod > 0 ? 'Payment verified and expenses recorded.' : 'Courier fee deducted for zero-COD order.'
              };

            } catch (err: any) {
              return {
                trackingNumber: joinedTracking,
                orderId: shortOrderId,
                codAmount: totalCod,
                shippingFee: totalShippingFee,
                category: 'error' as const,
                message: err.message || 'Database error occurred.'
              };
            }
          }

          return {
            trackingNumber: joinedTracking,
            orderId: shortOrderId,
            codAmount: 0,
            shippingFee: 0,
            category: 'already_paid' as const,
            message: 'No changes required.'
          };
        },
        (completed, total) => {
          setStatusText(`Syncing orders: ${completed} / ${total} (${Math.round((completed / total) * 100)}%)...`);
        }
      );

      // Add all tracking numbers from the Excel that were not found in any order
      for (const [key, item] of trackingData.entries()) {
        if (!processedTracking.has(key)) {
          syncResults.push({
            trackingNumber: item.originalTrackingNo || key,
            codAmount: item.cod,
            shippingFee: item.shippingFee + item.processingFee,
            category: 'not_found',
            message: 'Tracking number not found on any order in the database.'
          });
        }
      }

      setResults(syncResults);

      const successes = syncResults.filter(r => r.category === 'success').length;
      toast({
        title: 'Remittance Synced',
        description: `Successfully processed ${successes} payments.`
      });

    } catch (err: any) {
      console.error('Error processing remittance:', err);
      toast({
        variant: 'destructive',
        title: 'Sync Failed',
        description: err.message || 'An error occurred while processing the file.'
      });
    } finally {
      setLoading(false);
      setStatusText(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return {
    loading,
    statusText,
    results,
    fileInputRef,
    handleRemittanceUpload
  };
}
