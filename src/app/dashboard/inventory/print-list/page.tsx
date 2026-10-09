'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Printer, Download, Pencil } from 'lucide-react';
import * as xlsx from 'xlsx';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useAllProductsForPrint, type PrintableProduct, type PrintStockFilter } from '@/hooks/useAllProductsForPrint';
import { ProductAllocationDialog } from '@/components/dashboard/inventory/product-allocation-dialog';
import { EditUnallocatedStockDialog } from '@/components/dashboard/procurement/edit-unallocated-stock-dialog';
import { useRoleCheck } from '@/hooks/useRoleCheck';
import type { InventoryListStockInfo } from '@/lib/services/inventory-list-service';

type SortBy = 'name' | 'shelf';

const STOCK_FILTER_LABELS: Record<PrintStockFilter, string> = {
  'low-or-negative': 'Low (1-10) or Negative Stock',
  negative: 'Negative Stock Only',
  all: 'All Products',
};

function displayName(p: PrintableProduct) {
  return p.variant_name ? `${p.name} [${p.variant_name}]` : p.name;
}

/**
 * Plain case-insensitive compare, trimmed first. Deliberately not using localeCompare's
 * numeric/locale collation here — with 1000+ product names full of mixed punctuation
 * (-, /, &, brackets), that collation mode is not a consistent total order, which made
 * Array.prototype.sort produce a genuinely wrong-looking result (confirmed empirically).
 * Lowercase codepoint comparison is strictly transitive, at the cost of "2" not sorting
 * before "10". Trimming matters because some product names have stray leading whitespace
 * (invisible in the UI since HTML collapses it) that would otherwise sort them all first.
 */
function compareNatural(a: string, b: string): number {
  const la = a.trim().toLowerCase();
  const lb = b.trim().toLowerCase();
  return la < lb ? -1 : la > lb ? 1 : 0;
}

function compareByName(a: PrintableProduct, b: PrintableProduct): number {
  const nameCompare = compareNatural(a.name, b.name);
  return nameCompare !== 0 ? nameCompare : compareNatural(a.variant_name || '', b.variant_name || '');
}

/**
 * Always sorts alphabetically client-side rather than trusting the database's default
 * collation, which can put digit-led names (e.g. "1 Reclining Chair") in a surprising
 * spot relative to letter-led names.
 * For shelf sort, products with no shelf location sort to the end — they can't be found
 * by walking shelves — with name as the tiebreaker within each shelf.
 */
function sortProducts(products: PrintableProduct[], sortBy: SortBy): PrintableProduct[] {
  const sorted = [...products];
  if (sortBy === 'shelf') {
    sorted.sort((a, b) => {
      const aEmpty = !a.shelf_location;
      const bEmpty = !b.shelf_location;
      if (aEmpty !== bEmpty) return aEmpty ? 1 : -1;
      const shelfCompare = compareNatural(a.shelf_location || '', b.shelf_location || '');
      return shelfCompare !== 0 ? shelfCompare : compareByName(a, b);
    });
  } else {
    sorted.sort(compareByName);
  }
  return sorted;
}

export default function PrintInventoryListPage() {
  const [stockFilter, setStockFilter] = useState<PrintStockFilter>('low-or-negative');
  const { products, isLoading, refetch } = useAllProductsForPrint(stockFilter);
  const { canManageProducts } = useRoleCheck();
  const [sortBy, setSortBy] = useState<SortBy>('name');
  const sortedProducts = useMemo(() => sortProducts(products, sortBy), [products, sortBy]);
  const [selectedProduct, setSelectedProduct] = useState<PrintableProduct | null>(null);
  const [editingProduct, setEditingProduct] = useState<PrintableProduct | null>(null);

  // Unallocated stock is computed server-side (it needs live order demand), with the
  // same formula as the Procurement Sheet. null = still loading.
  const [stockInfo, setStockInfo] = useState<Record<string, InventoryListStockInfo> | null>(null);
  const fetchStockInfo = useCallback(async () => {
    try {
      const res = await fetch('/api/inventory/unallocated-stock');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load unallocated stock');
      setStockInfo(data.items);
    } catch (err) {
      console.error('Error fetching unallocated stock:', err);
      setStockInfo({});
    }
  }, []);
  useEffect(() => { fetchStockInfo(); }, [fetchStockInfo]);

  // Bundles hold no stock of their own (sales explode into components), so they have no
  // unallocated figure to show or edit.
  const unallocatedOf = (p: PrintableProduct): number | null => {
    const info = stockInfo?.[p.id];
    return info && !info.isBundle ? info.unallocatedStock : null;
  };

  const editingInfo = editingProduct ? stockInfo?.[editingProduct.id] : undefined;
  const editingItem = editingProduct && editingInfo ? {
    productId: editingProduct.id,
    productName: displayName(editingProduct),
    unallocatedStock: editingInfo.unallocatedStock,
    lastEditedAt: editingInfo.lastEditedAt,
    lastEditedBy: editingInfo.lastEditedBy,
    manualAdjustmentCount: editingInfo.manualAdjustmentCount,
  } : null;

  const handleExportExcel = () => {
    const exportData = sortedProducts.map(p => ({
      'Product': displayName(p),
      'SKU': p.sku || '',
      'Shelf Location': p.shelf_location || '',
      'System Stock': p.stock_level ?? 0,
      'Unallocated Stock': unallocatedOf(p) ?? '',
      'Physical Count': '',
      'Notes': '',
    }));

    const worksheet = xlsx.utils.json_to_sheet(exportData);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Inventory Count');
    xlsx.writeFile(workbook, `Inventory_Count_${STOCK_FILTER_LABELS[stockFilter].replace(/[^a-zA-Z0-9]+/g, '_')}_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`);
  };

  return (
    <>
    <Card className="print:shadow-none print:border-none">
      <CardHeader className="print:hidden">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle className="font-headline">Inventory List</CardTitle>
            <CardDescription>
              Products with their current system stock and unallocated stock (free pieces on the shelf, same number as the Procurement Sheet).
              Click the unallocated number to correct it. Click a product to see its photo and which orders currently have it allocated.
              Printing gives a count sheet with blank columns for your physical count — it defaults to low/negative stock only because the full catalog is a very long print job.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select value={stockFilter} onValueChange={(v) => setStockFilter(v as PrintStockFilter)}>
              <SelectTrigger className="w-[210px]">
                <SelectValue placeholder="Filter by stock" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low-or-negative">{STOCK_FILTER_LABELS['low-or-negative']}</SelectItem>
                <SelectItem value="negative">{STOCK_FILTER_LABELS.negative}</SelectItem>
                <SelectItem value="all">{STOCK_FILTER_LABELS.all}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name">Sort by Product Name</SelectItem>
                <SelectItem value="shelf">Sort by Shelf Location</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={handleExportExcel} disabled={isLoading || products.length === 0}>
              <Download className="mr-2 h-4 w-4" /> Export to Excel
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()} disabled={isLoading || products.length === 0}>
              <Printer className="mr-2 h-4 w-4" /> Print
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="print:hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Shelf Location</TableHead>
                <TableHead className="text-right">System Stock</TableHead>
                <TableHead className="text-right">Unallocated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : sortedProducts.length > 0 ? (
                sortedProducts.map(p => {
                  const info = stockInfo?.[p.id];
                  const unallocated = unallocatedOf(p);
                  return (
                    <TableRow key={p.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedProduct(p)}>
                      <TableCell className="font-medium">{displayName(p)}</TableCell>
                      <TableCell>{p.sku || '-'}</TableCell>
                      <TableCell>{p.shelf_location || '-'}</TableCell>
                      <TableCell className="text-right">{p.stock_level ?? 0}</TableCell>
                      <TableCell className="text-right">
                        {stockInfo === null ? (
                          <Skeleton className="h-4 w-12 ml-auto" />
                        ) : unallocated === null ? (
                          <span className="text-muted-foreground" title={info?.isBundle ? 'Bundles hold no stock of their own' : undefined}>-</span>
                        ) : canManageProducts ? (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setEditingProduct(p); }}
                            className="inline-flex items-center gap-1 group/num cursor-pointer hover:bg-slate-100 px-2 py-0.5 rounded border border-transparent hover:border-slate-200 transition-all"
                            title="Click to edit unallocated stock & view full edit history"
                          >
                            <span className={`font-bold ${unallocated > 0 ? 'text-emerald-700' : 'text-slate-500'}`}>{unallocated}</span>
                            <Pencil className="w-3.5 h-3.5 text-slate-400 group-hover/num:text-indigo-600 transition-colors" />
                          </button>
                        ) : (
                          <span className={`font-bold ${unallocated > 0 ? 'text-emerald-700' : 'text-slate-500'}`}>{unallocated}</span>
                        )}
                        {!!info && !info.isBundle && info.unscannedLayawayQty > 0 && (
                          <div
                            className="text-[10px] text-amber-700 font-medium whitespace-nowrap"
                            title={`${info.unscannedLayawayQty} pcs in active Lay-away orders waiting to be scanned/picked`}
                          >
                            +{info.unscannedLayawayQty} lay-away
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center">No products found.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div id="print-area" className="hidden print:block w-full bg-white">
          <div className="flex justify-between items-center mb-4 border-b-2 border-black pb-2">
            <h1 className="text-2xl font-bold uppercase">Inventory Count Sheet</h1>
            <div className="text-right text-sm">
              <p>Date Printed: {format(new Date(), 'PPPP p')}</p>
              <p>Filter: {STOCK_FILTER_LABELS[stockFilter]}</p>
              <p>Total Items: {products.length}</p>
            </div>
          </div>
          <table className="w-full border-collapse border border-black">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-black px-2 py-1 text-left text-xs uppercase w-[32%]">Product</th>
                <th className="border border-black px-2 py-1 text-left text-xs uppercase w-[12%]">SKU</th>
                <th className="border border-black px-2 py-1 text-left text-xs uppercase w-[12%]">Shelf</th>
                <th className="border border-black px-2 py-1 text-right text-xs uppercase w-[8%]">System</th>
                <th className="border border-black px-2 py-1 text-right text-xs uppercase w-[9%]">Unalloc.</th>
                <th className="border border-black px-2 py-1 text-center text-xs uppercase w-[12%]">Physical Count</th>
                <th className="border border-black px-2 py-1 text-left text-xs uppercase w-[15%]">Notes</th>
              </tr>
            </thead>
            <tbody>
              {sortedProducts.map(p => (
                <tr key={p.id}>
                  <td className="border border-black px-2 py-1 text-sm">{displayName(p)}</td>
                  <td className="border border-black px-2 py-1 text-xs font-mono">{p.sku || '-'}</td>
                  <td className="border border-black px-2 py-1 text-xs">{p.shelf_location || '-'}</td>
                  <td className="border border-black px-2 py-1 text-sm text-right">{p.stock_level ?? 0}</td>
                  <td className="border border-black px-2 py-1 text-sm text-right">{unallocatedOf(p) ?? '-'}</td>
                  <td className="border border-black px-2 py-1">&nbsp;</td>
                  <td className="border border-black px-2 py-1">&nbsp;</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
      <style>{`
        @media print {
            .print\\:hidden { display: none !important; }
            #print-area { display: block !important; }
            @page { margin: 1cm; }
        }
      `}</style>
    </Card>
    <ProductAllocationDialog
      product={selectedProduct}
      open={!!selectedProduct}
      onOpenChange={(open) => !open && setSelectedProduct(null)}
    />
    <EditUnallocatedStockDialog
      item={editingItem}
      isOpen={!!editingItem}
      onClose={() => setEditingProduct(null)}
      onSuccess={() => { refetch(); fetchStockInfo(); }}
    />
    </>
  );
}
