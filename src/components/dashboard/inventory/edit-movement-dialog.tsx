'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useSupabase, useUser } from '@/firebase';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

const editMovementSchema = z.object({
  quantity_change: z.coerce.number(),
  unit_cost: z.coerce.number().min(0),
  supplier_name: z.string().optional(),
  reason: z.string().optional(),
});

type EditMovementFormValues = z.infer<typeof editMovementSchema>;

type Movement = {
  id: string;
  product_id: string;
  quantity_change: number;
  unit_cost: number | null;
  supplier_name: string | null;
  reason: string;
  movement_type: string;
};

interface EditMovementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  movement: Movement | null;
  onSuccess: () => void;
}

export function EditMovementDialog({ open, onOpenChange, movement, onSuccess }: EditMovementDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const supabase = useSupabase();
  const { user } = useUser();
  const { toast } = useToast();

  const form = useForm<EditMovementFormValues>({
    resolver: zodResolver(editMovementSchema),
    defaultValues: {
      quantity_change: 0,
      unit_cost: 0,
      supplier_name: '',
      reason: '',
    },
  });

  useEffect(() => {
    if (movement && open) {
      form.reset({
        quantity_change: movement.quantity_change,
        unit_cost: movement.unit_cost || 0,
        supplier_name: movement.supplier_name || '',
        reason: movement.reason || '',
      });
    }
  }, [movement, open, form]);

  const onSubmit = async (values: EditMovementFormValues) => {
    if (!movement || !user) return;
    setIsSubmitting(true);
    toast({ title: 'Applying Edits...', description: 'Please wait.' });

    try {
      // 1. Calculate Differences
      const quantityDiff = values.quantity_change - movement.quantity_change;
      const oldCostTotal = (movement.quantity_change * (movement.unit_cost || 0));
      const newCostTotal = (values.quantity_change * values.unit_cost);
      const costDiff = newCostTotal - oldCostTotal;

      // 2. Fetch current product to update stock level
      const { data: productData, error: productError } = await supabase
        .from('products')
        .select('id, stock_level, name')
        .eq('id', movement.product_id)
        .single();

      if (productError || !productData) throw new Error("Could not fetch product details.");

      const newStockLevel = (productData.stock_level || 0) + quantityDiff;

      // 3. Update the product
      if (quantityDiff !== 0) {
        const { error: updateProductError } = await supabase
          .from('products')
          .update({ stock_level: newStockLevel })
          .eq('id', movement.product_id);
        if (updateProductError) throw updateProductError;
      }

      // 4. Update the inventory movement record
      const { error: updateMovementError } = await supabase
        .from('inventory_movements')
        .update({
          quantity_change: values.quantity_change,
          unit_cost: values.unit_cost,
          supplier_name: values.supplier_name || null,
          reason: values.reason || '',
        })
        .eq('id', movement.id);
      
      if (updateMovementError) throw updateMovementError;

      // 5. Compensating Expense (if cost changed)
      if (costDiff !== 0) {
        const { error: expenseError } = await supabase
          .from('expenses')
          .insert({
            expense_date: new Date().toISOString(),
            amount: costDiff, // Can be negative or positive
            category: 'Cost of Goods Sold',
            description: `Auto-adjustment: Edited inventory record for ${productData.name} (Diff: ₱${costDiff.toFixed(2)})`,
          });
        if (expenseError) throw expenseError;
      }

      // 6. Log the audit trail
      const oldValues = {
        quantity_change: movement.quantity_change,
        unit_cost: movement.unit_cost,
        supplier_name: movement.supplier_name,
        reason: movement.reason
      };
      
      const newValues = {
        quantity_change: values.quantity_change,
        unit_cost: values.unit_cost,
        supplier_name: values.supplier_name,
        reason: values.reason
      };

      const { error: auditError } = await supabase
        .from('audit_logs')
        .insert({
          table_name: 'inventory_movements',
          record_id: movement.id,
          user_id: user.uid,
          user_email: user.email || 'Unknown',
          action: 'UPDATE',
          old_values: oldValues,
          new_values: newValues,
        });
      
      if (auditError) throw auditError;

      toast({
        title: 'Edit Successful!',
        description: `The inventory transaction has been updated.`,
      });
      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      console.error(err);
      toast({
        variant: 'destructive',
        title: 'Edit Failed',
        description: err.message || 'An error occurred while saving the edit.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit Inventory Transaction</DialogTitle>
          <DialogDescription>
            Make corrections to this transaction. Any financial changes will automatically create an adjustment expense.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="quantity_change"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quantity Change</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="unit_cost"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Unit Cost (₱)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="supplier_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Supplier Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Optional" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reason / Description</FormLabel>
                  <FormControl>
                    <Textarea className="resize-none" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
