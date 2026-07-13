'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormControl, FormField, FormItem, FormLabel } from '@/components/ui/form';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Trash2 } from 'lucide-react';
import type { UseFormReturn, FieldArrayWithId, UseFieldArrayAppend, UseFieldArrayRemove } from 'react-hook-form';

interface SupplierSectionProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: UseFormReturn<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supplierFields: FieldArrayWithId<any, 'supplierPricing', 'id'>[];
  appendSupplier: UseFieldArrayAppend<any, 'supplierPricing'>;
  removeSupplier: UseFieldArrayRemove;
  supplierSearch: string;
  onSupplierSearchChange: (v: string) => void;
  supplierResults: { id: string; name: string }[];
  isLoadingSuppliers: boolean;
  isEdit: boolean;
}

/**
 * ProductSupplierSection
 * The "Suppliers & Pricing" panel inside the product form.
 * Extracted from product-dialog.tsx to keep that file under 400 lines.
 */
export function ProductSupplierSection({
  form, supplierFields, appendSupplier, removeSupplier,
  supplierSearch, onSupplierSearchChange, supplierResults,
  isLoadingSuppliers, isEdit,
}: SupplierSectionProps) {
  return (
    <div className="space-y-4 rounded-lg border p-4">
      <FormLabel className="text-base">Suppliers &amp; Pricing</FormLabel>
      <div className="space-y-2">
        {supplierFields.map((field, index) => (
          <div key={field.id} className="p-3 bg-muted/50 rounded-md border space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">{(field as any).supplierName}</span>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeSupplier(index)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            {isEdit && (
              <FormField control={form.control} name={`supplierPricing.${index}.supplierCode`} render={({ field: cf }) => (
                <FormItem>
                  <FormLabel className="text-xs text-muted-foreground">Supplier&apos;s Product Code</FormLabel>
                  <FormControl><Input placeholder="e.g. WK-32-SS" className="h-8" {...cf} /></FormControl>
                </FormItem>
              )} />
            )}
            <FormField control={form.control} name={`supplierPricing.${index}.unitCost`} render={({ field: cf }) => (
              <FormItem className={isEdit ? '' : 'w-24'}>
                {isEdit && <FormLabel className="text-xs text-muted-foreground">Unit Cost (₱)</FormLabel>}
                <FormControl><Input type="number" step="0.01" className="h-8 text-right" {...cf} /></FormControl>
              </FormItem>
            )} />
          </div>
        ))}
      </div>
      <Command className="rounded-lg border h-auto" shouldFilter={false}>
        <CommandInput
          placeholder="Search to add a supplier..."
          value={supplierSearch}
          onValueChange={onSupplierSearchChange}
        />
        {supplierSearch.length > 0 && (
          <CommandList>
            {isLoadingSuppliers && <CommandItem disabled>Searching...</CommandItem>}
            {supplierResults.length > 0 && (
              <CommandGroup>
                {supplierResults.map(s => (
                  <CommandItem
                    key={s.id}
                    value={s.name.toLowerCase()}
                    onSelect={() => {
                      if (!supplierFields.some((f: any) => f.supplierId === s.id)) {
                        appendSupplier({ supplierId: s.id, supplierName: s.name, unitCost: 0 });
                      }
                      onSupplierSearchChange('');
                    }}
                  >
                    {s.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {!isLoadingSuppliers && !supplierResults.length && supplierSearch.length > 1 && (
              <CommandEmpty>No suppliers found.</CommandEmpty>
            )}
          </CommandList>
        )}
      </Command>
    </div>
  );
}
