import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSupabase } from "@/lib/supabase/hooks";
import { format } from "date-fns";
import { Loader2, Activity, MessageSquare, PackageX } from "lucide-react";
import { fetchOrderTrail, type OrderTrailEntry } from "@/lib/services/order-trail-service";

const ENTRY_STYLES: Record<OrderTrailEntry['kind'], { dot: string; icon?: typeof MessageSquare }> = {
  status: { dot: 'bg-indigo-500' },
  note: { dot: 'bg-slate-400', icon: MessageSquare },
  issue_reported: { dot: 'bg-red-500', icon: PackageX },
  issue_message: { dot: 'bg-amber-400', icon: MessageSquare },
};

export function OrderTrailDialog({ open, onOpenChange, orderId }: { open: boolean; onOpenChange: (open: boolean) => void; orderId: string }) {
  const supabase = useSupabase();
  const [logs, setLogs] = useState<OrderTrailEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && orderId && supabase) {
      setLoading(true);
      fetchOrderTrail(supabase, orderId)
        .then(setLogs)
        .finally(() => setLoading(false));
    }
  }, [open, orderId, supabase]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-indigo-600" />
            Order Trail
          </DialogTitle>
        </DialogHeader>
        <div className="py-4 max-h-[70vh] overflow-y-auto pr-2">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No trail logs found for this order.
            </div>
          ) : (
            <div className="space-y-6">
              {logs.map((entry, index) => {
                const style = ENTRY_STYLES[entry.kind];
                return (
                  <div key={entry.id} className="relative pl-6">
                    {/* Timeline line */}
                    {index !== logs.length - 1 && (
                      <div className="absolute left-[11px] top-6 bottom-[-24px] w-[2px] bg-slate-200" />
                    )}
                    {/* Timeline dot */}
                    <div className={`absolute left-0 top-1.5 h-6 w-6 rounded-full border-4 border-white shadow-sm ${style.dot}`} />

                    <div className="bg-slate-50 border rounded-md p-3">
                      <div className="flex justify-between items-start mb-1 gap-2">
                        <span className="font-semibold text-slate-800 flex items-center gap-1">
                          {style.icon && <style.icon className="w-3.5 h-3.5 shrink-0" />}
                          {entry.title}
                        </span>
                        <span className="text-xs text-slate-500 shrink-0">{format(new Date(entry.createdAt), 'PPp')}</span>
                      </div>
                      {entry.detail && (
                        <div className="text-sm text-slate-700 whitespace-pre-wrap mb-1">{entry.detail}</div>
                      )}
                      <div className="text-xs text-slate-600">
                        {entry.kind === 'issue_message' ? 'From: ' : 'By: '}
                        <span className="font-medium text-slate-800">{entry.actor || 'System / Unknown'}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
