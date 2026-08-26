'use client';

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { AddCustomerDialog } from "./add-customer-dialog";
import { AddProductDialog } from "./product-dialog";
import { OrderLeftPanel } from "./orders/OrderLeftPanel";
import { OrderItemsPanel } from "./orders/OrderItemsPanel";
import { VariantSelectionDialog } from "./orders/VariantSelectionDialog";
import { useOrderDialog } from "@/hooks/useOrderDialog";
import { useSupabase } from "@/lib/supabase/hooks";
import { useToast } from "@/hooks/use-toast";

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

export function OrderDialog(props: OrderDialogProps) {
  const supabase = useSupabase();
  const { toast } = useToast();
  
  const {
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
    overpaymentApplied,
    totalAmount,
    addCustomerOpen,
    setAddCustomerOpen,
    addProductOpen,
    setAddProductOpen,
    onSubmit
  } = useOrderDialog(props);

  return (
    <>
      <Dialog open={dialogOpen} onOpenChange={handleOpenChange}>
      {!isEditing && (
        <DialogTrigger asChild>
          <Button>New Order</Button>
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
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
                    .select('id, name, variant_name, stock_level, selling_price, sale_price, is_on_sale, initial_unit_cost, stock_batches(*)')
                    .eq('parent_id', p.id);

                  if (variants && variants.length > 0) {
                    setVariantSelectionProduct(p as any);
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
          setSelectedCustomer({ id: customer.id, firstName: customer.firstName, lastName: customer.lastName } as any);
          setCustomerSearch('');
        }}
      />
      <AddProductDialog
        open={addProductOpen}
        onOpenChange={setAddProductOpen}
        initialValues={{ name: productSearch }}
        onProductAdded={(p: { id: string; name: string }) => {
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

export function AddOrderDialog({ onOrderAdded }: { onOrderAdded?: () => void }) {
  return <OrderDialog mode="create" onOrderAdded={onOrderAdded} />;
}

export function EditOrderDialog({ order, orderItems, open, onOpenChange }: { order: any; orderItems: any[]; open: boolean; onOpenChange: (open: boolean) => void }) {
  return <OrderDialog mode="edit" order={order} orderItems={orderItems} open={open} onOpenChange={onOpenChange} />;
}
