'use client';

import React from 'react';
import Image from 'next/image';
import { AlertCircle, AlertTriangle, ArrowRight, Package } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import type { DuplicateMatch } from '@/hooks/useProductForm';

interface DuplicateProductAlertProps {
  duplicateMatch: DuplicateMatch;
  overrideSimilarDuplicate: boolean;
  onOverrideChange: (override: boolean) => void;
  onUseExisting?: (product: { id: string; name: string }) => void;
}

export function DuplicateProductAlert({
  duplicateMatch,
  overrideSimilarDuplicate,
  onOverrideChange,
  onUseExisting,
}: DuplicateProductAlertProps) {
  const isExact = duplicateMatch.matchType === 'exact';

  return (
    <Alert
      className={`relative overflow-hidden border p-4 ${
        isExact
          ? 'border-destructive/50 bg-destructive/5 text-destructive dark:bg-destructive/10'
          : 'border-amber-400 bg-amber-50/70 text-amber-950 dark:bg-amber-950/20 dark:border-amber-800 dark:text-amber-200'
      }`}
    >
      <div className="flex items-start gap-3">
        {isExact ? (
          <AlertCircle className="h-5 w-5 shrink-0 text-destructive mt-0.5" />
        ) : (
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
        )}

        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <AlertTitle className="text-sm font-semibold m-0 leading-none">
              {isExact ? 'Exact Duplicate Detected' : 'Similar Product Found'}
            </AlertTitle>
            {duplicateMatch.similarityScore && !isExact && (
              <Badge variant="outline" className="text-[11px] border-amber-400 bg-amber-100/60 dark:bg-amber-900/40">
                {Math.round(duplicateMatch.similarityScore * 100)}% match
              </Badge>
            )}
          </div>

          <AlertDescription className="text-xs leading-relaxed opacity-90">
            {isExact
              ? 'A product with this exact name already exists in the catalog. Creating duplicate items is disabled to prevent inventory fragmentation.'
              : 'This product name is very similar to an existing catalog item. Please verify whether you should use the existing product or create a variation instead.'}
          </AlertDescription>

          {/* Existing Product Card Preview */}
          <div className="flex items-center gap-3 p-2.5 rounded-md border bg-background/80 text-foreground text-xs shadow-sm">
            <div className="h-12 w-12 rounded bg-muted flex items-center justify-center shrink-0 overflow-hidden relative">
              {duplicateMatch.imageUrl ? (
                <Image
                  src={duplicateMatch.imageUrl}
                  alt={duplicateMatch.name}
                  fill
                  className="object-cover"
                  sizes="48px"
                />
              ) : (
                <Package className="h-6 w-6 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold truncate text-sm">{duplicateMatch.name}</p>
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5">
                {duplicateMatch.sku && <span>SKU: {duplicateMatch.sku}</span>}
                <span>Stock: {duplicateMatch.stockLevel ?? 0}</span>
                <span>Price: ₱{(duplicateMatch.sellingPrice ?? 0).toFixed(2)}</span>
              </div>
            </div>
            {onUseExisting && (
              <Button
                type="button"
                size="sm"
                variant={isExact ? 'destructive' : 'default'}
                className="shrink-0 h-8 text-xs gap-1"
                onClick={() => onUseExisting({ id: duplicateMatch.id, name: duplicateMatch.name })}
              >
                Use Existing
                <ArrowRight className="h-3 w-3" />
              </Button>
            )}
          </div>

          {/* Override Checkbox for Similar (non-exact) Matches */}
          {!isExact && (
            <div className="flex items-start gap-2 pt-1">
              <Checkbox
                id="confirm-different-product"
                checked={overrideSimilarDuplicate}
                onCheckedChange={(checked) => onOverrideChange(Boolean(checked))}
                className="mt-0.5"
              />
              <label
                htmlFor="confirm-different-product"
                className="text-xs leading-snug cursor-pointer select-none font-medium text-foreground"
              >
                I confirm this is a distinctly different product from &ldquo;{duplicateMatch.name}&rdquo; and should be created separately.
              </label>
            </div>
          )}
        </div>
      </div>
    </Alert>
  );
}
