"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, PackageCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useSupplierReturns } from "@/hooks/useSupplierReturns";

// "Replacements from suppliers": bad items the owners handed back. When the
// supplier's replacement arrives, staff count it in here and it goes back on
// stock. No supplier names or costs are shown (the API strips them for staff).
export function ReplacementsToReceive() {
  const { toast } = useToast();
  const { data, act } = useSupplierReturns();
  const [qty, setQty] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const waiting = (data?.returns || [])
    .filter((r) => r.status === "with_supplier" && r.openQty > 0)
    .sort((a, b) => Number(b.customerWaiting) - Number(a.customerWaiting) || b.daysWaiting - a.daysWaiting);

  if (waiting.length === 0) return null;

  const receive = async (id: string, name: string, max: number) => {
    const n = Math.round(Number(qty[id]));
    if (!(n > 0) || n > max) {
      toast({ title: `Enter 1 to ${max}`, variant: "destructive" });
      return;
    }
    setSavingId(id);
    try {
      await act({ action: "replacement", id, qty: n });
      setQty((q) => ({ ...q, [id]: "" }));
      toast({ title: "Replacement received", description: `${n} × ${name} added back to stock.` });
    } catch (e) {
      toast({ title: "Could not save", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setSavingId(null);
    }
  };

  return (
    <Card className="border-sky-300">
      <CardHeader className="bg-sky-50/60 pb-3">
        <CardTitle className="flex items-center gap-2 text-lg text-sky-900">
          <PackageCheck className="h-5 w-5" /> Replacements from suppliers ({waiting.length})
        </CardTitle>
        <CardDescription className="text-sky-900/80">
          Damaged items the owners returned. When a replacement arrives, enter how many came and tap Receive.{" "}
          <Link href="/dashboard/inventory/supplier-returns" className="underline">All supplier returns</Link>
        </CardDescription>
      </CardHeader>
      <CardContent className="divide-y p-0">
        {waiting.map((r) => (
          <div key={r.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-slate-900">{r.productName}</p>
              <p className="text-xs text-muted-foreground">
                Return #{r.returnNo} · {r.reason} · waiting {r.daysWaiting} day(s)
                {r.customerWaiting && <span className="ml-1 font-semibold text-amber-700">· customer waiting</span>}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Owed {r.openQty}</span>
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={r.openQty}
                placeholder="Qty"
                className="h-9 w-20"
                value={qty[r.id] ?? ""}
                onChange={(e) => setQty((q) => ({ ...q, [r.id]: e.target.value }))}
              />
              <Button size="sm" onClick={() => receive(r.id, r.productName, r.openQty)} disabled={savingId === r.id || !qty[r.id]}>
                {savingId === r.id && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Receive
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
