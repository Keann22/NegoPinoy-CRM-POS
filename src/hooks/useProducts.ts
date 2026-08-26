'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSupabase, useUser } from '@/lib/supabase/hooks';
import type { FormattedProduct } from '@/types';
import { getStockStatus } from '@/types';
import { isOnSale, hasSaleDiscount, getEffectivePrice } from '@/lib/pricing';

interface UseProductsParams {
  searchTerm: string;
  stockFilter: string;
  page: number;
  pageSize: number;
}

function formatProduct(
  p: any,
  reservedStockMap: Record<string, number>,
  packedStockMap: Record<string, number>
): FormattedProduct {
  let sp = p.supplier_pricing || [];
  if (sp.length === 0 && p.initial_unit_cost) {
    sp = [{ supplierName: 'Initial Stock', unitCost: p.initial_unit_cost }];
  }
  const regularPrice = Number(p.selling_price ?? p.sellingPrice) || 0;
  const onSale = isOnSale(p.is_on_sale);
  const discounted = onSale && hasSaleDiscount(regularPrice, p.sale_price);
  const effectivePrice = getEffectivePrice(regularPrice, p.sale_price, p.is_on_sale);
  return {
    ...p,
    variantName: p.variant_name,
    quantityOnHand: p.quantityOnHand ?? p.stock_level ?? 0,
    status: getStockStatus(p.stock_level ?? p.quantityOnHand),
    price: `₱${effectivePrice.toFixed(2)}`,
    onSale,
    regularPriceLabel: discounted ? `₱${regularPrice.toFixed(2)}` : undefined,
    sellingPrice: regularPrice,
    image: p.images?.[0] || 'https://placehold.co/64x64',
    shelfLocation: p.shelf_location || '',
    supplierPricing: sp,
    reservedStock: reservedStockMap[p.id] || 0,
    packedStock: packedStockMap[p.id] || 0,
  };
}

/**
 * useProducts
 * Server-side search, stock filter, and pagination — only the current page's
 * products (and their variants) are ever fetched. A previous version loaded
 * the entire catalog client-side, which silently dropped everything past
 * Supabase's 1000-row default cap once the catalog grew past it (see
 * ARCHITECTURE.md, "The 1000-row query cap").
 */
export function useProducts({ searchTerm, stockFilter, page, pageSize }: UseProductsParams) {
  const supabase = useSupabase();
  const { user } = useUser();

  const [products, setProducts] = useState<FormattedProduct[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [refetchTrigger, setRefetchTrigger] = useState(0);

  const refetch = useCallback(() => setRefetchTrigger(n => n + 1), []);

  useEffect(() => {
    if (!supabase || !user) return;
    const fetchProducts = async () => {
      setIsLoading(true);
      try {
        let query = supabase
          .from('products')
          .select('*', { count: 'exact' })
          .is('parent_id', null)
          .not('name', 'ilike', '[DELETED]%');

        if (searchTerm) {
          query = query.ilike('name', `%${searchTerm}%`);
        }
        if (stockFilter === 'in-stock') {
          query = query.gt('stock_level', 0);
        } else if (stockFilter === 'no-stock') {
          query = query.eq('stock_level', 0);
        } else if (stockFilter === 'negative-stock') {
          query = query.lt('stock_level', 0);
        }

        const from = (page - 1) * pageSize;
        const { data: parents, error, count } = await query
          .order('name', { ascending: true })
          .range(from, from + pageSize - 1);
        if (error) throw error;

        setTotalCount(count || 0);

        const parentIds = (parents || []).map((p: any) => p.id);
        let children: any[] = [];
        if (parentIds.length > 0) {
          const { data: childData, error: childError } = await supabase
            .from('products')
            .select('*')
            .in('parent_id', parentIds)
            .not('name', 'ilike', '[DELETED]%');
          if (childError) throw childError;
          children = childData || [];
        }

        // Reserved/packed stock only needs to cover this page's products +
        // their variants - a small, safe set regardless of catalog size.
        const allIds = [...parentIds, ...children.map(c => c.id)];
        const reserved: Record<string, number> = {};
        const packed: Record<string, number> = {};
        if (allIds.length > 0) {
          const { data: itemsData, error: itemsError } = await supabase
            .from('order_items')
            .select('product_id, quantity, orders!inner(status)')
            .in('product_id', allIds)
            .in('orders.status', ['Processing', 'Packed', 'For Shipping', 'For Pick-up']);
          if (itemsError) throw itemsError;
          (itemsData || []).forEach((item: any) => {
            const status = item.orders?.status;
            if (status === 'Packed' || status === 'For Shipping' || status === 'For Pick-up') {
              packed[item.product_id] = (packed[item.product_id] || 0) + item.quantity;
            } else {
              reserved[item.product_id] = (reserved[item.product_id] || 0) + item.quantity;
            }
          });
        }

        const formattedChildren = children.map(c => formatProduct(c, reserved, packed));
        const formatted = (parents || []).map((p: any) => {
          const productChildren = formattedChildren
            .filter(c => c.parent_id === p.id)
            .map(c => ({ ...c, parentName: p.name }));
          return {
            ...formatProduct(p, reserved, packed),
            children: productChildren.length > 0 ? productChildren : undefined,
          };
        });

        setProducts(formatted);
      } catch (err) {
        console.error('Error fetching products:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchProducts();
  }, [supabase, user, searchTerm, stockFilter, page, pageSize, refetchTrigger]);

  return { products, totalCount, isLoading, refetch };
}
