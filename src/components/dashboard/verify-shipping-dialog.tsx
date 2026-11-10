'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSupabase } from '@/lib/supabase/hooks';
import { useToast } from '@/hooks/use-toast';
import { Order } from '@/app/dashboard/orders/page';
import { useAddressData } from '@/lib/address-data';
import { Checkbox } from '@/components/ui/checkbox';
import { VerifyShippingBoxes } from './verify-shipping-boxes';
import { collectsItemCod, suggestedItemCod } from '@/lib/services/shipping/courier-cod';

interface VerifyShippingDialogProps {
  order: Order | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function VerifyShippingDialog({ order, open, onOpenChange, onSuccess }: VerifyShippingDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const supabase = useSupabase();
  const { toast } = useToast();
  const { addressData, isLoaded: isAddressLoaded } = useAddressData(open);

  const [shippingName, setShippingName] = useState('');
  const [shippingPhone, setShippingPhone] = useState('');
  
  const [region, setRegion] = useState('');
  const [province, setProvince] = useState('');
  const [city, setCity] = useState('');
  const [barangay, setBarangay] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [streetAddress, setStreetAddress] = useState('');
  
  const [paymentType, setPaymentType] = useState('sf only');
  const [shippingAmount, setShippingAmount] = useState('0');
  const [balanceDue, setBalanceDue] = useState('0');
  const [boxCodAmounts, setBoxCodAmounts] = useState<Record<string, string>>({});
  const [saveAsSecondary, setSaveAsSecondary] = useState(false);
  const [deliveryInstructions, setDeliveryInstructions] = useState('Kuya wag nyo po sabihin na galing Shopee! Sabihin nyo po galing ng Negosyanteng Pinoy. Thankyou po! :)');
  const isMultiBox = !!(order?.boxes_config && Array.isArray(order.boxes_config) && order.boxes_config.length > 1);


  const regionOptions = Object.entries(addressData).map(([code, data]) => ({ value: code, label: data.region_name }));
  const provinceOptions = region && addressData[region]?.province_list ? Object.entries(addressData[region].province_list).map(([name]) => ({ value: name, label: name })) : [];
  const cityOptions = region && province && addressData[region]?.province_list?.[province]?.municipality_list ? Object.entries(addressData[region].province_list[province].municipality_list).map(([name]) => ({ value: name, label: name })) : [];
  const barangayOptions = region && province && city && addressData[region]?.province_list?.[province]?.municipality_list?.[city]?.barangay_list ? addressData[region].province_list[province].municipality_list[city].barangay_list.map((name: string) => ({ value: name, label: name })) : [];

  useEffect(() => {
    // Wait for the address list so the customer's saved address can be matched.
    if (open && order && supabase && isAddressLoaded) {
      // Fetch customer details
      supabase.from('customers').select('*').eq('id', order.customerId).single().then(({ data }: { data: any }) => {
        if (data) {
          setShippingName(data.full_name || '');
          setShippingPhone(data.mobile_number || '');
          
          const rawRegion = data.region || "";
          const rawProvince = data.province || "";
          const rawCity = data.city || "";
          const rawBarangay = data.barangay || "";
          
          let regionCode = "";
          if (rawRegion) {
              if (addressData[rawRegion]) regionCode = rawRegion;
              else {
                  const entry = Object.entries(addressData).find(([_, rd]) => rd.region_name === rawRegion);
                  if (entry) regionCode = entry[0];
              }
          }
          
          let validProvince = "";
          if (regionCode && rawProvince && addressData[regionCode]?.province_list?.[rawProvince]) validProvince = rawProvince;
          
          let validCity = "";
          if (regionCode && validProvince && rawCity && addressData[regionCode]?.province_list?.[validProvince]?.municipality_list?.[rawCity]) validCity = rawCity;
          
          let validBarangay = "";
          if (regionCode && validProvince && validCity && rawBarangay) {
              const barangays = addressData[regionCode].province_list[validProvince].municipality_list[validCity].barangay_list;
              if (barangays && barangays.includes(rawBarangay)) validBarangay = rawBarangay;
          }

          setRegion(regionCode);
          setProvince(validProvince);
          setCity(validCity);
          setBarangay(validBarangay);
          setPostalCode(data.postal_code || '');
          setStreetAddress(data.street_address || '');
        }
      });
      // Replacement orders from Customer Returns come with the owner's choice already set.
      const defaultType = order.shipping_payment_type || 'sf only';
      setPaymentType(defaultType);
      setShippingAmount('0');

      const expectedCod = suggestedItemCod(order);
      const codValue = collectsItemCod(defaultType) ? expectedCod : 0;
      setBalanceDue(codValue.toString());

      if (order.boxes_config && Array.isArray(order.boxes_config) && order.boxes_config.length > 1) {
          const amounts: Record<string, string> = {};
          order.boxes_config.forEach((b: any, index: number) => {
              amounts[b.id] = collectsItemCod(defaultType) ? (b.cod_amount?.toString() || (index === 0 ? expectedCod.toString() : '0')) : '0';
          });
          setBoxCodAmounts(amounts);
      } else {
          setBoxCodAmounts({});
      }
      setSaveAsSecondary(false);
      setDeliveryInstructions('Kuya wag nyo po sabihin na galing Shopee! Sabihin nyo po galing ng Negosyanteng Pinoy. Thankyou po! :)');
    }
  }, [open, order, supabase, isAddressLoaded, addressData]);

  const handlePaymentTypeChange = (newType: string) => {
    setPaymentType(newType);
    if (!order) return;
    // Only re-fill when switching between "no item COD" and "collect item COD",
    // so an amount staff typed isn't lost when they change who pays the SF.
    if (collectsItemCod(newType) === collectsItemCod(paymentType)) return;
    if (!collectsItemCod(newType)) {
      setBalanceDue('0');
      if (order.boxes_config && Array.isArray(order.boxes_config)) {
        const amounts: Record<string, string> = {};
        order.boxes_config.forEach((b: any) => { amounts[b.id] = '0'; });
        setBoxCodAmounts(amounts);
      }
    } else {
      const expected = suggestedItemCod(order);
      setBalanceDue(expected.toString());
      if (order.boxes_config && Array.isArray(order.boxes_config) && order.boxes_config.length > 1) {
        const amounts: Record<string, string> = {};
        order.boxes_config.forEach((b: any, index: number) => {
          amounts[b.id] = index === 0 ? expected.toString() : '0';
        });
        setBoxCodAmounts(amounts);
      }
    }
  };

  const handleSubmit = async () => {
    if (!order || !supabase) return;
    
    if (!shippingName || !region || !province || !city || !barangay || !streetAddress) {
      toast({ variant: 'destructive', title: 'Incomplete Details', description: 'Please fill in all required shipping fields.' });
      return;
    }

    setIsSubmitting(true);
    try {
      const regionName = addressData[region]?.region_name || region;
      const addressLine = `${streetAddress}, ${barangay}, ${city}, ${province}, ${regionName} ${postalCode}`;
      
      const shippingAddressJson = {
        region: regionName,
        province,
        city,
        barangay,
        postal_code: postalCode,
        street_address: streetAddress,
        address_line: addressLine
      };

      const isCod = collectsItemCod(paymentType);
      const boxes = Array.isArray(order.boxes_config) && order.boxes_config.length > 0
        ? order.boxes_config
        : [{ id: 'box-1', name: 'Box 1', items: [], width: 10, height: 10, length: 10, weight: 1 }];

      const newBoxesConfig = boxes.map((b: any) => ({
        ...b,
        cod_amount: isCod
          ? (isMultiBox ? (parseFloat(boxCodAmounts[b.id] || '0') || 0) : (parseFloat(balanceDue) || 0))
          : 0,
      }));

      // NOTE: Do not overwrite balance_due! balance_due tracks what the customer owes the store.
      const updateData: any = {
          status: 'For Shipping',
          shipping_verified: true,
          not_for_shipping_reason: null,
          shipping_name: shippingName,
          shipping_phone: shippingPhone,
          shipping_payment_type: paymentType,
          shipping_amount: parseFloat(shippingAmount) || 0,
          boxes_config: newBoxesConfig,
          shipping_address: shippingAddressJson,
          delivery_instructions: deliveryInstructions
      };

      // 1. Update Order
      const { error: orderError } = await supabase
        .from('orders')
        .update(updateData)
        .eq('id', order.id);

      if (orderError) throw orderError;

      // 2. Optional: Save to Customer
      if (saveAsSecondary) {
        await supabase
          .from('customers')
          .update({
            secondary_name: shippingName,
            secondary_phone: shippingPhone,
            secondary_address: shippingAddressJson
          })
          .eq('id', order.customerId);
      }

      toast({
        title: 'Verified Successfully',
        description: 'Order moved to For Shipping.',
      });
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error updating order:', error);
      toast({ variant: 'destructive', title: 'Update failed', description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Verify Shipping Details</DialogTitle>
          <DialogDescription>
            Confirm or edit the shipping details for this order. It will be moved to the &quot;For Shipping&quot; tab.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4 px-1 overflow-y-auto flex-1 pr-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Recipient Name</Label>
              <Input value={shippingName} onChange={e => setShippingName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Recipient Phone</Label>
              <Input value={shippingPhone} onChange={e => setShippingPhone(e.target.value)} />
            </div>
            
            <div className="col-span-2 mt-2">
              <h4 className="font-semibold text-sm border-b pb-2">Shipping Address</h4>
            </div>

            <div className="space-y-2">
              <Label>Region</Label>
              <Select value={region} onValueChange={(val) => { setRegion(val); setProvince(''); setCity(''); setBarangay(''); }}>
                <SelectTrigger><SelectValue placeholder="Select Region" /></SelectTrigger>
                <SelectContent>
                  {regionOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Province</Label>
              <Select value={province} disabled={!region} onValueChange={(val) => { setProvince(val); setCity(''); setBarangay(''); }}>
                <SelectTrigger><SelectValue placeholder="Select Province" /></SelectTrigger>
                <SelectContent>
                  {provinceOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>City/Municipality</Label>
              <Select value={city} disabled={!province} onValueChange={(val) => { setCity(val); setBarangay(''); }}>
                <SelectTrigger><SelectValue placeholder="Select City" /></SelectTrigger>
                <SelectContent>
                  {cityOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Barangay</Label>
              <Select value={barangay} disabled={!city} onValueChange={setBarangay}>
                <SelectTrigger><SelectValue placeholder="Select Barangay" /></SelectTrigger>
                <SelectContent>
                  {barangayOptions.map((opt: { value: string; label: string }) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Postal Code</Label>
              <Input value={postalCode} onChange={e => setPostalCode(e.target.value)} />
            </div>
            <div className="space-y-2 col-span-2">
              <Label>Street / Building / House No.</Label>
              <Input value={streetAddress} onChange={e => setStreetAddress(e.target.value)} />
            </div>

            <div className="col-span-2 mt-2">
              <h4 className="font-semibold text-sm border-b pb-2">Shipping Payment</h4>
            </div>

            <div className="space-y-2">
              <Label>Shipping Type</Label>
              <Select value={paymentType} onValueChange={handlePaymentTypeChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sf only">SF Only</SelectItem>
                  <SelectItem value="paid items, sf only">Paid items, SF only</SelectItem>
                  <SelectItem value="cod">COD</SelectItem>
                  <SelectItem value="free shipping">Free Shipping</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Shipping Amount (₱)</Label>
              <Input type="number" value={shippingAmount} onChange={e => setShippingAmount(e.target.value)} />
            </div>
            
            {isMultiBox ? (
              <VerifyShippingBoxes
                boxes={order.boxes_config}
                paymentType={paymentType}
                boxCodAmounts={boxCodAmounts}
                onBoxCodChange={(boxId, amount) => setBoxCodAmounts(prev => ({ ...prev, [boxId]: amount }))}
              />
            ) : (
              <div className="space-y-2 col-span-2">
                <Label>Amount to Collect for Items (Courier COD) (₱)</Label>
                <Input 
                  type="number" 
                  disabled={!collectsItemCod(paymentType)}
                  value={collectsItemCod(paymentType) ? balanceDue : '0'}
                  onChange={e => setBalanceDue(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {collectsItemCod(paymentType)
                    ? 'The courier collects this for the items (plus the shipping fee if the customer pays it). Put 0 if the items are already paid. This does not change what the customer owes us.'
                    : 'Items already paid: the courier collects nothing for the items.'}
                </p>
              </div>
            )}

            <div className="space-y-2 col-span-2 mt-2">
              <Label>Delivery Instructions (For Courier)</Label>
              <Input 
                value={deliveryInstructions} 
                onChange={e => setDeliveryInstructions(e.target.value)} 
                placeholder="Optional delivery instructions..."
              />
            </div>

            <div className="flex items-center space-x-2 col-span-2 mt-4 bg-muted/50 p-3 rounded-md">
              <Checkbox id="saveAsSecondary" checked={saveAsSecondary} onCheckedChange={(checked) => setSaveAsSecondary(checked === true)} />
              <Label htmlFor="saveAsSecondary" className="cursor-pointer">Save this address as customer&apos;s Secondary Address</Label>
            </div>
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Verifying...' : 'Verify & Move to For Shipping'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
