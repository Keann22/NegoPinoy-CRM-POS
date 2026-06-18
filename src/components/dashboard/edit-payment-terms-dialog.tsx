'use client';

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useSupabase } from "@/lib/supabase/hooks";
import { FileUpload } from "@/components/ui/file-upload";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import type { Order } from "@/app/dashboard/orders/page";
import { useEffect, useState } from "react";

const paymentSchema = z.object({
  paymentType: z.enum(["Full Payment", "Lay-away", "Installment", "COD", "Pending"], { required_error: "You need to select a payment type." }),
  installmentMonths: z.coerce.number().positive("Must be a positive number.").optional(),
  monthlyPayment: z.coerce.number().positive("Must be a positive number.").optional(),
  amountPaid: z.coerce.number().min(0).optional(),
  isDownpaymentCOD: z.boolean().default(false),
  proofOfPayment: z.any().optional(),
}).refine(data => {
    if (data.paymentType === 'Installment') {
        return data.installmentMonths && data.installmentMonths > 0;
    }
    return true;
}, {
    message: "Installment months are required for installment plans.",
    path: ["installmentMonths"],
}).refine(data => {
    if (data.paymentType === 'Installment') {
        return data.monthlyPayment && data.monthlyPayment > 0;
    }
    return true;
}, {
    message: "Monthly payment is required for installment plans.",
    path: ["monthlyPayment"],
}).superRefine((data, ctx) => {
    const actualAmount = data.isDownpaymentCOD ? 0 : (data.amountPaid ?? 0);
    if (actualAmount > 0) {
        if (!data.proofOfPayment || data.proofOfPayment.length === 0) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Proof of payment is required for upfront payments.",
                path: ["proofOfPayment"]
            });
        }
    }
});

type PaymentFormValues = z.infer<typeof paymentSchema>;

interface EditPaymentTermsDialogProps {
  order: Order | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function EditPaymentTermsDialog({ order, open, onOpenChange, onSuccess }: EditPaymentTermsDialogProps) {
  const supabase = useSupabase();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      paymentType: "Pending",
      amountPaid: 0,
      isDownpaymentCOD: false,
      proofOfPayment: [],
    },
  });

  useEffect(() => {
    if (order && open) {
      form.reset({
        paymentType: order.paymentType,
        amountPaid: Number(order.amountPaid) || 0,
        installmentMonths: order.installmentMonths || undefined,
        monthlyPayment: order.monthlyPayment || undefined,
        // Since we don't have isDownpaymentCOD in order DB directly, we'll assume false when opening
        isDownpaymentCOD: false,
        proofOfPayment: [],
      });
    }
  }, [order, open, form]);

  useEffect(() => {
    if (!order) return;
    const pType = form.watch('paymentType');
    if (pType === 'Full Payment') {
        form.setValue('amountPaid', Number(order.totalAmount) || 0);
    } else if (pType === 'COD' || pType === 'Pending') {
        form.setValue('amountPaid', 0);
    }
  }, [form.watch('paymentType'), order, form]);

  async function onSubmit(values: PaymentFormValues) {
    if (!order || !supabase) return;
    
    setIsSubmitting(true);
    try {
        let actualAmountPaid = values.amountPaid ?? 0;
        if (values.isDownpaymentCOD && (values.paymentType === 'Installment' || values.paymentType === 'Lay-away')) {
            actualAmountPaid = 0;
        }

        let totalAmount = Number(order.totalAmount) || 0;
        
        // If it's an installment, recalculate total amount based on terms (assuming base price isn't changed)
        // Actually, changing payment type means the total might change if they are moving to installment
        // The original logic: totalAmount = downpayment + (monthly * months)
        if (values.paymentType === 'Installment' && values.monthlyPayment && values.installmentMonths) {
            totalAmount = (values.amountPaid ?? 0) + (values.monthlyPayment * values.installmentMonths);
        } else if (order.paymentType === 'Installment' && values.paymentType !== 'Installment') {
            // Revert total amount to subtotal - discount if moving away from installment
            const { data: dbOrder } = await supabase.from('orders').select('subtotal, total_discount').eq('id', order.id).single();
            if (dbOrder) {
                totalAmount = (dbOrder.subtotal || 0) - (dbOrder.total_discount || 0);
            }
        }
        
        const balanceDue = totalAmount - actualAmountPaid;

        // 0. Upload proof of payment if exists
        let proofUrl = null;
        if (actualAmountPaid > 0 && values.proofOfPayment && values.proofOfPayment.length > 0) {
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

        const { error: updateError } = await supabase
            .from('orders')
            .update({
                payment_method: values.paymentType,
                installment_months: values.paymentType === 'Installment' ? values.installmentMonths : null,
                monthly_payment: values.paymentType === 'Installment' ? values.monthlyPayment : null,
                amount_paid: actualAmountPaid,
                balance_due: balanceDue,
                total_amount: totalAmount,
            })
            .eq('id', order.id);

        if (updateError) throw updateError;
        
        // If there's an actual amount paid during this edit, log it!
        // (Wait, we only log if they just added it now. Since Edit Payment Terms might be called multiple times, we should only log if proof is uploaded to avoid duplicates, or better yet, EditPaymentTerms is usually used to set the INITIAL terms).
        if (actualAmountPaid > 0 && proofUrl) {
            const { error: paymentError } = await supabase
                .from('payments')
                .insert({
                    order_id: order.id,
                    payment_date: new Date().toISOString(),
                    amount: actualAmountPaid,
                    payment_method: values.paymentType === 'Full Payment' ? 'Full Payment' : 'Downpayment',
                    proof_url: proofUrl,
                    notes: 'Initial Order Payment (Added via Edit Terms)'
                });
            if (paymentError) console.error("Failed to log payment during edit", paymentError);
        }
        
        toast({
            title: "Payment Terms Updated",
            description: `Order is now set to ${values.paymentType}.`,
        });
        
        onSuccess();
    } catch (error: any) {
        console.error("Failed to update payment terms:", error);
        toast({ variant: "destructive", title: "Update Failed", description: error.message });
    } finally {
        setIsSubmitting(false);
    }
  }

  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={(val) => !isSubmitting && onOpenChange(val)}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit Payment Terms</DialogTitle>
          <DialogDescription>
            Update the payment structure for Order #{order.id.substring(0, 7).toUpperCase()}.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            
            <FormField
                control={form.control}
                name="paymentType"
                render={({ field }) => (
                <FormItem className="space-y-3">
                    <FormLabel>Payment Type</FormLabel>
                    <FormControl>
                    <RadioGroup
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        value={field.value}
                        className="flex flex-col space-y-1"
                    >
                        <FormItem className="flex items-center space-x-3 space-y-0">
                        <FormControl><RadioGroupItem value="Full Payment" /></FormControl>
                        <FormLabel className="font-normal">Full Payment (Upfront)</FormLabel>
                        </FormItem>
                        <FormItem className="flex items-center space-x-3 space-y-0">
                        <FormControl><RadioGroupItem value="Lay-away" /></FormControl>
                        <FormLabel className="font-normal">Lay-away (Hulugan)</FormLabel>
                        </FormItem>
                        <FormItem className="flex items-center space-x-3 space-y-0">
                        <FormControl><RadioGroupItem value="Installment" /></FormControl>
                        <FormLabel className="font-normal">Installment</FormLabel>
                        </FormItem>
                        <FormItem className="flex items-center space-x-3 space-y-0">
                        <FormControl><RadioGroupItem value="COD" /></FormControl>
                        <FormLabel className="font-normal">Cash on Delivery (COD)</FormLabel>
                        </FormItem>
                        <FormItem className="flex items-center space-x-3 space-y-0">
                        <FormControl><RadioGroupItem value="Pending" /></FormControl>
                        <FormLabel className="font-normal">Pending / Undecided</FormLabel>
                        </FormItem>
                    </RadioGroup>
                    </FormControl>
                    <FormMessage />
                </FormItem>
                )}
            />

            {form.watch('paymentType') === 'Installment' && (
                <div className="grid grid-cols-2 gap-4">
                    <FormField
                        control={form.control}
                        name="installmentMonths"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Installment Months</FormLabel>
                                <FormControl>
                                    <Input type="number" placeholder="e.g., 3" {...field} value={field.value ?? ''} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="monthlyPayment"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Monthly Payment (₱)</FormLabel>
                                <FormControl>
                                    <Input type="number" step="0.01" placeholder="0.00" {...field} value={field.value ?? ''} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>
            )}
            
            {form.watch("paymentType") !== "Full Payment" && form.watch("paymentType") !== "COD" && form.watch("paymentType") !== "Pending" && (
                <div className="space-y-4">
                    <FormField
                        control={form.control}
                        name="amountPaid"
                        render={({ field }) => (
                            <FormItem>
                            <FormLabel>Downpayment (₱)</FormLabel>
                            <FormControl><Input type="number" step="0.01" placeholder="0.00" {...field} /></FormControl>
                            <FormMessage />
                            </FormItem>
                        )}
                    />
                    
                    <FormField
                        control={form.control}
                        name="isDownpaymentCOD"
                        render={({ field }) => (
                            <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                                <FormControl>
                                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                                </FormControl>
                                <div className="space-y-1 leading-none">
                                    <FormLabel>Downpayment is COD (Pending Collection)</FormLabel>
                                    <p className="text-xs text-muted-foreground">Check this if the downpayment will be collected on delivery instead of paid upfront.</p>
                                </div>
                            </FormItem>
                        )}
                    />
                </div>
            )}

            {((form.watch("paymentType") === "Full Payment") || (form.watch("amountPaid") !== undefined && form.watch("amountPaid")! > 0 && !form.watch("isDownpaymentCOD"))) && (
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
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Payment Terms
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
