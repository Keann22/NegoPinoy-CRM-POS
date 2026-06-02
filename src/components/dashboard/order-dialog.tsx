'use client';

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useSupabase, useUser } from "@/firebase";
import { FileUpload } from "@/components/ui/file-upload";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Trash2, PlusCircle } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { format } from "date-fns";
import { useUserProfile } from "@/hooks/useUserProfile";
import { AddCustomerDialog } from "./add-customer-dialog";
import { AddProductDialog } from "./add-product-dialog";
import { useRouter } from "next/navigation";
import { orderSchema, type OrderFormValues, type Customer, type Product } from "@/lib/schemas/order";

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

  // State for customer search
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [isSearchingCustomers, setIsSearchingCustomers] = useState(false);

  // State for product search
  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState<Product[]>([]);
  const [isSearchingProducts, setIsSearchingProducts] = useState(false);
  // Cache of { cashPrice, installmentPrice } keyed by productId so we can re-price when checkbox changes
  const [productPriceCache, setProductPriceCache] = useState<Record<string, { cashPrice: number; installmentPrice: number | null }>>({});

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
      setCustomerResults([]);
      setProductSearch('');
      setProductResults([]);
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

  // -------------------------------------------------------------------------
  // Debounced search for customers
  // -------------------------------------------------------------------------
  useEffect(() => {
    const handler = setTimeout(async () => {
      if (customerSearch.length < 1) {
        setCustomerResults([]);
        return;
      }
      if (!supabase || !user) return;

      setIsSearchingCustomers(true);
      try {
        const { data, error } = await supabase
          .from('customers')
          .select('*')
          .ilike('full_name', `%${customerSearch}%`)
          .limit(10);

        if (error) throw error;

        // Map full_name to firstName for the UI compatibility
        const results = (data || []).map(doc => ({
          id: doc.id,
          ...doc,
          firstName: doc.full_name?.split(' ')[0] || '',
          lastName: doc.full_name?.split(' ').slice(1).join(' ') || ''
        } as Customer));
        setCustomerResults(results);
      } catch (error) {
        console.error("Error searching customers:", error);
        toast({ variant: "destructive", title: "Customer search failed" });
      } finally {
        setIsSearchingCustomers(false);
      }
    }, 300);

    return () => clearTimeout(handler);
  }, [customerSearch, supabase, user, toast]);

  // -------------------------------------------------------------------------
  // Debounced search for products
  // -------------------------------------------------------------------------
  useEffect(() => {
    const handler = setTimeout(async () => {
      if (productSearch.length < 1) {
        setProductResults([]);
        return;
      }
      if (!supabase || !user) return;

      setIsSearchingProducts(true);
      try {
        const { data, error } = await supabase
          .from('products')
          .select('id, name, stock_level, selling_price, installment_price, parent_id, supplier_pricing')
          .ilike('name', `%${productSearch}%`)
          .gt('selling_price', 0)  // exclude pure parent containers (price = 0)
          .limit(15);

        if (error) throw error;

        const results = (data || []).map(doc => ({
          id: doc.id,
          name: doc.name,
          quantityOnHand: doc.stock_level,
          sellingPrice: doc.selling_price,
          installment_price: doc.installment_price,
          supplier_pricing: doc.supplier_pricing,
          stockBatches: [],
        } as Product));
        setProductResults(results);
      } catch (error) {
        console.error("Error searching products:", error);
        toast({ variant: "destructive", title: "Product search failed" });
      } finally {
        setIsSearchingProducts(false);
      }
    }, 300);

    return () => clearTimeout(handler);
  }, [productSearch, supabase, user, toast]);

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

    handleOpenChange(false);
    toast({ title: "Creating Order...", description: "Your new order is being saved." });

    try {
      const { subtotal, totalDiscount } = values.orderItems.reduce((acc, item) => {
        const itemPrice = item.sellingPriceAtSale || 0;
        const itemDiscount = item.discount || 0;
        const itemQty = item.quantity || 0;

        acc.subtotal += itemPrice * itemQty;
        acc.totalDiscount += itemDiscount * itemQty;
        return acc;
      }, { subtotal: 0, totalDiscount: 0 });

      let actualAmountPaid = values.amountPaid ?? 0;
      if (values.isDownpaymentCOD && (values.paymentType === 'Installment' || values.paymentType === 'Lay-away')) {
        actualAmountPaid = 0;
      }

      const insuranceFee = values.includeInsurance ? (subtotal - totalDiscount) * 0.01 : 0;
      const rawTotal = subtotal - totalDiscount + insuranceFee;
      const overpaymentApplied = (values.applyOverpayment && selectedCustomer?.store_credit) ? Math.min(selectedCustomer.store_credit, rawTotal) : 0;

      let totalAmount = rawTotal - overpaymentApplied;
      const balanceDue = totalAmount - actualAmountPaid;

      const { installmentMonths, monthlyPayment, proofOfPayment, applyOverpayment, ...restOfValues } = values;

      // 0. Upload proof of payment if exists
      let proofUrl = null;
      if (actualAmountPaid > 0 && proofOfPayment && proofOfPayment.length > 0) {
        const file = proofOfPayment[0];
        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`;

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('proof_of_payment')
          .upload(fileName, file, { upsert: false });

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage.from('proof_of_payment').getPublicUrl(uploadData.path);
        proofUrl = publicUrl;
      }

      // 1. Create the order
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .insert({
          customer_id: values.customerId,
          status: values.orderStatus,
          total_amount: totalAmount,
          payment_method: values.paymentType,
          notes: values.shippingDetails,
          installment_months: values.paymentType === 'Installment' ? installmentMonths : null,
          monthly_payment: values.paymentType === 'Installment' ? monthlyPayment : null,
          order_date: values.orderDate.toISOString(),
          subtotal: subtotal,
          total_discount: totalDiscount,
          insurance_fee: insuranceFee,
          balance_due: balanceDue,
          sales_person_id: userProfile.id,
          sales_person_name: `${userProfile.firstName} ${userProfile.lastName}`.trim() || userProfile.email,
          platform_fees: values.platformFees,
          tracking_number: values.trackingNumber,
          amount_paid: actualAmountPaid
        })
        .select()
        .single();

      if (orderError) throw orderError;
      const newOrderId = orderData.id;

      // 1.5 Insert payment record for the initial payment
      if (actualAmountPaid > 0) {
        const { error: paymentError } = await supabase
          .from('payments')
          .insert({
            order_id: newOrderId,
            payment_date: values.orderDate.toISOString(),
            amount: actualAmountPaid,
            payment_method: values.paymentType === 'Full Payment' ? 'Full Payment' : 'Downpayment',
            proof_url: proofUrl,
            notes: 'Initial Order Payment'
          });
        if (paymentError) {
          console.error("Failed to log initial payment", paymentError);
          // We don't throw here to avoid failing the whole order creation just for the payment log, but it's an edge case
        }
      }

      // 2. Fetch products to get current stock and unit cost
      const productIds = values.orderItems.map(item => item.productId);
      const { data: products, error: productsError } = await supabase
        .from('products')
        .select('id, stock_level, initial_unit_cost, name')
        .in('id', productIds);

      if (productsError) throw productsError;
      const productDataMap = new Map(products.map(p => [p.id, p]));

      // 3. Update products, insert order items and inventory movements
      for (const item of values.orderItems) {
        const product = productDataMap.get(item.productId);
        if (!product) {
          throw new Error(`Product "${item.productName}" not found.`);
        }

        const newStockLevel = (product.stock_level || 0) - item.quantity;
        const unitCost = product.initial_unit_cost || 0;

        // Update product stock level
        const { error: updateError } = await supabase
          .from('products')
          .update({ stock_level: newStockLevel })
          .eq('id', item.productId);

        if (updateError) throw updateError;

        // Insert order item
        const { error: orderItemError } = await supabase
          .from('order_items')
          .insert({
            order_id: newOrderId,
            product_id: item.productId,
            product_name: item.productName,
            quantity: item.quantity,
            unit_price: item.sellingPriceAtSale,
            cost_price_at_sale: unitCost,
            selling_price_at_sale: item.sellingPriceAtSale,
            discount: item.discount || 0
          });

        if (orderItemError) throw orderItemError;

        // Create inventory movement
        const { error: movementError } = await supabase
          .from('inventory_movements')
          .insert({
            product_id: item.productId,
            quantity_change: -item.quantity,
            movement_type: 'sale',
            timestamp: new Date().toISOString(),
            reason: `Order ${newOrderId}`,
            unit_cost: unitCost
          });

        if (movementError) throw movementError;
      }

      // 4. Log payment if amountPaid > 0
      if ((values.amountPaid ?? 0) > 0) {
        const { error: paymentError } = await supabase
          .from('payments')
          .insert({
            order_id: newOrderId,
            amount: values.amountPaid,
            payment_date: values.orderDate.toISOString(),
            payment_method: values.paymentType,
            notes: 'Initial deposit / full payment'
          });
        if (paymentError) throw paymentError;
      }

      toast({
        title: "Order Created",
        description: "The new order has been successfully saved and inventory updated.",
      });

      if (overpaymentApplied > 0 && selectedCustomer) {
        const { error: creditError } = await supabase
          .from('customers')
          .update({ store_credit: selectedCustomer.store_credit - overpaymentApplied })
          .eq('id', selectedCustomer.id);
        if (creditError) throw creditError;
      }

      if (props.mode === 'create' && props.onOrderAdded) {
        props.onOrderAdded();
      }

      router.push(`/dashboard/orders/${newOrderId}?share=true`);

    } catch (e: any) {
      console.error("Order creation transaction failed: ", e);
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
    const initialOrderItems = props.orderItems;

    props.onOpenChange(false);
    toast({ title: "Updating Order...", description: "Your order edits are being saved." });

    try {
      const { subtotal, totalDiscount } = values.orderItems.reduce((acc, item) => {
        const itemPrice = item.sellingPriceAtSale || 0;
        const itemDiscount = item.discount || 0;
        const itemQty = item.quantity || 0;

        acc.subtotal += itemPrice * itemQty;
        acc.totalDiscount += itemDiscount * itemQty;
        return acc;
      }, { subtotal: 0, totalDiscount: 0 });

      let actualAmountPaid = order.amountPaid || 0;
      if ((values.amountPaid ?? 0) > actualAmountPaid) {
        actualAmountPaid = values.amountPaid ?? 0;
      }

      const insuranceFee = values.includeInsurance ? (subtotal - totalDiscount) * 0.01 : 0;
      let totalAmount = subtotal - totalDiscount + insuranceFee;

      let balanceDue = totalAmount - actualAmountPaid;
      let overpayment = 0;

      if (balanceDue < 0) {
        overpayment = Math.abs(balanceDue);
        balanceDue = 0;
      }

      const { installmentMonths, monthlyPayment, proofOfPayment, ...restOfValues } = values;

      // 1. REVERT OLD INVENTORY
      for (const oldItem of initialOrderItems) {
        const { data: product } = await supabase.from('products').select('stock_level').eq('id', oldItem.productId).single();
        if (product) {
          const newStock = (product.stock_level || 0) + oldItem.quantity;
          await supabase.from('products').update({ stock_level: newStock }).eq('id', oldItem.productId);

          await supabase.from('inventory_movements').insert({
            product_id: oldItem.productId,
            quantity_change: oldItem.quantity,
            movement_type: 'adjustment',
            timestamp: new Date().toISOString(),
            reason: `Order Edit Reversal for ${order.id}`,
            unit_cost: oldItem.costPriceAtSale
          });
        }
      }

      await supabase.from('order_items').delete().eq('order_id', order.id);

      // 2. APPLY NEW INVENTORY
      const productIds = values.orderItems.map(item => item.productId);
      const { data: products } = await supabase.from('products').select('id, stock_level, initial_unit_cost, name').in('id', productIds);
      const productDataMap = new Map((products || []).map(p => [p.id, p]));

      for (const item of values.orderItems) {
        const product = productDataMap.get(item.productId);
        if (!product) throw new Error(`Product "${item.productName}" not found.`);

        const newStockLevel = (product.stock_level || 0) - item.quantity;
        const unitCost = product.initial_unit_cost || 0;

        await supabase.from('products').update({ stock_level: newStockLevel }).eq('id', item.productId);

        await supabase.from('order_items').insert({
          order_id: order.id,
          product_id: item.productId,
          product_name: item.productName,
          quantity: item.quantity,
          unit_price: item.sellingPriceAtSale,
          cost_price_at_sale: unitCost,
          selling_price_at_sale: item.sellingPriceAtSale,
          discount: item.discount || 0
        });

        await supabase.from('inventory_movements').insert({
          product_id: item.productId,
          quantity_change: -item.quantity,
          movement_type: 'sale',
          timestamp: new Date().toISOString(),
          reason: `Order Edited ${order.id}`,
          unit_cost: unitCost
        });
      }

      // 3. UPDATE ORDER
      await supabase.from('orders').update({
        customer_id: values.customerId,
        status: values.orderStatus,
        total_amount: totalAmount,
        payment_method: values.paymentType,
        notes: values.shippingDetails,
        installment_months: values.paymentType === 'Installment' ? installmentMonths : null,
        monthly_payment: values.paymentType === 'Installment' ? monthlyPayment : null,
        subtotal: subtotal,
        total_discount: totalDiscount,
        insurance_fee: insuranceFee,
        balance_due: balanceDue,
        tracking_number: values.trackingNumber,
        amount_paid: actualAmountPaid
      }).eq('id', order.id);

      // 4. HANDLE OVERPAYMENT STORE CREDIT
      if (overpayment > 0) {
        const { data: customer } = await supabase.from('customers').select('store_credit').eq('id', values.customerId).single();
        const currentCredit = customer?.store_credit || 0;
        const newCredit = currentCredit + overpayment;

        await supabase.from('customers').update({ store_credit: newCredit }).eq('id', values.customerId);

        await supabase.from('accounting_expenses').insert({
          date: new Date().toISOString(),
          category: 'Customer Store Credit Liability',
          amount: overpayment,
          description: `Overpayment from edited order ${order.id} converted to store credit`,
          recorded_by: userProfile.id
        });

        toast({
          title: "Overpayment Converted",
          description: `₱${overpayment.toFixed(2)} has been added to the customer's store credit.`,
        });
      }

      toast({
        title: "Order Updated",
        description: "The order has been successfully edited and inventory re-adjusted.",
      });

      window.location.reload();

    } catch (e: any) {
      console.error("Order edit transaction failed: ", e);
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
                {/* ===================== LEFT COLUMN ===================== */}
                <div className="md:col-span-1 space-y-4">
                  {/* Customer selector */}
                  <FormField
                    control={form.control}
                    name="customerId"
                    render={({ field }) => (
                        <FormItem className="flex flex-col">
                            <FormLabel>Customer</FormLabel>
                            {selectedCustomer ? (
                                <div className="flex items-center justify-between rounded-md border border-input bg-background p-2 text-sm h-10">
                                    <p>{selectedCustomer.firstName} {selectedCustomer.lastName}</p>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                            setSelectedCustomer(null);
                                            form.setValue('customerId', '');
                                        }}
                                    >
                                        Change
                                    </Button>
                                </div>
                            ) : (
                                <Command className="rounded-lg border">
                                    <CommandInput
                                        placeholder="Search customers by first name..."
                                        value={customerSearch}
                                        onValueChange={setCustomerSearch}
                                    />
                                    {customerSearch.length > 0 && (
                                        <CommandList>
                                            {isSearchingCustomers && <CommandItem disabled>Searching...</CommandItem>}
                                            {customerResults.length > 0 && (
                                                <CommandGroup>
                                                {customerResults.map((c) => (
                                                    <CommandItem
                                                        key={c.id}
                                                        value={`${c.firstName} ${c.lastName}`}
                                                        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                                        onSelect={() => {
                                                            form.setValue("customerId", c.id)
                                                            setSelectedCustomer(c);
                                                            setCustomerSearch('');
                                                            setCustomerResults([]);
                                                        }}
                                                    >
                                                        {c.firstName} {c.lastName}
                                                    </CommandItem>
                                                ))}
                                                </CommandGroup>
                                            )}
                                            {customerSearch.length > 0 && !isSearchingCustomers && (
                                                <CommandGroup>
                                                    <CommandItem
                                                        value={customerSearch + " add_new"}
                                                        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                                        onSelect={() => setAddCustomerOpen(true)}
                                                        className="text-primary font-medium cursor-pointer"
                                                    >
                                                        <PlusCircle className="mr-2 h-4 w-4" /> Add new customer &quot;{customerSearch}&quot;
                                                    </CommandItem>
                                                </CommandGroup>
                                            )}
                                            {!isSearchingCustomers && customerResults.length === 0 && customerSearch.length > 1 && <CommandEmpty>No customers found.</CommandEmpty>}
                                        </CommandList>
                                    )}
                                </Command>
                            )}
                            <FormMessage />
                        </FormItem>
                    )}
                    />
                    {/* Order date */}
                    <FormField
                        control={form.control}
                        name="orderDate"
                        render={({ field }) => (
                            <FormItem className="flex flex-col">
                            <FormLabel>Order Date</FormLabel>
                            <Popover>
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
                    {/* Payment type */}
                    <FormField
                      control={form.control}
                      name="paymentType"
                      render={({ field }) => (
                        <FormItem className="space-y-3">
                          <FormLabel>Payment Type</FormLabel>
                          <FormControl>
                            <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex flex-col space-y-1">
                              <FormItem className="flex items-center space-x-3 space-y-0">
                                <FormControl><RadioGroupItem value="Full Payment" /></FormControl>
                                <FormLabel className="font-normal">Full Payment</FormLabel>
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
                    {/* Installment fields */}
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
                    {/* First-timer installment checkbox */}
                    {form.watch('paymentType') === 'Installment' && (
                        <div className="flex items-start space-x-3 rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-3">
                            <FormField
                                control={form.control}
                                name="isInstallmentFirstTimer"
                                render={({ field }) => (
                                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                                        <FormControl>
                                            <Checkbox
                                                checked={field.value}
                                                onCheckedChange={field.onChange}
                                            />
                                        </FormControl>
                                        <div className="space-y-1 leading-none">
                                            <FormLabel className="text-amber-800 dark:text-amber-300 font-semibold">First-time installment customer</FormLabel>
                                            <p className="text-xs text-amber-700 dark:text-amber-400">Check this to apply the higher installment prices to eligible products when adding them below. Products without an installment price set will use the regular cash price.</p>
                                        </div>
                                    </FormItem>
                                )}
                            />
                        </div>
                    )}
                    {/* Downpayment + COD checkbox */}
                    {form.watch("paymentType") !== "Full Payment" && form.watch("paymentType") !== "COD" && form.watch("paymentType") !== "Pending" && (
                        <div className="space-y-4">
                            <FormField
                                control={form.control}
                                name="amountPaid"
                                render={({ field }) => (
                                    <FormItem>
                                    <FormLabel>Downpayment (₱)</FormLabel>
                                    <FormControl><Input type="number" step="0.01" placeholder="0.00" disabled={isEditing} {...field} /></FormControl>
                                    {isEditing && (
                                        <p className="text-xs text-muted-foreground mt-1">Amount Paid is managed through the Payment History log after order creation.</p>
                                    )}
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
                                            <FormLabel>Downpayment is Pending (To Be Collected)</FormLabel>
                                            <p className="text-xs text-muted-foreground">Check this if you are waiting for the customer to send the payment or if it will be collected on delivery.</p>
                                        </div>
                                    </FormItem>
                                )}
                            />
                        </div>
                    )}
                    {/* Proof of payment */}
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
                </div>

                {/* ===================== RIGHT COLUMN ===================== */}
                <div className="md:col-span-2 space-y-4">
                    {/* Order items table */}
                    <div>
                        <FormLabel>Order Items</FormLabel>
                        <div className="space-y-2 mt-2 rounded-lg border">
                           <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 p-2 font-medium text-muted-foreground text-sm">
                                <span>Product</span>
                                <span className="text-right">Qty</span>
                                <span className="text-right">Price</span>
                                <span className="text-right">Discount</span>
                                <span className="sr-only">Remove</span>
                           </div>
                           {fields.map((field, index) => (
                             <div key={field.id} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 items-center px-2 pb-2">
                                <p className="flex-1 text-sm font-medium truncate pr-2">{field.productName}</p>
                                <FormField control={form.control} name={`orderItems.${index}.quantity`} render={({ field }) => (<FormItem><FormControl><Input type="number" className="h-8 w-20 text-right" {...field} /></FormControl></FormItem>)} />
                                <FormField control={form.control} name={`orderItems.${index}.sellingPriceAtSale`} render={({ field }) => (<FormItem><FormControl><Input type="number" step="0.01" className="h-8 w-24 text-right" {...field} /></FormControl></FormItem>)} />
                                <FormField control={form.control} name={`orderItems.${index}.discount`} render={({ field }) => (<FormItem><FormControl><Input type="number" step="0.01" className="h-8 w-24 text-right" placeholder="0.00" {...field} onChange={e => field.onChange(e.target.value === '' ? 0 : e.target.value)} value={field.value ?? 0} /></FormControl><FormMessage /></FormItem>)} />
                                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => remove(index)}><Trash2 className="h-4 w-4" /></Button>
                             </div>
                           ))}
                           {fields.length === 0 && <p className="text-sm text-center text-muted-foreground py-8">No items added to order.</p>}
                        </div>
                        <FormMessage>{form.formState.errors.orderItems?.message || form.formState.errors.orderItems?.root?.message}</FormMessage>
                    </div>

                    {/* Product search */}
                    <Command className="rounded-lg border">
                        <CommandInput
                            placeholder="Search to add products..."
                            value={productSearch}
                            onValueChange={setProductSearch}
                        />
                        {productSearch.length > 0 && (
                            <CommandList>
                                {isSearchingProducts && <CommandItem disabled>Searching...</CommandItem>}
                                {productResults.length > 0 && (
                                    <CommandGroup>
                                    {productResults.map((p) => (
                                    <CommandItem
                                        value={p.name}
                                        key={p.id}
                                        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                        onSelect={async () => {
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
                                                toast({
                                                    variant: "default",
                                                    title: "Product already in order",
                                                    description: `${p.name} is already in this order. You can adjust the quantity above.`,
                                                });
                                                setProductSearch('');
                                                setProductResults([]);
                                                return;
                                            }

                                            const productToAdd = productResults.find(prod => prod.id === p.id);
                                            if (productToAdd) {
                                                const costPriceAtSale = productToAdd.stockBatches?.length > 0
                                                    ? productToAdd.stockBatches[0].unitCost
                                                    : 0;

                                                const isInstallmentFirstTimer = form.getValues('isInstallmentFirstTimer');
                                                const paymentType = form.getValues('paymentType');
                                                const useInstallmentPrice = 
                                                    paymentType === 'Installment' &&
                                                    isInstallmentFirstTimer &&
                                                    productToAdd.installment_price &&
                                                    productToAdd.installment_price > 0;

                                                const bundleTotal = fields.reduce((sum, item) => sum + (item.sellingPriceAtSale * item.quantity), 0) + productToAdd.sellingPrice;
                                                if (paymentType === 'Installment' && bundleTotal < 700 && (!productToAdd.installment_price)) {
                                                    toast({ variant: 'default', title: 'Not eligible for installment', description: `This product is under ₱700 and has no installment price set.` });
                                                }

                                                append({
                                                    productId: productToAdd.id,
                                                    productName: productToAdd.name,
                                                    quantity: 1,
                                                    costPriceAtSale: costPriceAtSale,
                                                    sellingPriceAtSale: useInstallmentPrice ? productToAdd.installment_price : productToAdd.sellingPrice,
                                                    discount: 0
                                                });
                                                // Cache prices for re-pricing when first-timer checkbox changes
                                                setProductPriceCache(prev => ({
                                                    ...prev,
                                                    [productToAdd.id]: {
                                                        cashPrice: productToAdd.sellingPrice,
                                                        installmentPrice: productToAdd.installment_price ?? null,
                                                    }
                                                }));
                                            }
                                            setProductSearch('');
                                            setProductResults([]);
                                        }}
                                    >
                                    <div className="flex justify-between w-full">
                                        <span>{p.name}</span>
                                        <span className="text-xs text-muted-foreground">Stock: {p.quantityOnHand}</span>
                                    </div>
                                    </CommandItem>
                                    ))}
                                    </CommandGroup>
                                )}
                                {productSearch.length > 0 && !isSearchingProducts && (
                                    <CommandGroup>
                                        <CommandItem
                                            value={productSearch + " add_new"}
                                            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                            onSelect={() => setAddProductOpen(true)}
                                            className="text-primary font-medium cursor-pointer"
                                        >
                                            <PlusCircle className="mr-2 h-4 w-4" /> Add new product &quot;{productSearch}&quot;
                                        </CommandItem>
                                    </CommandGroup>
                                )}
                                {!isSearchingProducts && productResults.length === 0 && productSearch.length > 1 && <CommandEmpty>No products found.</CommandEmpty>}
                            </CommandList>
                        )}
                    </Command>

                    {/* Totals summary */}
                    <div className="pt-4 space-y-2 text-right">
                        <div className="flex justify-between"><p className="text-muted-foreground">Subtotal</p><p>₱{subtotal.toFixed(2)}</p></div>
                        <div className="flex justify-between text-destructive"><p className="text-destructive">Discount</p><p>- ₱{totalDiscount.toFixed(2)}</p></div>
                        {includeInsurance && <div className="flex justify-between text-muted-foreground"><p>Insurance Fee (1%)</p><p>+ ₱{insuranceFee.toFixed(2)}</p></div>}
                        {/* Overpayment line — create mode only */}
                        {!isEditing && overpaymentApplied > 0 && <div className="flex justify-between text-green-600"><p>Overpayment Applied</p><p>- ₱{overpaymentApplied.toFixed(2)}</p></div>}
                        <div className="flex justify-between font-bold text-lg"><p>Total</p><p>₱{totalAmount.toFixed(2)}</p></div>
                    </div>

                    {/* Apply overpayment — create mode only, when customer has store credit */}
                    {!isEditing && (selectedCustomer?.store_credit ?? 0) > 0 && (
                        <FormField
                            control={form.control}
                            name="applyOverpayment"
                            render={({ field }) => (
                                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4 border-green-500/30 bg-green-500/5">
                                    <FormControl>
                                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                                    </FormControl>
                                    <div className="space-y-1 leading-none">
                                        <FormLabel className="text-green-700">Apply Overpayment Balance (₱{(selectedCustomer?.store_credit ?? 0).toFixed(2)})</FormLabel>
                                        <p className="text-xs text-muted-foreground">Use the customer&apos;s existing balance to reduce the total.</p>
                                    </div>
                                </FormItem>
                            )}
                        />
                    )}

                    {/* Insurance toggle — available to all users */}
                    <FormField
                        control={form.control}
                        name="includeInsurance"
                        render={({ field }) => (
                            <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                                <FormControl>
                                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                                </FormControl>
                                <div className="space-y-1 leading-none">
                                    <FormLabel>Include 1% Shipping Insurance</FormLabel>
                                    <p className="text-xs text-muted-foreground">You can optionally remove the insurance fee for this order.</p>
                                </div>
                            </FormItem>
                        )}
                    />

                    {/* Tracking Number */}
                    <FormField
                        control={form.control}
                        name="trackingNumber"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Tracking Number</FormLabel>
                                <FormControl>
                                    <Input
                                        placeholder="Enter tracking number if shipped"
                                        {...field}
                                        value={field.value ?? ''}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    {/* Notes */}
                    <FormField
                        control={form.control}
                        name="shippingDetails"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Notes / Remarks</FormLabel>
                                <FormControl>
                                    <Textarea
                                        placeholder="Add any notes about this order, e.g. delivery instructions, special requests..."
                                        className="resize-none"
                                        rows={3}
                                        {...field}
                                        value={field.value ?? ''}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>
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
            setCustomerResults([]);
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
      <Dialog open={!!variantSelectionProduct} onOpenChange={(open) => !open && setVariantSelectionProduct(null)}>
        <DialogContent className="sm:max-w-md">
            <DialogHeader>
                <DialogTitle>Select Variant for {variantSelectionProduct?.name}</DialogTitle>
                <DialogDescription>Choose a variant to add to the order.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2 py-4">
                {variantSelectionOptions.map((v) => (
                    <Button 
                        key={v.id} 
                        variant="outline" 
                        className="justify-between h-auto py-3"
                        onClick={() => {
                            const isAlreadyAdded = fields.some(item => item.productId === v.id);
                            if (isAlreadyAdded) {
                                toast({
                                    variant: "default",
                                    title: "Variant already in order",
                                    description: `${v.variant_name} is already in this order. You can adjust the quantity above.`,
                                });
                            } else {
                                const costPriceAtSale = v.stock_batches?.length > 0
                                    ? v.stock_batches[0].unitCost
                                    : (v.initial_unit_cost || 0);

                                append({
                                    productId: v.id,
                                    productName: v.name,
                                    quantity: 1,
                                    costPriceAtSale: costPriceAtSale,
                                    sellingPriceAtSale: v.selling_price,
                                    discount: 0
                                });
                            }
                            setVariantSelectionProduct(null);
                            setProductSearch('');
                            setProductResults([]);
                        }}
                    >
                        <span>{v.variant_name || v.name}</span>
                        <div className="flex gap-4">
                            <span className="text-muted-foreground text-sm font-normal">Stock: {v.stock_level}</span>
                            <span>₱{(v.selling_price || 0).toFixed(2)}</span>
                        </div>
                    </Button>
                ))}
            </div>
            <DialogFooter>
                <Button variant="ghost" onClick={() => setVariantSelectionProduct(null)}>Cancel</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
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
