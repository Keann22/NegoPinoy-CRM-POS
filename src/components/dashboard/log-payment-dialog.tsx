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
import { useGcashTransfer, uploadProof } from "@/hooks/useGcashTransfer";
import { TransferOrdersPicker } from "./payments/transfer-orders-picker";
import { paymentEffect } from "@/lib/services/payments/order-payment-rules";

const paymentSchema = z.object({
  paymentDate: z.date({ required_error: "A payment date is required." }),
  amount: z.coerce.number().positive("Amount must be positive"),
  paymentMethod: z.enum(["Cash", "GCash", "Bank Transfer", "Credit Card", "Other", "Shopee Platform Payouts", "COD Payed"], {
    required_error: "Please select a payment method.",
  }),
  notes: z.string().optional(),
  proofOfPayment: z.any().optional(),
  isTip: z.boolean().default(false),
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
  onSuccess?: () => void;
}

const SPLIT_METHODS = ["GCash", "Bank Transfer"];
const paymentMethods = ["GCash", "Shopee Platform Payouts", "Cash", "Bank Transfer", "COD Payed", "Credit Card", "Other"];

export function LogPaymentDialog(props: LogPaymentDialogProps) {
  const { order, open, onOpenChange } = props;
  const supabase = useSupabase();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [splitMode, setSplitMode] = useState(false);

  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      paymentDate: new Date(),
      amount: order.balanceDue > 0 ? order.balanceDue : 0,
      paymentMethod: "Cash",
      notes: "",
      proofOfPayment: [],
      isTip: false,
    },
  });

  const watchAmount = Number(form.watch("amount") || 0);
  // One GCash for several orders of this customer (owner, 2026-11-04).
  const isSplit = splitMode && SPLIT_METHODS.includes(form.watch("paymentMethod"));
  const transfer = useGcashTransfer(order.id, open && isSplit);
  const extraAmount = isSplit ? watchAmount - transfer.sharesTotal : watchAmount - (order.balanceDue || 0);

  useEffect(() => {
    if (order && open) {
      form.reset({
        paymentDate: new Date(),
        amount: order.balanceDue > 0 ? order.balanceDue : 0,
        paymentMethod: "Cash",
        notes: "",
        proofOfPayment: [],
        isTip: false,
      });
      setSplitMode(false);
    }
  }, [order, open, form]);

  async function processTransfer(values: PaymentFormValues) {
    const proofUrl = await uploadProof(supabase!, values.proofOfPayment[0]);
    const result = await transfer.save({
      transferAmount: values.amount,
      paymentDate: values.paymentDate.toISOString(),
      paymentMethod: values.paymentMethod,
      notes: values.notes,
      proofUrl,
      isTip: values.isTip,
    });
    // OCR reads the reference once; the server copies it to the other orders' payments.
    fetch('/api/payments/extract-ocr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proofUrl, paymentId: result.mainPaymentId }),
    }).catch(() => {});
    for (const orderId of result.fullyPaidOrderIds) {
      fetch('/api/priority/paid-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      }).catch(() => {});
    }
    const extraNote = result.storeCredit > 0 ? ` ₱${result.storeCredit.toFixed(2)} went to store credit.`
      : result.tip > 0 ? ` ₱${result.tip.toFixed(2)} kept as a tip.` : '';
    toast({ title: `Payment logged on ${transfer.shares.length} orders`, description: `₱${values.amount.toFixed(2)} GCash.${extraNote}` });
  }

  function onSubmit(values: PaymentFormValues) {
    if (isSplit) {
      if (transfer.shares.length < 2) {
        toast({ variant: 'destructive', title: 'Tick at least one other order', description: 'Or untick "This GCash also paid other orders".' });
        return;
      }
      if (transfer.sharesTotal > values.amount + 0.01) {
        toast({ variant: 'destructive', title: 'Orders add up to more than the GCash', description: "Lower an order's amount." });
        return;
      }
    }
    setIsSubmitting(true);
    
    toast({
      title: "Processing Payment...",
      description: `Your payment for order #${order.id.substring(0, 7)} is being saved.`,
    });

    const processPayment = async () => {
      try {
        if (!supabase) return;
        if (isSplit) {
          await processTransfer(values);
          if (props.onSuccess) props.onSuccess();
          props.onOpenChange(false);
          return;
        }

        // 1. Upload proof of payment
        let proofUrl: string | null = null;
        if (values.proofOfPayment && values.proofOfPayment.length > 0) {
            proofUrl = await uploadProof(supabase, values.proofOfPayment[0]);
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

        const effect = paymentEffect(currentOrderData, values.amount, values.paymentMethod);
        const { newAmountPaid, newBalanceDue, newStatus } = effect;
        let overpaymentAmount = effect.overpayment;

        if (values.isTip && overpaymentAmount > 0) {
            values.notes = (values.notes ? values.notes + "\n" : "") + `[Tip / Keep the change: ₱${overpaymentAmount.toFixed(2)}]`;
            overpaymentAmount = 0; // Keep in business revenue, do not credit customer
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
        
        // If this payment finished paying the order, the owner and warehouse get told once.
        if (newBalanceDue <= 0) {
            fetch('/api/priority/paid-check', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderId: order.id }),
            }).catch(() => {});
        }

        if (props.onSuccess) props.onSuccess();
        props.onOpenChange(false);
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
    <Dialog open={props.open} onOpenChange={(open) => {
        if (!isSubmitting) props.onOpenChange(open);
    }}>
      <DialogContent className={cn("max-h-[90vh] overflow-y-auto", isSplit ? "sm:max-w-[560px]" : "sm:max-w-[425px]")}>
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
                  <FormLabel>{isSplit ? "Whole GCash amount (₱)" : "Amount (₱)"}</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" placeholder="0.00" {...field} />
                  </FormControl>
                  <FormMessage />
                  {extraAmount > 0.009 && (
                    <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900 space-y-1.5 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
                      <div className="font-semibold flex items-center gap-1.5">
                        <span>💡</span>
                        <span>Overpayment of ₱{extraAmount.toFixed(2)} detected</span>
                      </div>
                      <p className="text-[11px] text-emerald-900/80 dark:text-emerald-200/80">
                        By default, this excess is automatically saved to the customer's Store Credit.
                      </p>
                      <label className="flex items-center gap-2 cursor-pointer font-medium text-foreground pt-1">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-emerald-500 accent-emerald-600"
                          {...form.register("isTip")}
                        />
                        <span>This excess is a Tip / Keep the change (do not add store credit)</span>
                      </label>
                    </div>
                  )}
                  {!isSplit && extraAmount <= 0.009 && (
                    <p className="text-[11px] text-muted-foreground mt-1">
                      💡 Enter the exact amount from GCash. Any excess is automatically credited to the customer.
                    </p>
                  )}
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
            {SPLIT_METHODS.includes(form.watch("paymentMethod")) && (
              <label className="flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-primary"
                  checked={splitMode}
                  onChange={(e) => setSplitMode(e.target.checked)}
                />
                <span>
                  <b>This GCash also paid other orders</b>
                  <span className="block text-xs text-muted-foreground">
                    Same customer only. Put the whole GCash amount above, then tick the orders.
                  </span>
                </span>
              </label>
            )}
            {isSplit && <TransferOrdersPicker transfer={transfer} mainOrderId={order.id} gcashAmount={watchAmount} />}
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
