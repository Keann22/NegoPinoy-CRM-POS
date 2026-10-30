"use client";

import Link from "next/link";
import { Undo2 } from "lucide-react";

export type SupplierOwed = { qty: number; returnNos: number[]; dueAt: string | null };

/** Under Need to Buy: pieces a supplier still owes from Supplier Returns, so nobody buys them twice. */
export function SupplierOwedChip({ owed }: { owed: SupplierOwed | null | undefined }) {
  if (!owed || owed.qty <= 0) return null;
  const late = !!owed.dueAt && new Date(owed.dueAt).getTime() < Date.now();
  return (
    <Link
      href="/dashboard/inventory/supplier-returns"
      title={`Supplier still owes ${owed.qty} pc(s) as a replacement (return ${owed.returnNos.map((n) => `#${n}`).join(", ")}).${late ? " Past the supplier's waiting limit." : ""}`}
      className={`mt-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
        late ? "border-red-300 bg-red-50 text-red-700 hover:bg-red-100" : "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
      }`}
    >
      <Undo2 className="h-3 w-3" />
      {owed.qty} owed by supplier{late ? " · late" : ""}
    </Link>
  );
}
