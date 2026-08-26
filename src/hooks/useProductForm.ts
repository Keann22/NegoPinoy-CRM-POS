import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
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
  isOnSale: z.boolean().default(false),
  salePrice: z.coerce.number().min(0, "Sale price must be positive").optional(),
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

export function useProductFormSetup() {
  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: { 
      name: '', sku: '', shelfLocation: '', description: '', categoryId: '', 
      images: [], sellingPrice: 0, isOnSale: false, salePrice: undefined, quantityOnHand: 0, supplierPricing: [],
      hasVariations: false, variations: [], assemblyRecipe: []
    },
  });

  const { fields: supplierFields, append: appendSupplier, remove: removeSupplier } = useFieldArray({ control: form.control, name: 'supplierPricing' });
  const { fields: variationFields, append: appendVariation, remove: removeVariation } = useFieldArray({ control: form.control, name: 'variations' });
  const { fields: recipeFields, append: appendRecipe, remove: removeRecipe } = useFieldArray({ control: form.control, name: 'assemblyRecipe' });
  
  return {
    form,
    supplierFields, appendSupplier, removeSupplier,
    variationFields, appendVariation, removeVariation,
    recipeFields, appendRecipe, removeRecipe,
    hasVariations: form.watch('hasVariations'),
    nameValue: form.watch('name')
  };
}
