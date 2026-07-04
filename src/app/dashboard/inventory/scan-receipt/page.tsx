'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { useToast } from '@/hooks/use-toast';
import { CalendarIcon, Loader2, Trash2, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ZoomableImage } from "@/components/ui/zoomable-image";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { AddProductDialog } from '@/components/dashboard/product-dialog';
import { useRoleCheck } from '@/hooks/useRoleCheck';
import { useScanReceipt } from '@/hooks/useScanReceipt';
import { ScanProductSearch } from '@/components/dashboard/inventory/scan-product-search';

export default function ScanReceiptPage() {
    const { toast } = useToast();
    const { isManagement } = useRoleCheck();
    const {
        form,
        fields,
        remove,
        handleFileChange,
        handleAddNewProduct,
        onSubmit,
        isParsing,
        isSaving,
        receiptImage,
        receiptImageUrl,
        totalCost,
        isAddProductDialogOpen,
        setIsAddProductDialogOpen,
        addProductInitialValues,
        productCreationRowIndex,
        setProductCreationRowIndex
    } = useScanReceipt();

    return (
        <Card>
            <CardHeader>
                <CardTitle className="font-headline flex items-center gap-2"><Upload /> Upload Receipt to Add Inventory</CardTitle>
                <CardDescription>
                    Upload an image of a supplier receipt, and Gemini will automatically parse the items for you to add to your inventory. This is designed for use on a computer where you have an existing image file.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                        <div className='grid md:grid-cols-2 gap-8'>
                            {/* Left column for upload and preview */}
                            <div className='space-y-4'>
                                <Label htmlFor="receipt-upload" className={cn(
                                    "flex flex-col items-center justify-center w-full h-64 px-4 transition bg-background border-2 border-dashed rounded-md appearance-none cursor-pointer hover:border-gray-400 focus:outline-none",
                                    receiptImageUrl && "border-solid"
                                )}>
                                    {receiptImageUrl ? (
                                        <ZoomableImage src={receiptImageUrl} alt="Receipt preview" width={400} height={400} className="max-h-full w-auto object-contain rounded-md" />
                                    ) : (
                                        <div className="flex flex-col items-center space-y-2 text-center">
                                            <Upload className="w-8 h-8 text-muted-foreground" />
                                            <span className="font-medium text-muted-foreground">Click to upload or drag and drop</span>
                                            <span className="text-xs text-muted-foreground">PNG, JPG, or GIF</span>
                                        </div>
                                    )}
                                    <Input id="receipt-upload" type="file" className="hidden" onChange={handleFileChange} accept="image/*" disabled={isParsing} />
                                </Label>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <FormField control={form.control} name="supplierName" render={({ field }) => (<FormItem><FormLabel>Supplier Name</FormLabel><FormControl><Input placeholder="e.g., Global Imports Inc." {...field} /></FormControl><FormMessage /></FormItem>)} />
                                <FormField control={form.control} name="purchaseDate" render={({ field }) => (<FormItem className="flex flex-col"><FormLabel>Purchase Date</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={'outline'} className={cn('w-full pl-3 text-left font-normal', !field.value && 'text-muted-foreground')}><> {field.value ? format(field.value, 'PPP') : <span>Pick a date</span>} <CalendarIcon className="ml-auto h-4 w-4 opacity-50" /> </></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus /></PopoverContent></Popover><FormMessage /></FormItem>)} />
                                </div>
                            </div>

                            {/* Right column for parsed items */}
                            <div className='space-y-2'>
                                <FormLabel>Parsed & Matched Items</FormLabel>
                                <div className='border rounded-lg max-h-96 overflow-y-auto'>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className='w-[45%]'>Product (Match)</TableHead>
                                            <TableHead>Qty</TableHead>
                                            {isManagement && <TableHead>Unit Cost</TableHead>}
                                            <TableHead className='w-[50px]'></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {isParsing && Array.from({ length: 3 }).map((_, i) => (<TableRow key={i}><TableCell colSpan={4}><Skeleton className="h-10 w-full" /></TableCell></TableRow>))}
                                        {!isParsing && fields.map((field, index) => (
                                            <TableRow key={field.id}>
                                                <TableCell className="font-medium">
                                                    <ScanProductSearch rowIndex={index} form={form} onAddNewProduct={handleAddNewProduct} />
                                                    <FormMessage>{form.formState.errors?.items?.[index]?.productId?.message}</FormMessage>
                                                </TableCell>
                                                <TableCell>
                                                    <FormField control={form.control} name={`items.${index}.quantity`} render={({ field }) => (<FormItem><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>)} />
                                                </TableCell>
                                                {isManagement && (
                                                    <TableCell>
                                                        <FormField control={form.control} name={`items.${index}.unitCost`} render={({ field }) => (<FormItem><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>)} />
                                                    </TableCell>
                                                )}
                                                <TableCell><Button type="button" variant='ghost' size='icon' onClick={() => remove(index)}><Trash2 className='h-4 w-4 text-destructive'/></Button></TableCell>
                                            </TableRow>
                                        ))}
                                         {!isParsing && fields.length === 0 && (
                                            <TableRow><TableCell colSpan={4} className="h-24 text-center"> {receiptImage ? 'No items found on receipt.' : 'Upload a receipt to begin.'} </TableCell></TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                                </div>
                                <FormMessage>{form.formState.errors.items?.message || form.formState.errors.items?.root?.message}</FormMessage>
                                {isManagement && fields.length > 0 && (
                                    <div className="pt-4 space-y-2 text-right">
                                        <p className="text-lg">Total Purchase Cost: <span className="font-bold">₱{totalCost.toFixed(2)}</span></p>
                                    </div>
                                )}
                            </div>
                        </div>

                        <Separator />
                        
                        <div className='flex justify-end'>
                            <Button type="submit" disabled={isParsing || isSaving || fields.length === 0}>
                                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Loader2 className="mr-2 h-4 w-4 animate-spin hidden" />}
                                {isSaving ? 'Adding to Inventory...' : 'Add to Inventory'}
                            </Button>
                        </div>
                    </form>
                </Form>
                <AddProductDialog
                    open={isAddProductDialogOpen}
                    onOpenChange={setIsAddProductDialogOpen}
                    initialValues={addProductInitialValues}
                    onProductAdded={(newProduct) => {
                        if (productCreationRowIndex !== null) {
                            form.setValue(`items.${productCreationRowIndex}.productId`, newProduct.id);
                            form.setValue(`items.${productCreationRowIndex}.productName`, newProduct.name);
                            form.trigger(`items.${productCreationRowIndex}.productId`);
                        }
                        setProductCreationRowIndex(null);
                        setIsAddProductDialogOpen(false);
                        toast({
                            title: `Matched to ${newProduct.name}`,
                            description: 'The new product has been created and matched to the receipt item.',
                        });
                    }}
                />
            </CardContent>
        </Card>
    );
}
