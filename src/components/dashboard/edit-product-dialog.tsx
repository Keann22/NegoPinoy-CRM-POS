'use client';

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useFieldArray } from "react-hook-form";
import { useCollection, useUser, useSupabase } from "@/firebase";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState, useMemo } from "react";
import { useUserProfile } from "@/hooks/useUserProfile";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "../ui/command";
import { FileUpload } from "@/components/ui/file-upload";
import { Trash2, Plus } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { FormattedProduct } from '@/app/dashboard/products/page';

type Supplier = { id: string; name: string; [key: string]: any;};

const editProductSchema = z.object({
  name: z.string().min(1, "Product name is required"),
  sku: z.string().optional(),
  shelfLocation: z.string().optional(),
  description: z.string().optional(),
  categoryId: z.string().optional(),
  sellingPrice: z.coerce.number().min(0, "Selling price must be positive"),
  installmentPrice: z.coerce.number().min(0).optional(),
  images: z.custom<File[]>().optional(),
  supplierPricing: z.array(z.object({
      supplierId: z.string().optional(),
      supplierName: z.string(),
      supplierCode: z.string().optional(),
      unitCost: z.coerce.number().min(0)
  })).optional().default([]),
  variations: z.array(z.object({
      nameSuffix: z.string().min(1, "Variation name is required"),
      sku: z.string().optional(),
      sellingPrice: z.coerce.number().min(0, "Price must be positive"),
      unitCost: z.coerce.number().min(0, "Cost must be positive").optional(),
      quantityOnHand: z.coerce.number().int().min(0, "Stock must be a non-negative integer"),
      images: z.custom<File[]>().optional(),
  })).optional().default([]),
});

type EditProductFormValues = z.infer<typeof editProductSchema>;

interface EditProductDialogProps {
  product: FormattedProduct | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function EditProductDialog({ product, open, onOpenChange, onSuccess }: EditProductDialogProps) {
  const supabase = useSupabase();
  const { user } = useUser();
  const { toast } = useToast();
  const { userProfile } = useUserProfile();

  const [supplierSearch, setSupplierSearch] = useState('');
  const [localProduct, setLocalProduct] = useState<FormattedProduct | null>(null);

  useEffect(() => {
    if (product) setLocalProduct(product);
  }, [product]);

  const displayProduct = product || localProduct;

  const isManagement = useMemo(() => userProfile?.roles?.some(r => ['Admin', 'Owner'].includes(r)), [userProfile]);

  const suppliersQuery = useMemo(
    () => {
      // FIX: Only query suppliers if user is Management AND has typed a search term.
      if (!supabase || !user || !isManagement || supplierSearch.length < 1) return null;
      const searchTermCapitalized = supplierSearch.charAt(0).toUpperCase() + supplierSearch.slice(1);
      return {
        path: 'suppliers',
        constraints: [
            { type: 'orderBy', field: 'name' },
            { type: 'where', field: 'name', op: '>=', value: searchTermCapitalized },
            { type: 'where', field: 'name', op: '<=', value: searchTermCapitalized + '\uf8ff' },
            { type: 'limit', value: 10 }
        ]
      };
    },
    [user, supplierSearch, isManagement]
  );
  const { data: supplierResults, isLoading: isLoadingSuppliers } = useCollection<Supplier>(suppliersQuery);

  const categoriesQuery = useMemo(
    () => supabase && user ? { path: 'categories', constraints: [{ type: 'orderBy', field: 'name' }] } : null,
    [supabase, user]
  );
  const { data: categoryResults, isLoading: isLoadingCategories } = useCollection<{ id: string, name: string }>(categoriesQuery);


  const form = useForm<EditProductFormValues>({
    resolver: zodResolver(editProductSchema),
    defaultValues: {
      supplierPricing: [],
      variations: []
    }
  });

  const { fields: supplierFields, append: appendSupplier, remove: removeSupplier } = useFieldArray({
      control: form.control,
      name: "supplierPricing"
  });

  const { fields: variationFields, append: appendVariation, remove: removeVariation } = useFieldArray({
      control: form.control,
      name: "variations"
  });

  useEffect(() => {
    if (product && open) {
      form.reset({
        name: product.name,
        sku: product.sku,
        shelfLocation: product.shelfLocation || "",
        description: product.description,
        categoryId: product.categoryId,
        sellingPrice: product.sellingPrice,
        installmentPrice: product.installment_price ?? undefined,
        supplierPricing: product.supplierPricing || [],
        variations: [],
      });
      
    } else if (!open) {
      form.reset();
      setSupplierSearch('');
    }
  }, [product, open, form, supabase, isManagement]);
  

  if (!displayProduct) {
    return null;
  }

  async function onSubmit(values: EditProductFormValues) {
    if (!supabase || !displayProduct) return;
    
    // Auto-generate SKU if not provided
    const finalSku = values.sku?.trim() 
      ? values.sku.trim() 
      : `PRD-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;

    if (finalSku !== displayProduct.sku) {
        const { data: existingSku } = await supabase
            .from('products')
            .select('id')
            .eq('sku', finalSku)
            .limit(1);

        if (existingSku && existingSku.length > 0) {
            toast({
                variant: "destructive",
                title: "Duplicate SKU",
                description: `A product with SKU "${finalSku}" already exists. Please use a unique SKU.`,
            });
            return;
        }
    }

    onOpenChange(false);
    
    toast({
      title: "Updating Product...",
      description: `Your product "${values.name}" is being updated.`,
    });

    const { images: imageFiles, supplierPricing, variations, ...productCoreData } = values;

    try {
        let uploadedImageUrls: string[] = displayProduct.images || [];

        if (imageFiles && imageFiles.length > 0) {
            // Upload new images and append them
            const newImageUrls = await Promise.all(
                imageFiles.map(async (file) => {
                    const fileExt = file.name.split('.').pop();
                    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
                    const filePath = `${fileName}`;
                    
                    const { error: uploadError } = await supabase.storage
                        .from('products')
                        .upload(filePath, file);
                        
                    if (uploadError) throw uploadError;
                    
                    const { data: { publicUrl } } = supabase.storage
                        .from('products')
                        .getPublicUrl(filePath);
                        
                    return publicUrl;
                })
            );
            uploadedImageUrls = [...uploadedImageUrls, ...newImageUrls];
        }

        const { error: updateError } = await supabase
            .from('products')
            .update({
                name: productCoreData.name,
                sku: finalSku,
                shelf_location: productCoreData.shelfLocation || null,
                description: productCoreData.description,
                category: productCoreData.categoryId,
                selling_price: productCoreData.sellingPrice,
                installment_price: values.installmentPrice ?? null,
                images: uploadedImageUrls,
                supplier_pricing: supplierPricing || []
            })
            .eq('id', displayProduct.id);

        if (updateError) throw updateError;

        if (variations && variations.length > 0) {
            for (let i = 0; i < variations.length; i++) {
                const v = variations[i];
                let variationImageUrls = [...uploadedImageUrls];
                
                if (v.images && v.images.length > 0) {
                    const newUrls = await Promise.all(
                        v.images.map(async (file) => {
                            const fileExt = file.name.split('.').pop();
                            const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
                            const { error } = await supabase.storage.from('products').upload(fileName, file);
                            if (error) throw error;
                            const { data } = supabase.storage.from('products').getPublicUrl(fileName);
                            return data.publicUrl;
                        })
                    );
                    variationImageUrls = [...variationImageUrls, ...newUrls];
                }

                const vSku = v.sku?.trim() || `PRD-${Date.now().toString().slice(-6)}-${i}-${Math.floor(100 + Math.random() * 900)}`;

                const { data: newProduct, error: insertError } = await supabase
                    .from('products')
                    .insert({
                        name: `${productCoreData.name} - ${v.nameSuffix}`,
                        variant_name: v.nameSuffix,
                        parent_id: displayProduct.id,
                        sku: vSku,
                        shelf_location: productCoreData.shelfLocation || null,
                        description: productCoreData.description,
                        category: productCoreData.categoryId,
                        selling_price: v.sellingPrice,
                        initial_unit_cost: v.unitCost !== undefined ? v.unitCost : (supplierPricing && supplierPricing.length > 0 ? supplierPricing[0].unitCost : 0),
                        supplier_pricing: supplierPricing && supplierPricing.length > 0 ? supplierPricing.map(sp => ({
                              ...sp,
                              unitCost: v.unitCost !== undefined ? v.unitCost : sp.unitCost
                        })) : [],
                        stock_level: v.quantityOnHand,
                        images: variationImageUrls
                    })
                    .select()
                    .single();

                if (insertError) throw insertError;

                if (v.quantityOnHand > 0) {
                    const firstSupplier = supplierPricing && supplierPricing.length > 0 ? supplierPricing[0] : null;
                    const cost = v.unitCost !== undefined ? v.unitCost : (firstSupplier ? firstSupplier.unitCost : 0);
                    
                    await supabase.from('inventory_movements').insert({
                        product_id: newProduct.id,
                        quantity_change: v.quantityOnHand,
                        movement_type: 'initial_stock',
                        timestamp: new Date().toISOString(),
                        reason: 'Initial stock for new variation',
                        supplier_name: firstSupplier ? firstSupplier.supplierName : 'Initial Stock',
                        unit_cost: cost
                    });
                }
            }
        }

        toast({
          title: "Product Updated",
          description: `${values.name} has been successfully updated.`,
        });
        onSuccess?.();
    } catch (error: any) {
        console.error("Error updating product:", error);
        toast({
            variant: "destructive",
            title: "Update Failed",
            description: error.message || `Could not update "${values.name}".`,
        });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] sm:max-w-[600px] md:max-w-[700px] lg:max-w-[800px]">
        <DialogHeader>
          <DialogTitle className="break-words">Edit Product: {displayProduct.name}</DialogTitle>
          <DialogDescription>
            Make changes to the product details below.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-2 py-4 px-1">
                <FormField
                    control={form.control}
                    name="images"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Add Product Images</FormLabel>
                        <FormControl>
                            <FileUpload 
                                value={field.value} 
                                onChange={field.onChange} 
                            />
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Product Name</FormLabel>
                        <FormControl>
                            <Input placeholder="e.g., AeroGrip Silicon Utensil Set" {...field} />
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="sku"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>SKU (Leave blank to auto-generate)</FormLabel>
                        <FormControl>
                            <Input placeholder="e.g., AG-SUS-001" {...field} readOnly className="bg-muted"/>
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="shelfLocation"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Shelf Location (Optional)</FormLabel>
                        <FormControl>
                            <Input placeholder="e.g., A1-Bin3" {...field} />
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                            <Textarea placeholder="Describe the product" {...field} />
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="categoryId"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Category</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                            <FormControl>
                            <SelectTrigger>
                                <SelectValue placeholder="Select a category" />
                            </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                                {isLoadingCategories && <SelectItem value="loading" disabled>Loading...</SelectItem>}
                                {categoryResults?.map(c => (
                                    <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>
                                ))}
                                {!isLoadingCategories && (!categoryResults || categoryResults.length === 0) && (
                                    <SelectItem value="empty" disabled>No categories found</SelectItem>
                                )}
                            </SelectContent>
                        </Select>
                        <FormMessage />
                        </FormItem>
                    )}
                />
                {/* ---- Pricing ---- */}
                <div className="grid grid-cols-2 gap-4 rounded-lg border p-4">
                  <div className="col-span-2">
                    <p className="text-sm font-semibold">Pricing</p>
                  </div>
                  <FormField
                    control={form.control}
                    name="sellingPrice"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Cash Price (₱)</FormLabel>
                        <FormControl>
                            <Input type="number" step="0.01" placeholder="49.99" {...field} />
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="installmentPrice"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Installment Price (₱) <span className="text-muted-foreground text-xs font-normal">First-timers only</span></FormLabel>
                        <FormControl>
                            <Input type="number" step="0.01" placeholder="Leave blank if not eligible" {...field} value={field.value ?? ''} onChange={e => field.onChange(e.target.value === '' ? undefined : Number(e.target.value))} />
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                  />
                </div>
                {isManagement && !displayProduct.children?.length && (
                  <div className="space-y-4 rounded-lg border p-4">
                      <FormLabel className="text-base">Suppliers &amp; Pricing</FormLabel>
                      <div className="space-y-2">
                        {supplierFields.map((field, index) => (
                            <div key={field.id} className="p-3 bg-muted/50 rounded-md border space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-semibold">{field.supplierName}</span>
                                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeSupplier(index)}>
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <FormField
                                        control={form.control}
                                        name={`supplierPricing.${index}.supplierCode`}
                                        render={({ field: codeField }) => (
                                            <FormItem>
                                                <FormLabel className="text-xs text-muted-foreground">Supplier's Product Code</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="e.g. WK-32-SS" className="h-8" {...codeField} />
                                                </FormControl>
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name={`supplierPricing.${index}.unitCost`}
                                        render={({ field: costField }) => (
                                            <FormItem>
                                                <FormLabel className="text-xs text-muted-foreground">Unit Cost (₱)</FormLabel>
                                                <FormControl>
                                                    <Input type="number" step="0.01" className="h-8" {...costField} />
                                                </FormControl>
                                            </FormItem>
                                        )}
                                    />
                                </div>
                            </div>
                        ))}
                      </div>

                      <Command className="rounded-lg border">
                          <CommandInput 
                              placeholder="Search to add a supplier..." 
                              value={supplierSearch} 
                              onValueChange={setSupplierSearch}
                          />
                          {supplierSearch.length > 0 && (
                              <CommandList>
                                  {isLoadingSuppliers && <CommandItem disabled>Searching...</CommandItem>}
                                  {supplierResults && supplierResults.length > 0 && (
                                      <CommandGroup>
                                      {supplierResults.map((s) => (
                                          <CommandItem
                                              key={s.id}
                                              value={s.name}
                                              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                              onSelect={() => {
                                                  const alreadyAdded = supplierFields.some(f => f.supplierId === s.id);
                                                  if (!alreadyAdded) {
                                                      appendSupplier({
                                                          supplierId: s.id,
                                                          supplierName: s.name,
                                                          unitCost: 0
                                                      });
                                                  }
                                                  setSupplierSearch('');
                                              }}
                                          >
                                              {s.name}
                                          </CommandItem>
                                      ))}
                                      </CommandGroup>
                                  )}
                                  {!isLoadingSuppliers && (!supplierResults || supplierResults.length === 0) && supplierSearch.length > 1 && <CommandEmpty>No suppliers found.</CommandEmpty>}
                              </CommandList>
                          )}
                      </Command>
                  </div>
                )}
                <div className="pt-4 border-t space-y-4">
                    {displayProduct.children && displayProduct.children.length > 0 && (
                        <div className="space-y-3 mb-6">
                            <FormLabel className="text-base font-semibold">Existing Variations</FormLabel>
                            <DialogDescription>
                                These are the variations that already exist for this product. To edit them directly, expand the parent row on the main Products table and click Edit on the specific variation.
                            </DialogDescription>
                            <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
                               {displayProduct.children.map(child => (
                                   <div key={child.id} className="flex justify-between items-center bg-muted/30 p-2 rounded-md border text-sm">
                                       <span className="font-medium text-foreground">{child.variantName || child.name}</span>
                                       <span className="text-muted-foreground">{child.price} &bull; Stock: {child.quantityOnHand ?? 0}</span>
                                   </div>
                               ))}
                            </div>
                        </div>
                    )}
                    <FormLabel className="text-base font-semibold">Create New Variations</FormLabel>
                    <DialogDescription>
                        Create new variations (e.g. "5L", "Red") based on this product's details. Each variation will be created as a new separate product.
                    </DialogDescription>
                    {variationFields.map((field, index) => (
                        <div key={field.id} className="p-4 border rounded-lg bg-muted/20 relative space-y-4">
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="absolute top-2 right-2 h-6 w-6 text-muted-foreground hover:text-destructive"
                                onClick={() => removeVariation(index)}
                            >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                            
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <FormField
                                    control={form.control}
                                    name={`variations.${index}.nameSuffix`}
                                    render={({ field: nameField }) => (
                                        <FormItem>
                                            <FormLabel>Variation Name (e.g., 5L, Red)</FormLabel>
                                            <FormControl>
                                                <Input {...nameField} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name={`variations.${index}.sku`}
                                    render={({ field: skuField }) => (
                                        <FormItem>
                                            <FormLabel>SKU (Optional)</FormLabel>
                                            <FormControl>
                                                <Input {...skuField} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name={`variations.${index}.sellingPrice`}
                                    render={({ field: priceField }) => (
                                        <FormItem>
                                            <FormLabel>Price (₱)</FormLabel>
                                            <FormControl>
                                                <Input type="number" step="0.01" {...priceField} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name={`variations.${index}.unitCost`}
                                    render={({ field: costField }) => (
                                        <FormItem>
                                            <FormLabel>Unit Cost (Optional)</FormLabel>
                                            <FormControl>
                                                <Input type="number" step="0.01" {...costField} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name={`variations.${index}.quantityOnHand`}
                                    render={({ field: stockField }) => (
                                        <FormItem>
                                            <FormLabel>Initial Stock</FormLabel>
                                            <FormControl>
                                                <Input type="number" {...stockField} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name={`variations.${index}.images`}
                                    render={({ field: imageField }) => (
                                        <FormItem className="col-span-2">
                                            <FormLabel>Variation Image (Optional)</FormLabel>
                                            <FormControl>
                                                <FileUpload 
                                                    value={imageField.value} 
                                                    onChange={imageField.onChange} 
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>
                        </div>
                    ))}
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full mt-2"
                        onClick={() => appendVariation({ nameSuffix: '', sku: '', sellingPrice: 0, unitCost: undefined, quantityOnHand: 0, images: [] })}
                    >
                        <Plus className="mr-2 h-4 w-4" />
                        Add New Variation
                    </Button>
                </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit">
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
