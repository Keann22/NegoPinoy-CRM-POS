import { useState, useMemo, useEffect } from 'react';
import { useSupabase } from '@/lib/supabase/hooks';
import { useToast } from '@/hooks/use-toast';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useProducts } from '@/hooks/useProducts';
import type { FormattedProduct } from '@/types';

export function useProductsPage() {
  const supabase = useSupabase();
  const { userProfile } = useUserProfile();
  const { toast } = useToast();

  const [deletingProduct, setDeletingProduct] = useState<FormattedProduct | null>(null);
  const [editingProduct, setEditingProduct] = useState<FormattedProduct | null>(null);
  const [viewingDetailsProduct, setViewingDetailsProduct] = useState<FormattedProduct | null>(null);
  const [viewingHistoryProduct, setViewingHistoryProduct] = useState<FormattedProduct | null>(null);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [searchTerm, setSearchTerm] = useState(() => {
    if (typeof window !== 'undefined') {
      return new URLSearchParams(window.location.search).get('search') || '';
    }
    return '';
  });
  const [stockFilter, setStockFilter] = useState('all');
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());
  const [viewingReservedProduct, setViewingReservedProduct] = useState<{ id: string; name: string } | null>(null);
  const [viewingPackedProduct, setViewingPackedProduct] = useState<{ id: string; name: string } | null>(null);
  const [viewingAllocatedProduct, setViewingAllocatedProduct] = useState<{ id: string; name: string } | null>(null);

  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState(searchTerm);
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearchTerm(searchTerm), 300);
    return () => clearTimeout(handle);
  }, [searchTerm]);

  const { products: paginatedProducts, totalCount, isLoading, refetch } = useProducts({
    searchTerm: debouncedSearchTerm,
    stockFilter,
    page: currentPage,
    pageSize: rowsPerPage,
  });

  const isManagement = useMemo(() => userProfile?.roles?.some(r => ['Admin', 'Owner'].includes(r)), [userProfile]);

  const allVisibleProducts = useMemo(
    () => paginatedProducts.flatMap(p => [p, ...(p.children || [])]),
    [paginatedProducts]
  );

  const totalPages = Math.ceil(totalCount / rowsPerPage) || 1;

  const handleDeleteConfirm = async () => {
    if (!deletingProduct) return;

    const productToDelete = deletingProduct;
    setDeletingProduct(null);

    toast({
      title: "Deleting Product...",
      description: `"${productToDelete.name}" is being removed.`,
    });

    try {
        if (productToDelete.images && productToDelete.images.length > 0) {
            const imagePaths = productToDelete.images
                .filter(url => !url.includes('placehold.co'))
                .map(url => {
                    const urlParts = url.split('/');
                    return urlParts[urlParts.length - 1];
                });
            
            if (imagePaths.length > 0) {
                await supabase.storage.from('products').remove(imagePaths);
            }
        }

        const { error } = await supabase.from('products').delete().eq('id', productToDelete.id);
        if (error) {
            if (error.code === '23503') {
                const { error: archiveError } = await supabase.from('products').update({
                    name: productToDelete.name.startsWith('[DELETED]') ? productToDelete.name : '[DELETED] ' + productToDelete.name,
                    category: 'Archived',
                    stock_level: 0
                }).eq('id', productToDelete.id);
                
                if (archiveError) throw archiveError;
                
                toast({
                  title: "Product Archived",
                  description: `"${productToDelete.name}" is part of existing orders and was archived instead of deleted.`,
                });
                refetch();
                return;
            }
            throw error;
        }

        toast({
          title: "Product Deleted",
          description: `"${productToDelete.name}" has been removed from your catalog.`,
        });
        refetch();
    } catch (error: any) {
        console.error("Error deleting product:", error);
        toast({
            variant: 'destructive',
            title: 'Deletion Failed',
            description: `Could not delete "${productToDelete.name}". ${error?.message || ''}`
        });
    }
  }

  const handleBulkDeleteConfirm = async () => {
    if (!supabase || selectedProductIds.length === 0) return;

    const idsToDelete = [...selectedProductIds];
    setShowBulkDeleteConfirm(false);
    setSelectedProductIds([]);

    toast({
      title: "Bulk Deletion Initiated",
      description: `${idsToDelete.length} products are being queued for deletion.`,
    });

    try {
        const { data: productsData } = await supabase
            .from('products')
            .select('images')
            .in('id', idsToDelete);
            
        if (productsData) {
            const allImagePaths = productsData
                .flatMap(p => p.images || [])
                .filter(url => !url.includes('placehold.co'))
                .map(url => {
                    const urlParts = url.split('/');
                    return urlParts[urlParts.length - 1];
                });
                
            if (allImagePaths.length > 0) {
                await supabase.storage.from('products').remove(allImagePaths);
            }
        }

        const { error } = await supabase.from('products').delete().in('id', idsToDelete);
        
        if (error) {
            if (error.code === '23503') {
                for (const id of idsToDelete) {
                    const prod = allVisibleProducts.find((p: FormattedProduct) => p.id === id);
                    if (prod) {
                        await supabase.from('products').update({
                            name: prod.name.startsWith('[DELETED]') ? prod.name : '[DELETED] ' + prod.name,
                            category: 'Archived',
                            stock_level: 0
                        }).eq('id', id);
                    }
                }
                toast({
                  title: "Products Archived",
                  description: `Some products were part of existing orders and were archived instead of permanently deleted.`,
                });
                refetch();
                return;
            }
            throw error;
        }

        toast({
          title: "Bulk Deletion Complete",
          description: `${idsToDelete.length} products have been successfully deleted.`,
        });
        refetch();
    } catch (error) {
        console.error("Bulk delete error", error);
        toast({
            variant: "destructive",
            title: "Bulk Deletion Failed",
            description: `There was an error deleting the products. ${(error as Error)?.message || ''}`,
        });
    }
  };

  return {
    deletingProduct,
    setDeletingProduct,
    editingProduct,
    setEditingProduct,
    viewingDetailsProduct,
    setViewingDetailsProduct,
    viewingHistoryProduct,
    setViewingHistoryProduct,
    selectedProductIds,
    setSelectedProductIds,
    showBulkDeleteConfirm,
    setShowBulkDeleteConfirm,
    currentPage,
    setCurrentPage,
    rowsPerPage,
    setRowsPerPage,
    searchTerm,
    setSearchTerm,
    stockFilter,
    setStockFilter,
    expandedParents,
    setExpandedParents,
    viewingReservedProduct,
    setViewingReservedProduct,
    viewingPackedProduct,
    setViewingPackedProduct,
    viewingAllocatedProduct,
    setViewingAllocatedProduct,
    paginatedProducts,
    totalCount,
    isLoading,
    refetch,
    isManagement,
    totalPages,
    handleDeleteConfirm,
    handleBulkDeleteConfirm,
  };
}
