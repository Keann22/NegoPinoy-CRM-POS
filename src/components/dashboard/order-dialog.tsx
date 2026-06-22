'use client';

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useSupabase, useUser } from "@/lib/supabase/hooks";
import { FileUpload } from "@/components/ui/file-upload";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";
import { useCustomerSearch } from "@/hooks/useCustomerSearch";
import { useProductSearch } from "@/hooks/useProductSearch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Trash2, PlusCircle } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { format } from "date-fns";
import { useUserProfile } from "@/hooks/useUserProfile";
import { AddCustomerDialog } from "./add-customer-dialog";
import { AddProductDialog } from "./product-dialog";
import { useRouter } from "next/navigation";
import { orderSchema, type OrderFormValues, type Customer, type Product } from "@/lib/schemas/order";
import { OrderLeftPanel } from "./orders/OrderLeftPanel";
import { OrderItemsPanel } from "./orders/OrderItemsPanel";
import { VariantSelectionDialog } from "./orders/VariantSelectionDialog";
import { createOrder, editOrder } from "@/lib/services/order-service";

// ---------------------------------------------------------------------------
// Props – discriminated union to support both "create" and "edit" modes
// ---------------------------------------------------------------------------
type OrderDialogProps =
  | {
      mode: 'create';
      onOrderAdded?: () => void;
      open?: never;
      onOpenChange?: never;
      order?: never;
      orderItems?: never;
    }
  | {
      mode: 'edit';
      order: any;
      orderItems: any[];
      open: boolean;
      onOpenChange: (open: boolean) => void;
      onOrderAdded?: never;
    };

// ---------------------------------------------------------------------------
// OrderDialog – unified component
// ---------------------------------------------------------------------------
export function OrderDialog(props: OrderDialogProps) {
  const isEditing = props.mode === 'edit';

  const supabase = useSupabase();
  const { user } = useUser();
  const { toast } = useToast();
  const { userProfile } = useUserProfile();
  const router = useRouter();

  const [addCustomerOpen, setAddCustomerOpen] = useState(false);
  const [addProductOpen, setAddProductOpen] = useState(false);

  // Create mode manages its own open state; edit mode uses props
  const [internalOpen, setInternalOpen] = useState(false);
  const dialogOpen = isEditing ? props.open : internalOpen;

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  // Search state
  const [customerSearch, setCustomerSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');
  // Cache of { cashPrice, installmentPrice } keyed by productId so we can re-price when checkbox changes
  const [productPriceCache, setProductPriceCache] = useState<Record<string, { cashPrice: number; installmentPrice: number | null }>>({});

  // Domain hooks for debounced search
  const { results: customerResults, isSearching: isSearchingCustomers } = useCustomerSearch(customerSearch);
  const { results: productResults, isSearching: isSearchingProducts } = useProductSearch(productSearch);

  const form = useForm<OrderFormValues>({
    resolver: zodResolver(orderSchema),
    defaultValues: {
      orderDate: new Date(),
      orderItems: [],
      paymentType: "Full Payment",
      orderStatus: "Processing",
      amountPaid: 0,
      includeInsurance: true,
      applyOverpayment: false,
      platformFees: 0,
      proofOfPayment: [],
      isInstallmentFirstTimer: false,
      installmentMonths: undefined,
      monthlyPayment: undefined,
    },
  });

  // -------------------------------------------------------------------------
  // Open/close handler
  // -------------------------------------------------------------------------
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      if (!isEditing) {
        // Reset form fully when closing create dialog
        form.reset({
          orderDate: new Date(),
          orderItems: [],
          paymentType: "Full Payment",
          orderStatus: "Processing",
          amountPaid: 0,
          isDownpaymentCOD: false,
          includeInsurance: true,
          applyOverpayment: false,
          platformFees: 0,
          trackingNumber: "",
          proofOfPayment: [],
        });
        setSelectedCustomer(null);
      }
      setCustomerSearch('');
      setProductSearch('');
    }

    if (isEditing) {
      props.onOpenChange(isOpen);
    } else {
      setInternalOpen(isOpen);
    }
  };

  // -------------------------------------------------------------------------
  // Edit mode: pre-populate form from existing order data
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (isEditing && props.open && props.order && props.orderItems) {
      const order = props.order;
      const initialOrderItems = props.orderItems;

      form.reset({
        customerId: order.customerId,
        orderDate: new Date(order.orderDate),
        orderItems: initialOrderItems.map((item: any) => ({
          productId: item.productId,
          productName: item.productName || "Unknown",
          quantity: item.quantity,
          costPriceAtSale: item.costPriceAtSale || 0,
          sellingPriceAtSale: item.sellingPriceAtSale || 0,
          discount: item.discount || 0
        })),
        paymentType: order.paymentType as any,
        installmentMonths: order.installmentMonths || undefined,
        monthlyPayment: order.monthlyPayment || undefined,
        orderStatus: order.orderStatus as any,
        amountPaid: order.amountPaid || 0,
        shippingDetails: order.notes || "",
        trackingNumber: order.tracking_number || "",
        includeInsurance: order.insurance_fee !== 0,
        platformFees: order.platformFees || 0,
        proofOfPayment: order.amountPaid > 0 ? [new File(["dummy"], "existing_proof.jpg", { type: "image/jpeg" })] : [],
      });

      const fetchCust = async () => {
        const { data } = await supabase.from('customers').select('*').eq('id', order.customerId).single();
        if (data) {
          setSelectedCustomer({
            id: data.id,
            firstName: data.full_name?.split(' ')[0] || '',
            lastName: data.full_name?.split(' ').slice(1).join(' ') || ''
          });
        }
      };
      fetchCust();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing && props.open, props.order, props.orderItems, form, supabase]);


  const [variantSelectionProduct, setVariantSelectionProduct] = useState<Product | null>(null);
  const [variantSelectionOptions, setVariantSelectionOptions] = useState<any[]>([]);

  // -------------------------------------------------------------------------
  // Re-price all items when first-timer checkbox or payment type changes
  // -------------------------------------------------------------------------
  const isInstallmentFirstTimer = form.watch('isInstallmentFirstTimer');
  const watchedPaymentType = form.watch('paymentType');
  useEffect(() => {
    const currentItems = form.getValues('orderItems');
    if (!currentItems || currentItems.length === 0) return;
    currentItems.forEach((item, index) => {
      const cached = productPriceCache[item.productId];
      if (!cached) return;
      const useInstallment =
        watchedPaymentType === 'Installment' &&
        isInstallmentFirstTimer &&
        cached.installmentPrice &&
        cached.installmentPrice > 0;
      const newPrice = useInstallment ? cached.installmentPrice! : cached.cashPrice;
      form.setValue(`orderItems.${index}.sellingPriceAtSale`, newPrice);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInstallmentFirstTimer, watchedPaymentType]);


  // -------------------------------------------------------------------------
  // Field array for order items
  // -------------------------------------------------------------------------
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "orderItems"
  });

  // -------------------------------------------------------------------------
  // Computed totals
  // -------------------------------------------------------------------------
  const { subtotal, totalDiscount } = form.watch('orderItems').reduce((acc, item) => {
    const itemPrice = item.sellingPriceAtSale || 0;
    const itemDiscount = item.discount || 0;
    const itemQty = item.quantity || 0;

    acc.subtotal += itemPrice * itemQty;
    acc.totalDiscount += itemDiscount * itemQty;
    return acc;
  }, { subtotal: 0, totalDiscount: 0 });

  const includeInsurance = form.watch('includeInsurance');
  const applyOverpayment = form.watch('applyOverpayment');

  const insuranceFee = includeInsurance ? (subtotal - totalDiscount) * 0.01 : 0;
  const rawTotal = subtotal - totalDiscount + insuranceFee;
  // Overpayment only applies in create mode
  const overpaymentApplied = (!isEditing && applyOverpayment && selectedCustomer?.store_credit)
    ? Math.min(selectedCustomer.store_credit, rawTotal)
    : 0;
  const totalAmount = rawTotal - overpaymentApplied;

  // Auto-set amount paid based on payment type
  useEffect(() => {
    const pType = form.watch('paymentType');
    if (pType === 'Full Payment') {
      form.setValue('amountPaid', totalAmount);
    } else if (pType === 'COD' || pType === 'Pending') {
      form.setValue('amountPaid', 0);
    }
  }, [totalAmount, form, form.watch('paymentType')]);

  // -------------------------------------------------------------------------
  // Submit: create mode
  // -------------------------------------------------------------------------
  async function handleCreateSubmit(values: OrderFormValues) {
    if (!userProfile || !supabase) {
      toast({ variant: "destructive", title: "Authentication or Database error", description: "Could not create order." });
      return;
    }

    const actualAmount = values.isDownpaymentCOD ? 0 : (values.amountPaid ?? 0);
    if (actualAmount > 0 && (!values.proofOfPayment || values.proofOfPayment.length === 0)) {
      form.setError('proofOfPayment', { type: 'manual', message: 'Proof of payment is required for upfront payments.' });
      return;
    }

    handleOpenChange(false);
    toast({ title: "Creating Order...", description: "Your new order is being saved." });

    try {
      const newOrderId = await createOrder(supabase, values, {
        userId: user?.uid ?? '',
        salesPersonId: userProfile.id,
        salesPersonName: `${userProfile.firstName} ${userProfile.lastName}`.trim() || userProfile.email,
        selectedCustomerStoreCredit: selectedCustomer?.store_credit,
        selectedCustomerId: selectedCustomer?.id,
      });

      toast({
        title: "Order Created",
        description: "The new order has been successfully saved and inventory updated.",
      });

      if (props.mode === 'create' && props.onOrderAdded) {
        props.onOrderAdded();
      }

      router.push(`/dashboard/orders/${newOrderId}?share=true`);
    } catch (e: any) {
      console.error("Order creation failed:", e);
      toast({
        variant: 'destructive',
        title: 'Order Failed',
        description: e.message || 'Could not create the order due to an error.',
      });
    }
  }

  // -------------------------------------------------------------------------
  // Submit: edit mode
  // -------------------------------------------------------------------------
  async function handleEditSubmit(values: OrderFormValues) {
    if (!userProfile || !supabase || !isEditing) {
      toast({ variant: "destructive", title: "Authentication or Database error", description: "Could not update order." });
      return;
    }

    const order = props.order;
    props.onOpenChange(false);
    toast({ title: "Updating Order...", description: "Your order edits are being saved." });

    try {
      await editOrder(supabase, values, {
        userProfileId: userProfile.id,
        orderId: order.id,
        originalOrderDate: order.orderDate,
        originalAmountPaid: order.amountPaid || 0,
        originalOrderItems: props.orderItems,
      });

      toast({
        title: "Order Updated",
        description: "The order has been successfully edited and inventory re-adjusted.",
      });

      window.location.reload();
    } catch (e: any) {
      console.error("Order edit failed:", e);
      toast({
        variant: 'destructive',
        title: 'Edit Failed',
        description: e.message || 'Could not update the order due to an error.',
      });
    }
  }

  // -------------------------------------------------------------------------
  // Submit dispatcher
  // -------------------------------------------------------------------------
  async function onSubmit(values: OrderFormValues) {
    if (isEditing) {
      await handleEditSubmit(values);
    } else {
      await handleCreateSubmit(values);
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <>
      <Dialog open={dialogOpen} onOpenChange={handleOpenChange}>
      {/* Create mode: render a trigger button; edit mode: no trigger */}
      {!isEditing && (
        <DialogTrigger asChild>
          <Button>New Order</Button>
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Order' : 'Create New Order'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Modify the items or shipping details for this order.'
              : 'Fill in the details for the new sales order.'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <div className="grid gap-4 py-4 px-1 md:grid-cols-3 md:gap-8">
              <OrderLeftPanel
                control={form.control}
                watch={form.watch}
                setValue={form.setValue}
                isEditing={isEditing}
                selectedCustomer={selectedCustomer}
                onClearCustomer={() => {
                  setSelectedCustomer(null);
                  form.setValue('customerId', '');
                }}
                customerSearch={customerSearch}
                onCustomerSearchChange={setCustomerSearch}
                customerResults={customerResults}
                isSearchingCustomers={isSearchingCustomers}
                onCustomerSelect={(c) => {
                  form.setValue('customerId', c.id);
                  setSelectedCustomer(c);
                  setCustomerSearch('');
                }}
                onAddCustomerClick={() => setAddCustomerOpen(true)}
                totalAmount={totalAmount}
                overpaymentApplied={overpaymentApplied}
              />
              <OrderItemsPanel
                control={form.control}
                watch={form.watch}
                fields={fields}
                remove={remove}
                formStateErrors={form.formState.errors}
                isEditing={isEditing}
                subtotal={subtotal}
                totalDiscount={totalDiscount}
                insuranceFee={insuranceFee}
                totalAmount={totalAmount}
                overpaymentApplied={overpaymentApplied}
                selectedCustomerStoreCredit={selectedCustomer?.store_credit}
                productSearch={productSearch}
                onProductSearchChange={setProductSearch}
                productResults={productResults}
                isSearchingProducts={isSearchingProducts}
                onProductSelect={async (p) => {
                  const { data: variants } = await supabase
                    .from('products')
                    .select('id, name, variant_name, stock_level, selling_price, initial_unit_cost, stock_batches(*)')
                    .eq('parent_id', p.id);

                  if (variants && variants.length > 0) {
                    setVariantSelectionProduct(p);
                    setVariantSelectionOptions(variants);
                    return;
                  }

                  const isAlreadyAdded = fields.some(item => item.productId === p.id);
                  if (isAlreadyAdded) {
                    toast({ variant: "default", title: "Product already in order", description: `${p.name} is already in this order. You can adjust the quantity above.` });
                    setProductSearch('');
                    return;
                  }

                  const productToAdd = productResults.find(prod => prod.id === p.id);
                  if (productToAdd) {
                    const costPriceAtSale = productToAdd.stockBatches?.length > 0 ? productToAdd.stockBatches[0].unitCost : 0;
                    const isInstallmentFirstTimer = form.getValues('isInstallmentFirstTimer');
                    const paymentType = form.getValues('paymentType');
                    const useInstallmentPrice = paymentType === 'Installment' && isInstallmentFirstTimer && productToAdd.installment_price && productToAdd.installment_price > 0;

                    if (paymentType === 'Installment' && !productToAdd.installment_price) {
                      toast({ variant: 'default', title: 'Not eligible for installment', description: `This product has no installment price set.` });
                    }

                    append({
                      productId: productToAdd.id,
                      productName: productToAdd.name,
                      quantity: 1,
                      costPriceAtSale: costPriceAtSale,
                      sellingPriceAtSale: useInstallmentPrice ? productToAdd.installment_price : productToAdd.sellingPrice,
                      discount: 0
                    });
                    setProductPriceCache(prev => ({ ...prev, [productToAdd.id]: { cashPrice: productToAdd.sellingPrice, installmentPrice: productToAdd.installment_price ?? null } }));
                  }
                  setProductSearch('');
                }}
                onAddProductClick={() => setAddProductOpen(true)}
              />
            </div>
            <DialogFooter className="pt-8">
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button>
              <Button type="submit">{isEditing ? 'Save Changes' : 'Create Order'}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
      <AddCustomerDialog
        open={addCustomerOpen}
        onOpenChange={setAddCustomerOpen}
        initialName={customerSearch}
        onSuccess={(customer) => {
          form.setValue("customerId", customer.id);
          setSelectedCustomer({ id: customer.id, firstName: customer.firstName, lastName: customer.lastName });
          setCustomerSearch('');
        }}
      />
      <AddProductDialog
        open={addProductOpen}
        onOpenChange={setAddProductOpen}
        initialValues={{ name: productSearch }}
        onProductAdded={(p) => {
          setProductSearch(p.name);
        }}
      />
    </Dialog>
    <VariantSelectionDialog
      parentProduct={variantSelectionProduct}
      options={variantSelectionOptions}
      existingProductIds={fields.map(f => f.productId)}
      onSelect={(item) => append(item)}
      onClose={() => { setVariantSelectionProduct(null); setProductSearch(''); }}
    />
  </>
  );
}

// ---------------------------------------------------------------------------
// Backward-compatible exports for gradual migration
// ---------------------------------------------------------------------------
export function AddOrderDialog({ onOrderAdded }: { onOrderAdded?: () => void }) {
  return <OrderDialog mode="create" onOrderAdded={onOrderAdded} />;
}

export function EditOrderDialog({ order, orderItems, open, onOpenChange }: { order: any; orderItems: any[]; open: boolean; onOpenChange: (open: boolean) => void }) {
  return <OrderDialog mode="edit" order={order} orderItems={orderItems} open={open} onOpenChange={onOpenChange} />;
}
