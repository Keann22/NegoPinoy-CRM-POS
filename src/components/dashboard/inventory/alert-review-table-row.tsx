'use client';

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { Package, CheckCircle2, History, Edit3, ShoppingBag } from 'lucide-react';

export interface AlertReviewRowItem {
  productId: string;
  name: string;
  variantName: string | null;
  sku: string | null;
  shelfLocation: string;
  currentStock: number;
  sellingPrice: number | string | null;
  image: string | null;
  alertCount: number;
  latestAlertAt: string;
  firstAlertAt: string;
  latestAnomalyType: string;
  latestAlertNotes: string;
  stockBeforeAlert: number | null;
  openOrdersCount: number;
  openOrdersQty: number;
  lastPhysicalAudit: {
    actorName: string;
    physicalCount: number;
    auditedAt: string;
    notes: string;
  } | null;
}

interface AlertReviewTableRowProps {
  item: AlertReviewRowItem;
  index: number;
  onViewOrders: (item: AlertReviewRowItem) => void;
  onViewTrail: (productId: string) => void;
  onOpenAdjust: (item: AlertReviewRowItem) => void;
}

export function AlertReviewTableRow({
  item,
  index,
  onViewOrders,
  onViewTrail,
  onOpenAdjust
}: AlertReviewTableRowProps) {
  const isNeg = item.currentStock < 0;
  const isZero = item.currentStock === 0;

  return (
    <tr className="hover:bg-slate-50 transition-colors">
      <td className="p-3 text-center font-mono text-[11px] text-muted-foreground">
        {index + 1}
      </td>

      {/* Product Name & Details */}
      <td className="p-3">
        <div className="flex items-center gap-2.5">
          {item.image ? (
            <img src={item.image} alt={item.name} className="w-9 h-9 object-cover rounded border shrink-0" />
          ) : (
            <div className="w-9 h-9 bg-slate-100 rounded border flex items-center justify-center shrink-0">
              <Package className="h-4 w-4 text-slate-400" />
            </div>
          )}
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => onViewOrders(item)}
              className="font-semibold text-slate-900 block truncate text-left hover:text-indigo-600 hover:underline"
              title="Click to view active orders and lay-aways"
            >
              {item.name} {item.variantName && !item.name.includes(item.variantName) ? `[${item.variantName}]` : ''}
            </button>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-mono mt-0.5">
              <span>SKU: {item.sku || 'N/A'}</span>
              {item.sellingPrice && <span>₱{Number(item.sellingPrice).toFixed(2)}</span>}
            </div>
          </div>
        </div>
      </td>

      {/* Shelf Location */}
      <td className="p-3 text-center font-mono font-medium text-slate-700">
        {item.shelfLocation}
      </td>

      {/* Current Inventory */}
      <td className="p-3 text-center">
        <span className={`inline-block px-2.5 py-1 rounded font-bold font-mono text-xs ${
          isNeg 
            ? 'bg-rose-100 text-rose-700 border border-rose-200' 
            : isZero 
            ? 'bg-amber-100 text-amber-800 border border-amber-200' 
            : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
        }`}>
          {item.currentStock}
        </span>
      </td>

      {/* Active Orders Demand (Clickable to view active orders & lay-aways!) */}
      <td className="p-3 text-center">
        <button
          type="button"
          onClick={() => onViewOrders(item)}
          className="group inline-flex flex-col items-center p-1.5 rounded-md hover:bg-indigo-50 border border-transparent hover:border-indigo-200 transition-colors"
          title="Click to see all active orders including Lay-aways and their statuses"
        >
          {item.openOrdersQty > 0 ? (
            <>
              <span className="font-bold text-indigo-600 group-hover:underline font-mono flex items-center gap-1">
                <ShoppingBag className="h-3.5 w-3.5 text-indigo-500" />
                {item.openOrdersQty} pcs
              </span>
              <span className="text-[10px] text-muted-foreground group-hover:text-indigo-700">
                ({item.openOrdersCount} order{item.openOrdersCount > 1 ? 's' : ''} • view)
              </span>
            </>
          ) : (
            <span className="text-muted-foreground text-[11px] group-hover:text-indigo-600 group-hover:underline flex items-center gap-1">
              <ShoppingBag className="h-3 w-3 text-slate-400 group-hover:text-indigo-500" />
              0 needed <span className="text-[10px] text-slate-400">(view)</span>
            </span>
          )}
        </button>
      </td>

      {/* Staff Audit Status */}
      <td className="p-3">
        {item.lastPhysicalAudit ? (
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
              <span className="font-semibold text-slate-800">
                {item.lastPhysicalAudit.actorName}: {item.lastPhysicalAudit.physicalCount} pcs
              </span>
            </div>
            <span className="text-[10px] text-muted-foreground block">
              {format(new Date(item.lastPhysicalAudit.auditedAt), 'MMM d, h:mm a')}
            </span>
          </div>
        ) : (
          <span className="text-muted-foreground text-[11px] italic">
            Pending audit
          </span>
        )}
      </td>

      {/* Alert Info */}
      <td className="p-3 text-center">
        <Badge variant="outline" className="font-bold text-[10px] py-0.5">
          {item.alertCount}x sent
        </Badge>
        <span className="text-[10px] text-muted-foreground block mt-0.5">
          {format(new Date(item.latestAlertAt), 'h:mm a')}
        </span>
      </td>

      {/* Actions */}
      <td className="p-3 text-right pr-4">
        <div className="flex items-center justify-end gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onViewOrders(item)}
            className="h-7 px-2 text-[11px] gap-1 font-medium text-slate-700 hover:text-indigo-600 hover:bg-slate-100"
            title="View all active orders including Lay-aways and their statuses"
          >
            <ShoppingBag className="h-3 w-3" />
            Orders
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => onViewTrail(item.productId)}
            className="h-7 px-2.5 text-[11px] gap-1 font-semibold text-indigo-700 hover:text-indigo-800 hover:bg-indigo-50 border-indigo-200"
            title="View complete audit & inventory movement trail"
          >
            <History className="h-3 w-3" />
            Trail
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => onOpenAdjust(item)}
            className="h-7 px-2 text-[11px] gap-1 font-medium"
            title="Set physical shelf count"
          >
            <Edit3 className="h-3 w-3" />
            Set Count
          </Button>
        </div>
      </td>
    </tr>
  );
}
