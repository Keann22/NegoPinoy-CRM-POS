import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSupabase } from "@/lib/supabase/hooks";
import { format } from "date-fns";
import { Loader2, Activity } from "lucide-react";

export function OrderTrailDialog({ open, onOpenChange, orderId }: { open: boolean; onOpenChange: (open: boolean) => void; orderId: string }) {
  const supabase = useSupabase();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && orderId && supabase) {
      setLoading(true);
      supabase
        .from('order_logs')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at', { ascending: false })
        .then(({ data, error }) => {
          if (!error && data) {
            setLogs(data);
          }
          setLoading(false);
        });
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
        <div className="py-4">
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
              {logs.map((log, index) => (
                <div key={log.id} className="relative pl-6">
                  {/* Timeline line */}
                  {index !== logs.length - 1 && (
                    <div className="absolute left-[11px] top-6 bottom-[-24px] w-[2px] bg-slate-200" />
                  )}
                  {/* Timeline dot */}
                  <div className="absolute left-0 top-1.5 h-6 w-6 rounded-full border-4 border-white bg-indigo-500 shadow-sm" />
                  
                  <div className="bg-slate-50 border rounded-md p-3">
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-semibold text-slate-800">{log.status}</span>
                      <span className="text-xs text-slate-500">{format(new Date(log.created_at), 'PPp')}</span>
                    </div>
                    <div className="text-sm text-slate-600">
                      Processed by: <span className="font-medium text-slate-800">{log.user_name || 'System / Unknown'}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
