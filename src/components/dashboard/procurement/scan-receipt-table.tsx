"use client";

import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { ProductPicker } from "./product-picker";
import type { ReceiptScanRow } from "@/types";

interface ScanReceiptTableProps {
  rows: ReceiptScanRow[];
  isManagement: boolean;
  onSelectProduct: (idx: number, product: { id: string; name: string }, existingCode: string | null) => void;
  onAddNewProduct: (idx: number, term: string) => void;
  onUpdateRow: (idx: number, patch: Partial<ReceiptScanRow>) => void;
  onRemoveRow: (idx: number) => void;
}

export function ScanReceiptTable({
  rows,
  isManagement,
  onSelectProduct,
  onAddNewProduct,
  onUpdateRow,
  onRemoveRow,
}: ScanReceiptTableProps) {
  return (
    <div className="border rounded-lg overflow-x-auto">
      <table className="w-full text-left text-sm min-w-[720px]">
        <thead>
          <tr className="bg-slate-50 text-slate-500 border-b">
            <th className="p-2 w-[38%]">Product (match)</th>
            <th className="p-2 text-center w-16">Qty</th>
            {isManagement && <th className="p-2 text-center w-24">Unit Cost</th>}
            <th className="p-2 w-40">Supplier code</th>
            <th className="p-2 w-8"></th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row, idx) => (
            <tr key={idx} className="align-top">
              <td className="p-2 space-y-1">
                <ProductPicker
                  label={row.productName}
                  onSelect={(p) => onSelectProduct(idx, p, null)}
                  onAddNew={(term) => onAddNewProduct(idx, term)}
                />
                {row.productId && row.matchedBy && row.matchedBy !== "manual" && (
                  <span className="text-[10px] text-slate-400">
                    matched by {row.matchedBy}
                    {row.matchedBy === "name" ? ` (${Math.round(row.confidence * 100)}%)` : ""}
                  </span>
                )}
                {!row.productId && row.candidates.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    <span className="text-[10px] text-slate-400 w-full">Did you buy:</span>
                    {row.candidates.map((c) => (
                      <button
                        key={c.productId}
                        type="button"
                        onClick={() => onSelectProduct(idx, { id: c.productId, name: c.productName }, c.existingCode)}
                        className="text-[11px] px-2 py-0.5 rounded-full border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                      >
                        {c.productName}
                      </button>
                    ))}
                  </div>
                )}
                <div className="text-[10px] text-slate-400 truncate" title={row.rawText}>
                  {row.rawText}
                </div>
              </td>
              <td className="p-2 text-center">
                <Input
                  type="number"
                  value={row.qty}
                  onChange={(e) => onUpdateRow(idx, { qty: Number(e.target.value) })}
                  className="h-8 text-center"
                />
              </td>
              {isManagement && (
                <td className="p-2 text-center">
                  <Input
                    type="number"
                    step="0.01"
                    value={row.unitCost}
                    onChange={(e) => onUpdateRow(idx, { unitCost: Number(e.target.value) })}
                    className="h-8 text-right"
                  />
                </td>
              )}
              <td className="p-2">
                {row.code ? (
                  <div className="space-y-1">
                    <Badge variant="outline" className="font-mono text-xs">
                      {row.code}
                    </Badge>
                    <label className="flex items-center gap-1.5 text-[11px] text-slate-500">
                      <Checkbox
                        checked={row.saveCode}
                        disabled={!row.productId}
                        onCheckedChange={(v) => onUpdateRow(idx, { saveCode: !!v })}
                      />
                      {row.existingCode && row.existingCode.toUpperCase() === row.code.toUpperCase()
                        ? "already saved"
                        : "save code for next time"}
                    </label>
                  </div>
                ) : (
                  <span className="text-[11px] text-slate-300">—</span>
                )}
              </td>
              <td className="p-2 text-center">
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => onRemoveRow(idx)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
