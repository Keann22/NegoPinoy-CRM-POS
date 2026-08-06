import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface MissingTrackingFiltersProps {
  scopeFilter: 'dispatched' | 'all';
  setScopeFilter: (val: 'dispatched' | 'all') => void;
  statusFilter: string;
  setStatusFilter: (val: string) => void;
  paymentFilter: string;
  setPaymentFilter: (val: string) => void;
  statusOptions: string[];
  paymentOptions: string[];
}

export function MissingTrackingFilters({
  scopeFilter,
  setScopeFilter,
  statusFilter,
  setStatusFilter,
  paymentFilter,
  setPaymentFilter,
  statusOptions,
  paymentOptions
}: MissingTrackingFiltersProps) {
  return (
    <div className="flex flex-wrap gap-3 pt-3">
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">Show</label>
        <Select
          value={scopeFilter}
          onValueChange={(v) => {
            setScopeFilter(v as 'dispatched' | 'all');
            setStatusFilter('all');
            setPaymentFilter('all');
          }}
        >
          <SelectTrigger className="w-[240px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="dispatched">Dispatched orders only</SelectItem>
            <SelectItem value="all">All open orders</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">Order Status</label>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {statusOptions.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">Payment Method</label>
        <Select value={paymentFilter} onValueChange={setPaymentFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All Methods" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Methods</SelectItem>
            {paymentOptions.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
