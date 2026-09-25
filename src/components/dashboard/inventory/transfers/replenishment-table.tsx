'use client';

import { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Loader2, RefreshCw, CheckCircle } from 'lucide-react';
import type { ReplenishmentSuggestion, Warehouse } from '@/types';

interface ReplenishmentTableProps {
  suggestions: ReplenishmentSuggestion[];
  warehouses: Warehouse[];
  loading: boolean;
  onTransfer: (
    fromWarehouseId: string,
    toWarehouseId: string,
    items: { productId: string; quantity: number }[]
  ) => Promise<boolean>;
  onRefresh: () => void;
}

export function ReplenishmentTable({
  suggestions,
  warehouses,
  loading,
  onTransfer,
  onRefresh,
}: ReplenishmentTableProps) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [transferringId, setTransferringId] = useState<string | null>(null);

  const unit1 = warehouses.find((w) => w.code === 'UNIT1');
  const unit2 = warehouses.find((w) => w.code === 'UNIT2');

  const handleQtyChange = (productId: string, val: string) => {
    const num = parseInt(val, 10);
    setQuantities((prev) => ({
      ...prev,
      [productId]: isNaN(num) ? 0 : Math.max(0, num),
    }));
  };

  const handleQuickTransfer = async (item: ReplenishmentSuggestion) => {
    if (!unit1 || !unit2) return;
    const qty = quantities[item.productId] ?? item.suggestedTransferQty;
    if (qty <= 0) return;

    setTransferringId(item.productId);
    try {
      await onTransfer(unit2.id, unit1.id, [{ productId: item.productId, quantity: qty }]);
    } finally {
      setTransferringId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Replenishment Runner Sheet</h3>
          <p className="text-sm text-muted-foreground">
            Products that are low or empty on Unit 1 picking shelves, but have stock available in Unit 2 Reserve.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {suggestions.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-8 border rounded-lg bg-card text-center text-muted-foreground">
          <CheckCircle className="h-10 w-10 text-emerald-500 mb-2" />
          <p className="font-medium text-foreground">Unit 1 picking shelves are well-stocked!</p>
          <p className="text-xs">No products currently require replenishment from Unit 2.</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden bg-card">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="w-[35%]">Product</TableHead>
                <TableHead className="text-center">Unit 1 Shelf</TableHead>
                <TableHead className="text-center">Unit 1 (Active)</TableHead>
                <TableHead className="text-center">Unit 2 (Reserve)</TableHead>
                <TableHead className="text-center w-[120px]">Transfer Qty</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {suggestions.map((item) => {
                const transferQty = quantities[item.productId] ?? item.suggestedTransferQty;
                const isWorking = transferringId === item.productId;

                return (
                  <TableRow key={item.productId}>
                    <TableCell>
                      <div className="font-medium">{item.productName}</div>
                      {item.sku && <div className="text-xs text-muted-foreground">SKU: {item.sku}</div>}
                    </TableCell>
                    <TableCell className="text-center font-mono text-xs">
                      {item.unit1Shelf ? (
                        <Badge variant="outline">{item.unit1Shelf}</Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={item.unit1Stock === 0 ? 'destructive' : 'secondary'}>
                        {item.unit1Stock} pcs
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="text-blue-600 border-blue-300 bg-blue-50">
                        {item.unit2Stock} in reserve
                      </Badge>
                      {item.unit2Shelf && (
                        <div className="text-[10px] text-muted-foreground">Loc: {item.unit2Shelf}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Input
                        type="number"
                        min="1"
                        max={item.unit2Stock}
                        value={transferQty}
                        onChange={(e) => handleQtyChange(item.productId, e.target.value)}
                        className="h-8 w-20 text-center mx-auto"
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        onClick={() => handleQuickTransfer(item)}
                        disabled={isWorking || transferQty <= 0 || transferQty > item.unit2Stock}
                      >
                        {isWorking ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-1" />
                        ) : (
                          <ArrowRight className="h-4 w-4 mr-1" />
                        )}
                        Transfer to Unit 1
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
