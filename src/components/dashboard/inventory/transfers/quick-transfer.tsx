'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ProductSearch } from '@/components/dashboard/inventory/product-search';
import { ArrowRightLeft, Loader2, PackageCheck } from 'lucide-react';
import type { Warehouse } from '@/types';
import { useSupabase } from '@/lib/supabase/hooks';

interface QuickTransferProps {
  warehouses: Warehouse[];
  isTransferring: boolean;
  onTransfer: (
    fromWarehouseId: string,
    toWarehouseId: string,
    items: { productId: string; quantity: number }[],
    notes?: string
  ) => Promise<boolean>;
}

export function QuickTransfer({ warehouses, isTransferring, onTransfer }: QuickTransferProps) {
  const supabase = useSupabase();
  const unit1 = warehouses.find((w) => w.code === 'UNIT1');
  const unit2 = warehouses.find((w) => w.code === 'UNIT2');

  const [fromWarehouseId, setFromWarehouseId] = useState<string>(unit2?.id || '');
  const [toWarehouseId, setToWarehouseId] = useState<string>(unit1?.id || '');
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [fromStock, setFromStock] = useState<number | null>(null);
  const [quantity, setQuantity] = useState<number>(1);
  const [notes, setNotes] = useState<string>('');
  const [loadingStock, setLoadingStock] = useState(false);

  // When product or fromWarehouse changes, fetch live source warehouse stock
  const fetchStock = async (productId: string, whId: string) => {
    if (!supabase || !productId || !whId) return;
    setLoadingStock(true);
    try {
      const { data } = await supabase
        .from('product_warehouse_stock')
        .select('stock_level')
        .eq('product_id', productId)
        .eq('warehouse_id', whId)
        .maybeSingle();

      setFromStock(data?.stock_level ?? 0);
    } catch {
      setFromStock(0);
    } finally {
      setLoadingStock(false);
    }
  };

  const handleProductSelect = (product: any) => {
    setSelectedProduct(product);
    if (fromWarehouseId) {
      fetchStock(product.id, fromWarehouseId);
    }
  };

  const handleFromChange = (whId: string) => {
    setFromWarehouseId(whId);
    if (selectedProduct) {
      fetchStock(selectedProduct.id, whId);
    }
  };

  const handleSwap = () => {
    const prevFrom = fromWarehouseId;
    const prevTo = toWarehouseId;
    setFromWarehouseId(prevTo);
    setToWarehouseId(prevFrom);
    if (selectedProduct) {
      fetchStock(selectedProduct.id, prevTo);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct || !fromWarehouseId || !toWarehouseId || quantity <= 0) return;

    const ok = await onTransfer(
      fromWarehouseId,
      toWarehouseId,
      [{ productId: selectedProduct.id, quantity }],
      notes || 'Quick Transfer'
    );

    if (ok) {
      setSelectedProduct(null);
      setFromStock(null);
      setQuantity(1);
      setNotes('');
    }
  };

  return (
    <Card className="max-w-2xl mx-auto shadow-sm">
      <CardHeader>
        <CardTitle className="text-xl flex items-center gap-2">
          <ArrowRightLeft className="h-5 w-5 text-indigo-600" />
          Quick Stock Transfer
        </CardTitle>
        <CardDescription>
          Move items between Unit 2 (Reserve) and Unit 1 (Fulfillment Hub).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Warehouse Direction */}
          <div className="grid grid-cols-[1fr,auto,1fr] gap-3 items-end">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Source Warehouse (From)</Label>
              <Select value={fromWarehouseId} onValueChange={handleFromChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Source" />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              type="button"
              variant="outline"
              size="icon"
              className="mb-0.5"
              onClick={handleSwap}
              title="Swap Direction"
            >
              <ArrowRightLeft className="h-4 w-4" />
            </Button>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Destination (To)</Label>
              <Select value={toWarehouseId} onValueChange={setToWarehouseId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Destination" />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id} disabled={w.id === fromWarehouseId}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Product Selector */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Select Product to Transfer</Label>
            {selectedProduct ? (
              <div className="p-3 border rounded-lg flex items-center justify-between bg-muted/30">
                <div>
                  <div className="font-medium text-sm">{selectedProduct.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {loadingStock ? (
                      'Checking available stock...'
                    ) : (
                      <>
                        Available in Source Warehouse:{' '}
                        <span className="font-semibold text-foreground">{fromStock ?? 0} pcs</span>
                      </>
                    )}
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setSelectedProduct(null)}>
                  Change
                </Button>
              </div>
            ) : (
              <ProductSearch onProductSelect={handleProductSelect} />
            )}
          </div>

          {/* Quantity & Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Quantity to Move</Label>
              <Input
                type="number"
                min="1"
                max={fromStock !== null && fromStock > 0 ? fromStock : undefined}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                disabled={!selectedProduct}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Notes (Optional)</Label>
              <Input
                placeholder="e.g. Daily morning replenishment"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={!selectedProduct}
              />
            </div>
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={!selectedProduct || isTransferring || (fromStock !== null && quantity > fromStock)}
          >
            {isTransferring ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Executing Transfer...
              </>
            ) : (
              <>
                <PackageCheck className="h-4 w-4 mr-2" />
                Confirm & Transfer {quantity} pcs
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
