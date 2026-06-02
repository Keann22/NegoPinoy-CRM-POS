'use client';

import { useState, useMemo } from 'react';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useCollection, useUser, useSupabase, collection, query, orderBy, where, limit } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { useToast } from '@/hooks/use-toast';
import { CalendarIcon, Loader2, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useRoleCheck } from '@/hooks/useRoleCheck';
const shipmentItemSchema = z.object({
  productId: z.string().min(1, "Product must be selected."),
  productName: z.string(),
  quantity: z.coerce.number().positive(),
  unitCost: z.coerce.number().min(0),
});

const shipmentSchema = z.object({
  purchaseDate: z.date({ required_error: 'A purchase date is required.' }),
  items: z.array(shipmentItemSchema).min(1, "Please add at least one item to the shipment."),
});

type ShipmentFormValues = z.infer<typeof shipmentSchema>;
type Product = { id: string; name: string; sku: string; [key: string]: any; };

// Reusable component for product search within a row
function ProductSearch({ onProductSelect }: { onProductSelect: (product: Product) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const supabase = useSupabase();
  const { user } = useUser();

  const productsQuery = useMemo(
    () => {
      if (!supabase || !user || search.length < 2) return null;
      // Simple capitalization for search term
      const searchTermCapitalized = search.charAt(0).toUpperCase() + search.slice(1);
      return query(
        collection(supabase, 'products'),
        orderBy('name'),
        where('name', '>=', searchTermCapitalized),
        where('name', '<=', searchTermCapitalized + '\uf8ff'),
        limit(10)
      );
    },
    [supabase, user, search]
  );
  const { data: productResults, isLoading: isLoadingProducts } = useCollection<Product>(productsQuery);
  
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-start font-normal text-left">Select Product...</Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command>
          <CommandInput
            placeholder="Search products..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {isLoadingProducts && <CommandItem disabled>Searching...</CommandItem>}
            {productResults && productResults.length > 0 ? (
              <CommandGroup>
                {productResults.map((p) => (
                  <CommandItem
                    key={p.id}
                    value={p.name}
                    onSelect={() => {
                      onProductSelect(p);
                      setOpen(false);
                      setSearch('');
                    }}
                  >
                    {p.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : (
              !isLoadingProducts && <CommandEmpty>No products found.</CommandEmpty>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

import { NeedsProcurementList } from '@/components/dashboard/needs-procurement-list';

export default function BulkReceivePage() {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const supabase = useSupabase();
  const { toast } = useToast();
  const { isManagement } = useRoleCheck();

  const form = useForm<ShipmentFormValues>({
    resolver: zodResolver(shipmentSchema),
    defaultValues: {
      purchaseDate: new Date(),
      items: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'items',
  });

  const addNewItem = () => {
    append({ productId: '', productName: '', quantity: 1, unitCost: 0 });
  };
  
  const items = useWatch({ control: form.control, name: 'items' });
  const totalCost = items.reduce((total, item) => {
    return total + ((item.quantity || 0) * (item.unitCost || 0));
  }, 0);

  const onSubmit = async (values: ShipmentFormValues) => {
    setIsSubmitting(true);
    toast({ title: 'Saving Shipment...', description: 'Please wait.' });

    try {
      // 1. Fetch current product data
      const productIds = values.items.map(item => item.productId);
      const { data: products, error: productsError } = await supabase
        .from('products')
        .select('id, stock_level, name')
        .in('id', productIds);
      
      if (productsError) throw productsError;
      
      const productDataMap = new Map(products.map(p => [p.id, p]));

      // Check if all products exist
      for (const item of values.items) {
          if (!productDataMap.has(item.productId)) {
              throw new Error(`Product "${item.productName}" not found in database.`);
          }
      }

      // 2. Record Expense
      const totalExpense = values.items.reduce((sum, item) => sum + (item.quantity * item.unitCost), 0);
      if (totalExpense > 0) {
        // Collect unique supplier names for the description if any
        const suppliers = Array.from(new Set(values.items.map(i => i.supplierName).filter(Boolean)));
        const supplierText = suppliers.length > 0 ? ` from ${suppliers.join(', ')}` : '';
        
        const { error: expenseError } = await supabase
          .from('expenses')
          .insert({
            expense_date: values.purchaseDate.toISOString(),
            amount: totalExpense,
            category: 'Cost of Goods Sold',
            description: `Shipment received${supplierText}`,
          });
        if (expenseError) throw expenseError;
      }
      
      // 3. Update products and create inventory movements
      for (const item of values.items) {
        const currentProduct = productDataMap.get(item.productId)!;
        const newStockLevel = (currentProduct.stock_level || 0) + item.quantity;

        // Update product stock level
        const { error: updateError } = await supabase
          .from('products')
          .update({
            stock_level: newStockLevel,
            initial_unit_cost: item.unitCost // Update unit cost to the latest
          })
          .eq('id', item.productId);
        
        if (updateError) throw updateError;

        // Create inventory movement
        const { error: movementError } = await supabase
          .from('inventory_movements')
          .insert({
            product_id: item.productId,
            quantity_change: item.quantity,
            movement_type: 'RESTOCK',
            timestamp: new Date().toISOString(),
            reason: `Bulk receive${item.supplierName ? ` from ${item.supplierName}` : ''}`,
            supplier_name: item.supplierName || null,
            unit_cost: item.unitCost
          });
          
        if (movementError) throw movementError;
      }

      toast({
        title: 'Shipment Saved!',
        description: `The received items have been added to inventory.`,
      });
      form.reset({
        purchaseDate: new Date(),
        items: [],
      });
    } catch (e: any) {
      console.error("Bulk receive transaction failed: ", e);
      toast({
        variant: 'destructive',
        title: 'Save Failed',
        description: e.message || 'Could not save the shipment.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2">
        <Card>
      <CardHeader>
        <CardTitle className="font-headline">Bulk Inventory Receiving</CardTitle>
        <CardDescription>
          Record a new shipment of products received from a supplier.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            </div>

            <div className="space-y-2">
                <FormLabel>Shipment Items</FormLabel>
                <div className='border rounded-lg'>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className='w-[40%]'>Product</TableHead>
                            <TableHead>Quantity</TableHead>
                            {isManagement && <TableHead>Unit Cost (₱)</TableHead>}
                            <TableHead className='w-[50px] text-right'></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {fields.map((field, index) => (
                            <TableRow key={field.id}>
                                <TableCell className="font-medium">
                                    {form.watch(`items.${index}.productId`) ? (
                                        <div className='flex items-center justify-between'>
                                            <p>{form.watch(`items.${index}.productName`)}</p>
                                            <Button variant='link' size='sm' onClick={() => form.setValue(`items.${index}.productId`, '')}>Change</Button>
                                        </div>
                                    ) : (
                                        <ProductSearch 
                                            onProductSelect={(product) => {
                                                form.setValue(`items.${index}.productId`, product.id);
                                                form.setValue(`items.${index}.productName`, product.name);
                                            }}
                                        />
                                    )}
                                    <FormMessage>{form.formState.errors?.items?.[index]?.productId?.message}</FormMessage>
                                </TableCell>
                                <TableCell>
                                     <FormField
                                        control={form.control}
                                        name={`items.${index}.quantity`}
                                        render={({ field }) => (
                                            <FormItem>
                                            <FormControl>
                                                <Input type="number" placeholder="100" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </TableCell>
                                {isManagement && (
                                    <TableCell>
                                         <FormField
                                            control={form.control}
                                            name={`items.${index}.unitCost`}
                                            render={({ field }) => (
                                                <FormItem>
                                                <FormControl>
                                                    <Input type="number" step="0.01" placeholder="50.00" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </TableCell>
                                )}
                                <TableCell className="text-right">
                                    <Button type="button" variant='ghost' size='icon' onClick={() => remove(index)}>
                                        <Trash2 className='h-4 w-4 text-destructive'/>
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                         {fields.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center">
                                No items added. Click "Add Item" to start.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
                </div>
                 <FormMessage>{form.formState.errors.items?.message || form.formState.errors.items?.root?.message}</FormMessage>
            </div>
            
            <Button type='button' variant='outline' onClick={addNewItem}>Add Item</Button>

            {isManagement && (
                <div className="pt-4 space-y-2 text-right">
                    <p className="text-lg">Total Purchase Cost: <span className="font-bold">₱{totalCost.toFixed(2)}</span></p>
                </div>
            )}

            <div className='flex justify-end'>
                <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Shipment
                </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
    </div>
    
    <div className="hidden lg:block lg:col-span-1 h-[calc(100vh-12rem)] sticky top-6">
      <NeedsProcurementList 
        onAddProduct={(product) => {
          append({ 
            productId: product.id, 
            productName: product.name, 
            quantity: 1, 
            unitCost: 0, 
            supplierName: '' 
          });
          toast({
            title: "Added to Shipment",
            description: `${product.name} has been added to your receive list.`,
          });
        }} 
      />
    </div>
    
    {/* Mobile view of the list */}
    <div className="block lg:hidden mt-6">
      <NeedsProcurementList 
        onAddProduct={(product) => {
          append({ 
            productId: product.id, 
            productName: product.name, 
            quantity: 1, 
            unitCost: 0, 
            supplierName: '' 
          });
          toast({
            title: "Added to Shipment",
            description: `${product.name} has been added to your receive list.`,
          });
          // scroll to bottom to see the added item
          window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
        }} 
      />
    </div>
    </div>
  );
}
