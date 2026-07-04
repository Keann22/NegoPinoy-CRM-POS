'use client';

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { Trash2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileUpload } from "@/components/ui/file-upload";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import type { FormattedProduct } from '@/types';
import { ProductSupplierSection } from './products/ProductSupplierSection';
import { ProductVariationsSection } from './products/ProductVariationsSection';
import { useProductDialog, type ProductDialogProps, type CreateProps, type EditProps } from '@/hooks/useProductDialog';

export function ProductDialog(props: ProductDialogProps) {
  const {
    isEdit,
    isControlled,
    open,
    setOpen,
    displayProduct,
    isManagement,
    form,
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
  } = useProductDialog(props);

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

              <FormField control={form.control} name="images" render={({ field }) => (
                <FormItem>
                  <FormLabel>{isEdit ? 'Add Product Images' : 'Product Images (Optional)'}</FormLabel>
                  <FormControl><FileUpload value={field.value || []} onChange={field.onChange} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem><FormLabel>Product Name</FormLabel><FormControl><Input placeholder="e.g., AeroGrip Silicon Utensil Set" {...field} /></FormControl><FormMessage /></FormItem>
              )} />

              <FormField control={form.control} name="sku" render={({ field }) => (
                <FormItem>
                  <FormLabel>SKU (Leave blank to auto-generate)</FormLabel>
                  <FormControl><Input placeholder="e.g., AG-SUS-001" {...field} readOnly={isEdit} className={isEdit ? 'bg-muted' : ''} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="shelfLocation" render={({ field }) => (
                <FormItem><FormLabel>Shelf Location (Optional)</FormLabel><FormControl><Input placeholder="e.g., A1-Bin3" {...field} /></FormControl><FormMessage /></FormItem>
              )} />

              <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem><FormLabel>Description</FormLabel><FormControl><Textarea placeholder="Describe the product" {...field} /></FormControl><FormMessage /></FormItem>
              )} />

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
                  <Command className="rounded-lg border h-auto" shouldFilter={false}>
                    <CommandInput placeholder="Search to add a component product..." value={componentSearch} onValueChange={setComponentSearch} />
                    {componentSearch.length > 0 && (
                      <CommandList>
                        {isLoadingComponents && <CommandItem disabled>Searching...</CommandItem>}
                        {componentResults && componentResults.length > 0 && (
                          <CommandGroup>
                            {componentResults.map(s => (
                              <CommandItem key={s.id} value={s.name.toLowerCase()}
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

export function AddProductDialog(props: Omit<CreateProps, 'mode'>) {
  return <ProductDialog mode="create" {...props} />;
}

export function EditProductDialog({ product, open, onOpenChange, onSuccess }: Omit<EditProps, 'mode'>) {
  return <ProductDialog mode="edit" product={product} open={open} onOpenChange={onOpenChange} onSuccess={onSuccess} />;
}
