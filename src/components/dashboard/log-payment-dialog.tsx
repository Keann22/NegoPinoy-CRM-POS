'use client';

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useSupabase } from "@/lib/supabase/hooks";
import { useToast } from "@/hooks/use-toast";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Order } from "@/app/dashboard/orders/page";
import { useEffect, useState } from "react";
import { FileUpload } from "../ui/file-upload";

const paymentSchema = z.object({
  paymentDate: z.date({ required_error: "A payment date is required." }),
  amount: z.coerce.number().positive("Amount must be positive"),
  paymentMethod: z.enum(["Cash", "GCash", "Bank Transfer", "Credit Card", "Other", "Shopee Platform Payouts", "COD Payed"], {
    required_error: "Please select a payment method.",
  }),
  notes: z.string().optional(),
  proofOfPayment: z.any().optional(),
}).superRefine((data, ctx) => {
    if (!data.proofOfPayment || data.proofOfPayment.length === 0) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Proof of payment is required.",
            path: ["proofOfPayment"]
        });
    }
});

type PaymentFormValues = z.infer<typeof paymentSchema>;

interface LogPaymentDialogProps {
  order: Order;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const paymentMethods = ["GCash", "Shopee Platform Payouts", "Cash", "Bank Transfer", "COD Payed", "Credit Card", "Other"];

export function LogPaymentDialog({ order, open, onOpenChange }: LogPaymentDialogProps) {
  const supabase = useSupabase();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      paymentDate: new Date(),
      amount: order.balanceDue > 0 ? order.balanceDue : 0,
      paymentMethod: "Cash",
      notes: "",
      proofOfPayment: [],
    },
  });

  useEffect(() => {
    if (order && open) {
      form.reset({
        paymentDate: new Date(),
        amount: order.balanceDue > 0 ? order.balanceDue : 0,
        paymentMethod: "Cash",
        notes: "",
        proofOfPayment: [],
      });
    }
  }, [order, open, form]);

  function onSubmit(values: PaymentFormValues) {
    setIsSubmitting(true);
    onOpenChange(false);
    
    toast({
      title: "Processing Payment...",
      description: `Your payment for order #${order.id.substring(0, 7)} is being saved.`,
    });

    const processPayment = async () => {
      try {
        if (!supabase) return;

        // 1. Upload proof of payment
        let proofUrl = null;
        if (values.proofOfPayment && values.proofOfPayment.length > 0) {
            const file = values.proofOfPayment[0];
            const fileExt = file.name.split('.').pop();
            const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`;
            
            const { data: uploadData, error: uploadError } = await supabase.storage
                .from('proof_of_payment')
                .upload(fileName, file, { upsert: false });
                
            if (uploadError) throw uploadError;
            
            const { data: { publicUrl } } = supabase.storage.from('proof_of_payment').getPublicUrl(uploadData.path);
            proofUrl = publicUrl;
        }

        // 2. Get current order data
        const { data: currentOrderData, error: fetchError } = await supabase
            .from('orders')
            .select('*')
            .eq('id', order.id)
            .single();
            
        if (fetchError || !currentOrderData) {
            throw new Error("Order does not exist!");
        }

        const newAmountPaid = (currentOrderData.amount_paid || 0) + values.amount;
        let newBalanceDue = currentOrderData.total_amount - newAmountPaid;
        const isCOD = currentOrderData.payment_method === 'COD' || values.paymentMethod === 'COD Payed';
        
        let overpaymentAmount = 0;
        if (newBalanceDue < 0) {
            overpaymentAmount = Math.abs(newBalanceDue);
            newBalanceDue = 0; // Cap at 0
        }

        let newStatus = currentOrderData.status;
        if (newBalanceDue <= 0) {
            newStatus = isCOD ? 'Payment Received (COD)' : 'Completed';
        }

        // 3. Log Payment
        const { data: paymentData, error: paymentError } = await supabase
            .from('payments')
            .insert({
                order_id: order.id,
                payment_date: values.paymentDate.toISOString(),
                amount: values.amount,
                payment_method: values.paymentMethod,
                notes: values.notes,
                proof_url: proofUrl,
            })
            .select()
            .single();

        if (paymentError) throw paymentError;

        // Trigger Google Cloud Vision OCR in the background
        if (proofUrl && paymentData?.id) {
            fetch('/api/payments/extract-ocr', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ proofUrl, paymentId: paymentData.id })
            }).catch(err => console.error("OCR trigger failed:", err));
        }

        // 4. Update Order
        const { error: updateError } = await supabase
            .from('orders')
            .update({
                amount_paid: newAmountPaid,
                balance_due: newBalanceDue,
                status: newStatus,
            })
            .eq('id', order.id);

        if (updateError) throw updateError;
        
        // 5. Handle Overpayment (Store Credit)
        if (overpaymentAmount > 0 && currentOrderData.customer_id) {
            const { data: customerData } = await supabase
                .from('customers')
                .select('store_credit')
                .eq('id', currentOrderData.customer_id)
                .single();
                
            const currentCredit = customerData?.store_credit || 0;
            const { error: creditError } = await supabase
                .from('customers')
                .update({ store_credit: currentCredit + overpaymentAmount })
                .eq('id', currentOrderData.customer_id);
                
            if (creditError) throw creditError;
            
            toast({
                title: "Overpayment Detected",
                description: `₱${overpaymentAmount.toFixed(2)} has been added to the customer's store credit balance.`,
            });
        }
        
        if (overpaymentAmount === 0) {
            toast({
                title: "Payment Logged Successfully",
                description: `₱${values.amount.toFixed(2)} has been logged.`,
            });
        }
      } catch (error: any) {
          console.error("Payment logging failed:", error);
          toast({
              variant: 'destructive',
              title: 'Payment Save Failed',
              description: error.message || 'Could not save the payment. Please try again.',
          });
      } finally {
        setIsSubmitting(false);
      }
    };
    
    processPayment();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Log Payment for Order</DialogTitle>
          <DialogDescription>
            Balance due: ₱{order.balanceDue.toFixed(2)}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
            <FormField
              control={form.control}
              name="paymentDate"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Payment Date</FormLabel>
                  <Popover modal={false}>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant={"outline"}
                          className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}
                        >
                          {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
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
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Amount (₱)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" placeholder="0.00" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="paymentMethod"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Payment Method</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a payment method" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {paymentMethods.map(method => (
                        <SelectItem key={method} value={method}>{method}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
                control={form.control}
                name="proofOfPayment"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>Proof of Payment <span className="text-destructive">*</span></FormLabel>
                        <FormControl>
                            <FileUpload 
                                value={field.value} 
                                onChange={field.onChange} 
                                multiple={false}
                            />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )}
            />
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Add any notes here..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Payment
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
