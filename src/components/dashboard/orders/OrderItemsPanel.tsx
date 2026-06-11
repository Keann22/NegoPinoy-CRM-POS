'use client';

import { Control, UseFieldArrayReturn, UseFormWatch } from 'react-hook-form';
import { type OrderFormValues, type Product } from '@/lib/schemas/order';
import { FormField, FormControl, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Trash2, PlusCircle } from 'lucide-react';

interface OrderItemsPanelProps {
  control: Control<OrderFormValues>;
  watch: UseFormWatch<OrderFormValues>;
  fields: UseFieldArrayReturn<OrderFormValues, 'orderItems'>['fields'];
  remove: UseFieldArrayReturn<OrderFormValues, 'orderItems'>['remove'];
  formStateErrors: any;

  isEditing: boolean;
  subtotal: number;
  totalDiscount: number;
  insuranceFee: number;
  totalAmount: number;
  overpaymentApplied: number;
  selectedCustomerStoreCredit?: number;

  productSearch: string;
  onProductSearchChange: (value: string) => void;
  productResults: Product[];
  isSearchingProducts: boolean;
  onProductSelect: (product: Product) => Promise<void>;
  onAddProductClick: () => void;
}

export function OrderItemsPanel({
  control,
  watch,
  fields,
  remove,
  formStateErrors,
  isEditing,
  subtotal,
  totalDiscount,
  insuranceFee,
  totalAmount,
  overpaymentApplied,
  selectedCustomerStoreCredit,
  productSearch,
  onProductSearchChange,
  productResults,
  isSearchingProducts,
  onProductSelect,
  onAddProductClick,
}: OrderItemsPanelProps) {
  const includeInsurance = watch('includeInsurance');

  return (
    <div className="md:col-span-2 space-y-4">
      {/* Order items table */}
      <div>
        <FormLabel>Order Items</FormLabel>
        <div className="space-y-2 mt-2 rounded-lg border">
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 p-2 font-medium text-muted-foreground text-sm">
            <span>Product</span>
            <span className="text-right">Qty</span>
            <span className="text-right">Price</span>
            <span className="text-right">Discount</span>
            <span className="sr-only">Remove</span>
          </div>
          {fields.map((field, index) => (
            <div key={field.id} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 items-center px-2 pb-2">
              <p className="flex-1 text-sm font-medium truncate pr-2">{field.productName}</p>
              <FormField control={control} name={`orderItems.${index}.quantity`} render={({ field: f }) => (
                <FormItem><FormControl><Input type="number" className="h-8 w-20 text-right" {...f} /></FormControl></FormItem>
              )} />
              <FormField control={control} name={`orderItems.${index}.sellingPriceAtSale`} render={({ field: f }) => (
                <FormItem><FormControl><Input type="number" step="0.01" className="h-8 w-24 text-right" {...f} /></FormControl></FormItem>
              )} />
              <FormField control={control} name={`orderItems.${index}.discount`} render={({ field: f }) => (
                <FormItem>
                  <FormControl>
                    <Input type="number" step="0.01" className="h-8 w-24 text-right" placeholder="0.00"
                      {...f} onChange={e => f.onChange(e.target.value === '' ? 0 : e.target.value)} value={f.value ?? 0} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => remove(index)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          {fields.length === 0 && <p className="text-sm text-center text-muted-foreground py-8">No items added to order.</p>}
        </div>
        <FormMessage>{formStateErrors.orderItems?.message || formStateErrors.orderItems?.root?.message}</FormMessage>
      </div>

      {/* Product search */}
      <Command className="rounded-lg border">
        <CommandInput placeholder="Search to add products..." value={productSearch} onValueChange={onProductSearchChange} />
        {productSearch.length > 0 && (
          <CommandList>
            {isSearchingProducts && <CommandItem disabled>Searching...</CommandItem>}
            {productResults.length > 0 && (
              <CommandGroup>
                {productResults.map((p) => (
                  <CommandItem
                    value={p.name}
                    key={p.id}
                    onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    onSelect={() => onProductSelect(p)}
                  >
                    <div className="flex justify-between w-full">
                      <span>{p.name}</span>
                      <span className="text-xs text-muted-foreground">Stock: {p.quantityOnHand}</span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {productSearch.length > 0 && !isSearchingProducts && (
              <CommandGroup>
                <CommandItem
                  value={productSearch + ' add_new'}
                  onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  onSelect={onAddProductClick}
                  className="text-primary font-medium cursor-pointer"
                >
                  <PlusCircle className="mr-2 h-4 w-4" /> Add new product &quot;{productSearch}&quot;
                </CommandItem>
              </CommandGroup>
            )}
            {!isSearchingProducts && productResults.length === 0 && productSearch.length > 1 && <CommandEmpty>No products found.</CommandEmpty>}
          </CommandList>
        )}
      </Command>

      {/* Totals summary */}
      <div className="pt-4 space-y-2 text-right">
        <div className="flex justify-between"><p className="text-muted-foreground">Subtotal</p><p>₱{subtotal.toFixed(2)}</p></div>
        <div className="flex justify-between text-destructive"><p className="text-destructive">Discount</p><p>- ₱{totalDiscount.toFixed(2)}</p></div>
        {includeInsurance && <div className="flex justify-between text-muted-foreground"><p>Insurance Fee (1%)</p><p>+ ₱{insuranceFee.toFixed(2)}</p></div>}
        {!isEditing && overpaymentApplied > 0 && <div className="flex justify-between text-green-600"><p>Overpayment Applied</p><p>- ₱{overpaymentApplied.toFixed(2)}</p></div>}
        <div className="flex justify-between font-bold text-lg"><p>Total</p><p>₱{totalAmount.toFixed(2)}</p></div>
      </div>

      {/* Apply overpayment — create mode only, when customer has store credit */}
      {!isEditing && (selectedCustomerStoreCredit ?? 0) > 0 && (
        <FormField control={control} name="applyOverpayment" render={({ field }) => (
          <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4 border-green-500/30 bg-green-500/5">
            <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
            <div className="space-y-1 leading-none">
              <FormLabel className="text-green-700">Apply Overpayment Balance (₱{(selectedCustomerStoreCredit ?? 0).toFixed(2)})</FormLabel>
              <p className="text-xs text-muted-foreground">Use the customer&apos;s existing balance to reduce the total.</p>
            </div>
          </FormItem>
        )} />
      )}

      {/* Insurance toggle */}
      <FormField control={control} name="includeInsurance" render={({ field }) => (
        <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
          <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
          <div className="space-y-1 leading-none">
            <FormLabel>Include 1% Shipping Insurance</FormLabel>
            <p className="text-xs text-muted-foreground">You can optionally remove the insurance fee for this order.</p>
          </div>
        </FormItem>
      )} />

      {/* Tracking Number */}
      <FormField control={control} name="trackingNumber" render={({ field }) => (
        <FormItem>
          <FormLabel>Tracking Number</FormLabel>
          <FormControl><Input placeholder="Enter tracking number if shipped" {...field} value={field.value ?? ''} /></FormControl>
          <FormMessage />
        </FormItem>
      )} />

      {/* Notes */}
      <FormField control={control} name="shippingDetails" render={({ field }) => (
        <FormItem>
          <FormLabel>Notes / Remarks</FormLabel>
          <FormControl>
            <Textarea placeholder="Add any notes about this order, e.g. delivery instructions, special requests..." className="resize-none" rows={3} {...field} value={field.value ?? ''} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )} />
    </div>
  );
}
