'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSupabase } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Order } from '@/app/dashboard/orders/page';
import addressDataRaw from '@/lib/philippine-address-data.json';
import { Checkbox } from '@/components/ui/checkbox';

const addressData = addressDataRaw as Record<string, any>;

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
    if (open && order && supabase) {
      // Fetch customer details
      supabase.from('customers').select('*').eq('id', order.customerId).single().then(({ data, error }) => {
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
      setPaymentType('sf only');
      setShippingAmount('0');
      setBalanceDue(order.balanceDue?.toString() || '0');
      if (order.boxes_config && Array.isArray(order.boxes_config) && order.boxes_config.length > 1) {
          const amounts: Record<string, string> = {};
          order.boxes_config.forEach((b: any, index: number) => {
              amounts[b.id] = b.cod_amount?.toString() || (index === 0 ? (order.balanceDue?.toString() || '0') : '0');
          });
          setBoxCodAmounts(amounts);
      } else {
          setBoxCodAmounts({});
      }
      setSaveAsSecondary(false);
      setDeliveryInstructions('Kuya wag nyo po sabihin na galing Shopee! Sabihin nyo po galing ng Negosyanteng Pinoy. Thankyou po! :)');
    }
  }, [open, order, supabase]);

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

      const updateData: any = {
          status: 'For Shipping',
          shipping_verified: true,
          not_for_shipping_reason: null,
          shipping_name: shippingName,
          shipping_phone: shippingPhone,
          shipping_payment_type: paymentType,
          shipping_amount: parseFloat(shippingAmount) || 0,
          balance_due: parseFloat(balanceDue) || 0,
          shipping_address: shippingAddressJson,
          delivery_instructions: deliveryInstructions
      };

      if (isMultiBox) {
         const newBoxesConfig = order.boxes_config.map((b: any) => ({
            ...b,
            cod_amount: parseFloat(boxCodAmounts[b.id] || '0') || 0
         }));
         updateData.boxes_config = newBoxesConfig;
         updateData.balance_due = newBoxesConfig.reduce((acc: number, b: any) => acc + b.cod_amount, 0);
      }

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
            Confirm or edit the shipping details for this order. It will be moved to the "For Shipping" tab.
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
                  {barangayOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
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
              <Select value={paymentType} onValueChange={setPaymentType}>
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
              <div className="space-y-3 col-span-2 border p-3 rounded-md bg-slate-50">
                <Label className="text-base font-semibold">Amount to Collect for Items (Multi-Box)</Label>
                <p className="text-xs text-muted-foreground mb-2">Assign how much COD should be collected per box.</p>
                {order.boxes_config.map((box: any) => (
                   <div key={box.id} className="flex flex-col gap-2 bg-white p-3 rounded border">
                      <div className="flex items-center gap-3">
                        <Label className="w-24 text-sm font-semibold">{box.name}: ₱</Label>
                        <Input 
                          type="number" 
                          value={boxCodAmounts[box.id] || ''} 
                          onChange={e => setBoxCodAmounts({...boxCodAmounts, [box.id]: e.target.value})} 
                        />
                      </div>
                      <div className="text-xs text-muted-foreground">
                         <span className="font-semibold block mb-1">Contents:</span>
                         <ul className="list-disc pl-4">
                            {box.items && box.items.length > 0 ? box.items.map((item: any, idx: number) => (
                               <li key={idx}>{item.quantity}x {item.product_name}</li>
                            )) : <li>Empty box</li>}
                         </ul>
                      </div>
                   </div>
                ))}
              </div>
            ) : (
              <div className="space-y-2 col-span-2">
                <Label>Amount to Collect for Items (Balance Due) (₱)</Label>
                <Input type="number" value={balanceDue} onChange={e => setBalanceDue(e.target.value)} />
                <p className="text-xs text-muted-foreground">The Courier will collect this amount + shipping fee (if applicable).</p>
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
              <Label htmlFor="saveAsSecondary" className="cursor-pointer">Save this address as customer's Secondary Address</Label>
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
