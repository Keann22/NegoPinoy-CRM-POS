import { useState, useEffect, useMemo } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import stringSimilarity from 'string-similarity';
import { useSupabase, useUser } from '@/lib/supabase/hooks';
import { useToast } from '@/hooks/use-toast';
import { useUserProfile } from '@/hooks/useUserProfile';
import type { FormattedProduct } from '@/types';

export type SimilarProductWarning = { id: string; name: string; matchType: 'exact' | 'similar' };

export const productSchema = z.object({
  name: z.string().trim().min(1, "Product name is required"),
  sku: z.string().trim().optional(),
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
    nameSuffix: z.string().trim().min(1, "Variation name is required"),
    sku: z.string().trim().optional(),
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

export type ProductFormValues = z.infer<typeof productSchema>;
export type Supplier = { id: string; name: string; [key: string]: any };

export type CreateProps = {
  mode: 'create';
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  initialValues?: Partial<ProductFormValues>;
  onProductAdded?: (product: { id: string; name: string }) => void;
  triggerButton?: React.ReactNode;
};

export type EditProps = {
  mode: 'edit';
  product: FormattedProduct | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
};

export type ProductDialogProps = CreateProps | EditProps;

export async function uploadImages(supabase: any, files: File[]): Promise<string[]> {
  return Promise.all(files.map(async (file) => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const { error } = await supabase.storage.from('products').upload(fileName, file);
    if (error) throw error;
    const { data: { publicUrl } } = supabase.storage.from('products').getPublicUrl(fileName);
    return publicUrl;
  }));
}

export async function deleteImages(supabase: any, urls: string[]): Promise<void> {
  const imagePaths = urls
    .filter(url => !url.includes('placehold.co'))
    .map(url => url.split('/').pop()!);
  if (imagePaths.length === 0) return;
  await supabase.storage.from('products').remove(imagePaths);
}

export function useProductDialog(props: ProductDialogProps) {
  const isEdit = props.mode === 'edit';

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
  const [existingImages, setExistingImages] = useState<string[]>([]);
  const removeExistingImage = (url: string) => setExistingImages(prev => prev.filter(u => u !== url));

  // Per-existing-variant photo edits (keyed by variant product id), separate from the
  // `variations` field array which only holds brand-new variations being created.
  const [variantExistingImages, setVariantExistingImages] = useState<Record<string, string[]>>({});
  const [variantNewImages, setVariantNewImages] = useState<Record<string, File[]>>({});
  const removeVariantExistingImage = (variantId: string, url: string) =>
    setVariantExistingImages(prev => ({ ...prev, [variantId]: (prev[variantId] || []).filter(u => u !== url) }));
  const updateVariantNewImages = (variantId: string, files: File[]) =>
    setVariantNewImages(prev => ({ ...prev, [variantId]: files }));

  useEffect(() => {
    if (isEdit && props.mode === 'edit' && props.product) setLocalProduct(props.product);
  }, [isEdit, props]);
  const displayProduct = isEdit ? ((props as EditProps).product || localProduct) : null;

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

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: { name: '', sku: '', shelfLocation: '', description: '', categoryId: '', images: [], sellingPrice: 0, quantityOnHand: 0, supplierPricing: [], hasVariations: false, variations: [], assemblyRecipe: [] },
  });

  const { fields: supplierFields, append: appendSupplier, remove: removeSupplier } = useFieldArray({ control: form.control, name: 'supplierPricing' });
  const { fields: variationFields, append: appendVariation, remove: removeVariation } = useFieldArray({ control: form.control, name: 'variations' });
  const { fields: recipeFields, append: appendRecipe, remove: removeRecipe } = useFieldArray({ control: form.control, name: 'assemblyRecipe' });
  const hasVariations = form.watch('hasVariations');

  // Warns (without blocking) when the typed name exactly matches an existing product after
  // trim/case-normalizing (catches the whitespace/casing duplicates found in the catalog), or
  // is a close fuzzy match to one (catches likely typos of an existing product name).
  const nameValue = form.watch('name');
  const [similarProductWarning, setSimilarProductWarning] = useState<SimilarProductWarning | null>(null);
  useEffect(() => {
    if (!supabase || !open) { setSimilarProductWarning(null); return; }
    const trimmed = (nameValue || '').trim();
    if (trimmed.length < 3) { setSimilarProductWarning(null); return; }

    const handler = setTimeout(async () => {
      const excludeId = isEdit ? displayProduct?.id : undefined;

      const { data: exactMatches } = await supabase
        .from('products')
        .select('id, name')
        .ilike('name', trimmed)
        .not('name', 'ilike', '[DELETED]%')
        .limit(5);
      const exactMatch = exactMatches?.find(p => p.id !== excludeId);
      if (exactMatch) {
        setSimilarProductWarning({ id: exactMatch.id, name: exactMatch.name, matchType: 'exact' });
        return;
      }

      const keyword = trimmed.split(/\s+/).filter(w => w.length >= 3).sort((a, b) => b.length - a.length)[0];
      if (!keyword) { setSimilarProductWarning(null); return; }

      const { data: candidates } = await supabase
        .from('products')
        .select('id, name')
        .ilike('name', `%${keyword}%`)
        .not('name', 'ilike', '[DELETED]%')
        .limit(25);

      let best: { id: string; name: string; score: number } | null = null;
      for (const c of candidates || []) {
        if (c.id === excludeId) continue;
        const score = stringSimilarity.compareTwoStrings(trimmed.toLowerCase(), c.name.trim().toLowerCase());
        if (score >= 0.85 && (!best || score > best.score)) best = { id: c.id, name: c.name, score };
      }
      setSimilarProductWarning(best ? { id: best.id, name: best.name, matchType: 'similar' } : null);
    }, 400);

    return () => clearTimeout(handler);
  }, [supabase, open, nameValue, isEdit, displayProduct?.id]);

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
        setExistingImages(displayProduct.images || []);
        const initialVariantImages: Record<string, string[]> = {};
        (displayProduct.children || []).forEach(child => { initialVariantImages[child.id] = child.images || []; });
        setVariantExistingImages(initialVariantImages);
        setVariantNewImages({});
      } else if (!isEdit) {
        const iv = (props as CreateProps).initialValues;
        form.reset(iv || { name: '', sku: '', description: '', categoryId: '', images: [], sellingPrice: 0, quantityOnHand: 0, supplierPricing: [], hasVariations: false, variations: [] });
        setExistingImages([]);
        setVariantExistingImages({});
        setVariantNewImages({});
      }
      setSupplierSearch('');
      setComponentSearch('');
    } else {
      form.reset();
      setExistingImages([]);
      setVariantExistingImages({});
      setVariantNewImages({});
      setSupplierSearch('');
      setComponentSearch('');
    }
  }, [open]);

  async function onSubmit(values: ProductFormValues) {
    if (!supabase) return;

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
        let uploadedImageUrls: string[] = existingImages;
        if (imageFiles && imageFiles.length > 0) {
          const newUrls = await uploadImages(supabase, imageFiles);
          uploadedImageUrls = [...uploadedImageUrls, ...newUrls];
        }
        const removedImageUrls = (displayProduct.images || []).filter(url => !existingImages.includes(url));

        const { error } = await supabase.from('products').update({
          name: core.name, sku: finalSku, shelf_location: core.shelfLocation || null,
          description: core.description, category: core.categoryId,
          selling_price: core.sellingPrice, installment_price: installmentPrice ?? null,
          images: uploadedImageUrls, supplier_pricing: supplierPricing || [],
          assembly_recipe: assemblyRecipe || [],
          // Variant rows are listed by variant_name, not name (see ProductsTable's
          // `child.variantName || child.name`). Only touch it on an actual rename —
          // Product Name shows the full compound name, so unconditionally syncing it
          // would clobber a short, already-correct variant_name (e.g. "CASH BASIS")
          // every time someone edits price/stock without renaming.
          ...(displayProduct.parent_id && core.name !== displayProduct.name ? { variant_name: core.name } : {}),
        }).eq('id', displayProduct.id);
        if (error) throw error;

        if (removedImageUrls.length > 0) await deleteImages(supabase, removedImageUrls);

        for (const child of displayProduct.children || []) {
          const remainingExisting = variantExistingImages[child.id] ?? (child.images || []);
          const pendingFiles = variantNewImages[child.id] || [];
          const removedVariantUrls = (child.images || []).filter(url => !remainingExisting.includes(url));
          if (pendingFiles.length === 0 && removedVariantUrls.length === 0) continue;

          let finalVariantImages = remainingExisting;
          if (pendingFiles.length > 0) {
            finalVariantImages = [...finalVariantImages, ...await uploadImages(supabase, pendingFiles)];
          }

          const { error: vImgErr } = await supabase.from('products').update({ images: finalVariantImages }).eq('id', child.id);
          if (vImgErr) throw vImgErr;

          if (removedVariantUrls.length > 0) await deleteImages(supabase, removedVariantUrls);
        }

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

  return {
    isEdit,
    isControlled,
    open,
    setOpen,
    displayProduct,
    isManagement,
    form,
    existingImages,
    removeExistingImage,
    variantExistingImages,
    variantNewImages,
    removeVariantExistingImage,
    updateVariantNewImages,
    similarProductWarning,
    supplierSearch,
    setSupplierSearch,
    supplierResults,
    isLoadingSuppliers,
    categoryResults,
    isLoadingCategories,
    componentSearch,
    setComponentSearch,
    componentResults,
    isLoadingComponents,
    supplierFields,
    appendSupplier,
    removeSupplier,
    variationFields,
    appendVariation,
    removeVariation,
    recipeFields,
    appendRecipe,
    removeRecipe,
    hasVariations,
    onSubmit
  };
}
