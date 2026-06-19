'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSupabase, useUser } from '@/lib/supabase/hooks';
import type { FormattedProduct } from '@/types';
import { getStockStatus } from '@/types';

/**
 * useProducts
 * Fetches the full product list + calculates reserved/packed stock quantities.
 * Extracted from products/page.tsx (lines 89–171).
 */
export function useProducts() {
  const supabase = useSupabase();
  const { user } = useUser();

  const [rawProducts, setRawProducts] = useState<any[] | null>(null);
  const [reservedStockMap, setReservedStockMap] = useState<Record<string, number>>({});
  const [packedStockMap, setPackedStockMap] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [refetchTrigger, setRefetchTrigger] = useState(0);

  const refetch = useCallback(() => setRefetchTrigger(n => n + 1), []);

  // Fetch products
  useEffect(() => {
    if (!supabase || !user) return;
    const fetchProducts = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('products')
          .select('*')
          .order('name', { ascending: true });
        if (error) throw error;
        setRawProducts(data || []);
      } catch (err) {
        console.error('Error fetching products:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchProducts();
  }, [supabase, user, refetchTrigger]);

  // Fetch reserved/packed stock from active order_items
  useEffect(() => {
    if (!supabase || !rawProducts || rawProducts.length === 0) return;
    const fetchReservedStock = async () => {
      try {
        const productIds = rawProducts.map(p => p.id);
        const { data, error } = await supabase
          .from('order_items')
          .select('product_id, quantity, orders!inner(status)')
          .in('product_id', productIds)
          .in('orders.status', ['Processing', 'Packed', 'For Shipping', 'For Pick-up']);
        if (error) throw error;

        const reserved: Record<string, number> = {};
        const packed: Record<string, number> = {};
        (data || []).forEach((item: any) => {
          const status = item.orders?.status;
          if (status === 'Packed' || status === 'For Shipping' || status === 'For Pick-up') {
            packed[item.product_id] = (packed[item.product_id] || 0) + item.quantity;
          } else {
            reserved[item.product_id] = (reserved[item.product_id] || 0) + item.quantity;
          }
        });
        setReservedStockMap(reserved);
        setPackedStockMap(packed);
      } catch (err) {
        console.error('Error fetching reserved stock:', err);
      }
    };
    fetchReservedStock();
  }, [supabase, rawProducts]);

  // Map to FormattedProduct shape
  const products: FormattedProduct[] = (rawProducts || []).map(p => {
    let sp = p.supplier_pricing || [];
    if (sp.length === 0 && p.initial_unit_cost) {
      sp = [{ supplierName: 'Initial Stock', unitCost: p.initial_unit_cost }];
    }
    return {
      ...p,
      quantityOnHand: p.quantityOnHand ?? p.stock_level ?? 0,
      status: getStockStatus(p.stock_level ?? p.quantityOnHand),
      price: `₱${(Number(p.selling_price ?? p.sellingPrice) || 0).toFixed(2)}`,
      sellingPrice: p.selling_price ?? p.sellingPrice ?? 0,
      image: p.images?.[0] || 'https://placehold.co/64x64',
      shelfLocation: p.shelf_location || '',
      supplierPricing: sp,
      reservedStock: reservedStockMap[p.id] || 0,
      packedStock: packedStockMap[p.id] || 0,
    };
  });

  return { products, isLoading, refetch };
}
