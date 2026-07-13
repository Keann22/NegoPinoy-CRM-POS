import { useState, useCallback } from 'react';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useSupabase } from '@/lib/supabase/hooks';
import { useToast } from '@/hooks/use-toast';
import { parseReceipt } from '@/ai/flows/parse-receipt-flow';

const parsedItemSchema = z.object({
  productId: z.string().min(1, "Product must be matched."),
  productName: z.string(),
  quantity: z.coerce.number().positive(),
  unitCost: z.coerce.number().min(0),
});

export const scanSchema = z.object({
  supplierName: z.string().min(1, 'Supplier name is required.'),
  purchaseDate: z.date({ required_error: 'A purchase date is required.' }),
  items: z.array(parsedItemSchema).min(1, "The receipt must contain at least one valid item."),
});

export type ScanFormValues = z.infer<typeof scanSchema>;

const fileToDataUri = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
};

export function useScanReceipt() {
    const supabase = useSupabase();
    const { toast } = useToast();

    const [isParsing, setIsParsing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [receiptImage, setReceiptImage] = useState<File | null>(null);
    const [receiptImageUrl, setReceiptImageUrl] = useState<string | null>(null);

    // State for the AddProductDialog
    const [isAddProductDialogOpen, setIsAddProductDialogOpen] = useState(false);
    const [addProductInitialValues, setAddProductInitialValues] = useState<any>();
    const [productCreationRowIndex, setProductCreationRowIndex] = useState<number | null>(null);

    const form = useForm<ScanFormValues>({
        resolver: zodResolver(scanSchema),
        defaultValues: {
            supplierName: '',
            purchaseDate: new Date(),
            items: [],
        },
    });

    const { fields, remove, replace } = useFieldArray({
        control: form.control,
        name: 'items',
    });

    const items = useWatch({ control: form.control, name: 'items' });
    const totalCost = items.reduce((total, item) => total + ((item.quantity || 0) * (item.unitCost || 0)), 0);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setReceiptImage(file);
        setReceiptImageUrl(URL.createObjectURL(file));
        setIsParsing(true);
        replace([]); // Clear previous items
        toast({ title: 'Parsing Receipt...', description: 'Gemini is processing the receipt. This may take a moment.' });

        try {
            const dataUri = await fileToDataUri(file);
            const result = await parseReceipt({ photoDataUri: dataUri });
            
            if (result.items && result.items.length > 0) {
                const newItems = result.items.map(item => ({
                    productName: item.productName || '',
                    quantity: isNaN(Number(item.quantity)) || Number(item.quantity) <= 0 ? 1 : Number(item.quantity),
                    unitCost: isNaN(Number(item.unitCost)) || Number(item.unitCost) < 0 ? 0 : Number(item.unitCost),
                    productId: '',
                }));
                replace(newItems);
                toast({ title: 'Receipt Parsed!', description: 'Please review the items below and match them to your products.' });
            } else {
                toast({ variant: 'destructive', title: 'Parsing Failed', description: 'No items were found on the receipt. Please try another image.' });
            }
        } catch (error) {
            console.error("Error parsing receipt:", error);
            toast({ variant: 'destructive', title: 'Parsing Error', description: 'An error occurred while parsing the receipt.' });
        } finally {
            setIsParsing(false);
        }
    };

    const handleAddNewProduct = useCallback((productName: string, rowIndex: number) => {
        const item = form.getValues(`items.${rowIndex}`);
        setAddProductInitialValues({
            name: productName,
            sku: '',
            description: '',
            categoryId: 'Uncategorized',
            supplierId: '',
            images: [],
            initialUnitCost: item.unitCost || 0,
            sellingPrice: item.unitCost ? item.unitCost * 1.5 : 0, // Suggest markup
            quantityOnHand: 0, // Stock is added when receipt is saved, not here.
        });
        setProductCreationRowIndex(rowIndex);
        setIsAddProductDialogOpen(true);
    }, [form]);

    const onSubmit = async (values: ScanFormValues) => {
        setIsSaving(true);
        toast({ title: 'Saving to Inventory...', description: 'Please wait.' });

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

            // 2. Record Expense (exclude if supplier is Internal Inventory)
            const totalExpense = values.items.reduce((sum, item) => sum + (item.quantity * item.unitCost), 0);
            if (totalExpense > 0 && values.supplierName !== 'Internal Inventory') {
                const { error: expenseError } = await supabase
                    .from('expenses')
                    .insert({
                        expense_date: values.purchaseDate.toISOString(),
                        amount: totalExpense,
                        category: 'Cost of Goods Sold',
                        description: `Scanned receipt from ${values.supplierName}`,
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
                        reason: `Scanned receipt from ${values.supplierName}`,
                        supplier_name: values.supplierName,
                        unit_cost: item.unitCost
                    });
                    
                if (movementError) throw movementError;
            }

            toast({ title: 'Inventory Updated!', description: 'The items have been added to your inventory.' });
            form.reset();
            replace([]);
            setReceiptImage(null);
            setReceiptImageUrl(null);
        } catch (e: any) {
            console.error("Scanned receipt transaction failed: ", e);
            toast({ variant: 'destructive', title: 'Save Failed', description: e.message || 'Could not save the items.' });
        } finally {
            setIsSaving(false);
        }
    };

    return {
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
    };
}
