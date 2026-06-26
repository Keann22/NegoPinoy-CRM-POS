'use client';

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useSupabase, useUser } from "@/lib/supabase/hooks";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState, useMemo } from "react";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileUpload } from "@/components/ui/file-upload";
import { useUserProfile } from "@/hooks/useUserProfile";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import type { FormattedProduct } from '@/types';
import { ProductSupplierSection } from './products/ProductSupplierSection';
import { ProductVariationsSection } from './products/ProductVariationsSection';

// ─── Types ───────────────────────────────────────────────────────────────────

type Supplier = { id: string; name: string; [key: string]: any };

const productSchema = z.object({
  name: z.string().min(1, "Product name is required"),
  sku: z.string().optional(),
  shelfLocation: z.string().optional(),
  description: z.string().optional(),
  categoryId: z.string().optional(),
  images: z.custom<File[]>().optional(),
  sellingPrice: z.coerce.number().min(0, "Selling price must be positive").optional().default(0),
  installmentPrice: z.coerce.number().min(0).optional(),
  quantityOnHand: z.coerce.number().int().min(0).optional().default(0),
  supplierPricing: z.array(z.object({
    supplierId: z.string().optional(),
    supplierName: z.string(),
    supplierCode: z.string().optional(),
    unitCost: z.coerce.number().min(0),
  })).optional().default([]),
  hasVariations: z.boolean().default(false),
  variations: z.array(z.object({
    nameSuffix: z.string().min(1, "Variation name is required"),
    sku: z.string().optional(),
    sellingPrice: z.coerce.number().min(0, "Price must be positive"),
    unitCost: z.coerce.number().min(0, "Cost must be positive").optional(),
    quantityOnHand: z.coerce.number().int().min(0),
    images: z.custom<File[]>().optional(),
  })).optional().default([]),
  assemblyRecipe: z.array(z.object({
    productId: z.string().min(1),
    productName: z.string(),
    quantity: z.coerce.number().min(1),
  })).optional().default([]),
});

type ProductFormValues = z.infer<typeof productSchema>;

// ─── Shared image upload helper ───────────────────────────────────────────────

async function uploadImages(supabase: any, files: File[]): Promise<string[]> {
  return Promise.all(files.map(async (file) => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const { error } = await supabase.storage.from('products').upload(fileName, file);
    if (error) throw error;
    const { data: { publicUrl } } = supabase.storage.from('products').getPublicUrl(fileName);
    return publicUrl;
  }));
}

// ─── Props ────────────────────────────────────────────────────────────────────

type CreateProps = {
  mode: 'create';
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  initialValues?: Partial<ProductFormValues>;
  onProductAdded?: (product: { id: string; name: string }) => void;
  triggerButton?: React.ReactNode;
};

type EditProps = {
  mode: 'edit';
  product: FormattedProduct | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
};

type ProductDialogProps = CreateProps | EditProps;

// ─── Component ────────────────────────────────────────────────────────────────

export function ProductDialog(props: ProductDialogProps) {
  const isEdit = props.mode === 'edit';

  // Controlled/uncontrolled open state (create mode can be uncontrolled)
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = props.open !== undefined && props.onOpenChange !== undefined;
  const open = isControlled ? props.open! : internalOpen;
  const setOpen = isControlled ? props.onOpenChange! : setInternalOpen;

  const supabase = useSupabase();
  const { user } = useUser();
  const { toast } = useToast();
  const { userProfile } = useUserProfile();
  const isManagement = useMemo(() => userProfile?.roles?.some((r: string) => ['Admin', 'Owner'].includes(r)), [userProfile]);

  const [supplierSearch, setSupplierSearch] = useState('');
  const [componentSearch, setComponentSearch] = useState('');
  const [localProduct, setLocalProduct] = useState<FormattedProduct | null>(null);

  // Keep localProduct in sync so dialog doesn't blank while closing
  useEffect(() => {
    if (isEdit && props.mode === 'edit' && props.product) setLocalProduct(props.product);
  }, [isEdit, props]);
  const displayProduct = isEdit ? ((props as EditProps).product || localProduct) : null;

  // ── Queries (direct Supabase) ─────────────────────────────────────────────

  const [supplierResults, setSupplierResults] = useState<Supplier[]>([]);
  const [isLoadingSuppliers, setIsLoadingSuppliers] = useState(false);
  useEffect(() => {
    if (!supabase || !user || !isManagement || supplierSearch.length < 1) { setSupplierResults([]); return; }
    const handler = setTimeout(async () => {
      setIsLoadingSuppliers(true);
      let query = supabase.from('suppliers').select('id, name');
      const searchWords = supplierSearch.split(' ').filter(w => w.trim() !== '');
      searchWords.forEach(w => {
          query = query.ilike('name', `%${w}%`);
      });
      const { data } = await query.order('name').limit(10);
      setSupplierResults(data || []);
      setIsLoadingSuppliers(false);
    }, 250);
    return () => clearTimeout(handler);
  }, [supabase, user, isManagement, supplierSearch]);

  const [categoryResults, setCategoryResults] = useState<{ id: string; name: string }[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);
  useEffect(() => {
    if (!supabase || !user) return;
    setIsLoadingCategories(true);
    supabase.from('categories').select('id, name').order('name').then(({ data }) => {
      setCategoryResults(data || []);
      setIsLoadingCategories(false);
    });
  }, [supabase, user]);

  const [componentResults, setComponentResults] = useState<{ id: string; name: string }[]>([]);
  const [isLoadingComponents, setIsLoadingComponents] = useState(false);
  useEffect(() => {
    if (!supabase || !user || componentSearch.length < 1) { setComponentResults([]); return; }
    const handler = setTimeout(async () => {
      setIsLoadingComponents(true);
      let query = supabase.from('products').select('id, name, variant_name');
      const searchWords = componentSearch.split(' ').filter(w => w.trim() !== '');
      searchWords.forEach(w => {
          query = query.or(`name.ilike.%${w}%,variant_name.ilike.%${w}%`);
      });
      const { data } = await query.order('name').limit(10);
      setComponentResults(data || []);
      setIsLoadingComponents(false);
    }, 250);
    return () => clearTimeout(handler);
  }, [supabase, user, componentSearch]);

  // ── Form ─────────────────────────────────────────────────────────────────

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: { name: '', sku: '', shelfLocation: '', description: '', categoryId: '', images: [], sellingPrice: 0, quantityOnHand: 0, supplierPricing: [], hasVariations: false, variations: [], assemblyRecipe: [] },
  });

  const { fields: supplierFields, append: appendSupplier, remove: removeSupplier } = useFieldArray({ control: form.control, name: 'supplierPricing' });
  const { fields: variationFields, append: appendVariation, remove: removeVariation } = useFieldArray({ control: form.control, name: 'variations' });
  const { fields: recipeFields, append: appendRecipe, remove: removeRecipe } = useFieldArray({ control: form.control, name: 'assemblyRecipe' });
  const hasVariations = form.watch('hasVariations');

  // Reset on open
  useEffect(() => {
    if (open) {
      if (isEdit && displayProduct) {
        form.reset({
          name: displayProduct.name ?? '',
          sku: displayProduct.sku ?? '',
          shelfLocation: displayProduct.shelfLocation || '',
          description: displayProduct.description ?? '',
          categoryId: displayProduct.categoryId ?? undefined,
          sellingPrice: displayProduct.sellingPrice ?? 0,
          installmentPrice: displayProduct.installment_price ?? undefined,
          supplierPricing: displayProduct.supplierPricing || [],
          variations: [],
          assemblyRecipe: displayProduct.assembly_recipe || [],
        });
      } else if (!isEdit) {
        const iv = (props as CreateProps).initialValues;
        form.reset(iv || { name: '', sku: '', description: '', categoryId: '', images: [], sellingPrice: 0, quantityOnHand: 0, supplierPricing: [], hasVariations: false, variations: [] });
      }
      setSupplierSearch('');
      setComponentSearch('');
    } else {
      form.reset();
      setSupplierSearch('');
      setComponentSearch('');
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Submit ───────────────────────────────────────────────────────────────

  async function onSubmit(values: ProductFormValues) {
    if (!supabase) return;

    // SKU validation
    const finalSku = values.sku?.trim() || `PRD-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;
    const shouldCheckSku = !isEdit || finalSku !== displayProduct?.sku;
    if (shouldCheckSku) {
      const { data: existingSku } = await supabase.from('products').select('id').eq('sku', finalSku).limit(1);
      if (existingSku && existingSku.length > 0) {
        toast({ variant: 'destructive', title: 'Duplicate SKU', description: `A product with SKU "${finalSku}" already exists.` });
        return;
      }
    }

    setOpen(false);
    toast({ title: isEdit ? 'Updating Product...' : 'Adding Product...', description: `"${values.name}" is being ${isEdit ? 'updated' : 'added'}.` });

    const { images: imageFiles, quantityOnHand, supplierPricing, hasVariations: _hv, variations, installmentPrice, assemblyRecipe, ...core } = values;

    try {
      if (isEdit && displayProduct) {
        // ── EDIT MODE ──────────────────────────────────────────────────────
        let uploadedImageUrls: string[] = displayProduct.images || [];
        if (imageFiles && imageFiles.length > 0) {
          const newUrls = await uploadImages(supabase, imageFiles);
          uploadedImageUrls = [...uploadedImageUrls, ...newUrls];
        }

        const { error } = await supabase.from('products').update({
          name: core.name, sku: finalSku, shelf_location: core.shelfLocation || null,
          description: core.description, category: core.categoryId,
          selling_price: core.sellingPrice, installment_price: installmentPrice ?? null,
          images: uploadedImageUrls, supplier_pricing: supplierPricing || [],
          assembly_recipe: assemblyRecipe || [],
        }).eq('id', displayProduct.id);
        if (error) throw error;

        // Create any new variations
        if (variations && variations.length > 0) {
          for (let i = 0; i < variations.length; i++) {
            const v = variations[i];
            let varImages = [...uploadedImageUrls];
            if (v.images && v.images.length > 0) varImages = [...varImages, ...await uploadImages(supabase, v.images)];
            const vSku = v.sku?.trim() || `PRD-${Date.now().toString().slice(-6)}-${i}-${Math.floor(100 + Math.random() * 900)}`;
            const { data: newVar, error: varErr } = await supabase.from('products').insert({
              name: `${core.name} - ${v.nameSuffix}`, variant_name: v.nameSuffix, parent_id: displayProduct.id,
              sku: vSku, shelf_location: core.shelfLocation || null, description: core.description,
              category: core.categoryId, selling_price: v.sellingPrice,
              initial_unit_cost: v.unitCost ?? supplierPricing?.[0]?.unitCost ?? 0,
              supplier_pricing: supplierPricing || [], stock_level: v.quantityOnHand, images: varImages,
            }).select().single();
            if (varErr) throw varErr;
            if (v.quantityOnHand > 0) {
              const cost = v.unitCost ?? supplierPricing?.[0]?.unitCost ?? 0;
              await supabase.from('inventory_movements').insert({ product_id: newVar.id, quantity_change: v.quantityOnHand, movement_type: 'initial_stock', timestamp: new Date().toISOString(), reason: 'Initial stock for new variation', supplier_name: supplierPricing?.[0]?.supplierName || 'Initial Stock', unit_cost: cost });
            }
          }
        }

        toast({ title: 'Product Updated', description: `${values.name} has been successfully updated.` });
        (props as EditProps).onSuccess?.();

      } else {
        // ── CREATE MODE ────────────────────────────────────────────────────
        let uploadedImageUrls: string[] = [];
        if (imageFiles && imageFiles.length > 0) uploadedImageUrls = await uploadImages(supabase, imageFiles);

        let parentProductId: string | null = null;
        if (hasVariations && variations && variations.length > 0) {
          const { data: parent, error: pErr } = await supabase.from('products').insert({
            name: core.name, sku: finalSku, shelf_location: core.shelfLocation || null,
            description: core.description, category: core.categoryId, images: uploadedImageUrls,
            selling_price: 0, installment_price: null, stock_level: 0, supplier_pricing: [],
          }).select().single();
          if (pErr) throw pErr;
          parentProductId = parent.id;
          (props as CreateProps).onProductAdded?.({ id: parent.id, name: core.name });
        }

        const productsToCreate = hasVariations && variations && variations.length > 0
          ? variations.map((v, i) => ({ name: `${core.name} - ${v.nameSuffix}`, variant_name: v.nameSuffix, sku: v.sku?.trim() || `PRD-${Date.now().toString().slice(-6)}-${i}-${Math.floor(100 + Math.random() * 900)}`, sellingPrice: v.sellingPrice, unitCost: v.unitCost, quantityOnHand: v.quantityOnHand, imagesToUpload: v.images }))
          : [{ name: core.name, variant_name: null, sku: finalSku, sellingPrice: core.sellingPrice || 0, unitCost: undefined, quantityOnHand: quantityOnHand || 0, imagesToUpload: [] as File[] }];

        for (let i = 0; i < productsToCreate.length; i++) {
          const p = productsToCreate[i];
          let varImages = uploadedImageUrls;
          if (p.imagesToUpload && p.imagesToUpload.length > 0) varImages = await uploadImages(supabase, p.imagesToUpload as File[]);

          const { data: newProduct, error: insErr } = await supabase.from('products').insert({
            name: p.name, variant_name: p.variant_name, parent_id: parentProductId, sku: p.sku,
            shelf_location: core.shelfLocation || null, description: core.description, category: core.categoryId,
            selling_price: p.sellingPrice, installment_price: installmentPrice ?? null,
            initial_unit_cost: p.unitCost ?? supplierPricing?.[0]?.unitCost ?? 0,
            supplier_pricing: supplierPricing || [], stock_level: p.quantityOnHand, images: varImages,
          }).select().single();
          if (insErr) throw insErr;

          if (i === 0 && !parentProductId) (props as CreateProps).onProductAdded?.({ id: newProduct.id, name: p.name });

          if (p.quantityOnHand > 0) {
            const cost = p.unitCost ?? supplierPricing?.[0]?.unitCost ?? 0;
            await supabase.from('inventory_movements').insert({ product_id: newProduct.id, quantity_change: p.quantityOnHand, movement_type: 'initial_stock', timestamp: new Date().toISOString(), reason: 'Initial stock for new product', supplier_name: supplierPricing?.[0]?.supplierName || 'Initial Stock', unit_cost: cost });
          }
        }

        toast({ title: 'Product Added', description: `${productsToCreate.length > 1 ? `${productsToCreate.length} variations` : core.name} successfully added.` });
        form.reset();
        setSupplierSearch('');
      }
    } catch (error: any) {
      console.error('Product save error:', error);
      toast({ variant: 'destructive', title: isEdit ? 'Update Failed' : 'Save Failed', description: error.message || `Could not ${isEdit ? 'update' : 'create'} "${values.name}".` });
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  if (isEdit && !displayProduct) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!isControlled && (props as CreateProps).mode === 'create' && (
        <DialogTrigger asChild>
          {(props as CreateProps).triggerButton || <Button>Add Product</Button>}
        </DialogTrigger>
      )}
      <DialogContent className="w-[calc(100%-2rem)] sm:max-w-[600px] md:max-w-[700px] lg:max-w-[800px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit Product: ${displayProduct?.name}` : 'Add New Product'}</DialogTitle>
          <DialogDescription>{isEdit ? 'Make changes to the product details below.' : 'Fill in the details below to add a new product to your catalog.'}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-2 py-4 px-1">

              {/* Images */}
              <FormField control={form.control} name="images" render={({ field }) => (
                <FormItem>
                  <FormLabel>{isEdit ? 'Add Product Images' : 'Product Images (Optional)'}</FormLabel>
                  <FormControl><FileUpload value={field.value || []} onChange={field.onChange} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              {/* Name */}
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem><FormLabel>Product Name</FormLabel><FormControl><Input placeholder="e.g., AeroGrip Silicon Utensil Set" {...field} /></FormControl><FormMessage /></FormItem>
              )} />

              {/* SKU */}
              <FormField control={form.control} name="sku" render={({ field }) => (
                <FormItem>
                  <FormLabel>SKU (Leave blank to auto-generate)</FormLabel>
                  <FormControl><Input placeholder="e.g., AG-SUS-001" {...field} readOnly={isEdit} className={isEdit ? 'bg-muted' : ''} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              {/* Shelf Location */}
              <FormField control={form.control} name="shelfLocation" render={({ field }) => (
                <FormItem><FormLabel>Shelf Location (Optional)</FormLabel><FormControl><Input placeholder="e.g., A1-Bin3" {...field} /></FormControl><FormMessage /></FormItem>
              )} />

              {/* Description */}
              <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem><FormLabel>Description</FormLabel><FormControl><Textarea placeholder="Describe the product" {...field} /></FormControl><FormMessage /></FormItem>
              )} />

              {/* Category */}
              <FormField control={form.control} name="categoryId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select a category" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {isLoadingCategories && <SelectItem value="loading" disabled>Loading...</SelectItem>}
                      {categoryResults?.map(c => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}
                      {!isLoadingCategories && !categoryResults?.length && <SelectItem value="empty" disabled>No categories found</SelectItem>}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              {/* Pricing (edit mode) */}
              {isEdit && (
                <div className="grid grid-cols-2 gap-4 rounded-lg border p-4">
                  <div className="col-span-2"><p className="text-sm font-semibold">Pricing</p></div>
                  <FormField control={form.control} name="sellingPrice" render={({ field }) => (
                    <FormItem><FormLabel>Cash Price (₱)</FormLabel><FormControl><Input type="number" step="0.01" placeholder="49.99" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="installmentPrice" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Installment Price (₱) <span className="text-muted-foreground text-xs font-normal">First-timers only</span></FormLabel>
                      <FormControl><Input type="number" step="0.01" placeholder="Leave blank if not eligible" {...field} value={field.value ?? ''} onChange={e => field.onChange(e.target.value === '' ? undefined : Number(e.target.value))} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
              )}

              {/* Suppliers (management, no-children edit) */}
              {isManagement && (!isEdit || !(displayProduct as FormattedProduct)?.children?.length) && (
                <ProductSupplierSection
                  form={form}
                  supplierFields={supplierFields}
                  appendSupplier={appendSupplier}
                  removeSupplier={removeSupplier}
                  supplierSearch={supplierSearch}
                  onSupplierSearchChange={setSupplierSearch}
                  supplierResults={supplierResults}
                  isLoadingSuppliers={isLoadingSuppliers}
                  isEdit={isEdit}
                />
              )}

              {/* Assembly Recipe (edit only, management only) */}
              {isEdit && (
                <div className="space-y-4 rounded-lg border p-4">
                  <FormLabel className="text-base">Assembly Recipe (Bundling)</FormLabel>
                  <DialogDescription>If this product is a bundle, add the individual component products here.</DialogDescription>
                  <div className="space-y-2">
                    {recipeFields.map((field, index) => (
                      <div key={field.id} className="p-3 bg-muted/50 rounded-md border flex items-center justify-between gap-4">
                        <span className="text-sm font-semibold flex-1">{field.productName}</span>
                        <div className="w-24">
                          <FormField control={form.control} name={`assemblyRecipe.${index}.quantity`} render={({ field: qf }) => (
                            <FormItem><FormControl><Input type="number" min="1" className="h-8" {...qf} /></FormControl></FormItem>
                          )} />
                        </div>
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeRecipe(index)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    ))}
                  </div>
                  <Command className="rounded-lg border" shouldFilter={false}>
                    <CommandInput placeholder="Search to add a component product..." value={componentSearch} onValueChange={setComponentSearch} />
                    {componentSearch.length > 0 && (
                      <CommandList>
                        {isLoadingComponents && <CommandItem disabled>Searching...</CommandItem>}
                        {componentResults && componentResults.length > 0 && (
                          <CommandGroup>
                            {componentResults.map(s => (
                              <CommandItem key={s.id} value={s.name}
                                onSelect={() => { if (!recipeFields.some(f => f.productId === s.id)) appendRecipe({ productId: s.id, productName: s.name, quantity: 1 }); setComponentSearch(''); }}>
                                {s.name}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        )}
                        {!isLoadingComponents && !componentResults?.length && componentSearch.length > 1 && <CommandEmpty>No components found.</CommandEmpty>}
                      </CommandList>
                    )}
                  </Command>
                </div>
              )}

              {/* Variations toggle (create only) */}
              {!isEdit && (
                <div className="pt-4 border-t">
                  <FormField control={form.control} name="hasVariations" render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Product has variations</FormLabel>
                        <DialogDescription>Create multiple sizes, colors, etc. at once.</DialogDescription>
                      </div>
                      <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                    </FormItem>
                  )} />
                </div>
              )}

              {/* Single product pricing (create, no variations) */}
              {!isEdit && !hasVariations && (
                <div className="space-y-4 rounded-lg border p-4">
                  <p className="text-sm font-semibold">Pricing</p>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="sellingPrice" render={({ field }) => (
                      <FormItem><FormLabel>Cash Price (₱)</FormLabel><FormControl><Input type="number" step="0.01" placeholder="49.99" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="installmentPrice" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Installment Price (₱) <span className="text-muted-foreground text-xs font-normal">First-timers only</span></FormLabel>
                        <FormControl><Input type="number" step="0.01" placeholder="Leave blank if not eligible" {...field} value={field.value ?? ''} onChange={e => field.onChange(e.target.value === '' ? undefined : Number(e.target.value))} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  <FormField control={form.control} name="quantityOnHand" render={({ field }) => (
                    <FormItem><FormLabel>Initial Stock</FormLabel><FormControl><Input type="number" placeholder="120" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
              )}

              {/* Variations section (both modes) */}
              <ProductVariationsSection
                form={form}
                variationFields={variationFields}
                appendVariation={appendVariation}
                removeVariation={removeVariation}
                isEdit={isEdit}
                displayProduct={displayProduct}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit">{isEdit ? 'Save Changes' : 'Save Product'}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Backward-compat re-exports ───────────────────────────────────────────────
// These allow existing imports to keep working without touching every consumer.

export function AddProductDialog(props: Omit<CreateProps, 'mode'>) {
  return <ProductDialog mode="create" {...props} />;
}

export function EditProductDialog({ product, open, onOpenChange, onSuccess }: Omit<EditProps, 'mode'>) {
  return <ProductDialog mode="edit" product={product} open={open} onOpenChange={onOpenChange} onSuccess={onSuccess} />;
}
