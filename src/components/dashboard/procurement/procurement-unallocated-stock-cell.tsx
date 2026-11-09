'use client';

import { useState } from 'react';
import { Pencil, Clock, CheckCircle2 } from 'lucide-react';
import { EditUnallocatedStockDialog } from './edit-unallocated-stock-dialog';

interface Props {
  item: any;
  onRefreshData?: () => void;
}

export function ProcurementUnallocatedStockCell({ item, onRefreshData }: Props) {
  const [editUnallocatedOpen, setEditUnallocatedOpen] = useState(false);

  const displayStock = item.unallocatedStock ?? item.physicalStock ?? 0;

  return (
    <td
      className="p-3 text-center"
      title={`Unallocated stock: ${displayStock} free pieces available on shelf.`}
    >
      <div className="flex flex-col items-center justify-center group/unallocated">
        <button
          type="button"
          onClick={() => setEditUnallocatedOpen(true)}
          className="flex items-center justify-center gap-1 group/num cursor-pointer hover:bg-slate-100 px-2 py-0.5 rounded border border-transparent hover:border-slate-200 transition-all"
          title="Click to edit unallocated stock & view full edit history"
        >
          <span
            className={`font-bold text-lg ${
              displayStock > 0 ? 'text-emerald-700' : 'text-slate-500'
            }`}
          >
            {displayStock}
          </span>
          <Pencil className="w-3.5 h-3.5 text-slate-400 group-hover/num:text-indigo-600 transition-colors" />
        </button>

        {item.unscannedLayawayQty > 0 && (
          <span
            className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 font-medium whitespace-nowrap mt-0.5"
            title={`${item.unscannedLayawayQty} pcs in active Lay-away orders waiting to be scanned/picked`}
          >
            +{item.unscannedLayawayQty} lay-away
          </span>
        )}

        {item.lastEditedAt ? (
          <button
            type="button"
            onClick={() => setEditUnallocatedOpen(true)}
            className={`text-[10px] mt-1 flex items-center justify-center gap-0.5 whitespace-nowrap cursor-pointer hover:underline ${
              item.isVerifiedMatch ? 'text-emerald-700 font-semibold' : 'text-slate-500 hover:text-indigo-600'
            }`}
            title={
              item.isVerifiedMatch
                ? `Confirmed correct on shelf (${displayStock} pcs) on ${new Date(item.lastEditedAt).toLocaleString('en-PH')} by ${item.lastEditedBy || 'Staff'}.`
                : `Manually adjusted ${item.manualAdjustmentCount ?? 1}x. Last: ${new Date(item.lastEditedAt).toLocaleString('en-PH')} by ${item.lastEditedBy || 'Staff'}.`
            }
          >
            {item.isVerifiedMatch ? (
              <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
            ) : (
              <Clock className="w-2.5 h-2.5 text-indigo-500 shrink-0" />
            )}
            {item.isVerifiedMatch ? (
              <span className="text-emerald-700 font-bold">✓ Checked</span>
            ) : (
              (item.manualAdjustmentCount ?? 0) > 1 && (
                <span className="font-bold text-indigo-600">{item.manualAdjustmentCount}×</span>
              )
            )}
            {new Date(item.lastEditedAt).toLocaleDateString('en-PH', {
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
            })}
            {item.lastEditedBy && (
              <span className="text-[9px] text-slate-500 font-medium max-w-[75px] truncate">
                ({item.lastEditedBy})
              </span>
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setEditUnallocatedOpen(true)}
            className="text-[10px] text-slate-400 hover:text-indigo-600 mt-0.5 italic cursor-pointer hover:underline"
            title="Click to view history or set unallocated stock"
          >
            Never adjusted
          </button>
        )}

        <EditUnallocatedStockDialog
          item={item}
          isOpen={editUnallocatedOpen}
          onClose={() => setEditUnallocatedOpen(false)}
          onSuccess={() => {
            if (onRefreshData) {
              onRefreshData();
            } else {
              window.location.reload();
            }
          }}
        />
      </div>
    </td>
  );
}
