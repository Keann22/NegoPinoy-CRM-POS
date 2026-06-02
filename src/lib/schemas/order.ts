import * as z from "zod";

export const orderItemSchema = z.object({
  productId: z.string(),
  productName: z.string(),
  quantity: z.coerce.number().min(1, "Quantity must be at least 1"),
  costPriceAtSale: z.coerce.number(),
  sellingPriceAtSale: z.coerce.number().min(0, "Price cannot be negative"),
  discount: z.coerce.number().min(0, "Discount must be non-negative").optional(),
}).refine(data => (data.discount || 0) <= data.sellingPriceAtSale, {
    message: "Discount cannot be greater than the selling price.",
    path: ["discount"],
});

export const orderSchema = z.object({
  customerId: z.string({ required_error: "Please select a customer." }),
  orderDate: z.date({ required_error: "An order date is required." }),
  orderItems: z.array(orderItemSchema).min(1, "Please add at least one product to the order."),
  paymentType: z.enum(["Full Payment", "Lay-away", "Installment", "COD", "Pending"], { required_error: "You need to select a payment type." }),
  installmentMonths: z.coerce.number().positive("Must be a positive number.").optional(),
  monthlyPayment: z.coerce.number().positive("Must be a positive number.").optional(),
  orderStatus: z.enum(["Pending Payment", "Processing", "Shipped", "Completed", "Cancelled", "Payment Received (COD)"]),
  amountPaid: z.coerce.number().min(0).optional(),
  isDownpaymentCOD: z.boolean().default(false),
  shippingDetails: z.string().optional(),
  trackingNumber: z.string().optional(),
  includeInsurance: z.boolean().default(true),
  applyOverpayment: z.boolean().default(false),
  platformFees: z.coerce.number().min(0).optional(),
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

export type OrderFormValues = z.infer<typeof orderSchema>;

export type Customer = { id: string; firstName: string; lastName: string; [key: string]: any; };

export type StockBatch = {
  batchId: string;
  purchaseDate: string;
  originalQty: number;
  remainingQty: number;
  unitCost: number;
  supplierName: string;
}

export type Product = { id: string; name: string; quantityOnHand: number; sellingPrice: number; stockBatches: StockBatch[]; [key: string]: any; };
