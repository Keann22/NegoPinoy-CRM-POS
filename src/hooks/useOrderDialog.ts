import { useState, useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useSupabase, useUser } from "@/lib/supabase/hooks";
import { useToast } from "@/hooks/use-toast";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useCustomerSearch } from "@/hooks/useCustomerSearch";
import { useProductSearch } from "@/hooks/useProductSearch";
import { orderSchema, type OrderFormValues, type Customer, type Product } from "@/lib/schemas/order";
import { createOrder, editOrder } from "@/lib/services/order-service";

type UseOrderDialogProps = {
    mode: 'create' | 'edit';
    order?: any;
    orderItems?: any[];
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    onOrderAdded?: () => void;
};

export function useOrderDialog(props: UseOrderDialogProps) {
    const isEditing = props.mode === 'edit';

    const supabase = useSupabase();
    const { user } = useUser();
    const { toast } = useToast();
    const { userProfile } = useUserProfile();
    const router = useRouter();

    const [addCustomerOpen, setAddCustomerOpen] = useState(false);
    const [addProductOpen, setAddProductOpen] = useState(false);

    const [internalOpen, setInternalOpen] = useState(false);
    const dialogOpen = isEditing ? (props.open ?? false) : internalOpen;

    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

    const [customerSearch, setCustomerSearch] = useState('');
    const [productSearch, setProductSearch] = useState('');
    const [productPriceCache, setProductPriceCache] = useState<Record<string, { cashPrice: number; installmentPrice: number | null }>>({});

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

    const handleOpenChange = (isOpen: boolean) => {
        if (!isOpen) {
            if (!isEditing) {
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

        if (isEditing && props.onOpenChange) {
            props.onOpenChange(isOpen);
        } else {
            setInternalOpen(isOpen);
        }
    };

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
    }, [isEditing && props.open, props.order, props.orderItems, form, supabase]);

    const [variantSelectionProduct, setVariantSelectionProduct] = useState<Product | null>(null);
    const [variantSelectionOptions, setVariantSelectionOptions] = useState<any[]>([]);

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
    }, [isInstallmentFirstTimer, watchedPaymentType, form, productPriceCache]);

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "orderItems"
    });

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
    const overpaymentApplied = (!isEditing && applyOverpayment && selectedCustomer?.store_credit)
        ? Math.min(selectedCustomer.store_credit, rawTotal)
        : 0;
    const totalAmount = rawTotal - overpaymentApplied;

    useEffect(() => {
        const pType = form.watch('paymentType');
        if (pType === 'Full Payment') {
            form.setValue('amountPaid', totalAmount);
        } else if (pType === 'COD' || pType === 'Pending') {
            form.setValue('amountPaid', 0);
        }
    }, [totalAmount, form, form.watch('paymentType')]);

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

    async function handleEditSubmit(values: OrderFormValues) {
        if (!userProfile || !supabase || !isEditing) {
            toast({ variant: "destructive", title: "Authentication or Database error", description: "Could not update order." });
            return;
        }

        const order = props.order;
        if (props.onOpenChange) props.onOpenChange(false);
        toast({ title: "Updating Order...", description: "Your order edits are being saved." });

        try {
            await editOrder(supabase, values, {
                userProfileId: userProfile.id,
                userProfileName: `${userProfile.firstName} ${userProfile.lastName}`.trim() || userProfile.email,
                orderId: order.id,
                originalOrderDate: order.orderDate,
                originalAmountPaid: order.amountPaid || 0,
                originalOrderItems: props.orderItems || [],
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

    async function onSubmit(values: OrderFormValues) {
        if (isEditing) {
            await handleEditSubmit(values);
        } else {
            await handleCreateSubmit(values);
        }
    }

    return {
        isEditing,
        form,
        dialogOpen,
        handleOpenChange,
        selectedCustomer,
        setSelectedCustomer,
        customerSearch,
        setCustomerSearch,
        productSearch,
        setProductSearch,
        productPriceCache,
        setProductPriceCache,
        customerResults,
        isSearchingCustomers,
        productResults,
        isSearchingProducts,
        variantSelectionProduct,
        setVariantSelectionProduct,
        variantSelectionOptions,
        setVariantSelectionOptions,
        fields,
        append,
        remove,
        subtotal,
        totalDiscount,
        insuranceFee,
        rawTotal,
        overpaymentApplied,
        totalAmount,
        addCustomerOpen,
        setAddCustomerOpen,
        addProductOpen,
        setAddProductOpen,
        onSubmit
    };
}
