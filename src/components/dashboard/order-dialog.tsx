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
import { defaultPriceType, resolvePrice, selectWithPriceColumns, type PriceList } from "@/lib/pricing";

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
    productPriceCache,
    canManagePrices,
    currentUserName,
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
    canAddProduct,
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
                setValue={form.setValue}
                priceLists={productPriceCache}
                canManagePrices={canManagePrices}
                currentUserName={currentUserName}
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
                  const { data: level1 } = await selectWithPriceColumns((priceColumns) => supabase
                    .from('products')
                    .select(`id, name, variant_name, stock_level, ${priceColumns}, initial_unit_cost, stock_batches(*)`)
                    .eq('parent_id', p.id)
                    .not('name', 'ilike', '[DELETED]%'));

                  if (level1 && level1.length > 0) {
                    const level1Ids = level1.map((v: any) => v.id);
                    const { data: level2 } = await selectWithPriceColumns((priceColumns) => supabase
                      .from('products')
                      .select(`id, name, variant_name, stock_level, ${priceColumns}, initial_unit_cost, stock_batches(*)`)
                      .in('parent_id', level1Ids)
                      .not('name', 'ilike', '[DELETED]%'));

                    let leafVariants = level1;
                    if (level2 && level2.length > 0) {
                      const nonLeafLevel1Ids = new Set(level2.map((l2: any) => l2.parent_id));
                      leafVariants = [...level1.filter((l1: any) => !nonLeafLevel1Ids.has(l1.id)), ...level2];
                    }

                    setVariantSelectionProduct(p as any);
                    setVariantSelectionOptions(leafVariants);
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
                    const priceList: PriceList = productToAdd.priceList;
                    const useInstallmentPrice = paymentType === 'Installment' && isInstallmentFirstTimer && priceList.installment != null;

                    if (paymentType === 'Installment' && !productToAdd.installment_price) {
                      toast({ variant: 'default', title: 'Not eligible for installment', description: `This product has no installment price set.` });
                    }

                    const priceType = useInstallmentPrice ? 'installment' : defaultPriceType(priceList);
                    append({
                      productId: productToAdd.id,
                      productName: productToAdd.name,
                      quantity: 1,
                      costPriceAtSale: costPriceAtSale,
                      sellingPriceAtSale: resolvePrice(priceList, priceType),
                      discount: 0,
                      priceType,
                    });
                  }
                  setProductSearch('');
                }}
                onAddProductClick={() => setAddProductOpen(true)}
                canAddProduct={canAddProduct}
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
        onSelectExisting={(p: { id: string; name: string }) => {
          setAddProductOpen(false);
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
