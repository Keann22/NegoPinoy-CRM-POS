'use client';

import { useState, useEffect } from 'react';
import { DateRange } from 'react-day-picker';
import {
  startOfMonth,
  endOfMonth,
} from 'date-fns';
import { CheckCircle2, PackageCheck } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useSupabase, useUser } from '@/lib/supabase/hooks';
import { ReportDateFilter } from '@/components/dashboard/reports/report-date-filter';
import { fetchOrdersInRange } from '@/lib/services/report-orders-service';

interface SalesSummaryReportProps {
  date?: DateRange | undefined;
  setDate?: (date: DateRange | undefined) => void;
}

export function SalesSummaryReport({ date: externalDate, setDate: externalSetDate }: SalesSummaryReportProps = {}) {
  const [internalDate, setInternalDate] = useState<DateRange | undefined>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  });

  const date = externalDate ?? internalDate;
  const setDate = externalSetDate ?? setInternalDate;

  const supabase = useSupabase();
  const { user } = useUser();

  const [isLoading, setIsLoading] = useState(true);
  const [totalSales, setTotalSales] = useState({ amount: 0, count: 0 });
  const [totalProcessed, setTotalProcessed] = useState({ amount: 0, count: 0 });

  useEffect(() => {
    if (!supabase || !user || !date?.from) return;
    
    let isMounted = true;

    const fetchSummary = async () => {
      setIsLoading(true);
      try {
        const fromDate = date.from!.toISOString();
        const toDateObj = new Date(date.to || date.from!);
        toDateObj.setHours(23, 59, 59, 999);
        const toDate = toDateObj.toISOString();

        // Fetch ALL orders in range without hitting the 1000-row cap
        const data = await fetchOrdersInRange(supabase, {
          selectCols: 'id, total_amount, status, created_at, order_date',
          fromISO: fromDate,
          toISO: toDate,
          dateColumn: 'order_date',
          statusesToExclude: [],
        });

        if (!isMounted) return;

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
        if (isMounted) setIsLoading(false);
      }
    };

    fetchSummary();

    return () => {
      isMounted = false;
    };
  }, [supabase, user, date]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-xl font-headline tracking-tight">Sales & Processing Summary</h2>
        <ReportDateFilter date={date} setDate={setDate} className="mb-0" />
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
                  Based on {totalSales.count} completed orders in this period.
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
