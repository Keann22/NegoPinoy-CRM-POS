'use client';

import { useState, useMemo, useEffect } from 'react';
import { DateRange } from 'react-day-picker';
import {
  startOfMonth,
  endOfMonth,
  format,
} from 'date-fns';
import { Calendar as CalendarIcon, CheckCircle2, TrendingUp, PackageCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { useSupabase, useUser } from '@/firebase';

export function SalesSummaryReport() {
  const [date, setDate] = useState<DateRange | undefined>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  });

  const supabase = useSupabase();
  const { user } = useUser();

  const [isLoading, setIsLoading] = useState(true);
  const [totalSales, setTotalSales] = useState({ amount: 0, count: 0 });
  const [totalProcessed, setTotalProcessed] = useState({ amount: 0, count: 0 });

  useEffect(() => {
    if (!supabase || !user || !date?.from || !date?.to) return;
    
    const fetchSummary = async () => {
      setIsLoading(true);
      try {
        const fromDate = date.from.toISOString();
        const toDateObj = new Date(date.to);
        toDateObj.setHours(23, 59, 59, 999);
        const toDate = toDateObj.toISOString();

        // We fetch ALL orders within the creation date range
        const { data, error } = await supabase
          .from('orders')
          .select('id, total_amount, status, created_at')
          .gte('created_at', fromDate)
          .lte('created_at', toDate);

        if (error) throw error;

        let sAmount = 0;
        let sCount = 0;
        let pAmount = 0;
        let pCount = 0;

        (data || []).forEach((order: any) => {
          const amt = Number(order.total_amount) || 0;
          
          // Total Processed: All except Cancelled
          if (order.status !== 'Cancelled') {
             pAmount += amt;
             pCount += 1;
          }

          // Total Sales: Only Completed / Paid
          if (order.status === 'Completed' || order.status === 'Payment Received (COD)') {
             sAmount += amt;
             sCount += 1;
          }
        });

        setTotalSales({ amount: sAmount, count: sCount });
        setTotalProcessed({ amount: pAmount, count: pCount });

      } catch (err) {
        console.error('Error fetching sales summary:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSummary();
  }, [supabase, user, date]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-headline tracking-tight">Sales & Processing Summary</h2>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant={"outline"} size="sm" className={cn("w-[240px] justify-start text-left font-normal bg-background", !date && "text-muted-foreground")}>
              <CalendarIcon className="mr-2 h-4 w-4" />
              {date?.from ? (date.to ? <>{format(date.from, "LLL dd, y")} - {format(date.to, "LLL dd, y")}</> : format(date.from, "LLL dd, y")) : <span>Pick a date</span>}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar initialFocus mode="range" defaultMonth={date?.from} selected={date} onSelect={setDate} numberOfMonths={2} />
          </PopoverContent>
        </Popover>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Total Sales Card */}
        <Card className="bg-primary/5 border-primary/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Sales (Received)
            </CardTitle>
            <CheckCircle2 className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-32 mt-1" />
            ) : (
              <>
                <div className="text-2xl font-bold font-headline text-primary">₱{totalSales.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Based on {totalSales.count} completed orders created in this period.
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Total Processed Card */}
        <Card className="bg-secondary/20 border-secondary/30">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Processed
            </CardTitle>
            <PackageCheck className="h-4 w-4 text-secondary-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-32 mt-1" />
            ) : (
              <>
                <div className="text-2xl font-bold font-headline text-secondary-foreground">₱{totalProcessed.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Based on {totalProcessed.count} valid orders processed in this period.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
