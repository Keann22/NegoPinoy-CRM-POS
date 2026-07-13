'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { FileUpload } from '@/components/ui/file-upload';
import { Trash2, Plus } from 'lucide-react';
import { DialogDescription } from '@/components/ui/dialog';
import type { UseFormReturn, FieldArrayWithId, UseFieldArrayAppend, UseFieldArrayRemove } from 'react-hook-form';
import type { FormattedProduct } from '@/types';

interface VariationsSectionProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: UseFormReturn<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  variationFields: FieldArrayWithId<any, 'variations', 'id'>[];
  appendVariation: UseFieldArrayAppend<any, 'variations'>;
  removeVariation: UseFieldArrayRemove;
  isEdit: boolean;
  displayProduct: FormattedProduct | null;
  variantExistingImages: Record<string, string[]>;
  variantNewImages: Record<string, File[]>;
  onRemoveVariantExistingImage: (variantId: string, url: string) => void;
  onVariantNewImagesChange: (variantId: string, files: File[]) => void;
}

/**
 * ProductVariationsSection
 * Handles both the "existing variations" read-only list (edit mode)
 * and the "create new variations" form (both modes).
 * Extracted from product-dialog.tsx to keep that file under 400 lines.
 */
export function ProductVariationsSection({
  form, variationFields, appendVariation, removeVariation, isEdit, displayProduct,
  variantExistingImages, variantNewImages, onRemoveVariantExistingImage, onVariantNewImagesChange,
}: VariationsSectionProps) {
  const hasVariations = form.watch('hasVariations');

  return (
    <div className="pt-4 border-t space-y-4">
      {/* Existing variations list (edit only) */}
      {isEdit && displayProduct?.children && displayProduct.children.length > 0 && (
        <div className="space-y-3">
          <FormLabel className="text-base font-semibold">Existing Variations</FormLabel>
          <DialogDescription>
            Add or remove photos per variation here. To change its name, price, or stock, expand the parent row on the Products table and click Edit on that specific variation.
          </DialogDescription>
          <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
            {displayProduct.children.map(child => (
              <div key={child.id} className="bg-muted/30 p-3 rounded-md border space-y-2">
                <div className="flex justify-between items-center text-sm">
                  <span className="font-medium text-foreground">{child.variantName || child.name}</span>
                  <span className="text-muted-foreground">{child.price} &bull; Stock: {child.quantityOnHand ?? 0}</span>
                </div>
                <FileUpload
                  value={variantNewImages[child.id] || []}
                  onChange={(files) => onVariantNewImagesChange(child.id, files)}
                  multiple
                  existingImages={variantExistingImages[child.id] || []}
                  onRemoveExisting={(url) => onRemoveVariantExistingImage(child.id, url)}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create new variations header (edit only) */}
      {isEdit && (
        <>
          <FormLabel className="text-base font-semibold">Create New Variations</FormLabel>
          <DialogDescription>
            Create new variations (e.g. &quot;5L&quot;, &quot;Red&quot;) based on this product&apos;s details.
          </DialogDescription>
        </>
      )}

      {/* Variation input rows */}
      {variationFields.map((field, index) => (
        <div key={field.id} className="p-4 border rounded-lg bg-muted/20 relative space-y-4">
          <Button
            type="button" variant="ghost" size="icon"
            className="absolute top-2 right-2 h-6 w-6 text-muted-foreground hover:text-destructive"
            onClick={() => removeVariation(index)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField control={form.control} name={`variations.${index}.nameSuffix`} render={({ field: f }) => (
              <FormItem><FormLabel>Variation Name (e.g., 5L, Red)</FormLabel><FormControl><Input {...f} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name={`variations.${index}.sku`} render={({ field: f }) => (
              <FormItem><FormLabel>SKU (Optional)</FormLabel><FormControl><Input {...f} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name={`variations.${index}.sellingPrice`} render={({ field: f }) => (
              <FormItem><FormLabel>Price (₱)</FormLabel><FormControl><Input type="number" step="0.01" {...f} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name={`variations.${index}.unitCost`} render={({ field: f }) => (
              <FormItem><FormLabel>Unit Cost (Optional)</FormLabel><FormControl><Input type="number" step="0.01" {...f} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name={`variations.${index}.quantityOnHand`} render={({ field: f }) => (
              <FormItem><FormLabel>Initial Stock</FormLabel><FormControl><Input type="number" {...f} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name={`variations.${index}.images`} render={({ field: f }) => (
              <FormItem className="col-span-2">
                <FormLabel>Variation Image (Optional)</FormLabel>
                <FormControl><FileUpload value={f.value || []} onChange={f.onChange} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </div>
        </div>
      ))}

      {(!isEdit ? hasVariations : true) && (
        <Button
          type="button" variant="outline" size="sm" className="w-full mt-2"
          onClick={() => appendVariation({ nameSuffix: '', sku: '', sellingPrice: 0, unitCost: undefined, quantityOnHand: 0, images: [] })}
        >
          <Plus className="mr-2 h-4 w-4" />{isEdit ? 'Add New Variation' : 'Add Variation'}
        </Button>
      )}
    </div>
  );
}
