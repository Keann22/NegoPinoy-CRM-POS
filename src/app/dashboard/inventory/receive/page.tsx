'use client';

import { useState, useMemo } from 'react';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useUser, useSupabase } from '@/lib/supabase/hooks';
import { useEffect } from 'react';
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
  supplierName: z.string().optional(),
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

  const [productResults, setProductResults] = useState<Product[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);

  useEffect(() => {
    if (!supabase || !user || search.length < 2) {
      setProductResults([]);
      return;
    }
    const handler = setTimeout(async () => {
      setIsLoadingProducts(true);
      try {
        let query = supabase.from('products').select('*');
        const searchWords = search.split(' ').filter(w => w.trim() !== '');
        searchWords.forEach(w => {
            query = query.or(`name.ilike.%${w}%,variant_name.ilike.%${w}%`);
        });
        const { data, error } = await query.order('name').limit(10);
        if (error) throw error;
        setProductResults(data || []);
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setIsLoadingProducts(false);
      }
    }, 250);
    return () => clearTimeout(handler);
  }, [supabase, user, search]);
  
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-start font-normal text-left">Select Product...</Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command shouldFilter={false}>
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

import { PendingPurchases } from '@/components/dashboard/pending-purchases';

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

  const [submittingIndex, setSubmittingIndex] = useState<number | null>(null);

  const handleReceiveSingleItem = async (index: number) => {
    const values = form.getValues();
    const item = values.items[index];
    
    if (!item.productId || !item.quantity || item.quantity <= 0) {
        toast({ variant: 'destructive', title: 'Invalid Item', description: 'Please ensure product is selected and quantity is valid.' });
        return;
    }

    setSubmittingIndex(index);
    toast({ title: 'Saving Item...', description: 'Please wait.' });

    try {
        const { data: product, error: productsError } = await supabase
            .from('products')
            .select('id, stock_level, name')
            .eq('id', item.productId)
            .single();
        
        if (productsError) throw productsError;
        
        const itemExpense = (item.quantity * (item.unitCost || 0));
        if (itemExpense > 0 && item.supplierName !== 'Internal Inventory') {
            const supplierText = item.supplierName ? ` from ${item.supplierName}` : '';
            const { error: expenseError } = await supabase
                .from('expenses')
                .insert({
                    expense_date: values.purchaseDate.toISOString(),
                    amount: itemExpense,
                    category: 'Cost of Goods Sold',
                    description: `Shipment received${supplierText} - ${product.name}`,
                });
            if (expenseError) throw expenseError;
        }

        const { error: updateError } = await supabase.rpc('increment_stock', {
            p_product_id: item.productId,
            qty: item.quantity,
            new_unit_cost: item.unitCost || 0
        });
        
        if (updateError) throw updateError;

        const { error: movementError } = await supabase
            .from('inventory_movements')
            .insert({
                product_id: item.productId,
                quantity_change: item.quantity,
                movement_type: 'RESTOCK',
                timestamp: new Date().toISOString(),
                reason: `Bulk receive${item.supplierName ? ` from ${item.supplierName}` : ''}`,
                supplier_name: item.supplierName || null,
                unit_cost: item.unitCost || 0
            });
            
        if (movementError) throw movementError;

        toast({
            title: 'Item Saved!',
            description: `${item.productName} has been received.`,
        });
        
        remove(index);
    } catch (e: any) {
        console.error("Single item receive failed: ", e);
        toast({
            variant: 'destructive',
            title: 'Save Failed',
            description: e.message || 'Could not save the item.',
        });
    } finally {
        setSubmittingIndex(null);
    }
  };

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

      // 2. Record Expense (exclude items from Internal Inventory)
      const totalExpense = values.items
        .filter(item => item.supplierName !== 'Internal Inventory')
        .reduce((sum, item) => sum + (item.quantity * item.unitCost), 0);
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
        // Update product stock level using atomic RPC
        const { error: updateError } = await supabase.rpc('increment_stock', {
            p_product_id: item.productId,
            qty: item.quantity,
            new_unit_cost: item.unitCost
        });
        
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
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <PendingPurchases onReceiveComplete={() => {
          // You could optionally refresh some other state here if needed
        }} />

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
                                    <div className="flex items-center justify-end gap-2">
                                        <Button 
                                            type="button" 
                                            size="sm"
                                            className="bg-green-600 hover:bg-green-700 text-white"
                                            onClick={() => handleReceiveSingleItem(index)}
                                            disabled={submittingIndex === index}
                                        >
                                            {submittingIndex === index ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                                        </Button>
                                        <Button type="button" variant='ghost' size='icon' onClick={() => remove(index)}>
                                            <Trash2 className='h-4 w-4 text-destructive'/>
                                        </Button>
                                    </div>
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
            
            <div className="flex gap-2">
                <Button type='button' variant='outline' onClick={addNewItem}>Add Item</Button>
                <Button type='button' variant='secondary' onClick={async () => {
                    try {
                        const res = await fetch("/api/inventory/procurement-request");
                        const data = await res.json();
                        if (data.outOfStock && data.outOfStock.length > 0) {
                            data.outOfStock.forEach((p: any) => {
                                const exists = form.getValues('items').some((f: any) => f.productId === p.productId);
                                if (!exists) {
                                    append({ productId: p.productId, productName: p.productName, quantity: p.systemQty, unitCost: 0 });
                                }
                            });
                            toast({ title: "Loaded To Procure items", description: "Items have been added to the form." });
                        } else {
                            toast({ title: "No items to procure", description: "All products have sufficient stock." });
                        }
                    } catch (e) {
                        console.error(e);
                        toast({ variant: 'destructive', title: "Error loading items" });
                    }
                }}>Load 'To Procure' Items</Button>
            </div>

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
    </div>
  );
}
