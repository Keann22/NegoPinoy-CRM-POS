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
import { FileUpload } from "@/components/ui/file-upload";
import type { Order } from "@/types";
import { useEffect, useState } from "react";

const paymentMethods = ["GCash", "Cash", "Bank Transfer", "Shopee Platform Payouts", "Credit Card", "Other"] as const;

const settlementSchema = z.object({
  settlementTotal: z.coerce.number().min(0, "Settlement total cannot be negative."),
  paymentDate: z.date({ required_error: "A payment date is required." }),
  paymentMethod: z.enum(paymentMethods, { required_error: "Please select a payment method." }),
  notes: z.string().optional(),
  proofOfPayment: z.any().optional(),
});

type SettlementFormValues = z.infer<typeof settlementSchema>;

interface EarlySettlementDialogProps {
  order: Order | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

/** Live financials fetched from the DB when the dialog opens, so we never rely on a stale row. */
type OrderFinancials = {
  cashTotal: number;
  alreadyPaid: number;
  installmentTotal: number;
  installmentMonths: number | null;
  monthlyPayment: number | null;
  customerId: string | null;
};

export function EarlySettlementDialog({ order, open, onOpenChange, onSuccess }: EarlySettlementDialogProps) {
  const supabase = useSupabase();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [financials, setFinancials] = useState<OrderFinancials | null>(null);

  const form = useForm<SettlementFormValues>({
    resolver: zodResolver(settlementSchema),
    defaultValues: {
      settlementTotal: 0,
      paymentDate: new Date(),
      paymentMethod: "Cash",
      notes: "",
      proofOfPayment: [],
    },
  });

  useEffect(() => {
    if (!order || !open || !supabase) return;
    let cancelled = false;
    setFinancials(null);
    (async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('subtotal, total_discount, insurance_fee, shipping_fee, amount_paid, total_amount, installment_months, monthly_payment, customer_id')
        .eq('id', order.id)
        .single();
      if (cancelled) return;
      if (error || !data) {
        toast({ variant: "destructive", title: "Failed to load order", description: error?.message || "Order not found." });
        onOpenChange(false);
        return;
      }
      // Cash basis: the order's price without the monthly-payment markup.
      const cashTotal = (data.subtotal || 0) - (data.total_discount || 0) + (data.insurance_fee || 0) + (data.shipping_fee || 0);
      setFinancials({
        cashTotal,
        alreadyPaid: Number(data.amount_paid) || 0,
        installmentTotal: Number(data.total_amount) || 0,
        installmentMonths: data.installment_months,
        monthlyPayment: data.monthly_payment,
        customerId: data.customer_id,
      });
      form.reset({
        settlementTotal: cashTotal,
        paymentDate: new Date(),
        paymentMethod: "Cash",
        notes: "",
        proofOfPayment: [],
      });
    })();
    return () => { cancelled = true; };
  }, [order, open, supabase, form, toast, onOpenChange]);

  const settlementTotal = Number(form.watch('settlementTotal')) || 0;
  const alreadyPaid = financials?.alreadyPaid ?? 0;
  const interestWaived = Math.max(0, (financials?.installmentTotal ?? 0) - settlementTotal);
  const amountDueNow = Math.max(0, settlementTotal - alreadyPaid);
  const creditFromExcess = Math.max(0, alreadyPaid - settlementTotal);

  async function onSubmit(values: SettlementFormValues) {
    if (!order || !supabase || !financials) return;

    const dueNow = Math.max(0, values.settlementTotal - financials.alreadyPaid);
    if (dueNow > 0 && (!values.proofOfPayment || values.proofOfPayment.length === 0)) {
      form.setError('proofOfPayment', { message: "Proof of payment is required for the settlement payment." });
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Upload proof of payment
      let proofUrl: string | null = null;
      if (dueNow > 0 && values.proofOfPayment && values.proofOfPayment.length > 0) {
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

      // 2. Settle atomically: the RPC locks the order row and does the payment insert,
      // order conversion, and store-credit handling in a single DB transaction.
      const { data, error: rpcError } = await supabase.rpc('settle_installment_order', {
        payload: {
          orderId: order.id,
          settlementTotal: values.settlementTotal,
          paymentDate: values.paymentDate.toISOString(),
          paymentMethod: values.paymentMethod,
          proofUrl,
          notes: values.notes || null,
        }
      });
      if (rpcError) throw rpcError;
      const result = data as { paymentId: string | null; paymentAmount: number; interestWaived: number; excessToCredit: number } | null;

      // 3. Trigger OCR in the background, same as the log-payment flow
      if (proofUrl && result?.paymentId) {
        fetch('/api/payments/extract-ocr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ proofUrl, paymentId: result.paymentId })
        }).catch(err => console.error("OCR trigger failed:", err));
      }

      if (result && result.excessToCredit > 0) {
        toast({
          title: "Overpayment Converted",
          description: `₱${result.excessToCredit.toFixed(2)} has been added to the customer's store credit balance.`,
        });
      }

      toast({
        title: "Order Settled",
        description: `Order settled at ₱${values.settlementTotal.toFixed(2)}. Interest waived: ₱${(result?.interestWaived ?? 0).toFixed(2)}.`,
      });
      onSuccess();
    } catch (error: any) {
      console.error("Early settlement failed:", error);
      toast({ variant: "destructive", title: "Settlement Failed", description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={(val) => !isSubmitting && onOpenChange(val)}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Early Settlement (Pay in Full)</DialogTitle>
          <DialogDescription>
            Settle Order #{order.id.substring(0, 7).toUpperCase()} at the cash price and waive the remaining installment interest.
          </DialogDescription>
        </DialogHeader>

        {!financials ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="rounded-md border p-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Installment Total</span>
                  <span>₱{financials.installmentTotal.toFixed(2)}</span>
                </div>
                {financials.installmentMonths && financials.monthlyPayment && (
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Plan</span>
                    <span>{financials.installmentMonths} mo × ₱{Number(financials.monthlyPayment).toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Already Paid</span>
                  <span>₱{alreadyPaid.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Interest Waived</span>
                  <span className="text-green-600">−₱{interestWaived.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-semibold border-t pt-1 mt-1">
                  <span>Amount Due Now</span>
                  <span>₱{amountDueNow.toFixed(2)}</span>
                </div>
                {creditFromExcess > 0 && (
                  <p className="text-xs text-amber-600">
                    Payments already exceed the settlement total. ₱{creditFromExcess.toFixed(2)} will be added to the customer's store credit.
                  </p>
                )}
              </div>

              <FormField
                control={form.control}
                name="settlementTotal"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Settlement Total (₱)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      Defaults to the order's cash price (subtotal − discount + fees). Adjust only if the owner approved a different settlement amount.
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {amountDueNow > 0 && (
                <>
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
                    name="paymentMethod"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Payment Method</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
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
                          <FileUpload value={field.value} onChange={field.onChange} multiple={false} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}

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

              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Settle Order
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
