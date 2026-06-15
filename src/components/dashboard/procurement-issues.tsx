import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle2 } from "lucide-react";

export function ProcurementIssues() {
  const [issues, setIssues] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const fetchIssues = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('products')
        .select('id, name, variant_name, procurement_note')
        .not('procurement_note', 'is', null);

      if (error) throw error;
      setIssues(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchIssues();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleResolve = async (productId: string) => {
    try {
      const res = await fetch('/api/inventory/products/issue', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, note: null })
      });
      if (!res.ok) throw new Error("Failed to resolve issue");
      fetchIssues();
    } catch (e: any) {
      alert("Error: " + e.message);
    }
  };

  if (!isLoading && issues.length === 0) {
    return null; // Don't show anything if there are no issues
  }

  return (
    <Card className="col-span-4 border-amber-200 bg-amber-50/30">
      <CardHeader>
        <CardTitle className="text-amber-800 flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          Procurement Issues
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-sm text-slate-500">Checking for issues...</div>
        ) : (
          <div className="space-y-4">
            {issues.map(issue => (
              <div key={issue.id} className="bg-white p-4 rounded-md border border-amber-100 shadow-sm flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
                <div>
                  <h4 className="font-semibold text-slate-900 text-sm">
                    {issue.name} {issue.variant_name ? `[${issue.variant_name}]` : ''}
                  </h4>
                  <p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap">{issue.procurement_note}</p>
                </div>
                <Button 
                  onClick={() => handleResolve(issue.id)}
                  variant="outline" 
                  size="sm"
                  className="shrink-0 text-amber-700 border-amber-300 hover:bg-amber-100"
                >
                  <CheckCircle2 className="w-4 h-4 mr-1" />
                  Acknowledge & Resolve
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
