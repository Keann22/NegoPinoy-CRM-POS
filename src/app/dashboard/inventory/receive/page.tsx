'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { useToast } from '@/hooks/use-toast';
import { CalendarIcon, Loader2, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useRoleCheck } from '@/hooks/useRoleCheck';
import { ProductSearch } from '@/components/dashboard/inventory/product-search';
import { PendingPurchases } from '@/components/dashboard/pending-purchases';
import { useBulkReceive } from '@/hooks/useBulkReceive';

export default function BulkReceivePage() {
  const { toast } = useToast();
  const { isManagement } = useRoleCheck();
  
  const {
    form,
    fields,
    append,
    remove,
    addNewItem,
    totalCost,
    submittingIndex,
    isSubmitting,
    handleReceiveSingleItem,
    onSubmit
  } = useBulkReceive();

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <PendingPurchases onReceiveComplete={() => {}} />

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
