"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Trash2, ArrowRight, Receipt, Loader2 } from "lucide-react";
import type { ReceiptScanDraft } from "@/types";

interface SavedReceiptsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  drafts: ReceiptScanDraft[];
  loading?: boolean;
  onResume: (draft: ReceiptScanDraft) => void;
  onDelete: (draftId: string) => void;
}

export function SavedReceiptsDialog({
  open,
  onOpenChange,
  drafts,
  loading = false,
  onResume,
  onDelete,
}: SavedReceiptsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-indigo-600" />
            Saved Receipt Scans
          </DialogTitle>
          <DialogDescription>
            Receipts scanned and saved for later review. Resume any receipt to finish matching items and record purchases.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {loading && (
            <div className="flex items-center justify-center py-8 text-slate-500">
              <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading drafts...
            </div>
          )}

          {!loading && drafts.length === 0 && (
            <div className="text-center py-10 border rounded-lg bg-slate-50 text-slate-500 space-y-2">
              <Receipt className="w-10 h-10 mx-auto text-slate-300" />
              <p className="font-medium text-slate-700">No saved receipt drafts</p>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                When you scan a receipt in Procurement, click &quot;Save as Draft&quot; to finish matching and recording it whenever you have time.
              </p>
            </div>
          )}

          {!loading &&
            drafts.map((draft) => {
              const totalLines = draft.rawLines?.length || 0;
              const matchedLines = (draft.rawLines || []).filter((r) => r.productId).length;

              return (
                <div
                  key={draft.id}
                  className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-3.5 border rounded-lg hover:border-slate-300 transition-colors bg-white shadow-sm"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {draft.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={draft.imageUrl}
                        alt="Receipt"
                        className="w-14 h-14 object-cover rounded border shrink-0 bg-slate-100"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded border bg-slate-100 flex items-center justify-center shrink-0">
                        <Receipt className="w-6 h-6 text-slate-400" />
                      </div>
                    )}
                    <div className="min-w-0 space-y-1">
                      <p className="font-semibold text-slate-900 truncate">{draft.supplierName || "Unknown Supplier"}</p>
                      <p className="text-xs text-slate-400">
                        Saved on {format(new Date(draft.updatedAt || draft.createdAt), "MMM d, yyyy h:mm a")}
                      </p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-[11px] font-normal">
                          {totalLines} {totalLines === 1 ? "line" : "lines"}
                        </Badge>
                        <Badge
                          variant="secondary"
                          className={`text-[11px] font-normal ${
                            matchedLines === totalLines && totalLines > 0
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-amber-50 text-amber-700 border-amber-200"
                          }`}
                        >
                          {matchedLines} of {totalLines} matched
                        </Badge>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => onDelete(draft.id)}
                      title="Delete draft"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        onResume(draft);
                        onOpenChange(false);
                      }}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium flex items-center gap-1.5"
                    >
                      Resume Review <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
