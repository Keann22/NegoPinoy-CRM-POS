'use client';

import { useState, useEffect, useCallback } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Building2, Warehouse, Search, Loader2, ArrowRight } from 'lucide-react';
import { useSupabase } from '@/lib/supabase/hooks';
import type { Warehouse as WarehouseType } from '@/types';

interface WarehouseOverviewProps {
  warehouses: WarehouseType[];
  onTransferClick?: (productId: string, productName: string) => void;
}

export function WarehouseOverview({ warehouses, onTransferClick }: WarehouseOverviewProps) {
  const supabase = useSupabase();

  const unit1 = warehouses.find((w) => w.code === 'UNIT1');
  const unit2 = warehouses.find((w) => w.code === 'UNIT2');

  const [searchTerm, setSearchTerm] = useState('');
  const [locationFilter, setLocationFilter] = useState<'ALL' | 'UNIT1' | 'UNIT2'>('ALL');
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<any[]>([]);
  const [unit1Total, setUnit1Total] = useState(0);
  const [unit2Total, setUnit2Total] = useState(0);

  // Fetch warehouse totals and items
  const loadOverviewData = useCallback(async () => {
    if (!supabase || !unit1 || !unit2) return;
    setLoading(true);

    try {
      // 1. Fetch total counts per warehouse
      const { data: totalsData } = await supabase
        .from('product_warehouse_stock')
        .select('warehouse_id, stock_level');

      if (totalsData) {
        let u1Sum = 0;
        let u2Sum = 0;
        for (const row of totalsData) {
          if (row.warehouse_id === unit1.id) u1Sum += row.stock_level || 0;
          if (row.warehouse_id === unit2.id) u2Sum += row.stock_level || 0;
        }
        setUnit1Total(u1Sum);
        setUnit2Total(u2Sum);
      }

      // 2. Fetch product catalog with warehouse stock rows
      let query = supabase
        .from('products')
        .select(`
          id, name, sku, stock_level, shelf_location,
          warehouse_stocks:product_warehouse_stock(warehouse_id, stock_level, shelf_location)
        `)
        .not('name', 'ilike', '[DELETED]%')
        .order('stock_level', { ascending: false });

      if (searchTerm.trim()) {
        query = query.or(`name.ilike.%${searchTerm}%,sku.ilike.%${searchTerm}%`);
      }

      const { data: prodData, error } = await query.limit(300);

      if (error) throw error;

      if (prodData) {
        const mapped = prodData.map((p: any) => {
          const u1Row = p.warehouse_stocks?.find((w: any) => w.warehouse_id === unit1.id);
          const u2Row = p.warehouse_stocks?.find((w: any) => w.warehouse_id === unit2.id);

          return {
            id: p.id,
            name: p.name,
            sku: p.sku,
            totalStock: p.stock_level ?? 0,
            unit1Stock: u1Row?.stock_level ?? 0,
            unit1Shelf: u1Row?.shelf_location || p.shelf_location || null,
            unit2Stock: u2Row?.stock_level ?? 0,
            unit2Shelf: u2Row?.shelf_location || null,
          };
        });

        setItems(mapped);
      }
    } catch (err) {
      console.error('Failed to load warehouse overview:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase, unit1, unit2, searchTerm]);

  useEffect(() => {
    loadOverviewData();
  }, [loadOverviewData]);

  const filteredItems = items
    .filter((item) => {
      if (locationFilter === 'UNIT1') return item.unit1Stock !== 0;
      if (locationFilter === 'UNIT2') return item.unit2Stock !== 0;
      return true;
    })
    .sort((a, b) => {
      const getStock = (item: any) => {
        if (locationFilter === 'UNIT1') return item.unit1Stock;
        if (locationFilter === 'UNIT2') return item.unit2Stock;
        return item.totalStock;
      };

      const stockA = getStock(a);
      const stockB = getStock(b);

      const isZeroA = stockA === 0;
      const isZeroB = stockB === 0;

      // Put zero stock items at the absolute end
      if (isZeroA && !isZeroB) return 1;
      if (!isZeroA && isZeroB) return -1;

      // Higher stock comes first
      return stockB - stockA;
    });

  return (
    <div className="space-y-6">
      {/* Overview Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-indigo-200 bg-indigo-50/40">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-indigo-700">Unit 1 — Fulfillment Hub</p>
              <p className="text-2xl font-bold text-indigo-950 mt-1">{unit1Total.toLocaleString()} pcs</p>
              <p className="text-[11px] text-indigo-600 mt-0.5">Active Pick & Pack Shelves</p>
            </div>
            <div className="h-10 w-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700">
              <Building2 className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-blue-200 bg-blue-50/40">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-blue-700">Unit 2 — Reserve Storage</p>
              <p className="text-2xl font-bold text-blue-950 mt-1">{unit2Total.toLocaleString()} pcs</p>
              <p className="text-[11px] text-blue-600 mt-0.5">Bulk Cartons & Supplier Receiving</p>
            </div>
            <div className="h-10 w-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-700">
              <Warehouse className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-slate-50/60">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-600">Total System Stock</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">
                {(unit1Total + unit2Total).toLocaleString()} pcs
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">Combined Inventory (Both Units)</p>
            </div>
            <div className="h-10 w-10 bg-slate-200 rounded-full flex items-center justify-center text-slate-700">
              <span className="font-bold text-sm">∑</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search product or SKU..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">Filter Location:</span>
          <Select value={locationFilter} onValueChange={(v: any) => setLocationFilter(v)}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Locations (Combined)</SelectItem>
              <SelectItem value="UNIT1">Unit 1 (Active Hub Only)</SelectItem>
              <SelectItem value="UNIT2">Unit 2 (Reserve Only)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Overview Table */}
      <div className="border rounded-lg overflow-hidden bg-card">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading warehouse inventory...
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            No products found matching your search.
          </div>
        ) : (
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="w-[40%]">Product Name</TableHead>
                <TableHead className="text-center">Unit 1 Stock (Active)</TableHead>
                <TableHead className="text-center">Unit 2 Stock (Reserve)</TableHead>
                <TableHead className="text-center">Total Inventory</TableHead>
                {onTransferClick && <TableHead className="text-right">Action</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredItems.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <div className="font-medium text-sm">{item.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">{item.sku || '-'}</div>
                  </TableCell>

                  <TableCell className="text-center">
                    <div className="flex flex-col items-center gap-0.5">
                      <Badge
                        variant={item.unit1Stock < 0 ? 'destructive' : item.unit1Stock === 0 ? 'secondary' : 'default'}
                        className="font-bold px-2 py-0.5"
                      >
                        {item.unit1Stock} pcs
                      </Badge>
                      {item.unit1Shelf && (
                        <span className="text-[10px] text-muted-foreground font-mono">
                          Shelf: {item.unit1Shelf}
                        </span>
                      )}
                    </div>
                  </TableCell>

                  <TableCell className="text-center">
                    <div className="flex flex-col items-center gap-0.5">
                      <Badge
                        variant="outline"
                        className={
                          item.unit2Stock > 0
                            ? 'text-blue-700 bg-blue-50 border-blue-300 font-bold'
                            : 'text-muted-foreground'
                        }
                      >
                        {item.unit2Stock} pcs
                      </Badge>
                      {item.unit2Shelf && (
                        <span className="text-[10px] text-muted-foreground font-mono">
                          Loc: {item.unit2Shelf}
                        </span>
                      )}
                    </div>
                  </TableCell>

                  <TableCell className="text-center font-bold text-foreground">
                    {item.totalStock} pcs
                  </TableCell>

                  {onTransferClick && (
                    <TableCell className="text-right">
                      {item.unit2Stock > 0 && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-xs text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                          onClick={() => onTransferClick(item.id, item.name)}
                        >
                          Transfer <ArrowRight className="h-3.5 w-3.5 ml-1" />
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
