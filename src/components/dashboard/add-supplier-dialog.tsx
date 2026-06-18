'use client';

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useSupabase } from "@/lib/supabase/hooks";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

const supplierSchema = z.object({
  name: z.string().min(1, "Supplier name is required"),
  contactPerson: z.string().optional(),
  email: z.string().email("Invalid email address").optional().or(z.literal('')),
  phoneNumber: z.string().optional(),
  facebookProfileLink: z.string().url("Must be a valid URL").optional().or(z.literal('')),
  website: z.string().url("Must be a valid URL").optional().or(z.literal('')),
});

interface AddSupplierDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSuccess?: (supplier: { id: string; name: string }) => void;
  children?: React.ReactNode;
}

export function AddSupplierDialog({ open: controlledOpen, onOpenChange: setControlledOpen, onSuccess, children }: AddSupplierDialogProps = {}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  
  const open = controlledOpen !== undefined ? controlledOpen : uncontrolledOpen;
  const setOpen = setControlledOpen !== undefined ? setControlledOpen : setUncontrolledOpen;
  
  const supabase = useSupabase();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const form = useForm<z.infer<typeof supplierSchema>>({
    resolver: zodResolver(supplierSchema),
    defaultValues: {
      name: "",
      contactPerson: "",
      email: "",
      phoneNumber: "",
      facebookProfileLink: "",
      website: "",
    },
  });

  async function onSubmit(values: z.infer<typeof supplierSchema>) {
    if (!supabase) return;
    setIsSubmitting(true);

    toast({
      title: "Adding Supplier...",
      description: `Adding ${values.name} to your database.`,
    });

    try {
        const { data, error } = await supabase
            .from('suppliers')
            .insert({
                name: values.name,
                contact_person: values.contactPerson || null,
                email: values.email || null,
                phone_number: values.phoneNumber || null,
                facebook_profile_link: values.facebookProfileLink || null,
                website: values.website || null,
            })
            .select();

        if (error) throw error;

        if (data && data.length > 0) {
            onSuccess?.({ id: data[0].id, name: data[0].name });
        }

        toast({
            title: "Supplier Added",
            description: `${values.name} has been successfully added.`,
        });
        form.reset();
        setOpen(false);
    } catch (error: any) {
        console.error("Failed to add supplier:", error);
        toast({
            variant: "destructive",
            title: "Error",
            description: error.message || "Failed to save the supplier.",
        });
    } finally {
        setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {children ? (
        <DialogTrigger asChild>
          {children}
        </DialogTrigger>
      ) : (
        <DialogTrigger asChild>
          <Button>Add Supplier</Button>
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add New Supplier</DialogTitle>
          <DialogDescription>
            Fill in the details for the new supplier.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-2 py-4 px-1">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Supplier Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Global Imports Inc." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="contactPerson"
                render={({ field }) => (
                  <FormItem>
                  <FormLabel>Contact Person (Optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="Jane Smith" {...field} />
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
                  <FormLabel>Facebook Profile Link (Optional)</FormLabel>
                  <FormControl>
                      <Input type="url" placeholder="https://facebook.com/supplier" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
                )}
                />
                <FormField
                control={form.control}
                name="website"
                render={({ field }) => (
                    <FormItem>
                  <FormLabel>Website (Optional)</FormLabel>
                  <FormControl>
                      <Input type="url" placeholder="https://supplier.com" {...field} />
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
                      <Input type="email" placeholder="contact@globalimports.com" {...field} />
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
                    <FormLabel>Phone Number (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="09171234567" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isSubmitting}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting}>Save Supplier</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
