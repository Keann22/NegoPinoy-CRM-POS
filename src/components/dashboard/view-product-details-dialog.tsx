import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import type { FormattedProduct } from '@/app/dashboard/products/page';
import { ZoomableImage } from "@/components/ui/zoomable-image";

interface ViewProductDetailsDialogProps {
  product: FormattedProduct | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ViewProductDetailsDialog({ product, open, onOpenChange }: ViewProductDetailsDialogProps) {
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
                  <p className="text-sm mt-1">{product.price}</p>
              </div>
              <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Stock Level</h4>
                  <p className="text-sm mt-1">{product.quantityOnHand}</p>
              </div>
          </div>

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
