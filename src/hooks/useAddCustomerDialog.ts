import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useToast } from "@/hooks/use-toast";
import { createClient } from "@/lib/supabase/client";
import addressDataRaw from '@/lib/philippine-address-data.json';

const addressData = addressDataRaw as Record<string, any>;

export const customerSchema = z.object({
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

export type CustomerFormValues = z.infer<typeof customerSchema>;

export interface UseAddCustomerDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSuccess?: (customer: {id: string, firstName: string, lastName: string}) => void;
  initialName?: string;
  customerToEdit?: any;
}

export function useAddCustomerDialog(props: UseAddCustomerDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const { toast } = useToast();

  const isControlled = props.open !== undefined && props.onOpenChange !== undefined;
  const open = isControlled ? props.open : internalOpen;
  const setOpen = isControlled ? props.onOpenChange : setInternalOpen;

  const form = useForm<CustomerFormValues>({
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
              firstName = cust.firstName || cust.first_name || '';
              lastName = cust.lastName || cust.last_name || '';
              
              if (!firstName && !lastName) {
                  const parts = (cust.full_name || cust.fullName || '').trim().split(' ');
                  firstName = parts[0] || '';
                  lastName = parts.slice(1).join(' ') || '';
              }
              
              const rawRegion = cust.region || "";
              const rawProvince = cust.province || "";
              const rawCity = cust.city || "";
              const rawBarangay = cust.barangay || "";
              
              let regionCode = "";
              if (rawRegion) {
                  if (addressData[rawRegion]) {
                      regionCode = rawRegion;
                  } else {
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
  }, [open, props.initialName, props.customerToEdit, form]);

  async function onSubmit(values: CustomerFormValues) {
    setOpen?.(false);

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

  return {
    open,
    setOpen,
    isControlled,
    form,
    selectedRegion,
    selectedProvince,
    selectedCity,
    regionOptions,
    provinceOptions,
    cityOptions,
    barangayOptions,
    onSubmit
  };
}
