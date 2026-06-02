'use client';

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useSupabase } from "@/firebase";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import type { Order } from "@/app/dashboard/orders/page";
import { useEffect, useState } from "react";

const codSchema = z.object({
  amountReceived: z.coerce.number().min(0, "Amount cannot be negative"),
});

type CodFormValues = z.infer<typeof codSchema>;

interface CompleteCodPaymentDialogProps {
  order: Order | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function CompleteCodPaymentDialog({ order, open, onOpenChange, onSuccess }: CompleteCodPaymentDialogProps) {
  const supabase = useSupabase();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<CodFormValues>({
    resolver: zodResolver(codSchema),
    defaultValues: {
      amountReceived: order?.balanceDue ?? 0,
    },
  });

  useEffect(() => {
    if (order && open) {
      form.reset({
        amountReceived: order.balanceDue > 0 ? order.balanceDue : 0,
      });
    }
  }, [order, open, form]);

  const amountReceived = form.watch("amountReceived");
  const processingFee = order ? Math.max(0, order.balanceDue - (amountReceived || 0)) : 0;

  async function onSubmit(values: CodFormValues) {
    if (!order || !supabase) return;
    
    setIsSubmitting(true);
    try {
        // 1. Get current order data to ensure it's up to date
        const { data: currentOrderData, error: fetchError } = await supabase
            .from('orders')
            .select('*')
            .eq('id', order.id)
            .single();
            
        if (fetchError || !currentOrderData) {
            throw new Error("Order does not exist!");
        }

        const currentBalanceDue = currentOrderData.balance_due;
        const newAmountPaid = currentOrderData.total_amount;
        const newBalanceDue = 0;
        const newStatus = 'Payment Received (COD)';

        // 2. Log Payment for the full balance due to close the order
        const { error: paymentError } = await supabase
            .from('payments')
            .insert({
                order_id: order.id,
                payment_date: new Date().toISOString(),
                amount: currentBalanceDue,
                payment_method: 'COD Payed',
                notes: processingFee > 0 ? `Remitted: ₱${values.amountReceived.toFixed(2)}, Fee: ₱${processingFee.toFixed(2)}` : 'Full Remittance',
            });

        if (paymentError) throw paymentError;

        // 3. Update Order
        const { error: updateError } = await supabase
            .from('orders')
            .update({
                amount_paid: newAmountPaid,
                balance_due: newBalanceDue,
                status: newStatus,
            })
            .eq('id', order.id);

        if (updateError) throw updateError;
        
        // 4. Log Processing Fee Expense if any
        if (processingFee > 0) {
            const { error: expenseError } = await supabase
                .from('expenses')
                .insert({
                    expense_date: new Date().toISOString(),
                    amount: processingFee,
                    category: 'Processing Fee',
                    description: `Courier Fee for Order #${order.id.substring(0, 7).toUpperCase()}`
                });
                
            if (expenseError) throw expenseError;
        }
        
        toast({
            title: "COD Payment Completed",
            description: processingFee > 0 
                ? `Logged ₱${values.amountReceived.toFixed(2)} received and ₱${processingFee.toFixed(2)} processing fee.` 
                : `Order fully paid.`,
        });
        
        onSuccess();
    } catch (error: any) {
        console.error("COD completion failed:", error);
        toast({ variant: "destructive", title: "Failed to complete COD", description: error.message });
    } finally {
        setIsSubmitting(false);
    }
  }

  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={(val) => !isSubmitting && onOpenChange(val)}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Complete COD Payment</DialogTitle>
          <DialogDescription>
            Enter the exact cash amount remitted by the courier for Order #{order.id.substring(0, 7).toUpperCase()}.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            
            <div className="rounded-lg border p-4 bg-muted/50 space-y-2">
                <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Expected Balance Due:</span>
                    <span className="font-medium">₱{order.balanceDue.toFixed(2)}</span>
                </div>
                {processingFee > 0 && (
                    <div className="flex justify-between text-sm text-destructive">
                        <span>Processing Fee:</span>
                        <span className="font-medium">- ₱{processingFee.toFixed(2)}</span>
                    </div>
                )}
            </div>

            <FormField
              control={form.control}
              name="amountReceived"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Actual Amount Received (₱)</FormLabel>
                  <FormControl>
                    <Input 
                        type="number" 
                        step="0.01" 
                        placeholder="0.00" 
                        {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {processingFee > 0 && (
                <p className="text-sm text-muted-foreground">
                    A <span className="font-medium text-black">₱{processingFee.toFixed(2)}</span> processing fee will automatically be recorded in Accounting &gt; Expenses. The customer's order will still be marked as fully paid.
                </p>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirm & Complete
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
