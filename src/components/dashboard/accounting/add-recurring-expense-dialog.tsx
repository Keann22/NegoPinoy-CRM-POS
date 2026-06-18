'use client';

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useSupabase } from "@/lib/supabase/hooks";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const recurringExpenseSchema = z.object({
  name: z.string().min(1, "Expense name is required"),
  amount: z.coerce.number().positive("Amount must be a positive number"),
  category: z.string().min(1, "Category is required"),
  dayOfMonth: z.coerce.number().min(1, "Day must be at least 1").max(31, "Day must be at most 31"),
});

type RecurringExpenseFormValues = z.infer<typeof recurringExpenseSchema>;

const expenseCategories = [
    "Marketing",
    "Salaries",
    "Rent",
    "Utilities",
    "Supplies",
    "Travel",
    "Software & Subscriptions",
    "Platform Fees",
    "Shipping Costs",
    "Other"
];

export function AddRecurringExpenseDialog() {
  const [open, setOpen] = useState(false);
  const supabase = useSupabase();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const form = useForm<RecurringExpenseFormValues>({
    resolver: zodResolver(recurringExpenseSchema),
  });

  async function onSubmit(values: RecurringExpenseFormValues) {
    if (!supabase) return;
    setIsSubmitting(true);

    toast({
      title: "Adding Recurring Expense...",
      description: `Saving "${values.name}".`,
    });

    try {
        const { error } = await supabase
            .from('recurring_expenses')
            .insert({
                name: values.name,
                amount: values.amount,
                category: values.category,
                day_of_month: values.dayOfMonth,
            });

        if (error) throw error;

        toast({
            title: "Recurring Expense Added",
            description: `"${values.name}" has been successfully saved.`,
        });
        form.reset();
        setOpen(false);
    } catch (error: any) {
        console.error("Failed to add recurring expense:", error);
        toast({
            variant: "destructive",
            title: "Error",
            description: error.message || "Failed to save the recurring expense.",
        });
    } finally {
        setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Add Recurring Expense</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add Recurring Expense</DialogTitle>
          <DialogDescription>
            Define a monthly expense that you can post automatically.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-4 py-4 max-h-[70vh] overflow-y-auto px-1">
                <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel>Expense Name</FormLabel>
                        <FormControl>
                        <Input placeholder="e.g., Office Rent" {...field} />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="amount"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel>Amount (₱)</FormLabel>
                        <FormControl>
                        <Input type="number" step="0.01" placeholder="20000.00" {...field} />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                    )}
                />
                 <FormField
                    control={form.control}
                    name="category"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Category</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                            <SelectTrigger>
                                <SelectValue placeholder="Select an expense category" />
                            </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                                {expenseCategories.map(category => (
                                    <SelectItem key={category} value={category}>{category}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="dayOfMonth"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel>Day of Month</FormLabel>
                        <FormControl>
                        <Input type="number" placeholder="e.g., 15" {...field} />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                    )}
                />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isSubmitting}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting}>Save Expense</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
