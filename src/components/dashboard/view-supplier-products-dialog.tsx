import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useEffect, useState, useMemo } from "react";
import { useSupabase } from "@/lib/supabase/hooks";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import Image from "next/image";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface EditableSupplierCodeProps {
  productId: string;
  supplierId: string;
  currentSupplierPricing: any[];
}

function EditableSupplierCode({ productId, supplierId, currentSupplierPricing }: EditableSupplierCodeProps) {
  const supabase = useSupabase();
  const { toast } = useToast();
  
  const pricingEntry = currentSupplierPricing.find((sp: any) => sp.supplierId === supplierId);
  const initialCode = pricingEntry?.supplierCode || '';
  
  const [value, setValue] = useState(initialCode);
  const [isSaving, setIsSaving] = useState(false);

  // Sync state if props change
  useEffect(() => {
    setValue(initialCode);
  }, [initialCode]);

  const handleBlur = async () => {
    if (value === initialCode) return; // No change
    
    setIsSaving(true);
    try {
      // Create a new array with the updated supplier code
      let updatedPricing = [...currentSupplierPricing];
      const entryIndex = updatedPricing.findIndex(sp => sp.supplierId === supplierId);
      
      if (entryIndex >= 0) {
        updatedPricing[entryIndex] = { ...updatedPricing[entryIndex], supplierCode: value };
      } else {
        // Technically shouldn't happen based on how this dialog works, but just in case
        updatedPricing.push({ supplierId, supplierCode: value, unitCost: 0 });
      }

      const { error } = await supabase
        .from('products')
        .update({ supplier_pricing: updatedPricing })
        .eq('id', productId);

      if (error) throw error;
      
      toast({ title: "Supplier Code Updated", description: "Saved successfully.", duration: 2000 });
    } catch (error: any) {
      console.error("Error updating supplier code:", error);
      toast({ variant: "destructive", title: "Error", description: "Could not save supplier code." });
      setValue(initialCode); // Revert on error
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="relative flex items-center max-w-[120px]">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={handleBlur}
        placeholder="Add code..."
        className="font-mono text-sm h-8"
        disabled={isSaving}
      />
      {isSaving && <Loader2 className="w-3 h-3 absolute right-2 animate-spin text-muted-foreground" />}
    </div>
  );
}

interface ViewSupplierProductsDialogProps {
  supplier: { id: string; name: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ViewSupplierProductsDialog({ supplier, open, onOpenChange }: ViewSupplierProductsDialogProps) {
  const supabase = useSupabase();
  const [products, setProducts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);

  const categories = useMemo(() => {
    return Array.from(new Set(products.map(p => p.category).filter(Boolean))).sort();
  }, [products]);

  const filteredAndSortedProducts = useMemo(() => {
    let result = products;
    if (selectedCategory !== 'all') {
      result = products.filter(p => p.category === selectedCategory);
    }
    return result.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [products, selectedCategory]);

  useEffect(() => {
    if (!open || !supplier || !supabase) return;

    const fetchProducts = async () => {
      setIsLoading(true);
      try {
        // Use a raw JSONB filter to find products where supplier_pricing array
        // contains at least one object with this supplierId (partial object match)
        const { data, error } = await supabase
          .from('products')
          .select('*')
          .filter('supplier_pricing', 'cs', JSON.stringify([{ supplierId: supplier.id }]));

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
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="text-xl">Product Catalog</DialogTitle>
          <DialogDescription>
            Products available to purchase from <strong>{supplier.name}</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-between items-center mt-2">
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filter by Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((cat: any) => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
        </div>

        <div className="flex-1 overflow-y-auto mt-4 border rounded-md">
          <Table>
            <TableHeader className="bg-muted sticky top-0 z-10">
              <TableRow>
                <TableHead>Product (Your Name)</TableHead>
                <TableHead>Supplier Code</TableHead>
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
              {!isLoading && filteredAndSortedProducts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center h-24 text-muted-foreground">
                    {products.length === 0 ? "No products found for this supplier." : "No products found in this category."}
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && filteredAndSortedProducts.map(product => {
                const pricingEntry = product.supplier_pricing?.find((sp: any) => sp.supplierId === supplier.id);
                const unitCost = pricingEntry?.unitCost || 0;
                
                return (
                  <TableRow key={product.id}>
                    <TableCell>
                      <div 
                        className="flex items-center gap-3 cursor-pointer hover:bg-muted/50 p-1 rounded-md transition-colors"
                        onClick={() => setSelectedProduct(product)}
                      >
                        <div className="relative w-10 h-10 border rounded-md bg-muted flex items-center justify-center overflow-hidden shrink-0">
                          {product.images && product.images.length > 0 ? (
                            <Image src={product.images[0]} alt={product.name} fill className="object-cover" />
                          ) : (
                            <span className="text-xs text-muted-foreground">No img</span>
                          )}
                        </div>
                        <div className="font-medium max-w-[200px] truncate" title={product.name}>
                          {product.name}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <EditableSupplierCode 
                        productId={product.id} 
                        supplierId={supplier.id}
                        currentSupplierPricing={product.supplier_pricing || []}
                      />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{product.sku || '-'}</TableCell>
                    <TableCell>
                      {product.category ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-secondary text-secondary-foreground">
                          {product.category}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium">₱{unitCost.toFixed(2)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>

    <Dialog open={!!selectedProduct} onOpenChange={(open) => !open && setSelectedProduct(null)}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Product Details</DialogTitle>
        </DialogHeader>
        {selectedProduct && (
          <div className="flex flex-col items-center gap-4 py-4 text-center">
            <div className="relative w-48 h-48 border rounded-lg bg-muted flex items-center justify-center overflow-hidden">
              {selectedProduct.images && selectedProduct.images.length > 0 ? (
                <Image src={selectedProduct.images[0]} alt={selectedProduct.name} fill className="object-cover" />
              ) : (
                <span className="text-muted-foreground">No image available</span>
              )}
            </div>
            <h3 className="text-lg font-bold leading-tight">{selectedProduct.name}</h3>
            {selectedProduct.sku && (
              <p className="text-sm text-muted-foreground">SKU: {selectedProduct.sku}</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
    </>
  );
}
