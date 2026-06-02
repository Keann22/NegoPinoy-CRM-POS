'use client';

import { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useCollection, useUser, useSupabase, collection, query, where, orderBy, limit } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { useToast } from '@/hooks/use-toast';
import { CalendarIcon, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { useRoleCheck } from '@/hooks/useRoleCheck';

const restockSchema = z.object({
  productId: z.string({ required_error: 'Please select a product.' }),
  productName: z.string(),
  quantity: z.coerce.number().positive('Quantity must be a positive number.'),
  unitCost: z.coerce.number().min(0, 'Unit cost cannot be negative.'),
  supplierName: z.string().optional(),
  purchaseDate: z.date({ required_error: 'A purchase date is required.' }),
});

type RestockFormValues = z.infer<typeof restockSchema>;
type Product = { id: string; name: string; quantityOnHand: number; [key: string]: any; };

export default function RestockPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [productSearch, setProductSearch] = useState('');
  

  const supabase = useSupabase();
  const { user } = useUser();
  const { toast } = useToast();
  const { isManagement } = useRoleCheck();

  const productsQuery = useMemo(
    () => {
      if (!supabase || !user || productSearch.length < 2) return null;
      const searchTermCapitalized = productSearch.charAt(0).toUpperCase() + productSearch.slice(1);
      return query(
        collection(supabase, 'products'),
        orderBy('name'),
        where('name', '>=', searchTermCapitalized),
        where('name', '<=', searchTermCapitalized + '\uf8ff'),
        limit(10)
      );
    },
    [supabase, user, productSearch]
  );
  const { data: productResults, isLoading: isLoadingProducts } = useCollection<Product>(productsQuery);

  const form = useForm<RestockFormValues>({
    resolver: zodResolver(restockSchema),
    defaultValues: {
      purchaseDate: new Date(),
      supplierName: '',
    },
  });

  const handleProductSelect = (product: Product) => {
    form.setValue('productId', product.id);
    form.setValue('productName', product.name);
    setSelectedProduct(product);
    setProductSearch('');
  };

  const onSubmit = async (values: RestockFormValues) => {
    setIsSubmitting(true);
    toast({ title: 'Saving Purchase...', description: 'Please wait.' });

    try {
      // 1. Fetch current product data
      const { data: productData, error: productError } = await supabase
        .from('products')
        .select('id, stock_level')
        .eq('id', values.productId)
        .single();

      if (productError || !productData) {
        throw new Error("Product not found. It may have been deleted.");
      }

      const newStockLevel = (productData.stock_level || 0) + values.quantity;

      // 2. Update product stock and unit cost
      const { error: updateError } = await supabase
        .from('products')
        .update({
          stock_level: newStockLevel,
          initial_unit_cost: values.unitCost
        })
        .eq('id', values.productId);

      if (updateError) throw updateError;

      // 3. Create inventory movement
      const { error: movementError } = await supabase
        .from('inventory_movements')
        .insert({
          product_id: values.productId,
          quantity_change: values.quantity,
          movement_type: 'RESTOCK',
          timestamp: new Date().toISOString(),
          reason: `Restock${values.supplierName ? ` from ${values.supplierName}` : ''}`,
          supplier_name: values.supplierName || null,
          unit_cost: values.unitCost
        });

      if (movementError) throw movementError;

      // 4. Record expense if there is a cost
      if (values.unitCost > 0) {
        const { error: expenseError } = await supabase
          .from('expenses')
          .insert({
            expense_date: values.purchaseDate.toISOString(),
            amount: values.quantity * values.unitCost,
            category: 'Cost of Goods Sold',
            description: `Purchased ${values.quantity} of ${values.productName}${values.supplierName ? ` from ${values.supplierName}` : ''}`
          });

        if (expenseError) throw expenseError;
      }

      toast({
        title: 'Purchase Saved!',
        description: `${values.quantity} units of ${values.productName} have been added to inventory.`,
      });
      form.reset({ purchaseDate: new Date() });
      setSelectedProduct(null);
    } catch (e: any) {
      console.error("Restock transaction failed: ", e);
      toast({
        variant: 'destructive',
        title: 'Save Failed',
        description: e.message || 'Could not save the purchase.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-headline">Restock / Purchase</CardTitle>
        <CardDescription>
          Record a new product purchase to add stock and log the expense.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 max-w-2xl mx-auto">
            <FormField
              control={form.control}
              name="productId"
              render={() => (
                <FormItem className="flex flex-col">
                  <FormLabel>Product</FormLabel>
                  {selectedProduct ? (
                    <div className="flex items-center justify-between rounded-md border border-input bg-background p-2 text-sm h-10">
                      <p>{selectedProduct.name}</p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedProduct(null);
                          form.resetField('productId');
                          form.resetField('productName');
                        }}
                      >
                        Change
                      </Button>
                    </div>
                  ) : (
                    <Command className="rounded-lg border">
                      <CommandInput
                        placeholder="Search products by name..."
                        value={productSearch}
                        onValueChange={setProductSearch}
                      />
                      {productSearch.length > 1 && (
                        <CommandList>
                          {isLoadingProducts && <CommandItem disabled>Searching...</CommandItem>}
                          {productResults && productResults.length > 0 && (
                            <CommandGroup>
                              {productResults.map((p) => (
                                <CommandItem
                                  key={p.id}
                                  value={p.name}
                                  onSelect={() => handleProductSelect(p)}
                                >
                                  {p.name}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          )}
                          {!isLoadingProducts && (!productResults || productResults.length === 0) && <CommandEmpty>No products found.</CommandEmpty>}
                        </CommandList>
                      )}
                    </Command>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                control={form.control}
                name="quantity"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Quantity</FormLabel>
                    <FormControl>
                        <Input type="number" placeholder="100" {...field} />
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />
                {isManagement && (
                    <FormField
                    control={form.control}
                    name="unitCost"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Unit Cost (₱)</FormLabel>
                        <FormControl>
                            <Input type="number" step="0.01" placeholder="50.00" {...field} />
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
                )}
            </div>
            
            <FormField
              control={form.control}
              name="supplierName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Supplier Name (Optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Global Imports Inc." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="purchaseDate"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Purchase Date</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant={'outline'}
                          className={cn('w-[240px] pl-3 text-left font-normal', !field.value && 'text-muted-foreground')}
                        >
                          {field.value ? format(field.value, 'PPP') : <span>Pick a date</span>}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Purchase
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
