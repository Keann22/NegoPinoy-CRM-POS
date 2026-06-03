'use client';

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";


const customerSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.preprocess(val => val === '' ? undefined : val, z.string().email("Invalid email address").optional()),
  phoneNumber: z.string().optional(),
  facebookProfileLink: z.preprocess(val => val === '' ? undefined : val, z.string().url("Invalid URL").optional()),
  shippingAddresses: z.string().min(1, "At least one shipping address is required."),
});

interface AddCustomerDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSuccess?: (customer: {id: string, firstName: string, lastName: string}) => void;
  triggerButton?: React.ReactNode;
  initialName?: string;
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
      shippingAddresses: "",
    },
  });

  useEffect(() => {
      if (open) {
          let firstName = "";
          let lastName = "";
          if (props.initialName) {
              const parts = props.initialName.trim().split(' ');
              firstName = parts[0] || '';
              lastName = parts.slice(1).join(' ') || '';
          }
          form.reset({
              firstName: firstName,
              lastName: lastName,
              email: "",
              phoneNumber: "",
              facebookProfileLink: "",
              shippingAddresses: "",
          });
      }
  }, [open, props.initialName, form]);

  async function onSubmit(values: z.infer<typeof customerSchema>) {
    setOpen(false);

    toast({
      title: "Adding Customer...",
      description: `Adding ${values.firstName} ${values.lastName} to your database.`,
    });

    const supabase = createClient();
    
    // Combine shipping addresses into a single string for address_line
    const addressLine = values.shippingAddresses.split('\n').filter(addr => addr.trim() !== '').join(', ');

    try {
      const { data, error } = await supabase
        .from('customers')
        .insert({
          full_name: `${values.firstName} ${values.lastName}`.trim(),
          email: values.email || null,
          mobile_number: values.phoneNumber || null,
          address_line: addressLine || null,
          facebook_profile_link: values.facebookProfileLink || null,
          suki_tier: 'NEWBIE'
        })
        .select()
        .single();
        
      if (error) throw error;
      
      toast({
          title: "Customer Added",
          description: `${values.firstName} ${values.lastName} has been successfully added.`,
      });
      form.reset();
      if (props.onSuccess) props.onSuccess({ id: data.id, firstName: values.firstName, lastName: values.lastName });
      
    } catch (err) {
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
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add New Customer</DialogTitle>
          <DialogDescription>
            Fill in the details for the new customer.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-2 py-4 px-1">
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
                  <FormItem>
                    <FormLabel>Facebook Profile</FormLabel>
                    <FormControl>
                      <Input type="url" placeholder="https://facebook.com/johndoe" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="shippingAddresses"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Shipping Addresses</FormLabel>
                    <FormControl>
                      <Textarea placeholder="123 Main St, Quezon City&#10;456 Other St, Cebu City" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit">Save Customer</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
