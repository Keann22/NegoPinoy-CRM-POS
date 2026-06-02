import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useEffect, useState } from "react";
import { useSupabase } from "@/firebase";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import Image from "next/image";

interface ViewSupplierProductsDialogProps {
  supplier: { id: string; name: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ViewSupplierProductsDialog({ supplier, open, onOpenChange }: ViewSupplierProductsDialogProps) {
  const supabase = useSupabase();
  const [products, setProducts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!open || !supplier || !supabase) return;

    const fetchProducts = async () => {
      setIsLoading(true);
      try {
        // Query products where supplier_pricing array contains an object with this supplierId
        const { data, error } = await supabase
          .from('products')
          .select('*')
          .contains('supplier_pricing', [{ supplierId: supplier.id }]);

        if (error) throw error;
        setProducts(data || []);
      } catch (error) {
        console.error("Error fetching supplier products:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchProducts();
  }, [open, supplier, supabase]);

  if (!supplier) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="text-xl">Product Catalog</DialogTitle>
          <DialogDescription>
            Products available to purchase from <strong>{supplier.name}</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto mt-4 border rounded-md">
          <Table>
            <TableHeader className="bg-muted sticky top-0 z-10">
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Unit Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-10 w-10 rounded-md" />
                      <Skeleton className="h-4 w-32" />
                    </div>
                  </TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                </TableRow>
              ))}

              {!isLoading && products.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="h-32 text-center text-muted-foreground">
                    No products found for this supplier.
                  </TableCell>
                </TableRow>
              )}

              {!isLoading && products.map((product) => {
                // Find the specific pricing entry for this supplier
                const pricingEntry = (product.supplier_pricing || []).find(
                  (sp: any) => sp.supplierId === supplier.id
                );
                
                const imageUrl = product.images && product.images.length > 0 ? product.images[0] : 'https://placehold.co/64x64';

                return (
                  <TableRow key={product.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="relative h-10 w-10 rounded-md overflow-hidden border shrink-0">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={imageUrl} alt={product.name} className="object-cover w-full h-full" />
                        </div>
                        <span className="font-medium line-clamp-2">{product.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{product.sku || '-'}</TableCell>
                    <TableCell>{product.category || product.categoryId || '-'}</TableCell>
                    <TableCell className="text-right font-semibold">
                      {pricingEntry ? `₱${Number(pricingEntry.unitCost).toFixed(2)}` : '-'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
