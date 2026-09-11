"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Upload, BookmarkCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AddProductDialog } from "@/components/dashboard/product-dialog";
import { ScanReceiptTable } from "./scan-receipt-table";
import type { ReceiptScanRow, ReceiptScanCandidate, ReceiptScanDraft } from "@/types";

type ScannedLine = {
  rawText: string;
  qty: number;
  unitCost: number;
  code: string | null;
  match: (ReceiptScanCandidate & { matchedBy: string; confidence: number }) | null;
  candidates: ReceiptScanCandidate[];
};

const fileToDataUri = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

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

const uploadImageToStorage = async (file: File): Promise<string | null> => {
  try {
    const supabase = createClient();
    const ext = file.name.split(".").pop() || "jpg";
    const fileName = `receipts/${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${ext}`;
    const { data, error } = await supabase.storage.from("proof_of_payment").upload(fileName, file, { upsert: false });
    if (error) return null;
    const { data: { publicUrl } } = supabase.storage.from("proof_of_payment").getPublicUrl(data.path);
    return publicUrl;
  } catch {
    return null;
  }
};

export interface ScanReceiptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplierId: string | null;
  supplierName: string;
  tableItems: any[];
  isManagement: boolean;
  onConfirm: (purchases: { productId: string; productName: string; qty: number; cost: number; supplierId: string | null }[]) => void;
  initialDraft?: ReceiptScanDraft | null;
  onSaveDraft?: (params: {
    id?: string | null;
    supplierId: string | null;
    supplierName: string;
    imageUrl?: string | null;
    rows: ReceiptScanRow[];
    engine?: string | null;
  }) => Promise<string | null>;
  onCompleteDraft?: (draftId: string) => Promise<void>;
}

export function ScanReceiptDialog({
  open,
  onOpenChange,
  supplierId,
  supplierName,
  tableItems,
  isManagement,
  onConfirm,
  initialDraft,
  onSaveDraft,
  onCompleteDraft,
}: ScanReceiptDialogProps) {
  const { toast } = useToast();
  const [isScanning, setIsScanning] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDraftSaving, setIsDraftSaving] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [engine, setEngine] = useState<string | null>(null);
  const [rows, setRows] = useState<ReceiptScanRow[]>([]);
  const [draftId, setDraftId] = useState<string | null>(null);

  const [addProductOpen, setAddProductOpen] = useState(false);
  const [addProductInitial, setAddProductInitial] = useState<any>();
  const [addProductRowIdx, setAddProductRowIdx] = useState<number | null>(null);

  useEffect(() => {
    if (open) {
      if (initialDraft) {
        setDraftId(initialDraft.id);
        setRows(initialDraft.rawLines || []);
        setPreviewUrl(initialDraft.imageUrl);
        setEngine(initialDraft.engine);
      }
    } else {
      setRows([]);
      setPreviewUrl(null);
      setEngine(null);
      setDraftId(null);
      setIsScanning(false);
    }
  }, [open, initialDraft]);

  const lineToRow = (line: ScannedLine): ReceiptScanRow => {
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

  const scanOne = async (dataUri: string): Promise<ReceiptScanRow[]> => {
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
    return scanned.map(lineToRow);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    e.target.value = "";
    setPreviewUrl(URL.createObjectURL(files[files.length - 1]));
    setIsScanning(true);

    try {
      uploadImageToStorage(files[files.length - 1]).then((url) => {
        if (url) setPreviewUrl(url);
      });

      let added = 0;
      for (const file of files) {
        let dataUri: string;
        try {
          dataUri = await downscaleImage(file);
        } catch {
          dataUri = await fileToDataUri(file);
        }
        const newRows = await scanOne(dataUri);
        if (newRows.length > 0) setRows((prev) => [...prev, ...newRows]);
        added += newRows.length;
      }
      if (added === 0) {
        toast({ variant: "destructive", title: "No items found", description: "Couldn't read line items. Try a clearer shot." });
      } else {
        toast({
          title: files.length > 1 ? `Scanned ${files.length} receipts` : "Receipt scanned",
          description: `Added ${added} line(s). Review below or save as draft.`,
        });
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Scan error", description: err.message || "Failed to scan receipt." });
    } finally {
      setIsScanning(false);
    }
  };

  const updateRow = useCallback((idx: number, patch: Partial<ReceiptScanRow>) => {
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

  const handleSaveDraft = async () => {
    if (rows.length === 0) {
      toast({ variant: "destructive", title: "Empty receipt", description: "Scan a receipt before saving a draft." });
      return;
    }
    setIsDraftSaving(true);
    try {
      if (onSaveDraft) {
        const savedId = await onSaveDraft({
          id: draftId,
          supplierId,
          supplierName,
          imageUrl: previewUrl,
          rows,
          engine,
        });
        if (savedId) setDraftId(savedId);
      }
      toast({ title: "Draft saved!", description: "You can come back and review this receipt anytime." });
      onOpenChange(false);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Save failed", description: err.message || "Failed to save draft." });
    } finally {
      setIsDraftSaving(false);
    }
  };

  const handleConfirm = async () => {
    const ready = rows.filter((r) => r.productId && Number(r.qty) > 0);
    if (ready.length === 0) {
      toast({ variant: "destructive", title: "Nothing to record", description: "Match at least one line to a product first." });
      return;
    }
    setIsSaving(true);
    try {
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

      if (draftId && onCompleteDraft) {
        await onCompleteDraft(draftId);
      }

      const purchases = ready.map((r) => ({
        productId: r.productId as string,
        productName: r.productName,
        qty: Number(r.qty),
        cost: Number(r.unitCost) || 0,
        supplierId: supplierId ?? null,
      }));
      onConfirm(purchases);
    } catch (err: any) {
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
            <DialogTitle className="flex items-center gap-2">
              Scan Receipt — {supplierName}
              {draftId && <span className="text-xs font-normal text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">Resumed Draft</span>}
            </DialogTitle>
            <DialogDescription>
              Upload receipt photo(s) to match products. You can save as draft to finish later, or record purchases now.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 px-4 py-2 border-2 border-dashed rounded-md cursor-pointer hover:border-slate-400 text-sm text-slate-600">
                <Upload className="w-4 h-4" />
                {rows.length > 0 ? "Add another receipt" : "Upload receipt photo(s)"}
                <input type="file" accept="image/*" multiple className="hidden" onChange={handleFileChange} disabled={isScanning} />
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
              <ScanReceiptTable
                rows={rows}
                isManagement={isManagement}
                onSelectProduct={selectProduct}
                onAddNewProduct={openAddProduct}
                onUpdateRow={updateRow}
                onRemoveRow={removeRow}
              />
            )}

            {rows.length > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                <span className="text-sm text-slate-500">
                  {matchedCount} of {rows.length} lines matched
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" onClick={() => onOpenChange(false)}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleSaveDraft}
                    disabled={isDraftSaving || isSaving}
                    className="flex items-center gap-1.5 border"
                  >
                    {isDraftSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookmarkCheck className="w-4 h-4 text-amber-600" />}
                    Save as Draft
                  </Button>
                  <Button
                    onClick={handleConfirm}
                    disabled={isSaving || isDraftSaving || matchedCount === 0}
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
