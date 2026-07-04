import { useState } from 'react';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useSupabase } from '@/lib/supabase/hooks';
import { useToast } from '@/hooks/use-toast';

const shipmentItemSchema = z.object({
  productId: z.string().min(1, "Product must be selected."),
  productName: z.string(),
  quantity: z.coerce.number().positive(),
  unitCost: z.coerce.number().min(0),
  supplierName: z.string().optional(),
});

export const shipmentSchema = z.object({
  purchaseDate: z.date({ required_error: 'A purchase date is required.' }),
  items: z.array(shipmentItemSchema).min(1, "Please add at least one item to the shipment."),
});

export type ShipmentFormValues = z.infer<typeof shipmentSchema>;

export function useBulkReceive() {
  const supabase = useSupabase();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittingIndex, setSubmittingIndex] = useState<number | null>(null);

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
      const productIds = values.items.map(item => item.productId);
      const { data: products, error: productsError } = await supabase
        .from('products')
        .select('id, stock_level, name')
        .in('id', productIds);
      
      if (productsError) throw productsError;
      
      const productDataMap = new Map(products.map(p => [p.id, p]));

      for (const item of values.items) {
          if (!productDataMap.has(item.productId)) {
              throw new Error(`Product "${item.productName}" not found in database.`);
          }
      }

      const totalExpense = values.items
        .filter(item => item.supplierName !== 'Internal Inventory')
        .reduce((sum, item) => sum + (item.quantity * item.unitCost), 0);
      if (totalExpense > 0) {
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
      
      for (const item of values.items) {
        const { error: updateError } = await supabase.rpc('increment_stock', {
            p_product_id: item.productId,
            qty: item.quantity,
            new_unit_cost: item.unitCost
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

  return {
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
  };
}
