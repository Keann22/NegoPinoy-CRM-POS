"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Flag } from "lucide-react";

export function ReportIssueDialog({
  open,
  onOpenChange,
  issueProduct,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  issueProduct: any;
  onSuccess: () => void;
}) {
  const [issueNote, setIssueNote] = useState("");
  const [isSubmittingIssue, setIsSubmittingIssue] = useState(false);

  useEffect(() => {
    if (!open) {
      setIssueNote("");
    }
  }, [open]);

  const handleReportIssue = async () => {
    if (!issueProduct || !issueNote.trim()) {
      alert("Please enter a note describing why this item cannot be purchased.");
      return;
    }

    setIsSubmittingIssue(true);
    try {
      const res = await fetch('/api/inventory/issues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: issueProduct.productId,
          note: issueNote.trim()
        })
      });

      if (!res.ok) throw new Error(await res.text());
      
      alert("Issue reported successfully! It will now appear on the main dashboard for Sales.");
      onSuccess();
    } catch (e: any) {
      alert("Failed to report issue: " + e.message);
    } finally {
      setIsSubmittingIssue(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-amber-600 flex items-center gap-2">
            <Flag className="w-5 h-5" />
            Report Procurement Issue
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <p className="text-sm text-slate-600">
            Reporting an issue for: <span className="font-semibold text-slate-900">{issueProduct?.productName}</span>
          </p>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Why can't this be purchased?</label>
            <textarea
              value={issueNote}
              onChange={e => setIssueNote(e.target.value)}
              placeholder="e.g. Out of stock at all suppliers, Price doubled, Discontinued..."
              className="w-full border rounded-md p-2 text-sm min-h-[100px]"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button 
            type="button" 
            className="bg-amber-600 hover:bg-amber-700 text-white" 
            onClick={handleReportIssue}
            disabled={isSubmittingIssue}
          >
            {isSubmittingIssue ? "Reporting..." : "Submit Issue"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
