'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { DateRange } from 'react-day-picker';
import {
  startOfToday, endOfToday, subMonths,
} from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter as ReportTableFooter } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { useUser, useSupabase } from '@/lib/supabase/hooks';
import { ReportDateFilter } from '@/components/dashboard/reports/report-date-filter';
import { fetchOrdersInRange } from '@/lib/services/report-orders-service';

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
};

interface SalesReportProps {
  date?: DateRange | undefined;
  setDate?: (date: DateRange | undefined) => void;
}

export function SalesReport({ date: externalDate, setDate: externalSetDate }: SalesReportProps = {}) {
  const [internalDate, setInternalDate] = useState<DateRange | undefined>({
    from: subMonths(startOfToday(), 1),
    to: endOfToday(),
  });

  const date = externalDate ?? internalDate;
  const setDate = externalSetDate ?? setInternalDate;

  const supabase = useSupabase();
  const { user } = useUser();
  const router = useRouter();

  const [orders, setOrders] = useState<Order[]>([]);
  const [userMap, setUserMap] = useState<Map<string, string>>(new Map());
  const [isLoading, setIsLoading] = useState(true);

  // Load user directory once
  useEffect(() => {
    if (!supabase || !user) return;
    const fetchUsers = async () => {
      try {
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
      } catch (err) {
        console.error('Error fetching users map:', err);
      }
    };
    fetchUsers();
  }, [supabase, user]);

  // Fetch orders scoped to date range without 1000-row cap
  useEffect(() => {
    if (!supabase || !user) return;
    if (!date?.from) {
      setOrders([]);
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    const fetchOrders = async () => {
      setIsLoading(true);
      try {
        const fromISO = date.from!.toISOString();
        const toDateObj = new Date(date.to || date.from!);
        toDateObj.setHours(23, 59, 59, 999);
        const toISO = toDateObj.toISOString();

        const ordersData = await fetchOrdersInRange(supabase, {
          selectCols: 'id, total_amount, order_date, created_at, status, sales_person_id',
          fromISO,
          toISO,
          dateColumn: 'order_date',
          statusesToExclude: ['Cancelled', 'Returned'],
        });

        if (!isMounted) return;

        setOrders(ordersData.map((o: any) => ({
          id: o.id,
          totalAmount: Number(o.total_amount) || 0,
          orderDate: o.order_date || o.created_at,
          orderStatus: o.status,
          salesPersonId: o.sales_person_id || '',
        })));
      } catch (err) {
        console.error('Sales report fetch error:', err);
        if (isMounted) setOrders([]);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchOrders();

    return () => {
      isMounted = false;
    };
  }, [supabase, user, date]);

  const salesByPerson = useMemo(() => {
    if (!orders || orders.length === 0) return [];
    const salesData = orders.reduce((acc, order) => {
      const key = order.salesPersonId || 'unknown';
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

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <CardTitle className="font-headline">Sales Report by Person</CardTitle>
            <CardDescription>View sales for each salesperson within the selected date range.</CardDescription>
          </div>
          <ReportDateFilter date={date} setDate={setDate} className="mb-0" />
        </div>
      </CardHeader>
      <CardContent>
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
            {!isLoading && salesByPerson.map((sale) => (
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
