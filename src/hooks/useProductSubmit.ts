import { useToast } from '@/hooks/use-toast';
import { useSupabase } from '@/lib/supabase/hooks';
import type { FormattedProduct } from '@/types';
import type { ProductFormValues, CreateProps, EditProps } from './useProductForm';

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

export function useProductSubmit({
  isEdit,
  displayProduct,
  setOpen,
  existingImages,
  variantExistingImages,
  variantNewImages,
  props,
  form
}: {
  isEdit: boolean;
  displayProduct: FormattedProduct | null;
  setOpen: (open: boolean) => void;
  existingImages: string[];
  variantExistingImages: Record<string, string[]>;
  variantNewImages: Record<string, File[]>;
  props: CreateProps | EditProps;
  form: any;
}) {
  const supabase = useSupabase();
  const { toast } = useToast();

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

    const { images: imageFiles, quantityOnHand, supplierPricing, hasVariations: _hv, variations, installmentPrice, isOnSale, salePrice, assemblyRecipe, ...core } = values;

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
          is_on_sale: isOnSale ?? false, sale_price: salePrice ?? null,
          images: uploadedImageUrls, supplier_pricing: supplierPricing || [],
          assembly_recipe: assemblyRecipe || [],
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
        if (values.hasVariations && variations && variations.length > 0) {
          const { data: parent, error: pErr } = await supabase.from('products').insert({
            name: core.name, sku: finalSku, shelf_location: core.shelfLocation || null,
            description: core.description, category: core.categoryId, images: uploadedImageUrls,
            selling_price: 0, installment_price: null, stock_level: 0, supplier_pricing: [],
          }).select().single();
          if (pErr) throw pErr;
          parentProductId = parent.id;
          (props as CreateProps).onProductAdded?.({ id: parent.id, name: core.name });
        }

        const productsToCreate = values.hasVariations && variations && variations.length > 0
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
            is_on_sale: parentProductId ? false : (isOnSale ?? false),
            sale_price: parentProductId ? null : (salePrice ?? null),
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
        
      }
    } catch (error: any) {
      console.error('Product save error:', error);
      toast({ variant: 'destructive', title: isEdit ? 'Update Failed' : 'Save Failed', description: error.message || `Could not ${isEdit ? 'update' : 'create'} "${values.name}".` });
    }
  }

  return { onSubmit };
}
