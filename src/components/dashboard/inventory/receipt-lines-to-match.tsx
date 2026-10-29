"use client";

import { useState } from "react";
import { Loader2, ScanText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PendingProductSearch } from "@/components/dashboard/inventory/pending-product-search";
import { useReceiptLinesToMatch } from "@/hooks/useReceiptLinesToMatch";

type Picked = { id: string; name: string };

// "From receipts: match these". Only the receipt's item text is shown: no
// price, quantity or supplier. Matching records the purchase; the item then
// appears in Pending Incoming Items to be counted in.
export function ReceiptLinesToMatch({ onMatched, refreshKey = 0 }: { onMatched: () => void; refreshKey?: number }) {
  const { lines, savingId, resolve } = useReceiptLinesToMatch(onMatched, refreshKey);
  const [picked, setPicked] = useState<Record<string, Picked>>({});

  if (lines.length === 0) return null;

  return (
    <Card className="border-amber-300">
      <CardHeader className="bg-amber-50/60 pb-3">
        <CardTitle className="flex items-center gap-2 text-lg text-amber-900">
          <ScanText className="h-5 w-5" /> From receipts: match these ({lines.length})
        </CardTitle>
        <CardDescription className="text-amber-900/80">
          The owners snapped these receipts, but the system wasn&apos;t sure which product each line is.
          Hold the item, pick the product it matches, and it moves to the list below to count in.
        </CardDescription>
      </CardHeader>
      <CardContent className="divide-y p-0">
        {lines.map((line) => {
          const choice = picked[line.id];
          const busy = savingId === line.id;
          return (
            <div key={line.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
              <p className="min-w-0 flex-1 font-mono text-sm font-semibold text-slate-900">&quot;{line.description}&quot;</p>
              <div className="flex flex-wrap items-center gap-2">
                {choice ? (
                  <>
                    <span className="max-w-[220px] truncate rounded-md border bg-white px-2 py-1 text-sm" title={choice.name}>{choice.name}</span>
                    <Button size="sm" className="bg-green-600 text-white hover:bg-green-700" disabled={busy}
                      onClick={() => resolve(line.id, "product", choice.id)}>
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm"}
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busy}
                      onClick={() => setPicked((prev) => { const n = { ...prev }; delete n[line.id]; return n; })}>
                      Change
                    </Button>
                  </>
                ) : (
                  <div className="w-[230px]">
                    <PendingProductSearch
                      label="Pick the product"
                      onProductSelect={(p) => setPicked((prev) => ({
                        ...prev,
                        [line.id]: { id: p.id, name: p.variant_name && !p.name.includes(p.variant_name) ? `${p.name} [${p.variant_name}]` : p.name },
                      }))}
                    />
                  </div>
                )}
                <Button size="sm" variant="outline" disabled={busy} title="Bag, discount, delivery fee, etc."
                  onClick={() => resolve(line.id, "not_product")}>
                  Not a product
                </Button>
                <Button size="sm" variant="outline" disabled={busy} title="We don't have this product yet. The owners will add it."
                  onClick={() => resolve(line.id, "not_in_list")}>
                  Not in our list
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
