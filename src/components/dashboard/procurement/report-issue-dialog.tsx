"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Flag } from "lucide-react";
import { useUserProfile } from "@/hooks/useUserProfile";
import { StaffSearch } from "@/components/dashboard/staff-search";

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
  const { userProfile } = useUserProfile();
  const [issueNote, setIssueNote] = useState("");
  const [extraRecipients, setExtraRecipients] = useState<string[]>([]);
  const [isSubmittingIssue, setIsSubmittingIssue] = useState(false);

  useEffect(() => {
    if (!open) {
      setIssueNote("");
      setExtraRecipients([]);
    }
  }, [open]);

  const handleReportIssue = async () => {
    if (!issueProduct || !issueNote.trim()) {
      alert("Please enter a note describing why this item cannot be purchased.");
      return;
    }

    setIsSubmittingIssue(true);
    try {
      const senderName = userProfile ? `${userProfile.firstName} ${userProfile.lastName}`.trim() : 'Inventory';
      const roles = userProfile?.roles || [];
      const senderRole = roles.some((r: string) => String(r).toLowerCase() === 'sales') ? 'sales' : 'inventory';

      const res = await fetch('/api/inventory/procurement-issues/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: issueProduct.productId,
          note: issueNote.trim(),
          senderName,
          senderRole,
          extraRecipientNames: extraRecipients,
        })
      });

      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to report issue');

      alert("Issue reported — the Admin team, Inventory, and any sales reps waiting on this item have been notified.");
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
          <div className="space-y-2">
            <Label className="text-sm font-medium text-slate-700">Tag additional staff (optional)</Label>
            <StaffSearch selected={extraRecipients} onChange={setExtraRecipients} />
            <p className="text-xs text-slate-500">
              The Admin team, Jas Urs/Jasmin Urs, and any sales reps with an order still waiting on this item are notified automatically.
            </p>
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
