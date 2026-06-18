'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { DateRange } from 'react-day-picker';
import {
  startOfToday, endOfToday, startOfYesterday, endOfYesterday, format, subMonths,
} from 'date-fns';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter as ReportTableFooter } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { useUser, useSupabase } from '@/lib/supabase/hooks';

type Order = {
  id: string;
  totalAmount: number;
  orderDate: string;
  salesPersonId: string;
  salesPersonName?: string;
  orderStatus: string;
};

type SalesData = {
  userId: string;
  name: string;
  salesCount: number;
  totalAmount: number;
}

export function SalesReport() {
  const [date, setDate] = useState<DateRange | undefined>({
    from: subMonths(startOfToday(), 1),
    to: endOfToday(),
  });

  const supabase = useSupabase();
  const { user } = useUser();
  const router = useRouter();

  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [userMap, setUserMap] = useState<Map<string, string>>(new Map());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!supabase || !user) return;
    const fetchAll = async () => {
      setIsLoading(true);
      try {
        // Fetch users using the RPC that the UsersPage uses
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

        // Fetch orders - REMOVED sales_person_name to prevent crashes if column doesn't exist
        const { data: ordersData, error: ordersError } = await supabase
          .from('orders')
          .select('id, total_amount, order_date, created_at, status, sales_person_id');

        if (ordersError) {
           console.error('Error fetching orders:', ordersError);
        }

        setAllOrders((ordersData || []).map((o: any) => ({
          id: o.id,
          totalAmount: Number(o.total_amount) || 0,
          orderDate: o.order_date || o.created_at,
          orderStatus: o.status,
          salesPersonId: o.sales_person_id || '',
        })));
      } catch (err) {
        console.error('Sales report fetch error:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchAll();
  }, [supabase, user]);

  const orders = useMemo(() => {
    if (!allOrders || !date?.from || !date?.to) return [];
    const fromTime = date.from.getTime();
    const toDate = new Date(date.to); toDate.setHours(23, 59, 59, 999);
    const toTime = toDate.getTime();
    return allOrders.filter(order => {
      const orderTime = new Date(order.orderDate).getTime();
      return orderTime >= fromTime && orderTime <= toTime
        && order.orderStatus !== 'Cancelled'
        && order.orderStatus !== 'Returned';
    });
  }, [allOrders, date]);

  const salesByPerson = useMemo(() => {
    if (!orders) return [];
    const salesData = orders.reduce((acc, order) => {
      const key = order.salesPersonId || 'unknown';
      // Fallback: order.salesPersonName -> userMap -> short ID
      const displayName = order.salesPersonName || userMap.get(key) || `User ${(order.salesPersonId || '').substring(0, 6)}`;
      if (!acc[key]) {
        acc[key] = { userId: key, name: displayName, salesCount: 0, totalAmount: 0 };
      }
      acc[key].salesCount += 1;
      acc[key].totalAmount += order.totalAmount;
      return acc;
    }, {} as Record<string, SalesData>);
    return Object.values(salesData).sort((a, b) => b.totalAmount - a.totalAmount);
  }, [orders, userMap]);

  const grandTotal = useMemo(() => salesByPerson.reduce((sum, item) => sum + item.totalAmount, 0), [salesByPerson]);

  const setDatePreset = (preset: 'today' | 'yesterday') => {
    const from = preset === 'today' ? startOfToday() : startOfYesterday();
    const to = preset === 'today' ? endOfToday() : endOfYesterday();
    setDate({ from, to });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-headline">Sales Report by Person</CardTitle>
        <CardDescription>View sales for each salesperson within a selected date range.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-2 mb-4">
            <span className="text-sm font-medium">Filter by:</span>
            <Button variant={date?.from?.toDateString() === startOfToday().toDateString() ? 'default': 'outline'} size="sm" onClick={() => setDatePreset('today')}>Today</Button>
            <Button variant={date?.from?.toDateString() === startOfYesterday().toDateString() ? 'default': 'outline'} size="sm" onClick={() => setDatePreset('yesterday')}>Yesterday</Button>
            <Popover>
                <PopoverTrigger asChild>
                <Button id="sales-date-picker" variant={"outline"} size="sm"
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
            <TableRow>
              <TableHead>Sales Person</TableHead>
              <TableHead className="text-center">Number of Orders</TableHead>
              <TableHead className="text-right">Total Sales Amount</TableHead>
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
            {salesByPerson.map((sale) => (
              <TableRow 
                key={sale.userId}
                className="cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => {
                  const fromParam = date?.from ? date.from.toISOString() : '';
                  const toParam = date?.to ? date.to.toISOString() : '';
                  const nameParam = encodeURIComponent(sale.name);
                  router.push(`/dashboard/reports/sales-by-person/${sale.userId}?from=${fromParam}&to=${toParam}&name=${nameParam}`);
                }}
              >
                <TableCell className="font-medium text-primary hover:underline">{sale.name}</TableCell>
                <TableCell className="text-center">{sale.salesCount}</TableCell>
                <TableCell className="text-right">₱{sale.totalAmount.toFixed(2)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          <ReportTableFooter>
            <TableRow>
              <TableCell colSpan={2} className="font-bold">Grand Total</TableCell>
              <TableCell className="text-right font-bold">
                {isLoading ? <Skeleton className="h-5 w-28 ml-auto" /> : `₱${grandTotal.toFixed(2)}`}
              </TableCell>
            </TableRow>
          </ReportTableFooter>
        </Table>
        {!isLoading && salesByPerson.length === 0 && (
          <div className="flex flex-col items-center justify-center text-center border-2 border-dashed rounded-lg p-12 mt-4">
            <p className="text-lg font-semibold">No Sales Found</p>
            <p className="text-muted-foreground mt-2">There are no orders in the selected date range.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
