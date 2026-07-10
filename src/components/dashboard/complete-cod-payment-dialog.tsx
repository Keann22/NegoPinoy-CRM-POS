'use client';

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useSupabase } from "@/lib/supabase/hooks";
import { useToast } from "@/hooks/use-toast";
import { resolveOpenOrderIssues, STATUSES_THAT_CLEAR_ORDER_ISSUES } from "@/lib/services/order-service";
import { Loader2 } from "lucide-react";
import type { Order } from "@/app/dashboard/orders/page";
import { useEffect, useState } from "react";

const codSchema = z.object({
  amountCollected: z.coerce.number().min(0, "Amount cannot be negative"),
  amountRemitted: z.coerce.number().min(0, "Amount cannot be negative"),
}).refine(data => data.amountCollected >= data.amountRemitted, {
  message: "Remitted amount cannot be greater than collected amount",
  path: ["amountRemitted"]
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
      amountCollected: order?.balanceDue ?? 0,
      amountRemitted: order?.balanceDue ?? 0,
    },
  });

  useEffect(() => {
    if (order && open) {
      form.reset({
        amountCollected: order.balanceDue > 0 ? order.balanceDue : 0,
        amountRemitted: order.balanceDue > 0 ? order.balanceDue : 0,
      });
    }
  }, [order, open, form]);

  const amountCollected = form.watch("amountCollected") || 0;
  const amountRemitted = form.watch("amountRemitted") || 0;
  const processingFee = Math.max(0, amountCollected - amountRemitted);

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
        const newAmountPaid = (currentOrderData.amount_paid || 0) + values.amountCollected;
        const newBalanceDue = Math.max(0, currentBalanceDue - values.amountCollected);
        const newStatus = newBalanceDue <= 0 ? 'Completed' : currentOrderData.status;

        // 2. Log Payment for the collected amount
        const { error: paymentError } = await supabase
            .from('payments')
            .insert({
                order_id: order.id,
                payment_date: new Date().toISOString(),
                amount: values.amountCollected,
                payment_method: 'COD Payed',
                notes: processingFee > 0 ? `Remitted: ₱${values.amountRemitted.toFixed(2)}, Fee: ₱${processingFee.toFixed(2)}` : 'Full Remittance',
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

        if (STATUSES_THAT_CLEAR_ORDER_ISSUES.includes(newStatus)) {
            await resolveOpenOrderIssues(supabase, order.id);
        }

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
                ? `Logged ₱${values.amountCollected.toFixed(2)} received and ₱${processingFee.toFixed(2)} processing fee.` 
                : `Order payment of ₱${values.amountCollected.toFixed(2)} logged.`,
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
            Enter the details for the COD delivery of Order #{order.id.substring(0, 7).toUpperCase()}.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            
            <div className="rounded-lg border p-4 bg-muted/50 space-y-2">
                <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Order Balance Due:</span>
                    <span className="font-medium">₱{order.balanceDue.toFixed(2)}</span>
                </div>
                {processingFee > 0 && (
                    <div className="flex justify-between text-sm text-destructive">
                        <span>Courier Processing Fee:</span>
                        <span className="font-medium">- ₱{processingFee.toFixed(2)}</span>
                    </div>
                )}
            </div>

            <FormField
              control={form.control}
              name="amountCollected"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Amount Collected from Customer (₱)</FormLabel>
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

            <FormField
              control={form.control}
              name="amountRemitted"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Actual Amount Remitted to You (₱)</FormLabel>
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
                    A <span className="font-medium text-black">₱{processingFee.toFixed(2)}</span> processing fee will automatically be recorded in Accounting &gt; Expenses. The collected amount will be credited to the customer.
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
