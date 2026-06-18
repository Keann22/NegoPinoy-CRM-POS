'use client';

import { useState, useMemo, useEffect } from 'react';
import { DateRange } from 'react-day-picker';
import {
  startOfMonth,
  endOfMonth,
  format,
} from 'date-fns';
import { Calendar as CalendarIcon, Gift } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter as ReportTableFooter } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { useUser, useSupabase } from '@/lib/supabase/hooks';
import { useUserProfile } from '@/hooks/useUserProfile';

type CommissionData = {
  userId: string;
  name: string;
  shippedCount: number;
  totalShippedAmount: number;
}

export function CommissionReport() {
  const [date, setDate] = useState<DateRange | undefined>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  });

  const supabase = useSupabase();
  const { user } = useUser();
  const { userProfile } = useUserProfile();

  const isManagement = useMemo(() => userProfile?.roles?.some(r => ['Owner', 'Admin'].includes(r)), [userProfile]);

  const [allEligibleOrders, setAllEligibleOrders] = useState<any[]>([]);
  const [userMap, setUserMap] = useState<Map<string, string>>(new Map());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!supabase || !user || !userProfile) return;
    const fetchAll = async () => {
      setIsLoading(true);
      try {
        // Fetch users map for names (only needed if management, but safe to fetch)
        const { data: usersData } = await supabase.rpc('get_all_users');
        const map = new Map<string, string>();
        if (usersData) {
          usersData.forEach((u: any) => {
            const meta = u.raw_user_meta_data || {};
            const fullName = `${meta.first_name || ''} ${meta.last_name || ''}`.trim() || u.email;
            map.set(u.id, fullName);
          });
          setUserMap(map);
        }

        // Fetch eligible orders for commission
        let query = supabase
          .from('orders')
          .select('id, total_amount, order_date, created_at, status, sales_person_id, completed_at, sales_person_name')
          .in('status', ['Shipped', 'Completed', 'Payment Received (COD)']);

        if (!isManagement) {
            query = query.eq('sales_person_id', user.uid);
        }

        const { data: ordersData, error: ordersError } = await query;

        if (ordersError) throw ordersError;

        setAllEligibleOrders(ordersData || []);
      } catch (err) {
        console.error('Commission report fetch error:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchAll();
  }, [supabase, user, userProfile, isManagement]);

  const commissionData = useMemo(() => {
    if (!allEligibleOrders || !date?.from || !date?.to) return [];
    
    const fromTime = date.from.getTime();
    const toDate = new Date(date.to); 
    toDate.setHours(23, 59, 59, 999);
    const toTime = toDate.getTime();
    
    // Filter by completion date
    const filtered = allEligibleOrders.filter(order => {
      const targetDateStr = order.completed_at || order.order_date || order.created_at;
      const targetTime = new Date(targetDateStr).getTime();
      return targetTime >= fromTime && targetTime <= toTime;
    });

    const grouped = filtered.reduce((acc, order) => {
      const key = order.sales_person_id || 'unknown';
      const displayName = order.sales_person_name || userMap.get(key) || `User ${(order.sales_person_id || '').substring(0, 6)}`;
      
      if (!acc[key]) {
        acc[key] = { userId: key, name: displayName, shippedCount: 0, totalShippedAmount: 0 };
      }
      acc[key].shippedCount += 1;
      acc[key].totalShippedAmount += (Number(order.total_amount) || 0);
      return acc;
    }, {} as Record<string, CommissionData>);
    
    return Object.values(grouped).sort((a, b) => b.totalShippedAmount - a.totalShippedAmount);
  }, [allEligibleOrders, date, userMap]);

  const grandTotal = useMemo(() => commissionData.reduce((sum, item) => sum + item.totalShippedAmount, 0), [commissionData]);

  return (
    <Card className="border-blue-200 shadow-sm">
      <CardHeader className="bg-blue-50/50 rounded-t-lg">
        <div className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-blue-600" />
            <CardTitle className="font-headline text-blue-900">Commission & Incentive Report</CardTitle>
        </div>
        <CardDescription>
          Calculates totals based on the date the order was actually <b>shipped or completed</b>, ensuring commissions accurately roll over if delayed.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="flex flex-wrap items-center gap-2 mb-4">
            <span className="text-sm font-medium">Commission Period:</span>
            <Popover>
                <PopoverTrigger asChild>
                <Button variant={"outline"} size="sm"
                    className={cn("w-[240px] justify-start text-left font-normal", !date && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date?.from ? (date.to ? <>{format(date.from, "LLL dd, y")} - {format(date.to, "LLL dd, y")}</> : format(date.from, "LLL dd, y")) : <span>Pick a date</span>}
                </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                <Calendar initialFocus mode="range" defaultMonth={date?.from} selected={date} onSelect={setDate} numberOfMonths={2} />
                </PopoverContent>
            </Popover>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Sales Person</TableHead>
              <TableHead className="text-center">Valid Shipped Orders</TableHead>
              <TableHead className="text-right">Commissionable Sales</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && Array.from({ length: 3 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                <TableCell className="text-center"><Skeleton className="h-4 w-12 mx-auto" /></TableCell>
                <TableCell className="text-right"><Skeleton className="h-4 w-24 ml-auto" /></TableCell>
              </TableRow>
            ))}
            {commissionData.map((data) => (
              <TableRow key={data.userId}>
                <TableCell className="font-medium text-blue-950">{data.name}</TableCell>
                <TableCell className="text-center">{data.shippedCount}</TableCell>
                <TableCell className="text-right font-semibold text-blue-700">₱{data.totalShippedAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          <ReportTableFooter className="bg-blue-50/50">
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={2} className="font-bold text-blue-950 text-right">Total Commissionable Revenue:</TableCell>
              <TableCell className="text-right font-bold text-blue-900 text-lg">
                {isLoading ? <Skeleton className="h-6 w-28 ml-auto" /> : `₱${grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              </TableCell>
            </TableRow>
          </ReportTableFooter>
        </Table>
        {!isLoading && commissionData.length === 0 && (
          <div className="flex flex-col items-center justify-center text-center border-2 border-dashed border-blue-100 rounded-lg p-12 mt-4">
            <Gift className="h-8 w-8 text-blue-200 mb-2" />
            <p className="text-lg font-semibold text-blue-900">No Commission Data Found</p>
            <p className="text-muted-foreground mt-1">No orders were shipped or completed in this period.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
