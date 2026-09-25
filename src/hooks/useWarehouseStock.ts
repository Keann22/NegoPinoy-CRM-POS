'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSupabase, useUser } from '@/lib/supabase/hooks';
import type { Warehouse, StockTransfer, ReplenishmentSuggestion } from '@/types';
import { useToast } from '@/hooks/use-toast';

export function useWarehouseStock() {
  const supabase = useSupabase();
  const { user } = useUser();
  const { toast } = useToast();

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [transfers, setTransfers] = useState<StockTransfer[]>([]);
  const [suggestions, setSuggestions] = useState<ReplenishmentSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);

  // Fetch active warehouses
  const fetchWarehouses = useCallback(async () => {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase
        .from('warehouses')
        .select('*')
        .eq('is_active', true)
        .order('is_fulfillment_hub', { ascending: false });

      if (error) throw error;
      setWarehouses(data || []);
      return data || [];
    } catch (err: unknown) {
      console.error('Failed to fetch warehouses:', err);
      return [];
    }
  }, [supabase]);

  // Fetch replenishment suggestions (Unit 1 low, Unit 2 has reserve)
  const fetchReplenishmentSuggestions = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      // 1. Fetch warehouses
      const { data: whList } = await supabase.from('warehouses').select('id, code');
      const unit1 = whList?.find((w) => w.code === 'UNIT1');
      const unit2 = whList?.find((w) => w.code === 'UNIT2');

      if (!unit1 || !unit2) return;

      // 2. Fetch products where Unit 2 has reserve stock > 0
      const { data: u2Stock, error: u2Err } = await supabase
        .from('product_warehouse_stock')
        .select('product_id, stock_level, shelf_location, products(id, name, sku)')
        .eq('warehouse_id', unit2.id)
        .gt('stock_level', 0);

      if (u2Err) throw u2Err;
      if (!u2Stock || u2Stock.length === 0) {
        setSuggestions([]);
        return;
      }

      const productIds = u2Stock.map((row) => row.product_id);

      // 3. Fetch Unit 1 stock for those products
      const { data: u1Stock, error: u1Err } = await supabase
        .from('product_warehouse_stock')
        .select('product_id, stock_level, shelf_location, reorder_threshold')
        .eq('warehouse_id', unit1.id)
        .in('product_id', productIds);

      if (u1Err) throw u1Err;

      const u1Map = new Map(u1Stock?.map((row) => [row.product_id, row]));

      const results: ReplenishmentSuggestion[] = [];
      for (const row of u2Stock) {
        const u1 = u1Map.get(row.product_id);
        const u1Level = u1?.stock_level ?? 0;
        const threshold = u1?.reorder_threshold ?? 5;
        const u2Level = row.stock_level ?? 0;

        // If Unit 1 is low or empty
        if (u1Level <= threshold && u2Level > 0) {
          const prod: any = row.products;
          // Suggest transferring up to 10 or whatever is in reserve
          const suggested = Math.min(u2Level, Math.max(5, threshold * 2 - u1Level));
          results.push({
            productId: row.product_id,
            productName: prod?.name || 'Unknown Product',
            sku: prod?.sku || undefined,
            unit1Stock: u1Level,
            unit2Stock: u2Level,
            unit1Shelf: u1?.shelf_location,
            unit2Shelf: row.shelf_location,
            reorderThreshold: threshold,
            suggestedTransferQty: suggested,
          });
        }
      }

      setSuggestions(results);
    } catch (err: unknown) {
      console.error('Failed to fetch replenishment suggestions:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  // Fetch recent transfers
  const fetchTransfers = useCallback(async () => {
    if (!supabase) return;
    try {
      const { data, error } = await supabase
        .from('stock_transfers')
        .select(`
          id, transfer_number, status, notes, created_by, created_at,
          from_warehouse_id, to_warehouse_id,
          from_warehouse:warehouses!from_warehouse_id(name, code),
          to_warehouse:warehouses!to_warehouse_id(name, code),
          items:stock_transfer_items(id, quantity, product_id, products(name, sku))
        `)
        .order('created_at', { ascending: false })
        .limit(30);

      if (error) throw error;
      setTransfers((data as any) || []);
    } catch (err: unknown) {
      console.error('Failed to fetch stock transfers:', err);
    }
  }, [supabase]);

  // Execute transfer
  const transferStock = async (
    fromWarehouseId: string,
    toWarehouseId: string,
    items: { productId: string; quantity: number }[],
    notes?: string
  ): Promise<boolean> => {
    if (!supabase) return false;
    setIsTransferring(true);
    try {
      const createdBy = user?.userMetadata?.full_name || user?.email || 'Staff';
      const { error } = await supabase.rpc('execute_stock_transfer', {
        p_from_warehouse_id: fromWarehouseId,
        p_to_warehouse_id: toWarehouseId,
        p_items: items,
        p_notes: notes || 'Internal Stock Transfer',
        p_created_by: createdBy,
      });

      if (error) throw error;

      toast({
        title: 'Transfer successful',
        description: `Transferred ${items.reduce((sum, i) => sum + i.quantity, 0)} item(s) successfully.`,
      });

      // Refresh suggestions and history
      await Promise.all([fetchReplenishmentSuggestions(), fetchTransfers()]);
      return true;
    } catch (err: any) {
      console.error('Stock transfer failed:', err);
      toast({
        title: 'Transfer failed',
        description: err.message || 'Could not complete stock transfer.',
        variant: 'destructive',
      });
      return false;
    } finally {
      setIsTransferring(false);
    }
  };

  useEffect(() => {
    fetchWarehouses();
    fetchReplenishmentSuggestions();
    fetchTransfers();
  }, [fetchWarehouses, fetchReplenishmentSuggestions, fetchTransfers]);

  return {
    warehouses,
    transfers,
    suggestions,
    loading,
    isTransferring,
    transferStock,
    refreshSuggestions: fetchReplenishmentSuggestions,
    refreshTransfers: fetchTransfers,
  };
}
