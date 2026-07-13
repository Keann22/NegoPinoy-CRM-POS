import { useRef } from 'react';
import ExcelJS from 'exceljs';
import { useSupabase } from '@/lib/supabase/hooks';
import { useToast } from '@/hooks/use-toast';
import type { ShippingOrder } from '../useForShipping';

export type OrderUpdate = {
  tracking_numbers: string[];
  cod_amount: number;
  estimated_shipping_fee: number;
  basic_shipping_fee: number;
  insurance_fee: number;
  cod_service_fee: number;
  scheduled_pickup_time: string;
  payment_role: string;
};

export function useSPXUpload(orders: ShippingOrder[], setLoading: (val: boolean) => void, fetchForShippingOrders: () => void) {
  const supabase = useSupabase();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSPXUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !supabase) return;
    
    setLoading(true);
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await file.arrayBuffer());
      const worksheet = workbook.worksheets[0];
      
      const orderUpdates: Record<string, OrderUpdate> = {};
      
      let trackingCol = -1;
      let refCol = -1;
      let pickupTimeCol = 10;
      let paymentRoleCol = 32;
      let codAmountCol = 38;
      let estShippingFeeCol = 42;
      let basicShippingFeeCol = -1;
      let insuranceFeeCol = -1;
      let codServiceFeeCol = -1;
      let foundHeaders = false;

      worksheet.eachRow((row) => {
          if (!foundHeaders) {
              row.eachCell((cell, colNumber) => {
                  const val = cell.value?.toString().toLowerCase().trim() || '';
                  if (trackingCol === -1 && (val === 'tracking number' || val === 'tracking no.')) trackingCol = colNumber;
                  else if (refCol === -1 && (val.includes('customer reference') || val === 'order number')) refCol = colNumber;
                  else if (pickupTimeCol === 10 && val.includes('pickup time')) pickupTimeCol = colNumber;
                  else if (paymentRoleCol === 32 && val.includes('payment role')) paymentRoleCol = colNumber;
                  else if (codAmountCol === 38 && val.includes('cod amount')) codAmountCol = colNumber;
                  else if (estShippingFeeCol === 42 && (val === 'estimated shipping fee' || val === 'est. shipping fee' || val.includes('est. shipping'))) estShippingFeeCol = colNumber;
                  else if (basicShippingFeeCol === -1 && val.includes('basic shipping fee')) basicShippingFeeCol = colNumber;
                  else if (insuranceFeeCol === -1 && val.includes('insurance fee')) insuranceFeeCol = colNumber;
                  else if (codServiceFeeCol === -1 && val.includes('cod service fee')) codServiceFeeCol = colNumber;
              });
              
              if (trackingCol !== -1 && refCol !== -1) {
                  foundHeaders = true;
              }
              return; 
          }
          
          if (!foundHeaders) return; 
          
          const tCol = trackingCol !== -1 ? trackingCol : 1;
          const rCol = refCol !== -1 ? refCol : 3;
          
          const trackingNo = row.getCell(tCol).value?.toString().trim() || '';
          if (!trackingNo || trackingNo.toLowerCase().includes('tracking number')) return;
          
          const rawCustRef = row.getCell(rCol).value?.toString().trim() || ''; 
          const pickupTime = row.getCell(pickupTimeCol).value?.toString() || '';
          const paymentRole = row.getCell(paymentRoleCol).value?.toString() || '';
          const codAmount = parseFloat(row.getCell(codAmountCol).value?.toString() || '0') || 0;
          const estShippingFee = parseFloat(row.getCell(estShippingFeeCol).value?.toString() || '0') || 0;
          const basicShippingFee = basicShippingFeeCol !== -1 ? parseFloat(row.getCell(basicShippingFeeCol).value?.toString() || '0') || 0 : 0;
          const insuranceFee = insuranceFeeCol !== -1 ? parseFloat(row.getCell(insuranceFeeCol).value?.toString() || '0') || 0 : 0;
          const codServiceFee = codServiceFeeCol !== -1 ? parseFloat(row.getCell(codServiceFeeCol).value?.toString() || '0') || 0 : 0;
          
          let rawPrefix = '';
          const orderIdMatch = rawCustRef.match(/ORDER\s*#?\s*([A-Za-z0-9-]+)/i);
          if (orderIdMatch && orderIdMatch[1]) {
              rawPrefix = orderIdMatch[1].toLowerCase();
          } else if (rawCustRef.match(/^[a-f0-9]{8}(?:-b\d+)?$/i)) {
              rawPrefix = rawCustRef.toLowerCase();
          }
          
          if (rawPrefix) {
              const orderIdPrefix = rawPrefix.replace(/-b\d+$/i, '');
              
              const matchingOrder = orders.find(o => o.id.toLowerCase().startsWith(orderIdPrefix));
              if (matchingOrder) {
                  const fullId = matchingOrder.id;
                  if (!orderUpdates[fullId]) {
                      orderUpdates[fullId] = {
                          tracking_numbers: [],
                          cod_amount: 0,
                          estimated_shipping_fee: 0,
                          basic_shipping_fee: 0,
                          insurance_fee: 0,
                          cod_service_fee: 0,
                          scheduled_pickup_time: pickupTime,
                          payment_role: paymentRole
                      };
                  }
                  
                  if (trackingNo && !orderUpdates[fullId].tracking_numbers.includes(trackingNo)) {
                      orderUpdates[fullId].tracking_numbers.push(trackingNo);
                  }
                  orderUpdates[fullId].cod_amount += codAmount;
                  orderUpdates[fullId].estimated_shipping_fee += estShippingFee;
                  orderUpdates[fullId].basic_shipping_fee += basicShippingFee;
                  orderUpdates[fullId].insurance_fee += insuranceFee;
                  orderUpdates[fullId].cod_service_fee += codServiceFee;
              }
          }
      });
      
      if (!foundHeaders && Object.keys(orderUpdates).length === 0) {
         toast({ variant: 'destructive', title: 'Invalid File Format', description: 'Could not find Tracking Number and Customer Reference columns in the Excel file. Please ensure you uploaded the correct SPX file.' });
         setLoading(false);
         if (fileInputRef.current) fileInputRef.current.value = '';
         return;
      }
      
      const updatePromises = Object.entries(orderUpdates).map(async ([fullId, data]) => {
          return supabase.from('orders').update({
               status: 'For Pick-up',
               tracking_number: data.tracking_numbers.join(', '),
               spx_sync_data: {
                   scheduled_pickup_time: data.scheduled_pickup_time,
                   estimated_shipping_fee: data.estimated_shipping_fee,
                   basic_shipping_fee: data.basic_shipping_fee,
                   insurance_fee: data.insurance_fee,
                   cod_service_fee: data.cod_service_fee,
                   cod_amount: data.cod_amount,
                   payment_role: data.payment_role,
                   service_type: 'Standard Service',
                   collect_type: 'Pickup',
                   payment_type: 'Pay by Cycle'
               }
           }).eq('id', fullId);
      });
      
      for (const updateFn of updatePromises) {
          await updateFn;
      }
      
      toast({ title: 'Upload Successful', description: `Synced ${Object.keys(orderUpdates).length} orders to SPX tracking and moved to For Pick-up.` });
      fetchForShippingOrders();
    } catch (err: any) {
      console.error(err);
      toast({ variant: 'destructive', title: 'Upload Failed', description: err.message || 'Failed to process SPX file.' });
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return { fileInputRef, handleSPXUpload };
}
