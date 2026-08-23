"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { Loader2, Trash2, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AddProductDialog } from "@/components/dashboard/product-dialog";

type Candidate = { productId: string; productName: string; sku: string | null; existingCode: string | null };

type ScannedLine = {
  rawText: string;
  qty: number;
  unitCost: number;
  code: string | null;
  match: (Candidate & { matchedBy: string; confidence: number }) | null;
  candidates: Candidate[];
};

type Row = {
  rawText: string;
  qty: number;
  unitCost: number;
  code: string | null;
  productId: string | null;
  productName: string;
  existingCode: string | null;
  matchedBy: string | null;
  confidence: number;
  candidates: Candidate[];
  saveCode: boolean;
};

const fileToDataUri = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

// Phone photos are multi-megabyte; sent raw as base64 they blow past Vercel's
// ~4.5MB request-body limit and make the vision read slow enough to time out.
// Downscale to a sane max dimension and re-encode as JPEG before uploading —
// a few hundred KB, still sharp enough to read a receipt. Falls back to the
// original file if the browser canvas path fails.
const MAX_DIM = 1600;
const JPEG_QUALITY = 0.7;

const downscaleImage = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("no canvas context"));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", JPEG_QUALITY));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image load failed"));
    };
    img.src = url;
  });

/** Local product search + "add new" picker (no react-hook-form dependency). */
function ProductPicker({
  label,
  onSelect,
  onAddNew,
}: {
  label: string;
  onSelect: (p: { id: string; name: string }) => void;
  onAddNew: (term: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<{ id: string; name: string; sku?: string }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handler = setTimeout(async () => {
      if (search.trim().length < 2) {
        setResults([]);
        return;
      }
      setLoading(true);
      try {
        const supabase = createClient();
        let query = supabase.from("products").select("id, name, sku").not("name", "ilike", "[DELETED]%");
        search
          .split(" ")
          .filter((w) => w.trim() !== "")
          .forEach((w) => {
            query = query.or(`name.ilike.%${w}%,variant_name.ilike.%${w}%`);
          });
        const { data } = await query.limit(10);
        setResults(data || []);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(handler);
  }, [search, open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="w-full justify-start font-normal text-left truncate">
          {label || "Search product..."}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search products..." value={search} onValueChange={setSearch} />
          <CommandList>
            {loading && <CommandItem disabled>Searching...</CommandItem>}
            {!loading && results.length > 0 && (
              <CommandGroup>
                {results.map((p) => (
                  <CommandItem
                    key={p.id}
                    value={p.id}
                    onSelect={() => {
                      onSelect({ id: p.id, name: p.name });
                      setOpen(false);
                    }}
                  >
                    {p.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {!loading && search.trim().length > 1 && (
              <>
                {results.length > 0 && <CommandSeparator />}
                <CommandItem
                  value={`${search}-add-new`}
                  className="text-primary cursor-pointer"
                  onSelect={() => {
                    onAddNew(search.trim());
                    setOpen(false);
                  }}
                >
                  + Add &quot;{search.trim()}&quot; as new product
                </CommandItem>
              </>
            )}
            <CommandEmpty>{search.trim().length < 2 ? "Type to search products." : "No products found."}</CommandEmpty>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function ScanReceiptDialog({
  open,
  onOpenChange,
  supplierId,
  supplierName,
  tableItems,
  isManagement,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplierId: string | null;
  supplierName: string;
  tableItems: any[];
  isManagement: boolean;
  onConfirm: (purchases: { productId: string; productName: string; qty: number; cost: number; supplierId: string | null }[]) => void;
}) {
  const { toast } = useToast();
  const [isScanning, setIsScanning] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [engine, setEngine] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);

  const [addProductOpen, setAddProductOpen] = useState(false);
  const [addProductInitial, setAddProductInitial] = useState<any>();
  const [addProductRowIdx, setAddProductRowIdx] = useState<number | null>(null);

  // Reset when the dialog closes so the next open starts clean.
  useEffect(() => {
    if (!open) {
      setRows([]);
      setPreviewUrl(null);
      setEngine(null);
      setIsScanning(false);
    }
  }, [open]);

  const lineToRow = (line: ScannedLine): Row => {
    const code = line.code;
    const existingCode = line.match?.existingCode ?? null;
    const codeIsNew = !!code && (!existingCode || existingCode.toUpperCase() !== code.toUpperCase());
    return {
      rawText: line.rawText,
      qty: line.qty || 1,
      unitCost: line.unitCost || 0,
      code,
      productId: line.match?.productId ?? null,
      productName: line.match?.productName ?? "",
      existingCode,
      matchedBy: line.match?.matchedBy ?? null,
      confidence: line.match?.confidence ?? 0,
      candidates: line.candidates || [],
      saveCode: !!line.match?.productId && codeIsNew,
    };
  };

  const runScan = async (dataUri: string) => {
    setIsScanning(true);
    setRows([]);
    try {
      const res = await fetch("/api/inventory/scan-receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: dataUri,
          supplierId,
          tableItems: (tableItems || []).map((i) => ({ productId: i.productId, productName: i.productName })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Scan failed");

      setEngine(data.engine || null);
      const scanned: ScannedLine[] = data.lines || [];
      if (scanned.length === 0) {
        toast({
          variant: "destructive",
          title: "No items found",
          description: "Couldn't read line items from that photo. Try a clearer, flatter shot.",
        });
      } else {
        toast({ title: "Receipt scanned", description: `Found ${scanned.length} line(s). Review below.` });
      }
      setRows(scanned.map(lineToRow));
    } catch (err: any) {
      console.error("Scan receipt error:", err);
      toast({ variant: "destructive", title: "Scan error", description: err.message || "Failed to scan the receipt." });
    } finally {
      setIsScanning(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreviewUrl(URL.createObjectURL(file));
    let dataUri: string;
    try {
      dataUri = await downscaleImage(file);
    } catch {
      dataUri = await fileToDataUri(file); // fallback: send original
    }
    // allow re-selecting the same file
    e.target.value = "";
    await runScan(dataUri);
  };

  const updateRow = useCallback((idx: number, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }, []);

  const selectProduct = (idx: number, product: { id: string; name: string }, existingCode: string | null) => {
    const row = rows[idx];
    const codeIsNew = !!row.code && (!existingCode || existingCode.toUpperCase() !== row.code.toUpperCase());
    updateRow(idx, {
      productId: product.id,
      productName: product.name,
      existingCode,
      matchedBy: "manual",
      confidence: 1,
      saveCode: !!row.code && codeIsNew,
    });
  };

  const openAddProduct = (idx: number, term: string) => {
    const row = rows[idx];
    setAddProductRowIdx(idx);
    setAddProductInitial({
      name: term || row.rawText,
      sellingPrice: row.unitCost ? Number((row.unitCost * 1.5).toFixed(2)) : 0,
      supplierPricing:
        supplierId && supplierName
          ? [{ supplierId, supplierName, unitCost: row.unitCost || 0, supplierCode: row.code || undefined }]
          : [],
    });
    setAddProductOpen(true);
  };

  const removeRow = (idx: number) => setRows((prev) => prev.filter((_, i) => i !== idx));

  const matchedCount = rows.filter((r) => r.productId).length;

  const handleConfirm = async () => {
    const ready = rows.filter((r) => r.productId && Number(r.qty) > 0);
    if (ready.length === 0) {
      toast({ variant: "destructive", title: "Nothing to record", description: "Match at least one line to a product first." });
      return;
    }
    setIsSaving(true);
    try {
      // 1. Learn supplier codes the user chose to keep.
      const codeSaves = rows.filter((r) => r.productId && r.saveCode && r.code && supplierId);
      await Promise.all(
        codeSaves.map((r) =>
          fetch("/api/inventory/procurement", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ productId: r.productId, newSupplierId: supplierId, supplierCode: r.code }),
          })
        )
      );
      if (codeSaves.length > 0) {
        toast({ title: "Supplier codes saved", description: `${codeSaves.length} code(s) will auto-match next time.` });
      }

      // 2. Hand the matched items to the existing Record Purchases flow.
      const purchases = ready.map((r) => ({
        productId: r.productId as string,
        productName: r.productName,
        qty: Number(r.qty),
        cost: Number(r.unitCost) || 0,
        supplierId: supplierId ?? null,
      }));
      onConfirm(purchases);
    } catch (err: any) {
      console.error("Confirm scan error:", err);
      toast({ variant: "destructive", title: "Couldn't save", description: err.message || "Failed to save." });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Scan Receipt — {supplierName}</DialogTitle>
            <DialogDescription>
              Upload a photo of this supplier&apos;s receipt. Items are matched to your products; unknown supplier codes are
              learned for next time. Review below, then record as purchases.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 px-4 py-2 border-2 border-dashed rounded-md cursor-pointer hover:border-slate-400 text-sm text-slate-600">
                <Upload className="w-4 h-4" />
                {previewUrl ? "Choose a different photo" : "Upload receipt photo"}
                <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} disabled={isScanning} />
              </label>
              {isScanning && (
                <span className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="w-4 h-4 animate-spin" /> Reading receipt...
                </span>
              )}
              {engine && !isScanning && (
                <span className="text-xs text-slate-400">
                  read by {engine === "gemini" ? "AI" : engine === "vision" ? "Google Vision" : "Tesseract"}
                </span>
              )}
              {previewUrl && !isScanning && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl} alt="Receipt preview" className="h-14 w-14 object-cover rounded border" />
              )}
            </div>

            {rows.length > 0 && (
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
                            onSelect={(p) => selectProduct(idx, p, null)}
                            onAddNew={(term) => openAddProduct(idx, term)}
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
                                  onClick={() => selectProduct(idx, { id: c.productId, name: c.productName }, c.existingCode)}
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
                            onChange={(e) => updateRow(idx, { qty: Number(e.target.value) })}
                            className="h-8 text-center"
                          />
                        </td>
                        {isManagement && (
                          <td className="p-2 text-center">
                            <Input
                              type="number"
                              step="0.01"
                              value={row.unitCost}
                              onChange={(e) => updateRow(idx, { unitCost: Number(e.target.value) })}
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
                                  onCheckedChange={(v) => updateRow(idx, { saveCode: !!v })}
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
                          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeRow(idx)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {rows.length > 0 && (
              <div className="flex items-center justify-between pt-2">
                <span className="text-sm text-slate-500">
                  {matchedCount} of {rows.length} lines matched
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => onOpenChange(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleConfirm}
                    disabled={isSaving || matchedCount === 0}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
                  >
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Save codes &amp; Record {matchedCount} item{matchedCount === 1 ? "" : "s"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AddProductDialog
        open={addProductOpen}
        onOpenChange={setAddProductOpen}
        initialValues={addProductInitial}
        onProductAdded={(newProduct: { id: string; name: string }) => {
          if (addProductRowIdx !== null) {
            // A newly created product already carries the code via supplierPricing.
            updateRow(addProductRowIdx, {
              productId: newProduct.id,
              productName: newProduct.name,
              matchedBy: "manual",
              confidence: 1,
              saveCode: false,
              existingCode: rows[addProductRowIdx]?.code ?? null,
            });
          }
          setAddProductRowIdx(null);
          setAddProductOpen(false);
          toast({ title: `Matched to ${newProduct.name}`, description: "New product created and matched to this line." });
        }}
      />
    </>
  );
}
