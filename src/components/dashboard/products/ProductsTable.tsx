'use client';

import React from 'react';
import { ZoomableImage } from '@/components/ui/zoomable-image';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronDown, ChevronRight, MoreHorizontal } from 'lucide-react';
import { getStockStatus } from '@/types';
import type { FormattedProduct } from '@/types';

/** Price cell: shows sale price with the regular price struck through when on sale. */
function PriceLabel({ product }: { product: FormattedProduct }) {
  if (product.onSale) {
    return (
      <span className="flex flex-col leading-tight">
        {product.regularPriceLabel && (
          <span className="text-muted-foreground text-xs line-through">{product.regularPriceLabel}</span>
        )}
        <span className="text-green-600 dark:text-green-500 font-medium">
          {product.price} <Badge variant="outline" className="ml-1 border-green-600/40 text-green-600 dark:text-green-500">Sale</Badge>
        </span>
      </span>
    );
  }
  return <>{product.price}</>;
}

interface ProductsTableProps {
  products: FormattedProduct[];
  isLoading: boolean;
  selectedProductIds: string[];
  expandedParents: Set<string>;
  isManagement: boolean | undefined;
  onSelectAll: (checked: boolean) => void;
  onSelectOne: (id: string, checked: boolean) => void;
  onToggleExpand: (id: string) => void;
  onViewDetails: (product: FormattedProduct) => void;
  onEdit: (product: FormattedProduct) => void;
  onViewHistory: (product: FormattedProduct) => void;
  onDelete: (product: FormattedProduct) => void;
  onViewReserved: (product: { id: string; name: string }) => void;
  onViewPacked: (product: { id: string; name: string }) => void;
  onViewAllocated: (product: { id: string; name: string }) => void;
}

function StockCell({ product, onViewReserved, onViewPacked, onViewAllocated }: {
  product: FormattedProduct;
  onViewReserved: (p: { id: string; name: string }) => void;
  onViewPacked: (p: { id: string; name: string }) => void;
  onViewAllocated: (p: { id: string; name: string }) => void;
}) {
  const allocatedTarget = { id: product.id, name: product.variantName || product.name };
  return (
    <div className="space-y-1 text-sm">
      <p
        className="font-medium text-foreground cursor-pointer hover:underline"
        onClick={() => onViewAllocated(allocatedTarget)}
      >
        Physical: {(product.quantityOnHand ?? 0) + (product.reservedStock || 0)}
      </p>
      <p
        className="text-muted-foreground cursor-pointer hover:underline"
        onClick={() => onViewAllocated(allocatedTarget)}
      >
        Available: {product.quantityOnHand ?? 0}
      </p>
      {(product.reservedStock || 0) > 0 && (
        <p
          className="text-amber-600 dark:text-amber-400 cursor-pointer hover:underline"
          onClick={() => onViewReserved({ id: product.id, name: product.variantName || product.name })}
        >
          Reserved: {product.reservedStock}
        </p>
      )}
      {(product.packedStock || 0) > 0 && (
        <p
          className="text-blue-600 dark:text-blue-400 cursor-pointer hover:underline"
          onClick={() => onViewPacked({ id: product.id, name: product.variantName || product.name })}
        >
          Packed: {product.packedStock}
        </p>
      )}
    </div>
  );
}

function GroupStockCell({ product, onViewReserved, onViewPacked, onViewAllocated }: {
  product: FormattedProduct;
  onViewReserved: (p: { id: string; name: string }) => void;
  onViewPacked: (p: { id: string; name: string }) => void;
  onViewAllocated: (p: { id: string; name: string }) => void;
}) {
  const totalAvailable = product.children!.reduce((acc, c) => acc + (c.quantityOnHand || 0), 0);
  const totalReserved = product.children!.reduce((acc, c) => acc + (c.reservedStock || 0), 0);
  const totalPacked = product.children!.reduce((acc, c) => acc + (c.packedStock || 0), 0);
  const allocatedTarget = { id: product.id, name: product.name };
  return (
    <div className="space-y-1 text-sm">
      <p
        className="font-medium text-foreground cursor-pointer hover:underline"
        onClick={() => onViewAllocated(allocatedTarget)}
      >
        Physical: {totalAvailable + totalReserved}
      </p>
      <p
        className="text-muted-foreground cursor-pointer hover:underline"
        onClick={() => onViewAllocated(allocatedTarget)}
      >
        Available: {totalAvailable}
      </p>
      {totalReserved > 0 && (
        <p className="text-amber-600 dark:text-amber-400 cursor-pointer hover:underline"
          onClick={() => onViewReserved({ id: product.id, name: product.name })}>
          Reserved: {totalReserved}
        </p>
      )}
      {totalPacked > 0 && (
        <p className="text-blue-600 dark:text-blue-400 cursor-pointer hover:underline"
          onClick={() => onViewPacked({ id: product.id, name: product.name })}>
          Packed: {totalPacked}
        </p>
      )}
    </div>
  );
}

function ProductActionsMenu({ product, isManagement, onViewDetails, onEdit, onViewHistory, onDelete }: {
  product: FormattedProduct;
  isManagement: boolean | undefined;
  onViewDetails: (p: FormattedProduct) => void;
  onEdit: (p: FormattedProduct) => void;
  onViewHistory: (p: FormattedProduct) => void;
  onDelete: (p: FormattedProduct) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button aria-haspopup="true" size="icon" variant="ghost">
          <MoreHorizontal className="h-4 w-4" />
          <span className="sr-only">Toggle menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => onViewDetails(product)}>View Details</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onEdit(product)}>Edit</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onViewHistory(product)}>View History</DropdownMenuItem>
        {isManagement && (
          <DropdownMenuItem
            className="text-destructive focus:text-destructive focus:bg-destructive/10"
            onClick={() => onDelete(product)}
          >
            Delete
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ProductsTable({
  products, isLoading, selectedProductIds, expandedParents, isManagement,
  onSelectAll, onSelectOne, onToggleExpand,
  onViewDetails, onEdit, onViewHistory, onDelete,
  onViewReserved, onViewPacked, onViewAllocated,
}: ProductsTableProps) {
  const allSelected = products.length > 0 && products.every(p => selectedProductIds.includes(p.id));

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[50px]">
            <Checkbox
              onCheckedChange={(checked) => onSelectAll(!!checked)}
              checked={allSelected}
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
          <TableHead className="hidden md:table-cell">Inventory</TableHead>
          <TableHead><span className="sr-only">Actions</span></TableHead>
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

        {products.map((product) => (
          <React.Fragment key={product.id}>
            {/* Parent row */}
            <TableRow data-state={selectedProductIds.includes(product.id) ? 'selected' : undefined}>
              <TableCell>
                <Checkbox
                  onCheckedChange={(checked) => onSelectOne(product.id, !!checked)}
                  checked={selectedProductIds.includes(product.id)}
                  aria-label={`Select product ${product.name}`}
                />
              </TableCell>
              <TableCell className="hidden sm:table-cell">
                <ZoomableImage alt="Product image" className="aspect-square rounded-md object-cover" height={64} src={product.image} width={64} data-ai-hint="product image" />
              </TableCell>
              <TableCell className="font-medium">
                <div className="flex items-center gap-2">
                  {product.children && product.children.length > 0 && (
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onToggleExpand(product.id)}>
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
                {product.children && product.children.length > 0 ? (() => {
                  const total = product.children.reduce((acc, c) => acc + (c.quantityOnHand || 0), 0);
                  const s = getStockStatus(total);
                  return <Badge variant={s.variant}>{s.text}</Badge>;
                })() : (
                  <Badge variant={product.status.variant}>{product.status.text}</Badge>
                )}
              </TableCell>
              <TableCell>
                {product.children && product.children.length > 0
                  ? <span className="text-muted-foreground">-</span>
                  : <PriceLabel product={product} />}
              </TableCell>
              <TableCell className="hidden md:table-cell">{product.shelfLocation || '-'}</TableCell>
              <TableCell className="hidden md:table-cell">
                {product.children && product.children.length > 0
                  ? <GroupStockCell product={product} onViewReserved={onViewReserved} onViewPacked={onViewPacked} onViewAllocated={onViewAllocated} />
                  : <StockCell product={product} onViewReserved={onViewReserved} onViewPacked={onViewPacked} onViewAllocated={onViewAllocated} />
                }
              </TableCell>
              <TableCell>
                <ProductActionsMenu product={product} isManagement={isManagement} onViewDetails={onViewDetails} onEdit={onEdit} onViewHistory={onViewHistory} onDelete={onDelete} />
              </TableCell>
            </TableRow>

            {/* Child rows (variants) */}
            {expandedParents.has(product.id) && product.children?.map(child => (
              <TableRow key={child.id} className="bg-muted/30" data-state={selectedProductIds.includes(child.id) ? 'selected' : undefined}>
                <TableCell>
                  <Checkbox
                    onCheckedChange={(checked) => onSelectOne(child.id, !!checked)}
                    checked={selectedProductIds.includes(child.id)}
                    aria-label={`Select product ${child.name}`}
                  />
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <ZoomableImage alt="Product image" className="aspect-square rounded-md object-cover" height={64} src={child.image} width={64} data-ai-hint="product image" />
                </TableCell>
                <TableCell className="font-medium pl-10">└ {child.variantName || child.name}</TableCell>
                <TableCell><Badge variant={child.status.variant}>{child.status.text}</Badge></TableCell>
                <TableCell><PriceLabel product={child} /></TableCell>
                <TableCell className="hidden md:table-cell">{child.shelfLocation || '-'}</TableCell>
                <TableCell className="hidden md:table-cell">
                  <StockCell product={child} onViewReserved={onViewReserved} onViewPacked={onViewPacked} onViewAllocated={onViewAllocated} />
                </TableCell>
                <TableCell>
                  <ProductActionsMenu product={child} isManagement={isManagement} onViewDetails={onViewDetails} onEdit={onEdit} onViewHistory={onViewHistory} onDelete={onDelete} />
                </TableCell>
              </TableRow>
            ))}
          </React.Fragment>
        ))}
      </TableBody>
    </Table>
  );
}
