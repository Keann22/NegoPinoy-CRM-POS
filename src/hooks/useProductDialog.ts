import { useState, useEffect, useMemo } from 'react';
import stringSimilarity from 'string-similarity';
import { useSupabase, useUser } from '@/lib/supabase/hooks';
import { useUserProfile } from '@/hooks/useUserProfile';
import type { FormattedProduct } from '@/types';
import { useProductFormSetup, type Supplier, type ProductDialogProps, type EditProps, type CreateProps, type SimilarProductWarning } from './useProductForm';
export * from './useProductForm';
import { useProductSubmit } from './useProductSubmit';

export function useProductDialog(props: ProductDialogProps) {
  const isEdit = props.mode === 'edit';

  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = props.open !== undefined && props.onOpenChange !== undefined;
  const open = isControlled ? props.open! : internalOpen;
  const setOpen = isControlled ? props.onOpenChange! : setInternalOpen;

  const supabase = useSupabase();
  const { user } = useUser();
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

  const { form, supplierFields, appendSupplier, removeSupplier, variationFields, appendVariation, removeVariation, recipeFields, appendRecipe, removeRecipe, hasVariations, nameValue } = useProductFormSetup();
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

  const { onSubmit } = useProductSubmit({
    isEdit,
    displayProduct,
    setOpen,
    existingImages,
    variantExistingImages,
    variantNewImages,
    props,
    form
  });

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
