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
import { AlertCircle, CalendarIcon, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Order } from "@/app/dashboard/orders/page";
import { useEffect, useState, useMemo } from "react";
import { FileUpload } from "../ui/file-upload";
import { useGcashTransfer } from "@/hooks/useGcashTransfer";
import { TransferOrdersPicker } from "./payments/transfer-orders-picker";
import { useCustomerCredit } from "@/hooks/useCustomerCredit";
import { OverpaymentTipNotice } from "./payments/OverpaymentTipNotice";
import {
  type PaymentFormValues,
  submitStoreCreditPayment,
  submitTransferPayment,
  submitStandardPayment,
} from "@/hooks/useLogPaymentSubmission";

const paymentSchema = z.object({
  paymentDate: z.date({ required_error: "A payment date is required." }),
  amount: z.coerce.number().positive("Amount must be positive"),
  paymentMethod: z.enum(["Cash", "GCash", "Bank Transfer", "Credit Card", "Other", "Shopee Platform Payouts", "COD Payed", "Store Credit"], {
    required_error: "Please select a payment method.",
  }),
  notes: z.string().optional(),
  proofOfPayment: z.any().optional(),
  isTip: z.boolean().default(false),
}).superRefine((data, ctx) => {
  if (data.paymentMethod !== "Store Credit") {
    if (!data.proofOfPayment || data.proofOfPayment.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Proof of payment is required.",
        path: ["proofOfPayment"],
      });
    }
  }
});

interface LogPaymentDialogProps {
  order: Order;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const SPLIT_METHODS = ["GCash", "Bank Transfer"];
const BASE_PAYMENT_METHODS = ["GCash", "Shopee Platform Payouts", "Cash", "Bank Transfer", "COD Payed", "Credit Card", "Other"];

export function LogPaymentDialog(props: LogPaymentDialogProps) {
  const { order, open, onOpenChange } = props;
  const supabase = useSupabase();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [splitMode, setSplitMode] = useState(false);

  const { info: creditInfo } = useCustomerCredit(order?.id, open);

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

  const selectedMethod = form.watch("paymentMethod");
  const watchAmount = Number(form.watch("amount") || 0);
  const isStoreCredit = selectedMethod === "Store Credit";

  const customerCredit = creditInfo?.storeCredit || 0;
  const availableMethods = useMemo(() => {
    if (customerCredit > 0.009) {
      return ["Store Credit", ...BASE_PAYMENT_METHODS];
    }
    return BASE_PAYMENT_METHODS;
  }, [customerCredit]);

  const maxStoreCreditUsable = useMemo(() => {
    return Math.min(customerCredit, Math.max(0, order.balanceDue || 0));
  }, [customerCredit, order.balanceDue]);

  const handleMethodChange = (value: string) => {
    form.setValue("paymentMethod", value as any);
    if (value === "Store Credit") {
      setSplitMode(false);
      form.setValue("amount", maxStoreCreditUsable);
    }
  };

  const isSplit = !isStoreCredit && splitMode && SPLIT_METHODS.includes(selectedMethod);
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

  async function onSubmit(values: PaymentFormValues) {
    if (isStoreCredit) {
      if (values.amount > maxStoreCreditUsable + 0.009) {
        toast({
          variant: "destructive",
          title: "Amount too high",
          description: `Cannot exceed available store credit or balance due (max ₱${maxStoreCreditUsable.toFixed(2)}).`,
        });
        return;
      }
      setIsSubmitting(true);
      try {
        const { creditLeft } = await submitStoreCreditPayment(order.id, values.amount, values.notes);
        toast({
          title: "Store Credit Applied",
          description: `₱${values.amount.toFixed(2)} paid with store credit. ₱${creditLeft.toFixed(2)} credit left.`,
        });
        if (props.onSuccess) props.onSuccess();
        props.onOpenChange(false);
      } catch (error: any) {
        toast({
          variant: "destructive",
          title: "Save Failed",
          description: error.message || "Could not apply store credit.",
        });
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

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

    try {
      if (!supabase) return;
      if (isSplit) {
        const result = await submitTransferPayment(supabase, transfer, values);
        toast({ title: `Payment logged on ${result.transferCount} orders`, description: result.message });
        if (props.onSuccess) props.onSuccess();
        props.onOpenChange(false);
        return;
      }

      const { overpayment } = await submitStandardPayment(supabase, order, values);
      if (overpayment > 0) {
        toast({
          title: "Overpayment Detected",
          description: `₱${overpayment.toFixed(2)} has been added to the customer's store credit balance.`,
        });
      } else {
        toast({
          title: "Payment Logged Successfully",
          description: `₱${values.amount.toFixed(2)} has been logged.`,
        });
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
              name="paymentMethod"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Payment Method</FormLabel>
                  <Select onValueChange={handleMethodChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a payment method" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {availableMethods.map(method => (
                        <SelectItem key={method} value={method}>{method}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {customerCredit > 0.009 && (
                    <div className="space-y-1 mt-1">
                      <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                        Customer has ₱{customerCredit.toFixed(2)} store credit
                      </p>
                      {creditInfo?.hasPendingPayment && (
                        <div className="flex items-center gap-1 text-[11px] text-amber-600 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-300 p-1.5 rounded border border-amber-200 dark:border-amber-800">
                          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                          <span>Credit came from a payment not yet verified by owners.</span>
                        </div>
                      )}
                    </div>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{isSplit ? "Whole GCash amount (₱)" : isStoreCredit ? "Store credit to use (₱)" : "Amount (₱)"}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      max={isStoreCredit ? maxStoreCreditUsable : undefined}
                      placeholder="0.00"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                  {isStoreCredit && (
                    <div className="text-xs text-muted-foreground mt-1.5 bg-muted/40 p-2 rounded border">
                      <span>Balance after: <b>₱{Math.max(0, (order.balanceDue || 0) - watchAmount).toFixed(2)}</b></span>
                      <span className="mx-2">·</span>
                      <span>Credit left: <b>₱{Math.max(0, customerCredit - watchAmount).toFixed(2)}</b></span>
                    </div>
                  )}
                  {!isStoreCredit && (
                    <OverpaymentTipNotice extraAmount={extraAmount} isSplit={isSplit} register={form.register} />
                  )}
                </FormItem>
              )}
            />

            {!isStoreCredit && SPLIT_METHODS.includes(selectedMethod) && (
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

            {!isStoreCredit && (
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

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isStoreCredit ? "Apply Store Credit" : "Save Payment"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
