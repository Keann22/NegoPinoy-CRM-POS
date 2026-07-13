'use client';

import { useState, useMemo, useEffect } from 'react';
import { useSupabase, useUser } from '@/lib/supabase/hooks';
import { useUserProfile } from '@/hooks/useUserProfile';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Plus } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { ManageCategoryDialog } from '@/components/dashboard/manage-category-dialog';

export type Category = {
    id: string;
    name: string;
    description: string;
};

export default function CategoriesPage() {
    const supabase = useSupabase();
    const { user } = useUser();
    const { userProfile } = useUserProfile();
    const { toast } = useToast();
    
    const [searchTerm, setSearchTerm] = useState('');
    const [editingCategory, setEditingCategory] = useState<Category | null>(null);
    const [isAddingCategory, setIsAddingCategory] = useState(false);
    const [deletingCategory, setDeletingCategory] = useState<Category | null>(null);
    
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    const isManagement = useMemo(() => userProfile?.roles?.some(r => ['Admin', 'Owner'].includes(r)), [userProfile]);
    const isInventory = useMemo(() => userProfile?.roles?.some(r => String(r).toLowerCase() === 'inventory'), [userProfile]);
    const canManageCategories = isManagement || isInventory;

    const [categories, setCategories] = useState<Category[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [refetchTrigger, setRefetchTrigger] = useState(0);
    const refetch = () => setRefetchTrigger(n => n + 1);

    useEffect(() => {
      if (!supabase || !user) return;
      const fetch = async () => {
        setIsLoading(true);
        try {
          const { data, error } = await supabase.from('categories').select('*').order('name');
          if (error) throw error;
          setCategories(data || []);
        } catch (err) { console.error('Categories fetch error:', err); }
        finally { setIsLoading(false); }
      };
      fetch();
    }, [supabase, user, refetchTrigger]);

    const filteredCategories = useMemo(() => {
        if (!categories) return [];
        if (!searchTerm) return categories;
        return categories.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()));
    }, [categories, searchTerm]);

    const totalPages = Math.ceil(filteredCategories.length / itemsPerPage) || 1;
    
    // Reset to page 1 if search term changes and current page is out of bounds
    useEffect(() => {
        if (currentPage > totalPages) {
            setCurrentPage(1);
        }
    }, [searchTerm, totalPages, currentPage]);

    const paginatedCategories = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        return filteredCategories.slice(startIndex, startIndex + itemsPerPage);
    }, [filteredCategories, currentPage, itemsPerPage]);

    const startIndex = filteredCategories.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0;
    const endIndex = filteredCategories.length > 0 ? Math.min(currentPage * itemsPerPage, filteredCategories.length) : 0;

    const handleDeleteConfirm = async () => {
        if (!deletingCategory || !supabase) return;
        
        const categoryToDelete = deletingCategory;
        setDeletingCategory(null);
        
        try {
            const { error } = await supabase.from('categories').delete().eq('id', categoryToDelete.id);
            if (error) throw error;
            
            toast({
                title: "Category Deleted",
                description: `"${categoryToDelete.name}" has been removed.`,
            });
            refetch();
        } catch (error: any) {
            console.error("Error deleting category:", error);
            toast({
                variant: 'destructive',
                title: 'Deletion Failed',
                description: error.message || `Could not delete "${categoryToDelete.name}".`
            });
        }
    };

    return (
        <>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle className="font-headline">Categories</CardTitle>
                        <CardDescription>
                            Manage your product categories.
                        </CardDescription>
                    </div>
                    {canManageCategories && (
                        <Button onClick={() => setIsAddingCategory(true)}>
                            <Plus className="mr-2 h-4 w-4" /> Add Category
                        </Button>
                    )}
                </CardHeader>
                <CardContent>
                    <div className="flex items-center mb-4">
                        <Input
                            placeholder="Search categories by name..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="max-w-sm"
                        />
                    </div>
                    
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Description</TableHead>
                                {canManageCategories && (
                                    <TableHead className="w-[100px]"><span className="sr-only">Actions</span></TableHead>
                                )}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading && Array.from({ length: 5 }).map((_, i) => (
                                <TableRow key={i}>
                                    <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                                    <TableCell><Skeleton className="h-4 w-full" /></TableCell>
                                    {canManageCategories && <TableCell><Skeleton className="h-8 w-8" /></TableCell>}
                                </TableRow>
                            ))}
                            
                            {!isLoading && paginatedCategories.map((category) => (
                                <TableRow key={category.id}>
                                    <TableCell className="font-medium">{category.name}</TableCell>
                                    <TableCell className="text-muted-foreground">{category.description || '-'}</TableCell>
                                    {canManageCategories && (
                                        <TableCell>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button aria-haspopup="true" size="icon" variant="ghost">
                                                        <MoreHorizontal className="h-4 w-4" />
                                                        <span className="sr-only">Toggle menu</span>
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                    <DropdownMenuItem onClick={() => setEditingCategory(category)}>Edit</DropdownMenuItem>
                                                    <DropdownMenuItem 
                                                        className="text-destructive focus:text-destructive focus:bg-destructive/10"
                                                        onClick={() => setDeletingCategory(category)}
                                                    >
                                                        Delete
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </TableCell>
                                    )}
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                    
                    {!isLoading && filteredCategories.length === 0 && (
                        <div className="flex flex-col items-center justify-center text-center border-2 border-dashed rounded-lg p-12 mt-4">
                            <p className="text-lg font-semibold">No categories found</p>
                            <p className="text-muted-foreground mt-2">
                                {searchTerm ? `No category matched "${searchTerm}".` : `Click "Add Category" to get started.`}
                            </p>
                        </div>
                    )}
                </CardContent>
                {filteredCategories.length > 0 && (
                    <CardFooter className="flex items-center justify-between border-t p-4">
                        <div className="text-xs text-muted-foreground">
                            Showing <strong>{startIndex}-{endIndex}</strong> of <strong>{filteredCategories.length}</strong> categories
                        </div>
                        <div className="flex items-center space-x-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage <= 1}
                            >
                                Previous
                            </Button>
                            <span className="text-sm text-muted-foreground">
                                Page {currentPage} of {totalPages}
                            </span>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage >= totalPages}
                            >
                                Next
                            </Button>
                        </div>
                    </CardFooter>
                )}
            </Card>

            <ManageCategoryDialog 
                open={isAddingCategory || !!editingCategory}
                category={editingCategory}
                onOpenChange={(isOpen) => {
                    if (!isOpen) {
                        setIsAddingCategory(false);
                        setEditingCategory(null);
                    }
                }}
                onSuccess={refetch}
            />

            <AlertDialog open={!!deletingCategory} onOpenChange={(isOpen) => !isOpen && setDeletingCategory(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete the category &quot;{deletingCategory?.name}&quot;. Products currently assigned to this category will not be deleted, but they may lose their category association.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={handleDeleteConfirm}
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
