import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DiscrepancyKpiData } from '@/types/payment-discrepancy.types';

interface DiscrepancyKpisProps {
  kpis: DiscrepancyKpiData;
}

export function DiscrepancyKpis({ kpis }: DiscrepancyKpisProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <Card className="bg-card">
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">Orders to Fix</CardTitle>
        </CardHeader>
        <CardContent className="py-2 px-4">
          <div className="text-2xl font-bold text-amber-500 font-mono">{kpis.remaining}</div>
          <p className="text-xs text-muted-foreground mt-1">{kpis.resolved} resolved of {kpis.total}</p>
        </CardContent>
      </Card>

      <Card className="bg-card">
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">GCash Received</CardTitle>
        </CardHeader>
        <CardContent className="py-2 px-4">
          <div className="text-2xl font-bold text-emerald-400 font-mono">
            ₱{kpis.gcashSum.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
          </div>
          <p className="text-xs text-muted-foreground mt-1">From bank/statement receipts</p>
        </CardContent>
      </Card>

      <Card className="bg-card">
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">Net Variance</CardTitle>
        </CardHeader>
        <CardContent className="py-2 px-4">
          <div className={`text-2xl font-bold font-mono ${kpis.varSum < 0 ? 'text-rose-400' : 'text-sky-400'}`}>
            {kpis.varSum >= 0 ? '+' : ''}₱{kpis.varSum.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {kpis.varSum < 0 ? 'Customer paid excess' : 'Recorded higher than GCash'}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
