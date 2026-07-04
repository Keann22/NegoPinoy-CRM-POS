import { useState, useEffect } from 'react';
import { useSupabase } from '@/lib/supabase/hooks';
import { useSPXUpload } from './shipping/useSPXUpload';
import { useShippingExport } from './shipping/useShippingExport';

export type ShippingOrder = {
  id: string;
  orderId: string;
  shippingName: string;
  shippingPhone: string;
  orderDate: string;
  shippingAmount: number;
  paymentType: string;
  totalAmount: number;
  amountPaid: number;
  balanceDue: number;
  paymentMethod?: string;
  monthlyPayment?: number;
  installmentMonths?: number;
  items: any[];
  shippingAddress: any;
  weight: number | null;
  length: number | null;
  width: number | null;
  height: number | null;
  deliveryInstructions: string | null;
  boxesConfig: any;
};

export function useForShipping() {
  const supabase = useSupabase();
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<ShippingOrder[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [markShippedOrder, setMarkShippedOrder] = useState<{id: string, tracking_number: string} | null>(null);
  const [revertOrder, setRevertOrder] = useState<any>(null);

  const fetchForShippingOrders = async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          id,
          order_date,
          package_length,
          package_width,
          package_height,
          package_weight,
          boxes_config,
          total_amount,
          amount_paid,
          balance_due,
          shipping_name,
          shipping_phone,
          shipping_payment_type,
          shipping_amount,
          shipping_address,
          delivery_instructions,
          payment_method,
          monthly_payment,
          installment_months,
          order_items (
            product_name,
            quantity,
          selling_price_at_sale,
          discount
        )
      `)
      .eq('status', 'For Shipping')
        .order('order_date', { ascending: true });
      
      if (error) throw error;

      const formatted: ShippingOrder[] = (data || []).map((item: any) => ({
        id: item.id,
        orderId: item.id.split('-')[0].toUpperCase(),
        shippingName: item.shipping_name || 'Unknown',
        shippingPhone: item.shipping_phone || '',
        orderDate: item.order_date,
        shippingAmount: item.shipping_amount || 0,
        paymentType: item.shipping_payment_type || '',
        totalAmount: item.total_amount || 0,
        amountPaid: item.amount_paid || 0,
        balanceDue: item.balance_due || 0,
        paymentMethod: item.payment_method,
        monthlyPayment: item.monthly_payment,
        installmentMonths: item.installment_months,
        items: item.order_items || [],
        shippingAddress: typeof item.shipping_address === 'string' ? JSON.parse(item.shipping_address) : (item.shipping_address || {}),
        weight: item.package_weight,
        length: item.package_length,
        width: item.package_width,
        height: item.package_height,
        deliveryInstructions: item.delivery_instructions,
        boxesConfig: item.boxes_config,
      }));

      setOrders(formatted);
    } catch (err) {
      console.error("Failed to fetch for-shipping orders", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchForShippingOrders();
  }, [supabase]);

  const { fileInputRef, handleSPXUpload } = useSPXUpload(orders, setLoading, fetchForShippingOrders);
  const { handleExportExcel } = useShippingExport(orders, setLoading);

  return {
    orders,
    loading,
    fileInputRef,
    handleSPXUpload,
    handleExportExcel,
    currentPage,
    setCurrentPage,
    itemsPerPage,
    markShippedOrder,
    setMarkShippedOrder,
    revertOrder,
    setRevertOrder,
    fetchForShippingOrders
  };
}
