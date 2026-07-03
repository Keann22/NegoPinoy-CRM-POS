'use client';

import { Button } from '@/components/ui/button';
import {
  Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useSupabase } from '@/lib/supabase/hooks';
import { AddProductDialog, EditProductDialog } from '@/components/dashboard/product-dialog';
import { BulkUploadProductsDialog } from '@/components/dashboard/bulk-upload-products-dialog';
import { ReservedStockDialog } from '@/components/dashboard/reserved-stock-dialog';
import { ViewProductHistoryDialog } from '@/components/dashboard/view-product-history-dialog';
import { ViewProductDetailsDialog } from '@/components/dashboard/view-product-details-dialog';
import { useUserProfile } from '@/hooks/useUserProfile';
import { ProductsTable } from '@/components/dashboard/products/ProductsTable';
import { useState, useMemo, useEffect } from 'react';

import type { FormattedProduct } from '@/types';
import { useProducts } from '@/hooks/useProducts';

// Re-export for any components that still import FormattedProduct from this page
export type { FormattedProduct } from '@/types';

export default function ProductsPage() {
  const supabase = useSupabase();
  const { userProfile } = useUserProfile();
  const [deletingProduct, setDeletingProduct] = useState<FormattedProduct | null>(null);
  const [editingProduct, setEditingProduct] = useState<FormattedProduct | null>(null);
  const [viewingDetailsProduct, setViewingDetailsProduct] = useState<FormattedProduct | null>(null);
  const [viewingHistoryProduct, setViewingHistoryProduct] = useState<FormattedProduct | null>(null);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const { toast } = useToast();
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

  // Debounce the search box before it hits the database - otherwise every
  // keystroke would fire a new query.
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState(searchTerm);
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearchTerm(searchTerm), 300);
    return () => clearTimeout(handle);
  }, [searchTerm]);

  // ── Domain hook ────────────────────────────────────────────────────────────
  // Search, stock filter, and pagination all happen at the database query
  // level - only the current page of products is ever fetched, so this
  // scales regardless of catalog size (see ARCHITECTURE.md, "1000-row query cap").
  const { products: paginatedProducts, totalCount, isLoading, refetch } = useProducts({
    searchTerm: debouncedSearchTerm,
    stockFilter,
    page: currentPage,
    pageSize: rowsPerPage,
  });

  const isManagement = useMemo(() => userProfile?.roles?.some(r => ['Admin', 'Owner'].includes(r)), [userProfile]);

  // Flat view of everything currently loaded (this page's parents + their
  // variants) - used for lookups like the archive-rename fallback below.
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
        // Delete images from Storage
        if (productToDelete.images && productToDelete.images.length > 0) {
            const imagePaths = productToDelete.images
                .filter(url => !url.includes('placehold.co'))
                .map(url => {
                    const urlParts = url.split('/');
                    return urlParts[urlParts.length - 1]; // get file name
                });
            
            if (imagePaths.length > 0) {
                await supabase.storage.from('products').remove(imagePaths);
            }
        }

        const { error } = await supabase.from('products').delete().eq('id', productToDelete.id);
        if (error) {
            if (error.code === '23503') {
                // Archive instead
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
        // 1. Fetch images to delete
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

        // 2. Delete rows
        const { error } = await supabase.from('products').delete().in('id', idsToDelete);
        
        if (error) {
            if (error.code === '23503') {
                // Some or all are tied to orders, archive them instead
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

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="font-headline">Products</CardTitle>
            <CardDescription>
              Manage your products and view their inventory status.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <BulkUploadProductsDialog />
            <AddProductDialog onProductAdded={refetch} />
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
                <Input
                placeholder="Search products by name..."
                value={searchTerm}
                onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                }}
                className="max-w-sm"
                />
                <Select value={stockFilter} onValueChange={(value) => {
                    setStockFilter(value);
                    setCurrentPage(1);
                }}>
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Filter by stock" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Products</SelectItem>
                        <SelectItem value="in-stock">In Stock</SelectItem>
                        <SelectItem value="no-stock">No Stock</SelectItem>
                        <SelectItem value="negative-stock">Negative Stock</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            {selectedProductIds.length > 0 && isManagement && (
                <Button
                    variant="destructive"
                    onClick={() => setShowBulkDeleteConfirm(true)}
                >
                    Delete Selected ({selectedProductIds.length})
                </Button>
            )}
          </div>
          <ProductsTable
            products={paginatedProducts}
            isLoading={isLoading}
            selectedProductIds={selectedProductIds}
            expandedParents={expandedParents}
            isManagement={isManagement}
            onSelectAll={(checked) => {
              if (checked) {
                setSelectedProductIds(prev => Array.from(new Set([...prev, ...paginatedProducts.map(p => p.id)])));
              } else {
                const paginatedIds = new Set(paginatedProducts.map(p => p.id));
                setSelectedProductIds(prev => prev.filter(id => !paginatedIds.has(id)));
              }
            }}
            onSelectOne={(id, checked) =>
              setSelectedProductIds(prev => checked ? [...prev, id] : prev.filter(x => x !== id))
            }
            onToggleExpand={(id) => setExpandedParents(prev => {
              const next = new Set(prev);
              if (next.has(id)) next.delete(id); else next.add(id);
              return next;
            })}
            onViewDetails={setViewingDetailsProduct}
            onEdit={setEditingProduct}
            onViewHistory={setViewingHistoryProduct}
            onDelete={setDeletingProduct}
            onViewReserved={setViewingReservedProduct}
            onViewPacked={setViewingPackedProduct}
          />
          {!isLoading && totalCount === 0 && (
              <div className="flex flex-col items-center justify-center text-center border-2 border-dashed rounded-lg p-12 mt-4">
                  <p className="text-lg font-semibold">No products found</p>
                  <p className="text-muted-foreground mt-2">
                      {searchTerm ? `Your search for "${searchTerm}" did not match any products.` : `Click "Add Product" to get started.`}
                  </p>
              </div>
          )}
        </CardContent>
        {totalCount > 0 && (
          <CardFooter className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-2">
              <div className="text-sm text-muted-foreground">
                Showing <strong>{(currentPage - 1) * rowsPerPage + 1}-{Math.min(currentPage * rowsPerPage, totalCount)}</strong> of <strong>{totalCount}</strong> items
              </div>
              <div className="flex items-center gap-2">
                <Select value={rowsPerPage.toString()} onValueChange={(val) => { setRowsPerPage(Number(val)); setCurrentPage(1); }}>
                  <SelectTrigger className="w-[70px] h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="20">20</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex items-center border rounded-md h-9 px-1">
                  <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>Prev</Button>
                  <span className="text-sm mx-2 min-w-[3rem] text-center">{currentPage} / {totalPages}</span>
                  <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>Next</Button>
                </div>
              </div>
          </CardFooter>
        )}
      </Card>

      <EditProductDialog 
        product={editingProduct}
        open={!!editingProduct}
        onOpenChange={(isOpen) => !isOpen && setEditingProduct(null)}
        onSuccess={() => refetch()}
      />

      <ViewProductDetailsDialog
        product={viewingDetailsProduct}
        open={!!viewingDetailsProduct}
        onOpenChange={(isOpen) => !isOpen && setViewingDetailsProduct(null)}
      />

      <ViewProductHistoryDialog
        product={viewingHistoryProduct}
        open={!!viewingHistoryProduct}
        onOpenChange={(isOpen) => !isOpen && setViewingHistoryProduct(null)}
      />

      <AlertDialog open={!!deletingProduct} onOpenChange={(isOpen) => !isOpen && setDeletingProduct(null)}>
        <AlertDialogContent>
            <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
                This action will permanently delete the product "{deletingProduct?.name}". This action cannot be undone.
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

      <AlertDialog open={showBulkDeleteConfirm} onOpenChange={setShowBulkDeleteConfirm}>
        <AlertDialogContent>
            <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
                This action will permanently delete the {selectedProductIds.length} selected products. This action cannot be undone.
            </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={handleBulkDeleteConfirm}
            >
                Delete
            </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <ReservedStockDialog
          productId={viewingReservedProduct?.id || ''}
          productName={viewingReservedProduct?.name || ''}
          isOpen={!!viewingReservedProduct}
          onClose={() => setViewingReservedProduct(null)}
      />
      <ReservedStockDialog
          productId={viewingPackedProduct?.id || ''}
          productName={viewingPackedProduct?.name || ''}
          isOpen={!!viewingPackedProduct}
          onClose={() => setViewingPackedProduct(null)}
          statusFilter={['Packed']}
          title="Packed Stock Details"
      />
    </>
  );
}
