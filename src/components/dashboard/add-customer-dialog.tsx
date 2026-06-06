'use client';

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import addressDataRaw from '@/lib/philippine-address-data.json';

const addressData = addressDataRaw as Record<string, any>;

const customerSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.preprocess(val => val === '' ? undefined : val, z.string().email("Invalid email address").optional()),
  phoneNumber: z.string().optional(),
  facebookProfileLink: z.preprocess(val => val === '' ? undefined : val, z.string().url("Invalid URL").optional()),
  region: z.string().min(1, "Region is required"),
  province: z.string().min(1, "Province is required"),
  city: z.string().min(1, "City is required"),
  barangay: z.string().min(1, "Barangay is required"),
  postalCode: z.string().min(1, "Postal code is required"),
  streetAddress: z.string().min(1, "Street address is required"),
});

interface AddCustomerDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSuccess?: (customer: {id: string, firstName: string, lastName: string}) => void;
  triggerButton?: React.ReactNode;
  initialName?: string;
  customerToEdit?: any;
}

export function AddCustomerDialog(props: AddCustomerDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const { toast } = useToast();

  const isControlled = props.open !== undefined && props.onOpenChange !== undefined;
  const open = isControlled ? props.open : internalOpen;
  const setOpen = isControlled ? props.onOpenChange : setInternalOpen;

  const form = useForm<z.infer<typeof customerSchema>>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      phoneNumber: "",
      facebookProfileLink: "",
      region: "",
      province: "",
      city: "",
      barangay: "",
      postalCode: "",
      streetAddress: "",
    },
  });

  const selectedRegion = form.watch("region");
  const selectedProvince = form.watch("province");
  const selectedCity = form.watch("city");

  const regionOptions = Object.entries(addressData).map(([code, data]) => ({ value: code, label: data.region_name }));
  const provinceOptions = selectedRegion && addressData[selectedRegion]?.province_list ? Object.entries(addressData[selectedRegion].province_list).map(([name]) => ({ value: name, label: name })) : [];
  const cityOptions = selectedRegion && selectedProvince && addressData[selectedRegion]?.province_list?.[selectedProvince]?.municipality_list ? Object.entries(addressData[selectedRegion].province_list[selectedProvince].municipality_list).map(([name]) => ({ value: name, label: name })) : [];
  const barangayOptions = selectedRegion && selectedProvince && selectedCity && addressData[selectedRegion]?.province_list?.[selectedProvince]?.municipality_list?.[selectedCity]?.barangay_list ? addressData[selectedRegion].province_list[selectedProvince].municipality_list[selectedCity].barangay_list.map((name: string) => ({ value: name, label: name })) : [];

  useEffect(() => {
      if (open) {
          let firstName = "";
          let lastName = "";
          if (props.initialName) {
              const parts = props.initialName.trim().split(' ');
              firstName = parts[0] || '';
              lastName = parts.slice(1).join(' ') || '';
          }
          if (props.customerToEdit) {
              const cust = props.customerToEdit;
              // Handle both camelCase and snake_case formats from different parent components
              firstName = cust.firstName || cust.first_name || '';
              lastName = cust.lastName || cust.last_name || '';
              
              if (!firstName && !lastName) {
                  const parts = (cust.full_name || '').trim().split(' ');
                  firstName = parts[0] || '';
                  lastName = parts.slice(1).join(' ') || '';
              }
              
              const rawRegion = cust.region || "";
              const rawProvince = cust.province || "";
              const rawCity = cust.city || "";
              const rawBarangay = cust.barangay || "";
              
              let regionCode = "";
              if (rawRegion) {
                  // Check if it's already a valid code
                  if (addressData[rawRegion]) {
                      regionCode = rawRegion;
                  } else {
                      // Find region code by name
                      const entry = Object.entries(addressData).find(([_, data]) => data.region_name === rawRegion);
                      if (entry) regionCode = entry[0];
                  }
              }
              
              let validProvince = "";
              if (regionCode && rawProvince && addressData[regionCode]?.province_list?.[rawProvince]) {
                  validProvince = rawProvince;
              }
              
              let validCity = "";
              if (regionCode && validProvince && rawCity && addressData[regionCode]?.province_list?.[validProvince]?.municipality_list?.[rawCity]) {
                  validCity = rawCity;
              }
              
              let validBarangay = "";
              if (regionCode && validProvince && validCity && rawBarangay) {
                  const barangays = addressData[regionCode].province_list[validProvince].municipality_list[validCity].barangay_list;
                  if (barangays && barangays.includes(rawBarangay)) {
                      validBarangay = rawBarangay;
                  }
              }

              form.reset({
                  firstName: firstName,
                  lastName: lastName,
                  email: cust.email || "",
                  phoneNumber: cust.mobileNumber || cust.mobile_number || "",
                  facebookProfileLink: cust.facebookProfileLink || cust.facebook_profile_link || "",
                  region: regionCode,
                  province: validProvince,
                  city: validCity,
                  barangay: validBarangay,
                  postalCode: cust.postalCode || cust.postal_code || "",
                  streetAddress: cust.streetAddress || cust.street_address || "",
              });
          } else {
              form.reset({
                  firstName: firstName,
                  lastName: lastName,
                  email: "",
                  phoneNumber: "",
                  facebookProfileLink: "",
                  region: "",
                  province: "",
                  city: "",
                  barangay: "",
                  postalCode: "",
                  streetAddress: "",
              });
          }
      }
  }, [open, props.initialName, form]);

  async function onSubmit(values: z.infer<typeof customerSchema>) {
    setOpen(false);

    toast({
      title: props.customerToEdit ? "Updating Customer..." : "Adding Customer...",
      description: props.customerToEdit 
        ? `Updating ${values.firstName} ${values.lastName}'s details.` 
        : `Adding ${values.firstName} ${values.lastName} to your database.`,
    });

    const supabase = createClient();
    
    const regionName = addressData[values.region]?.region_name || values.region;
    const addressLine = `${values.streetAddress}, ${values.barangay}, ${values.city}, ${values.province}, ${regionName} ${values.postalCode}`;

    try {
      let data, error;

      if (props.customerToEdit) {
        const result = await supabase
          .from('customers')
          .update({
            full_name: `${values.firstName} ${values.lastName}`.trim(),
            email: values.email || null,
            mobile_number: values.phoneNumber || null,
            address_line: addressLine,
            region: regionName,
            province: values.province,
            city: values.city,
            barangay: values.barangay,
            postal_code: values.postalCode,
            street_address: values.streetAddress,
            facebook_profile_link: values.facebookProfileLink || null,
          })
          .eq('id', props.customerToEdit.id)
          .select()
          .single();
        data = result.data;
        error = result.error;
      } else {
        const result = await supabase
          .from('customers')
          .insert({
            full_name: `${values.firstName} ${values.lastName}`.trim(),
            email: values.email || null,
            mobile_number: values.phoneNumber || null,
            address_line: addressLine,
            region: regionName,
            province: values.province,
            city: values.city,
            barangay: values.barangay,
            postal_code: values.postalCode,
            street_address: values.streetAddress,
            facebook_profile_link: values.facebookProfileLink || null,
            suki_tier: 'NEWBIE'
          })
          .select()
          .single();
        data = result.data;
        error = result.error;
      }
        
      if (error) throw error;
      
      toast({
          title: props.customerToEdit ? "Customer Updated" : "Customer Added",
          description: `${values.firstName} ${values.lastName} has been successfully ${props.customerToEdit ? 'updated' : 'added'}.`,
      });
      form.reset();
      if (props.onSuccess) props.onSuccess({ id: data.id, firstName: values.firstName, lastName: values.lastName });
      
    } catch (err: any) {
      console.error("Error adding customer:", err);
      toast({
          variant: "destructive",
          title: "Save Failed",
          description: `There was an error creating the customer: ${err.message || 'Unknown error'}`,
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!isControlled && (
          <DialogTrigger asChild>
            {props.triggerButton || <Button>Add Customer</Button>}
          </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-[550px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{props.customerToEdit ? "Edit Customer" : "Add New Customer"}</DialogTitle>
          <DialogDescription>
            {props.customerToEdit ? "Update the customer's details below." : "Fill in the details for the new customer."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 flex flex-col flex-1 overflow-hidden">
            <div className="grid grid-cols-2 gap-4 py-4 px-1 overflow-y-auto flex-1 pr-2">
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>First Name</FormLabel>
                    <FormControl>
                      <Input placeholder="John" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Last Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Doe" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email (Optional)</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="john.doe@example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phoneNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone Number</FormLabel>
                    <FormControl>
                      <Input placeholder="09171234567" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="facebookProfileLink"
                render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Facebook Profile</FormLabel>
                    <FormControl>
                      <Input type="url" placeholder="https://facebook.com/johndoe" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="col-span-2 mt-4 mb-2">
                <h4 className="font-semibold text-sm border-b pb-2">Shipping Address</h4>
              </div>

              <FormField
                control={form.control}
                name="region"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Region</FormLabel>
                    <Select onValueChange={(val) => {
                      field.onChange(val);
                      form.setValue('province', '');
                      form.setValue('city', '');
                      form.setValue('barangay', '');
                    }} defaultValue={field.value} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select Region" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {regionOptions.map(option => (
                          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="province"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Province</FormLabel>
                    <Select onValueChange={(val) => {
                      field.onChange(val);
                      form.setValue('city', '');
                      form.setValue('barangay', '');
                    }} defaultValue={field.value} value={field.value} disabled={!selectedRegion}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select Province" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {provinceOptions.map(option => (
                          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>City/Municipality</FormLabel>
                    <Select onValueChange={(val) => {
                      field.onChange(val);
                      form.setValue('barangay', '');
                    }} defaultValue={field.value} value={field.value} disabled={!selectedProvince}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select City" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {cityOptions.map(option => (
                          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="barangay"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Barangay</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value} disabled={!selectedCity}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select Barangay" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {barangayOptions.map(option => (
                          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="postalCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Postal Code</FormLabel>
                    <FormControl>
                      <Input placeholder="1234" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="streetAddress"
                render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Street / Building / House No.</FormLabel>
                    <FormControl>
                      <Input placeholder="123 Main St, Apt 4B" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <DialogFooter className="mt-6 flex gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit">{props.customerToEdit ? "Save Changes" : "Save Customer"}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
