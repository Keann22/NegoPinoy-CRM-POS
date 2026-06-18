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
        let query = supabase.from('customers').select('*');
        const searchWords = customerSearch.split(' ').filter(w => w.trim() !== '');
        searchWords.forEach(w => {
            query = query.ilike('full_name', `%${w}%`);
        });
        const { data, error } = await query.limit(10);

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
        let query = supabase.from('products').select('id, name, stock_level, selling_price, installment_price, parent_id, supplier_pricing');
        const searchWords = productSearch.split(' ').filter(w => w.trim() !== '');
        searchWords.forEach(w => {
            query = query.or(`name.ilike.%${w}%,variant_name.ilike.%${w}%`);
        });
        const { data, error } = await query.gt('selling_price', 0).limit(15);

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
        const { data: paymentData, error: paymentError } = await supabase
          .from('payments')
          .insert({
            order_id: newOrderId,
            payment_date: values.orderDate.toISOString(),
            amount: actualAmountPaid,
            payment_method: values.paymentType === 'Full Payment' ? 'Full Payment' : 'Downpayment',
            proof_url: proofUrl,
            notes: 'Initial Order Payment'
          })
          .select()
          .single();

        if (paymentError) {
          throw paymentError;
        }

        // Trigger Google Cloud Vision OCR in the background
        if (proofUrl && paymentData?.id) {
            fetch('/api/payments/extract-ocr', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ proofUrl, paymentId: paymentData.id })
            }).catch(err => console.error("OCR trigger failed:", err));
        }
      }

      // 2. Fetch products to get current stock, unit cost, and assembly recipes
      const productIds = values.orderItems.map(item => item.productId);
      const { data: products, error: productsError } = await supabase
        .from('products')
        .select('id, stock_level, initial_unit_cost, name, assembly_recipe')
        .in('id', productIds);

      if (productsError) throw productsError;
      const productDataMap = new Map(products.map(p => [p.id, p]));

      // 2.5 Fetch components if any product is a bundle
      const componentIds = new Set<string>();
      products.forEach(p => {
        if (p.assembly_recipe && Array.isArray(p.assembly_recipe)) {
          p.assembly_recipe.forEach((comp: any) => componentIds.add(comp.productId));
        }
      });
      const componentDataMap = new Map();
      if (componentIds.size > 0) {
        const { data: components, error: compError } = await supabase
          .from('products')
          .select('id, stock_level, initial_unit_cost, name')
          .in('id', Array.from(componentIds));
        if (compError) throw compError;
        components.forEach(c => componentDataMap.set(c.id, c));
      }

      // 3. Update products, insert order items and inventory movements
      for (const item of values.orderItems) {
        const product = productDataMap.get(item.productId);
        if (!product) {
          throw new Error(`Product "${item.productName}" not found.`);
        }

        const isOldOrder = values.orderDate < new Date('2026-06-01T00:00:00+08:00');
        let unitCost = product.initial_unit_cost || 0;

        if (product.assembly_recipe && Array.isArray(product.assembly_recipe) && product.assembly_recipe.length > 0) {
          // Dynamic Bundling logic
          unitCost = 0;
          for (const comp of product.assembly_recipe) {
             const compData = componentDataMap.get(comp.productId);
             if (!compData) throw new Error(`Component "${comp.productName}" not found for bundle "${product.name}".`);
             
             // Calculate cost sum
             unitCost += (compData.initial_unit_cost || 0) * comp.quantity;

             if (!isOldOrder) {
               // Update component stock level
               const { error: updateError } = await supabase.rpc('increment_stock', {
                 p_product_id: comp.productId,
                 qty: -(item.quantity * comp.quantity)
               });
               if (updateError) throw updateError;
               
               // Update componentMap so multiple bundles using the same component deduct properly in memory
               // (no longer strictly needed for DB, but good for local consistency if used later)
               compData.stock_level = (compData.stock_level || 0) - (item.quantity * comp.quantity);

               // Insert movement for component
               const { error: movementError } = await supabase
                .from('inventory_movements')
                .insert({
                  product_id: comp.productId,
                  quantity_change: -(item.quantity * comp.quantity),
                  movement_type: 'sale',
                  timestamp: new Date().toISOString(),
                  reason: `Order ${newOrderId} (Bundle: ${product.name})`,
                  unit_cost: compData.initial_unit_cost || 0
                });
               if (movementError) throw movementError;
             }
          }
        } else {
          // Standard logic
          if (!isOldOrder) {
            // Update product stock level using atomic RPC
            const { error: updateError } = await supabase.rpc('increment_stock', {
              p_product_id: item.productId,
              qty: -item.quantity
            });

            if (updateError) throw updateError;
            product.stock_level = (product.stock_level || 0) - item.quantity;

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
        }

        // Insert order item (represents the Bundle, using the sum cost if it's a bundle)
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
      }

      // (Step 4 payment log removed because it is a duplicate of Step 1.5)

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
      const wasOldOrder = new Date(order.orderDate) < new Date('2026-06-01T00:00:00+08:00');
      if (!wasOldOrder) {
        const oldProductIds = initialOrderItems.map(item => item.productId);
        const { data: oldProducts } = await supabase.from('products').select('id, stock_level, assembly_recipe').in('id', oldProductIds);
        const oldProductMap = new Map((oldProducts || []).map(p => [p.id, p]));

        for (const oldItem of initialOrderItems) {
          const product = oldProductMap.get(oldItem.productId);
          if (product) {
            if (product.assembly_recipe && Array.isArray(product.assembly_recipe) && product.assembly_recipe.length > 0) {
              for (const comp of product.assembly_recipe) {
                const { data: compData } = await supabase.from('products').select('stock_level, initial_unit_cost').eq('id', comp.productId).single();
                if (compData) {
                  const revertQty = oldItem.quantity * comp.quantity;
                  await supabase.rpc('increment_stock', { p_product_id: comp.productId, qty: revertQty });
                  await supabase.from('inventory_movements').insert({
                    product_id: comp.productId,
                    quantity_change: revertQty,
                    movement_type: 'adjustment',
                    timestamp: new Date().toISOString(),
                    reason: `Order Edit Reversal for ${order.id} (Bundle: ${oldItem.productName})`,
                    unit_cost: compData.initial_unit_cost || 0
                  });
                }
              }
            } else {
              await supabase.rpc('increment_stock', { p_product_id: oldItem.productId, qty: oldItem.quantity });

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
        }
      }

      await supabase.from('order_items').delete().eq('order_id', order.id);

      // 2. APPLY NEW INVENTORY
      const productIds = values.orderItems.map(item => item.productId);
      const { data: products } = await supabase.from('products').select('id, stock_level, initial_unit_cost, name, assembly_recipe').in('id', productIds);
      const productDataMap = new Map((products || []).map(p => [p.id, p]));

      // 2.5 Fetch components
      const componentIds = new Set<string>();
      (products || []).forEach(p => {
        if (p.assembly_recipe && Array.isArray(p.assembly_recipe)) {
          p.assembly_recipe.forEach((comp: any) => componentIds.add(comp.productId));
        }
      });
      const componentDataMap = new Map();
      if (componentIds.size > 0) {
        const { data: components } = await supabase.from('products').select('id, stock_level, initial_unit_cost, name').in('id', Array.from(componentIds));
        (components || []).forEach(c => componentDataMap.set(c.id, c));
      }

      for (const item of values.orderItems) {
        const product = productDataMap.get(item.productId);
        if (!product) throw new Error(`Product "${item.productName}" not found.`);

        const isOldOrder = values.orderDate < new Date('2026-06-01T00:00:00+08:00');
        let unitCost = product.initial_unit_cost || 0;

        if (product.assembly_recipe && Array.isArray(product.assembly_recipe) && product.assembly_recipe.length > 0) {
           unitCost = 0;
           for (const comp of product.assembly_recipe) {
             const compData = componentDataMap.get(comp.productId);
             if (!compData) throw new Error(`Component "${comp.productName}" not found for bundle "${product.name}".`);
             unitCost += (compData.initial_unit_cost || 0) * comp.quantity;

             if (!isOldOrder) {
               await supabase.rpc('increment_stock', { p_product_id: comp.productId, qty: -(item.quantity * comp.quantity) });
               compData.stock_level = (compData.stock_level || 0) - (item.quantity * comp.quantity);

               await supabase.from('inventory_movements').insert({
                 product_id: comp.productId,
                 quantity_change: -(item.quantity * comp.quantity),
                 movement_type: 'sale',
                 timestamp: new Date().toISOString(),
                 reason: `Order Edited ${order.id} (Bundle: ${product.name})`,
                 unit_cost: compData.initial_unit_cost || 0
               });
             }
           }
        } else {
           if (!isOldOrder) {
             await supabase.rpc('increment_stock', { p_product_id: item.productId, qty: -item.quantity });
             product.stock_level = (product.stock_level || 0) - item.quantity;
             await supabase.from('inventory_movements').insert({
               product_id: item.productId,
               quantity_change: -item.quantity,
               movement_type: 'sale',
               timestamp: new Date().toISOString(),
               reason: `Order Edited ${order.id}`,
               unit_cost: unitCost
             });
           }
        }

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
                  setCustomerResults([]);
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
                    setProductResults([]);
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
                  setProductResults([]);
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
                    toast({ variant: "default", title: "Variant already in order", description: `${v.variant_name} is already in this order. You can adjust the quantity above.` });
                  } else {
                    const costPriceAtSale = v.stock_batches?.length > 0 ? v.stock_batches[0].unitCost : (v.initial_unit_cost || 0);
                    append({ productId: v.id, productName: v.name, quantity: 1, costPriceAtSale, sellingPriceAtSale: v.selling_price, discount: 0 });
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
