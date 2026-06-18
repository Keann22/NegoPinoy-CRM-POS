'use client';

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useSupabase } from "@/lib/supabase/hooks";
import { useToast } from "@/hooks/use-toast";
import { useEffect } from "react";
import type { Category } from '@/app/dashboard/categories/page';

const categorySchema = z.object({
  name: z.string().min(1, "Category name is required"),
  description: z.string().optional(),
});

type CategoryFormValues = z.infer<typeof categorySchema>;

interface ManageCategoryDialogProps {
  category: Category | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function ManageCategoryDialog({ category, open, onOpenChange, onSuccess }: ManageCategoryDialogProps) {
  const supabase = useSupabase();
  const { toast } = useToast();

  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name: "",
      description: "",
    }
  });

  useEffect(() => {
    if (open) {
      if (category) {
        form.reset({
          name: category.name,
          description: category.description || "",
        });
      } else {
        form.reset({
          name: "",
          description: "",
        });
      }
    }
  }, [category, open, form]);

  async function onSubmit(values: CategoryFormValues) {
    if (!supabase) return;
    
    toast({
      title: category ? "Updating Category..." : "Adding Category...",
      description: "Please wait.",
    });

    try {
      if (category) {
        const slug = values.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        const { error } = await supabase
          .from('categories')
          .update({
            name: values.name,
            slug,
            description: values.description,
          })
          .eq('id', category.id);
          
        if (error) throw error;
        
        toast({
          title: "Category Updated",
          description: `"${values.name}" has been updated.`,
        });
      } else {
        const slug = values.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        const { error } = await supabase
          .from('categories')
          .insert({
            name: values.name,
            slug,
            description: values.description,
          });
          
        if (error) throw error;

        toast({
          title: "Category Added",
          description: `"${values.name}" has been added to your categories.`,
        });
      }
      
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error managing category:", error);
      toast({
        variant: "destructive",
        title: "Operation Failed",
        description: error.message || "An error occurred while saving the category.",
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{category ? 'Edit Category' : 'Add Category'}</DialogTitle>
          <DialogDescription>
            {category ? 'Make changes to the category details below.' : 'Create a new product category.'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-4 py-4">
                <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Category Name</FormLabel>
                        <FormControl>
                            <Input placeholder="e.g., Electronics" {...field} />
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Description (Optional)</FormLabel>
                        <FormControl>
                            <Textarea placeholder="What kind of products belong here?" {...field} />
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit">
                {category ? 'Save Changes' : 'Add Category'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
