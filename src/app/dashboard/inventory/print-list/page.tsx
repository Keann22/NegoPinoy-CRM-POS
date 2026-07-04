'use client';

import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useAllProductsForPrint, type PrintableProduct } from '@/hooks/useAllProductsForPrint';

type SortBy = 'name' | 'shelf';

function displayName(p: PrintableProduct) {
  return p.variant_name ? `${p.name} [${p.variant_name}]` : p.name;
}

/** Products with no shelf location sort to the end — they can't be found by walking shelves. */
function sortProducts(products: PrintableProduct[], sortBy: SortBy): PrintableProduct[] {
  const sorted = [...products];
  if (sortBy === 'shelf') {
    sorted.sort((a, b) => {
      const aEmpty = !a.shelf_location;
      const bEmpty = !b.shelf_location;
      if (aEmpty !== bEmpty) return aEmpty ? 1 : -1;
      const shelfCompare = (a.shelf_location || '').localeCompare(b.shelf_location || '');
      return shelfCompare !== 0 ? shelfCompare : a.name.localeCompare(b.name);
    });
  }
  return sorted;
}

export default function PrintInventoryListPage() {
  const { products, isLoading } = useAllProductsForPrint();
  const [sortBy, setSortBy] = useState<SortBy>('name');
  const sortedProducts = useMemo(() => sortProducts(products, sortBy), [products, sortBy]);

  return (
    <Card className="print:shadow-none print:border-none">
      <CardHeader className="print:hidden">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle className="font-headline">Print Inventory List</CardTitle>
            <CardDescription>
              A printable sheet of every product and its current system stock, with blank columns for writing down your physical count.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name">Sort by Product Name</SelectItem>
                <SelectItem value="shelf">Sort by Shelf Location</SelectItem>
              </SelectContent>
            </Select>
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
                  </TableRow>
                ))
              ) : sortedProducts.length > 0 ? (
                sortedProducts.map(p => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{displayName(p)}</TableCell>
                    <TableCell>{p.sku || '-'}</TableCell>
                    <TableCell>{p.shelf_location || '-'}</TableCell>
                    <TableCell className="text-right">{p.stock_level ?? 0}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center">No products found.</TableCell>
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
              <p>Total Items: {products.length}</p>
            </div>
          </div>
          <table className="w-full border-collapse border border-black">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-black px-2 py-1 text-left text-xs uppercase w-[35%]">Product</th>
                <th className="border border-black px-2 py-1 text-left text-xs uppercase w-[12%]">SKU</th>
                <th className="border border-black px-2 py-1 text-left text-xs uppercase w-[13%]">Shelf</th>
                <th className="border border-black px-2 py-1 text-right text-xs uppercase w-[10%]">System</th>
                <th className="border border-black px-2 py-1 text-center text-xs uppercase w-[13%]">Physical Count</th>
                <th className="border border-black px-2 py-1 text-left text-xs uppercase w-[17%]">Notes</th>
              </tr>
            </thead>
            <tbody>
              {sortedProducts.map(p => (
                <tr key={p.id}>
                  <td className="border border-black px-2 py-1 text-sm">{displayName(p)}</td>
                  <td className="border border-black px-2 py-1 text-xs font-mono">{p.sku || '-'}</td>
                  <td className="border border-black px-2 py-1 text-xs">{p.shelf_location || '-'}</td>
                  <td className="border border-black px-2 py-1 text-sm text-right">{p.stock_level ?? 0}</td>
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
  );
}
