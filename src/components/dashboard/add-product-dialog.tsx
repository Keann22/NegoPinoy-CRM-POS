'use client';

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useSupabase, useCollection, useUser } from "@/firebase";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState, useMemo } from "react";
import { Switch } from "@/components/ui/switch";
import { Plus } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { FileUpload } from "@/components/ui/file-upload";
import { useUserProfile } from "@/hooks/useUserProfile";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "../ui/command";
import { Trash2 } from "lucide-react";

type Supplier = { id: string; name: string; [key: string]: any;};

const productSchema = z.object({
  name: z.string().min(1, "Product name is required"),
  sku: z.string().optional(),
  shelfLocation: z.string().optional(),
  description: z.string().optional(),
  categoryId: z.string().optional(),
  images: z.custom<File[]>().optional(),
  sellingPrice: z.coerce.number().min(0, "Selling price must be positive").optional().default(0),
  quantityOnHand: z.coerce.number().int().min(0, "Stock must be a non-negative integer").optional().default(0),
  supplierPricing: z.array(z.object({
      supplierId: z.string(),
      supplierName: z.string(),
      unitCost: z.coerce.number().min(0)
  })).optional().default([]),
  hasVariations: z.boolean().default(false),
  variations: z.array(z.object({
      nameSuffix: z.string().min(1, "Variation name is required"),
      sku: z.string().optional(),
      sellingPrice: z.coerce.number().min(0, "Price must be positive"),
      quantityOnHand: z.coerce.number().int().min(0, "Stock must be a non-negative integer"),
      images: z.custom<File[]>().optional(),
  })).optional().default([]),
});

type ProductFormValues = z.infer<typeof productSchema>;

interface AddProductDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  initialValues?: Partial<ProductFormValues>;
  onProductAdded?: (product: { id: string; name: string }) => void;
  triggerButton?: React.ReactNode;
}

export function AddProductDialog(props: AddProductDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const supabase = useSupabase();
  const { user } = useUser();
  const { toast } = useToast();
  const { userProfile } = useUserProfile();

  const [supplierSearch, setSupplierSearch] = useState('');

  const isControlled = props.open !== undefined && props.onOpenChange !== undefined;
  const open = isControlled ? props.open : internalOpen;
  const setOpen = isControlled ? props.onOpenChange : setInternalOpen;

  const isManagement = useMemo(() => userProfile?.roles?.some(r => ['Admin', 'Owner'].includes(r)), [userProfile]);
  const canViewCostPrice = isManagement;

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

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
        name: "",
        sku: "",
        shelfLocation: "",
        description: "",
        categoryId: "",
        images: [],
        sellingPrice: 0,
        quantityOnHand: 0,
        supplierPricing: [],
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

  const hasVariations = form.watch("hasVariations");

  useEffect(() => {
    if (open) {
        form.reset(props.initialValues || {
            name: "",
            sku: "",
            description: "",
            categoryId: "",
            images: [],
            sellingPrice: 0,
            quantityOnHand: 0,
            supplierPricing: [],
            hasVariations: false,
            variations: [],
        });
        setSupplierSearch('');
    }
  }, [open, props.initialValues, form]);

  async function onSubmit(values: ProductFormValues) {
    if (!supabase) return;
    
    // Auto-generate SKU if not provided
    const finalSku = values.sku?.trim() 
      ? values.sku.trim() 
      : `PRD-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;

    // Check if SKU exists using Supabase
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

    setOpen(false);
    
    toast({
      title: "Adding Product...",
      description: `Your product "${values.name}" is being added.`,
    });

    const { images: imageFiles, quantityOnHand, supplierPricing, hasVariations, variations, ...productCoreData } = values;

    try {
        let uploadedImageUrls: string[] = [];

        if (imageFiles && imageFiles.length > 0) {
            uploadedImageUrls = await Promise.all(
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
        }

        const productsToCreate = hasVariations && variations && variations.length > 0 
            ? variations.map((v, i) => ({
                name: `${productCoreData.name} - ${v.nameSuffix}`,
                sku: v.sku?.trim() || `PRD-${Date.now().toString().slice(-6)}-${i}-${Math.floor(100 + Math.random() * 900)}`,
                sellingPrice: v.sellingPrice,
                quantityOnHand: v.quantityOnHand,
                imagesToUpload: v.images
            }))
            : [{
                name: productCoreData.name,
                sku: finalSku, // auto-generated if blank
                sellingPrice: productCoreData.sellingPrice || 0,
                quantityOnHand: quantityOnHand || 0,
                imagesToUpload: [] // Using uploadedImageUrls as fallback anyway
            }];

        for (let i = 0; i < productsToCreate.length; i++) {
            const p = productsToCreate[i];
            
            let variationImageUrls = uploadedImageUrls;
            
            if (p.imagesToUpload && p.imagesToUpload.length > 0) {
                variationImageUrls = await Promise.all(
                    p.imagesToUpload.map(async (file) => {
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
            }

            const { data: newProduct, error: insertError } = await supabase
                .from('products')
                .insert({
                    name: p.name,
                    sku: p.sku,
                    shelf_location: productCoreData.shelfLocation || null,
                    description: productCoreData.description,
                    category: productCoreData.categoryId,
                    selling_price: p.sellingPrice,
                    initial_unit_cost: supplierPricing && supplierPricing.length > 0 ? supplierPricing[0].unitCost : 0,
                    supplier_pricing: supplierPricing || [],
                    stock_level: p.quantityOnHand,
                    images: variationImageUrls
                })
                .select()
                .single();

            if (insertError) throw insertError;
            
            // Only fire the onProductAdded callback for the first variation so it selects something in the dropdown
            if (i === 0) {
                props.onProductAdded?.({ id: newProduct.id, name: p.name });
            }

            if (p.quantityOnHand > 0) {
                const firstSupplier = supplierPricing && supplierPricing.length > 0 ? supplierPricing[0] : null;
                const selectedSupplierName = firstSupplier ? firstSupplier.supplierName : 'Initial Stock';
                const cost = firstSupplier ? firstSupplier.unitCost : 0;
                
                await supabase.from('inventory_movements').insert({
                    product_id: newProduct.id,
                    quantity_change: p.quantityOnHand,
                    movement_type: 'initial_stock',
                    timestamp: new Date().toISOString(),
                    reason: 'Initial stock for new product',
                    supplier_name: selectedSupplierName,
                    unit_cost: cost
                });
            }
        }

        toast({
          title: "Product Added",
          description: `${productsToCreate.length > 1 ? `${productsToCreate.length} variations` : productCoreData.name} successfully added.`,
        });
        
    } catch (error) {
        console.error("Error during product creation:", error);
        toast({
          variant: "destructive",
          title: "Save Failed",
          description: `There was an error creating "${values.name}".`,
        });
    }

    form.reset();
    setSupplierSearch('');
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
        {!isControlled && (
            <DialogTrigger asChild>
                {props.triggerButton || <Button>Add Product</Button>}
            </DialogTrigger>
        )}
      <DialogContent className="w-[calc(100%-2rem)] sm:max-w-[600px] md:max-w-[700px] lg:max-w-[800px]">
        <DialogHeader>
          <DialogTitle>Add New Product</DialogTitle>
          <DialogDescription>
            Fill in the details below to add a new product to your catalog.
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
                        <FormLabel>Product Images (Optional)</FormLabel>
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
                            <Input placeholder="e.g., AG-SUS-001" {...field} />
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
                {isManagement && (
                  <div className="space-y-4 rounded-lg border p-4">
                      <FormLabel className="text-base">Suppliers & Pricing</FormLabel>
                      <div className="space-y-2">
                        {supplierFields.map((field, index) => (
                            <div key={field.id} className="flex items-center gap-2 p-2 bg-muted/50 rounded-md border">
                                <div className="flex-1 truncate text-sm font-medium">
                                    {field.supplierName}
                                </div>
                                <FormField
                                    control={form.control}
                                    name={`supplierPricing.${index}.unitCost`}
                                    render={({ field: costField }) => (
                                        <FormItem className="w-24">
                                            <FormControl>
                                                <Input type="number" step="0.01" className="h-8 text-right" {...costField} />
                                            </FormControl>
                                        </FormItem>
                                    )}
                                />
                                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeSupplier(index)}>
                                    <Trash2 className="h-4 w-4" />
                                </Button>
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
                <div className="pt-4 border-t">
                    <FormField
                        control={form.control}
                        name="hasVariations"
                        render={({ field }) => (
                            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                                <div className="space-y-0.5">
                                    <FormLabel className="text-base">Product has variations</FormLabel>
                                    <DialogDescription>
                                        Create multiple sizes, colors, etc. at once.
                                    </DialogDescription>
                                </div>
                                <FormControl>
                                    <Switch
                                        checked={field.value}
                                        onCheckedChange={field.onChange}
                                    />
                                </FormControl>
                            </FormItem>
                        )}
                    />
                </div>

                {!hasVariations ? (
                    <div className="grid grid-cols-2 gap-4">
                        <FormField
                            control={form.control}
                            name="sellingPrice"
                            render={({ field }) => (
                                <FormItem>
                                <FormLabel>Selling Price (₱)</FormLabel>
                                <FormControl>
                                    <Input type="number" step="0.01" placeholder="49.99" {...field} />
                                </FormControl>
                                <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="quantityOnHand"
                            render={({ field }) => (
                                <FormItem>
                                <FormLabel>Initial Stock</FormLabel>
                                <FormControl>
                                    <Input type="number" placeholder="120" {...field} />
                                </FormControl>
                                <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>
                ) : (
                    <div className="space-y-4 pt-4">
                        <FormLabel className="text-base">Variations</FormLabel>
                        <DialogDescription>
                            Each variation will be created as a separate product (e.g. "Rice Barrel - 5L").
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
                            onClick={() => appendVariation({ nameSuffix: '', sku: '', sellingPrice: 0, quantityOnHand: 0, images: [] })}
                        >
                            <Plus className="mr-2 h-4 w-4" />
                            Add Variation
                        </Button>
                    </div>
                )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit">
                Save Product
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
