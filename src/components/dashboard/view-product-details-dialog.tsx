import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import type { FormattedProduct } from '@/types';
import { ZoomableImage } from "@/components/ui/zoomable-image";
import { useSupabase } from "@/lib/supabase/hooks";
import { useState, useEffect } from "react";

interface ViewProductDetailsDialogProps {
  product: FormattedProduct | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ViewProductDetailsDialog({ product, open, onOpenChange }: ViewProductDetailsDialogProps) {
  const supabase = useSupabase();
  const [warehouseStock, setWarehouseStock] = useState<any[]>([]);

  useEffect(() => {
    if (!product?.id || !open || !supabase) return;
    const loadStock = async () => {
      try {
        const { data } = await supabase
          .from('product_warehouse_stock')
          .select('stock_level, shelf_location, warehouse:warehouses(name, code, is_fulfillment_hub)')
          .eq('product_id', product.id);
        if (data) {
          // Sort fulfillment hub first
          data.sort((a: any, b: any) => (b.warehouse?.is_fulfillment_hub ? 1 : 0) - (a.warehouse?.is_fulfillment_hub ? 1 : 0));
          setWarehouseStock(data);
        }
      } catch (err) {
        console.error('Failed to load warehouse stock:', err);
      }
    };
    loadStock();
  }, [product?.id, open, supabase]);

  if (!product) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">Product Details</DialogTitle>
          <DialogDescription>
            Detailed information about this product.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-6">
          {/* Images */}
          {product.images && product.images.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-2">
                {product.images.filter(img => !img.includes('placehold.co')).map((img, i) => (
                    <div key={i} className="relative w-24 h-24 shrink-0 rounded-md overflow-hidden border">
                        <ZoomableImage src={img} alt={`${product.name} ${i+1}`} fill className="object-cover" />
                    </div>
                ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
              <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Product Name</h4>
                  {product.parentName ? (
                    <p className="font-medium text-base">
                      {product.parentName}
                      <span className="text-muted-foreground"> — {product.variantName || product.name}</span>
                    </p>
                  ) : (
                    <p className="font-medium text-base">{product.name}</p>
                  )}
              </div>
              <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Status</h4>
                  <div className="mt-1">
                    <Badge variant={product.status.variant}>{product.status.text}</Badge>
                  </div>
              </div>
              <div>
                  <h4 className="text-sm font-medium text-muted-foreground">SKU</h4>
                  <p className="font-mono text-sm mt-1">{product.sku || 'N/A'}</p>
              </div>
              <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Category</h4>
                  <p className="text-sm mt-1">{product.categoryId || 'N/A'}</p>
              </div>
              <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Selling Price</h4>
                  {product.onSale ? (
                    <p className="text-sm mt-1 flex items-center gap-2">
                      {product.regularPriceLabel && (
                        <span className="text-muted-foreground line-through">{product.regularPriceLabel}</span>
                      )}
                      <span className="text-green-600 dark:text-green-500 font-medium">{product.price}</span>
                      <Badge variant="outline" className="border-green-600/40 text-green-600 dark:text-green-500">On Sale</Badge>
                    </p>
                  ) : (
                    <p className="text-sm mt-1">{product.price}</p>
                  )}
              </div>
              <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Total Stock</h4>
                  <p className="text-sm font-semibold mt-1">{product.quantityOnHand} pcs</p>
              </div>
          </div>

          {/* Warehouse Stock Breakdown */}
          {warehouseStock.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">Location & Storage Breakdown</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {warehouseStock.map((ws, i) => (
                  <div key={i} className="border rounded-lg p-3 bg-muted/20 flex flex-col justify-between">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-semibold text-foreground">{ws.warehouse?.name}</span>
                      <Badge variant={ws.warehouse?.is_fulfillment_hub ? 'default' : 'secondary'} className="text-[10px] px-1.5 py-0">
                        {ws.warehouse?.code}
                      </Badge>
                    </div>
                    <div className="mt-2.5 flex items-baseline justify-between">
                      <span className="text-xl font-bold">{ws.stock_level} pcs</span>
                      <span className="text-xs font-mono text-muted-foreground">
                        {ws.shelf_location ? `Shelf: ${ws.shelf_location}` : 'No shelf'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">Description</h4>
              <div className="bg-muted/50 rounded-md p-3 text-sm whitespace-pre-wrap text-foreground min-h-[60px]">
                  {product.description || <span className="text-muted-foreground italic">No description provided.</span>}
              </div>
          </div>

          {/* Supplier Pricing section if available */}
          {product.supplierPricing && product.supplierPricing.length > 0 && (
              <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">Supplier Pricing</h4>
                  <div className="border rounded-md overflow-hidden">
                      <table className="w-full text-sm">
                          <thead className="bg-muted">
                              <tr>
                                  <th className="text-left px-3 py-2 font-medium">Supplier</th>
                                  <th className="text-right px-3 py-2 font-medium">Unit Cost</th>
                              </tr>
                          </thead>
                          <tbody>
                              {product.supplierPricing.map((sp, i) => (
                                  <tr key={i} className="border-t">
                                      <td className="px-3 py-2">{sp.supplierName}</td>
                                      <td className="px-3 py-2 text-right">₱{Number(sp.unitCost).toFixed(2)}</td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  </div>
              </div>
          )}

        </div>
      </DialogContent>
    </Dialog>
  );
}
