'use client';

import Image from 'next/image';
import { MoreHorizontal, ChevronDown, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
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
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useCollection, useUser, useSupabase } from '@/firebase';
import { AddProductDialog } from '@/components/dashboard/add-product-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { BulkUploadProductsDialog } from '@/components/dashboard/bulk-upload-products-dialog';
import React, { useState, useMemo } from 'react';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EditProductDialog } from '@/components/dashboard/edit-product-dialog';
import { ViewProductHistoryDialog } from '@/components/dashboard/view-product-history-dialog';
import { ViewProductDetailsDialog } from '@/components/dashboard/view-product-details-dialog';
import { useUserProfile } from '@/hooks/useUserProfile';

// Matches the Firestore document structure for a product
export type Product = {
  id: string;
  name: string;
  sku: string;
  description: string;
  categoryId: string;
  supplierId?: string;
  images: string[];
  sellingPrice: number;
  quantityOnHand: number;
  shelf_location?: string;
  supplier_pricing?: any;
  initial_unit_cost?: number;
  parentId?: string | null;
  variantName?: string | null;
};

export type FormattedProduct = Product & {
    status: { text: 'In Stock' | 'Low Stock' | 'Out of Stock'; variant: 'outline' | 'default' | 'destructive'; };
    price: string;
    image: string;
    shelfLocation?: string;
    supplierPricing?: any[];
    children?: FormattedProduct[];
}

const getStatus = (stock: number | undefined | null): { text: 'In Stock' | 'Low Stock' | 'Out of Stock'; variant: 'outline' | 'default' | 'destructive' } => {
  const currentStock = stock ?? 0;
  if (currentStock <= 0) {
    return { text: 'Out of Stock', variant: 'destructive' };
  }
  if (currentStock <= 10) {
    return { text: 'Low Stock', variant: 'default' };
  }
  return { text: 'In Stock', variant: 'outline' };
};

export default function ProductsPage() {
  const supabase = useSupabase();
  const { user } = useUser();
  const { userProfile } = useUserProfile();
  const [deletingProduct, setDeletingProduct] = useState<FormattedProduct | null>(null);
  const [editingProduct, setEditingProduct] = useState<FormattedProduct | null>(null);
  const [viewingDetailsProduct, setViewingDetailsProduct] = useState<FormattedProduct | null>(null);
  const [viewingHistoryProduct, setViewingHistoryProduct] = useState<FormattedProduct | null>(null);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [stockFilter, setStockFilter] = useState('all');
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());

  const isManagement = useMemo(() => userProfile?.roles?.some(r => ['Admin', 'Owner'].includes(r)), [userProfile]);

  const productsQuery = useMemo(
    () => (supabase && user ? 'products' : null),
    [supabase, user]
  );

  const { data: products, isLoading, refetch } = useCollection<Omit<Product, 'id'>>(productsQuery);

  const rawFormattedProducts: FormattedProduct[] = useMemo(() => {
    if (!products) return [];
    return products.map(p => {
      let sp = p.supplier_pricing || [];
      if (sp.length === 0 && p.initial_unit_cost) {
          sp = [{ supplierName: 'Initial Stock', unitCost: p.initial_unit_cost }];
      }
      return {
        ...p,
        quantityOnHand: p.quantityOnHand ?? 0,
        status: getStatus(p.quantityOnHand),
        price: `₱${(Number(p.sellingPrice) || 0).toFixed(2)}`,
        image: p.images?.[0] || 'https://placehold.co/64x64',
        shelfLocation: p.shelf_location || "",
        supplierPricing: sp,
      };
    });
  }, [products]);

  const formattedProducts: FormattedProduct[] = useMemo(() => {
    if (!rawFormattedProducts) return [];
    const parents = rawFormattedProducts.filter(p => !p.parentId);
    const children = rawFormattedProducts.filter(p => p.parentId);

    return parents.map(parent => {
        const productChildren = children.filter(c => c.parentId === parent.id);
        return {
            ...parent,
            children: productChildren.length > 0 ? productChildren : undefined
        };
    });
  }, [rawFormattedProducts]);

  const filteredProducts = useMemo(() => {
    let results = formattedProducts;

    // Filter by stock status
    if (stockFilter === 'in-stock') {
      results = results.filter(product => (product.quantityOnHand ?? 0) > 0);
    } else if (stockFilter === 'no-stock') {
      results = results.filter(product => (product.quantityOnHand ?? 0) === 0);
    } else if (stockFilter === 'negative-stock') {
        results = results.filter(product => (product.quantityOnHand ?? 0) < 0);
    }

    // Filter by search term
    if (searchTerm) {
      results = results.filter(product =>
        product.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    return results;
  }, [formattedProducts, searchTerm, stockFilter]);

  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
  const paginatedProducts = filteredProducts.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );
  const startIndex = filteredProducts.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0;
  const endIndex = filteredProducts.length > 0 ? Math.min(currentPage * itemsPerPage, filteredProducts.length) : 0;


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
        if (error) throw error;

        toast({
          title: "Product Deleted",
          description: `"${productToDelete.name}" has been removed from your catalog.`,
        });
    } catch (error) {
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
        if (error) throw error;

        toast({
          title: "Bulk Deletion Complete",
          description: `${idsToDelete.length} products have been successfully deleted.`,
        });
    } catch (error) {
        console.error("Bulk delete error", error);
        toast({
            variant: "destructive",
            title: "Bulk Deletion Failed",
            description: `There was an error deleting the products. ${error?.message || ''}`,
        });
    }
  };

  const areAllFilteredSelected = filteredProducts.length > 0 && filteredProducts.every(p => selectedProductIds.includes(p.id));

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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">
                  <Checkbox
                    onCheckedChange={(checked) => {
                        if (checked) {
                            setSelectedProductIds(prev => Array.from(new Set([...prev, ...filteredProducts.map(p => p.id)])));
                        } else {
                            const filteredIds = new Set(filteredProducts.map(p => p.id));
                            setSelectedProductIds(prev => prev.filter(id => !filteredIds.has(id)));
                        }
                    }}
                    checked={areAllFilteredSelected}
                    aria-label="Select all"
                  />
                </TableHead>
                <TableHead className="hidden w-[100px] sm:table-cell">
                  <span className="sr-only">Image</span>
                </TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Price</TableHead>
                <TableHead className="hidden md:table-cell">Location</TableHead>
                <TableHead className="hidden md:table-cell">
                  Stock
                </TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && Array.from({ length: 10 }).map((_, i) => (
                  <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                      <TableCell className="hidden sm:table-cell"><Skeleton className="aspect-square rounded-md h-16 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-20 rounded-full" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-12" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-8" /></TableCell>
                  </TableRow>
              ))}
              {paginatedProducts && paginatedProducts.map((product) => (
                <React.Fragment key={product.id}>
                  <TableRow data-state={selectedProductIds.includes(product.id) ? 'selected' : undefined}>
                    <TableCell>
                      <Checkbox
                          onCheckedChange={(checked) => {
                              setSelectedProductIds((prevIds) =>
                              checked
                                  ? [...prevIds, product.id]
                                  : prevIds.filter((id) => id !== product.id)
                              );
                          }}
                          checked={selectedProductIds.includes(product.id)}
                          aria-label={`Select product ${product.name}`}
                      />
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Image
                        alt="Product image"
                        className="aspect-square rounded-md object-cover"
                        height="64"
                        src={product.image}
                        width="64"
                        data-ai-hint="product image"
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                          {product.children && product.children.length > 0 && (
                              <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-6 w-6" 
                                  onClick={() => {
                                      setExpandedParents(prev => {
                                          const next = new Set(prev);
                                          if (next.has(product.id)) next.delete(product.id);
                                          else next.add(product.id);
                                          return next;
                                      });
                                  }}
                              >
                                  {expandedParents.has(product.id) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                              </Button>
                          )}
                          {product.name}
                          {product.children && product.children.length > 0 && (
                              <Badge variant="secondary" className="ml-2">{product.children.length} variations</Badge>
                          )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {product.children && product.children.length > 0 ? (
                          <Badge variant={getStatus(product.children.reduce((acc, c) => acc + (c.quantityOnHand || 0), 0)).variant}>
                              {getStatus(product.children.reduce((acc, c) => acc + (c.quantityOnHand || 0), 0)).text}
                          </Badge>
                      ) : (
                          <Badge variant={product.status.variant}>{product.status.text}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {product.children && product.children.length > 0 ? (
                        <span className="text-muted-foreground">-</span>
                      ) : (
                        product.price
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{product.shelfLocation || '-'}</TableCell>
                    <TableCell className="hidden md:table-cell">
                      {product.children && product.children.length > 0 ? (
                          product.children.reduce((acc, c) => acc + (c.quantityOnHand || 0), 0)
                      ) : (
                          product.quantityOnHand ?? 0
                      )}
                    </TableCell>
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
                          <DropdownMenuItem onClick={() => setViewingDetailsProduct(product)}>View Details</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setEditingProduct(product)}>Edit</DropdownMenuItem>
                          {isManagement && <DropdownMenuItem>Duplicate</DropdownMenuItem>}
                          <DropdownMenuItem onClick={() => setViewingHistoryProduct(product)}>View History</DropdownMenuItem>
                          {isManagement && (
                              <DropdownMenuItem
                              className="text-destructive focus:text-destructive focus:bg-destructive/10"
                              onClick={() => setDeletingProduct(product)}
                              >
                              Delete
                              </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                  
                  {expandedParents.has(product.id) && product.children?.map(child => (
                    <TableRow key={child.id} className="bg-muted/30" data-state={selectedProductIds.includes(child.id) ? 'selected' : undefined}>
                        <TableCell>
                          <Checkbox
                              onCheckedChange={(checked) => {
                                  setSelectedProductIds((prevIds) =>
                                  checked
                                      ? [...prevIds, child.id]
                                      : prevIds.filter((id) => id !== child.id)
                                  );
                              }}
                              checked={selectedProductIds.includes(child.id)}
                              aria-label={`Select product ${child.name}`}
                          />
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <Image
                            alt="Product image"
                            className="aspect-square rounded-md object-cover"
                            height="64"
                            src={child.image}
                            width="64"
                            data-ai-hint="product image"
                          />
                        </TableCell>
                        <TableCell className="font-medium pl-10">
                            └ {child.variantName || child.name}
                        </TableCell>
                        <TableCell>
                            <Badge variant={child.status.variant}>{child.status.text}</Badge>
                        </TableCell>
                        <TableCell>{child.price}</TableCell>
                        <TableCell className="hidden md:table-cell">{child.shelfLocation || '-'}</TableCell>
                        <TableCell className="hidden md:table-cell">
                            {child.quantityOnHand ?? 0}
                        </TableCell>
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
                                  <DropdownMenuItem onClick={() => setViewingDetailsProduct(child)}>View Details</DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => setEditingProduct(child)}>Edit</DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => setViewingHistoryProduct(child)}>View History</DropdownMenuItem>
                                  {isManagement && (
                                      <DropdownMenuItem
                                      className="text-destructive focus:text-destructive focus:bg-destructive/10"
                                      onClick={() => setDeletingProduct(child)}
                                      >
                                      Delete
                                      </DropdownMenuItem>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                        </TableCell>
                    </TableRow>
                  ))}
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
          {!isLoading && filteredProducts.length === 0 && (
              <div className="flex flex-col items-center justify-center text-center border-2 border-dashed rounded-lg p-12 mt-4">
                  <p className="text-lg font-semibold">No products found</p>
                  <p className="text-muted-foreground mt-2">
                      {searchTerm ? `Your search for "${searchTerm}" did not match any products.` : `Click "Add Product" to get started.`}
                  </p>
              </div>
          )}
        </CardContent>
        {filteredProducts.length > 0 && (
          <CardFooter className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground">
              Showing <strong>{startIndex}-{endIndex}</strong> of <strong>{filteredProducts.length}</strong> products
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

      <EditProductDialog 
        product={editingProduct}
        open={!!editingProduct}
        onOpenChange={(isOpen) => !isOpen && setEditingProduct(null)}
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
    </>
  );
}
