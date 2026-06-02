'use client';

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import type { UserProfile } from "@/app/dashboard/users/page";
import { Checkbox } from "@/components/ui/checkbox";
import { createClient } from "@/lib/supabase/client";

const roles: UserProfile['roles'] = ['Owner', 'Admin', 'Inventory', 'Sales'];

const rolesSchema = z.object({
  roles: z.array(z.string()).refine((value) => value.some((item) => item), {
    message: "You have to select at least one role.",
  }),
});

type RolesFormValues = z.infer<typeof rolesSchema>;

interface EditUserRolesDialogProps {
  user: UserProfile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function EditUserRolesDialog({ user, open, onOpenChange, onSuccess }: EditUserRolesDialogProps) {
  const { toast } = useToast();
  const supabase = createClient();

  const form = useForm<RolesFormValues>({
    resolver: zodResolver(rolesSchema),
    values: {
        roles: user?.roles || [],
    },
  });

  if (!user) {
    return null;
  }

  async function onSubmit(data: RolesFormValues) {
    if (!user) return;
    onOpenChange(false);

    toast({
      title: "Updating Roles...",
      description: `Updating roles for ${user.firstName} ${user.lastName}.`,
    });
    
    const { error } = await supabase.rpc('set_user_roles', {
      target_user_id: user.id,
      new_roles: data.roles
    });

    if (error) {
      toast({
        variant: 'destructive',
        title: "Error Updating Roles",
        description: error.message,
      });
      return;
    }

    toast({
        title: "Roles Updated",
        description: `Successfully updated roles.`,
    });
    
    if (onSuccess) {
      onSuccess();
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit Roles for {user.firstName} {user.lastName}</DialogTitle>
          <DialogDescription>
            Select the roles to assign to this user.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <FormField
              control={form.control}
              name="roles"
              render={() => (
                <FormItem>
                  <div className="mb-4">
                    <FormLabel className="text-base">User Roles</FormLabel>
                  </div>
                  {roles.map((role) => (
                    <FormField
                      key={role}
                      control={form.control}
                      name="roles"
                      render={({ field }) => {
                        return (
                          <FormItem
                            key={role}
                            className="flex flex-row items-start space-x-3 space-y-0"
                          >
                            <FormControl>
                              <Checkbox
                                checked={field.value?.includes(role)}
                                onCheckedChange={(checked) => {
                                  return checked
                                    ? field.onChange([...field.value, role])
                                    : field.onChange(
                                        field.value?.filter(
                                          (value) => value !== role
                                        )
                                      )
                                }}
                              />
                            </FormControl>
                            <FormLabel className="font-normal">
                              {role}
                            </FormLabel>
                          </FormItem>
                        )
                      }}
                    />
                  ))}
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                <Button type="submit">Save Changes</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}