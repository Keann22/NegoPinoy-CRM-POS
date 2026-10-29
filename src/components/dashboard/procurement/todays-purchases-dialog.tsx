"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ClipboardList } from "lucide-react";
import { TodaysPurchasesPanel } from "./todays-purchases-panel";

export function TodaysPurchasesDialog({
  open,
  onOpenChange,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Fired after an edit/removal so the sheet behind can refresh its numbers.
  onChanged: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto [&>*]:min-w-0">
        <TodaysPurchasesPanel
          active={open}
          onChanged={onChanged}
          renderTitle={(title, description) => (
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-emerald-600" />
                {title}
              </DialogTitle>
              <DialogDescription>{description}</DialogDescription>
            </DialogHeader>
          )}
        />
      </DialogContent>
    </Dialog>
  );
}
