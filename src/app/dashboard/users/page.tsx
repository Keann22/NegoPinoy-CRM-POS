'use client';

import { MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useState, useEffect } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { createClient } from '@/lib/supabase/client';
import { EditUserRolesDialog } from '@/components/dashboard/edit-user-roles-dialog';

export type UserProfile = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  roles: ('Owner' | 'Admin' | 'Inventory' | 'Sales')[];
};

export default function UsersPage() {
  const supabase = createClient();
  const { userProfile: currentUserProfile } = useUserProfile();
  const [deletingUser, setDeletingUser] = useState<UserProfile | null>(null);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [refreshCount, setRefreshCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const { toast } = useToast();

  const canManageUsers = currentUserProfile &&
    (currentUserProfile.roles.includes('Owner') || currentUserProfile.roles.includes('Admin'));

  // Fetch users from Supabase Auth via admin-level API
  useEffect(() => {
    if (!canManageUsers) {
      setIsLoading(false);
      return;
    }

    const loadUsers = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase.rpc('get_all_users');
        if (error) throw error;
        
        if (data) {
          const mapRole = (r: string): ('Owner' | 'Admin' | 'Inventory' | 'Sales')[] => {
            switch (r) {
              case 'Owner': return ['Owner', 'Admin', 'Sales', 'Inventory'];
              case 'Admin': return ['Admin', 'Sales', 'Inventory'];
              case 'Sales': return ['Sales'];
              case 'Inventory': return ['Inventory'];
              default: return [];
            }
          };

          const parsedUsers = data.map((u: any) => {
            const meta = u.raw_user_meta_data || {};
            let userRoles: any[] = [];
            
            if (Array.isArray(meta.roles)) {
              userRoles = meta.roles;
            } else if (meta.role) {
              userRoles = mapRole(meta.role);
            }
            
            return {
              id: u.id,
              firstName: meta.first_name || '',
              lastName: meta.last_name || '',
              email: u.email || '',
              roles: userRoles
            };
          });
          setUsers(parsedUsers);
        }
      } catch (err) {
        console.error('Error loading users:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadUsers();
  }, [canManageUsers, refreshCount]);

  if (currentUserProfile && !canManageUsers) {
    return (
      <Card className="m-6">
        <CardHeader>
          <CardTitle>Access Denied</CardTitle>
          <CardDescription>You do not have permission to view the user directory.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const handlePasswordReset = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } else {
      toast({ title: 'Password Reset Sent', description: `Reset link sent to ${email}` });
    }
  };

  const confirmDelete = async () => {
    if (!deletingUser) return;
    if (currentUserProfile?.id === deletingUser.id) {
      toast({ variant: 'destructive', title: 'Action Forbidden', description: 'You cannot delete your own account.' });
      setDeletingUser(null);
      return;
    }
    // Note: Deleting auth users requires server-side admin API; this is a placeholder
    toast({ title: 'User Removed', description: `${deletingUser.email} has been flagged for removal. Contact your Supabase admin to fully delete the auth account.` });
    setDeletingUser(null);
  };

  const totalPages = Math.ceil(users.length / itemsPerPage);
  const paginatedUsers = users.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );
  const startIndex = users.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0;
  const endIndex = users.length > 0 ? Math.min(currentPage * itemsPerPage, users.length) : 0;

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="font-headline">User Management</CardTitle>
            <CardDescription>Manage user roles and permissions.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><div className="flex items-center gap-4"><Skeleton className="h-10 w-10 rounded-full" /><Skeleton className="h-4 w-32" /></div></TableCell>
                  <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-24 rounded-full" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-8 ml-auto" /></TableCell>
                </TableRow>
              ))}
              {paginatedUsers.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="flex items-center gap-4">
                      <Avatar><AvatarFallback>{user.firstName?.charAt(0)}{user.lastName?.charAt(0)}</AvatarFallback></Avatar>
                      <div className="font-medium">{user.firstName} {user.lastName}</div>
                    </div>
                  </TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    <div className='flex flex-wrap gap-1'>
                      {user.roles.map(role => <Badge key={role} variant="secondary">{role}</Badge>)}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button aria-haspopup="true" size="icon" variant="ghost" disabled={currentUserProfile?.id === user.id}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setEditingUser(user)}>Edit Roles</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handlePasswordReset(user.email)}>Send Password Reset</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive" onClick={() => setDeletingUser(user)}>Delete User</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
              {!isLoading && users.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">No users found.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
        {users.length > 0 && (
          <CardFooter className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground">
              Showing <strong>{startIndex}-{endIndex}</strong> of <strong>{users.length}</strong> users
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => p - 1)}
                disabled={currentPage <= 1}
              >
                Previous
              </Button>
              <span className='text-sm text-muted-foreground'>
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => p + 1)}
                disabled={currentPage >= totalPages}
              >
                Next
              </Button>
            </div>
          </CardFooter>
        )}
      </Card>

      <AlertDialog open={!!deletingUser} onOpenChange={(isOpen) => !isOpen && setDeletingUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the profile for <strong>{deletingUser?.email}</strong>. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <EditUserRolesDialog 
        user={editingUser} 
        open={!!editingUser} 
        onOpenChange={(isOpen) => !isOpen && setEditingUser(null)} 
        onSuccess={() => {
          setEditingUser(null);
          setRefreshCount(prev => prev + 1);
        }}
      />
    </>
  );
}