import { useState, useRef, useMemo } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useSupabase } from '@/lib/supabase/hooks';
import ExcelJS from 'exceljs';
import { useUserProfile } from '@/hooks/useUserProfile';

export type SyncCategory = 'success' | 'already_updated' | 'partial_match' | 'not_found' | 'error';

export type SyncResult = {
  orderId: string;
  trackingNumber: string;
  originalStatus: string;
  newStatus: string;
  category: SyncCategory;
  message: string;
};

export function useCourierSync() {
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
    return '';
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
      let headerRowNumber = -1;

      worksheet.eachRow((row, rowNumber) => {
        if (headerRowNumber === -1) {
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
            headerRowNumber = rowNumber;
          }
          return;
        }
      });

      if (headerRowNumber === -1) {
        toast({
          variant: 'destructive',
          title: 'Invalid File Format',
          description: 'Could not find required columns: Order Number, Tracking Number, and Status.'
        });
        setLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      let allOrders: any[] = [];
      let fetchError = null;
      let from = 0;
      const step = 1000;
      
      while (true) {
        const { data, error } = await supabase
          .from('orders')
          .select('id, status, tracking_number, payment_method, balance_due, next_due_date')
          .order('id')
          .range(from, from + step - 1);
          
        if (error) {
          fetchError = error;
          break;
        }
        if (data) {
          allOrders = allOrders.concat(data);
          if (data.length < step) {
            break;
          }
        } else {
          break;
        }
        from += step;
      }

      if (fetchError) throw fetchError;

      const orderMap = new Map();
      allOrders?.forEach(o => {
        orderMap.set(o.id.toLowerCase(), o);
        const uuidPrefix = o.id.split('-')[0].toLowerCase();
        orderMap.set(uuidPrefix, o);
        orderMap.set(`order #${uuidPrefix}`, o);
        orderMap.set(`order#${uuidPrefix}`, o);
        
        const shortId = o.id.substring(0, 7).toLowerCase();
        orderMap.set(shortId, o);
        orderMap.set(`order #${shortId}`, o);
        orderMap.set(`order#${shortId}`, o);
      });

      const syncResults: SyncResult[] = [];
      const updatePromises: PromiseLike<any>[] = [];

      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber <= headerRowNumber) return;

        const rawOrderId = row.getCell(orderCol).value?.toString().trim();
        const rawTracking = row.getCell(trackingCol).value?.toString().trim() || '';
        const rawStatus = row.getCell(statusCol).value?.toString().trim() || '';

        if (!rawOrderId) return;

        const cleanOrderId = rawOrderId.replace(/-b\d+$/i, '').toLowerCase();
        const matchedOrder = orderMap.get(cleanOrderId) || orderMap.get(rawOrderId.toLowerCase());

        if (!matchedOrder) {
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

  return {
    loading,
    results,
    fileInputRef,
    canSyncCourier,
    handleFileUpload
  };
}
