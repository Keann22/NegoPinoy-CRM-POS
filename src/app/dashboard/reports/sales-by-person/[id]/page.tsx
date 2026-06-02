'use client';

import { use, useMemo, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { format, isValid } from 'date-fns';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { useSupabase, useUser } from '@/firebase';
import { Badge } from '@/components/ui/badge';

type Order = {
  id: string;
  totalAmount: number;
  orderDate: string; // ISO string
  salesPersonId: string;
  customerId: string;
  orderStatus: string;
};

export default function SalesBreakdownPage(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useSupabase();
  const { user } = useUser();
  
  const fromParam = searchParams.get('from');
  const toParam = searchParams.get('to');
  const nameParam = searchParams.get('name') || 'Unknown Salesperson';
  
  const fromTime = fromParam ? new Date(fromParam).getTime() : null;
  const toTime = toParam ? new Date(toParam).setHours(23, 59, 59, 999) : null;

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(true);
  
  useEffect(() => {
    if (!supabase || !user || !params.id) return;
    const fetchOrders = async () => {
      setIsLoadingOrders(true);
      try {
        const { data, error } = await supabase
          .from('orders')
          .select('id, total_amount, order_date, created_at, status, sales_person_id, customer_id')
          .eq('sales_person_id', params.id);
          
        if (error) throw error;
        
        if (data) {
          setAllOrders(data.map((o: any) => ({
            id: o.id,
            totalAmount: Number(o.total_amount) || 0,
            orderDate: o.order_date || o.created_at,
            orderStatus: o.status,
            salesPersonId: o.sales_person_id,
            customerId: o.customer_id,
          })));
        }
      } catch (err) {
        console.error('Error fetching orders:', err);
      } finally {
        setIsLoadingOrders(false);
      }
    };
    fetchOrders();
  }, [supabase, user, params.id]);

  // Filter orders by date range and status
  const filteredOrders = useMemo(() => {
    if (!allOrders) return [];
    return allOrders.filter(order => {
        const orderTime = new Date(order.orderDate).getTime();
        let isValidDate = true;
        if (fromTime) isValidDate = isValidDate && orderTime >= fromTime;
        if (toTime) isValidDate = isValidDate && orderTime <= toTime;
        
        let isValidStatus = true;
        if (statusFilter === 'all') {
            isValidStatus = order.orderStatus !== 'Cancelled' && order.orderStatus !== 'Returned';
        } else {
            isValidStatus = order.orderStatus === statusFilter;
        }
        
        return isValidDate && isValidStatus;
    }).sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime());
  }, [allOrders, fromTime, toTime, statusFilter]);

  // Fetch Customers
  const [customerMap, setCustomerMap] = useState<Map<string, string>>(new Map());
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(false);
  
  useEffect(() => {
      if (!filteredOrders || filteredOrders.length === 0 || !supabase) return;
  
      const fetchCustomers = async () => {
        setIsLoadingCustomers(true);
        try {
          const customerIds = Array.from(new Set(filteredOrders.map(o => o.customerId).filter(Boolean)));
          if (customerIds.length === 0) {
            setIsLoadingCustomers(false);
            return;
          }
          const map = new Map<string, string>();
          
          const { data, error } = await supabase
            .from('customers')
            .select('id, full_name')
            .in('id', customerIds);
            
          if (error) throw error;
          
          if (data) {
            data.forEach(c => {
               map.set(c.id, c.full_name || 'Unknown Customer');
            });
          }
          setCustomerMap(map);
        } catch (err) {
          console.error('Error fetching customers:', err);
        } finally {
          setIsLoadingCustomers(false);
        }
      };
      
      fetchCustomers();
  }, [filteredOrders, supabase]);

  const isLoading = isLoadingOrders || isLoadingCustomers;

  const totalAmount = useMemo(() => {
    return filteredOrders.reduce((sum, order) => sum + order.totalAmount, 0);
  }, [filteredOrders]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">Sales Breakdown</h1>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                  <CardTitle className="font-headline">{nameParam}</CardTitle>
                  <CardDescription>
                    {fromParam && toParam ? (
                      <span>
                        Sales from {format(new Date(fromParam), 'MMM dd, yyyy')} to {format(new Date(toParam), 'MMM dd, yyyy')}
                      </span>
                    ) : (
                      <span>All sales</span>
                    )}
                  </CardDescription>
              </div>
              <div className="w-full sm:w-48">
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger>
                          <SelectValue placeholder="Filter by status" />
                      </SelectTrigger>
                      <SelectContent>
                          <SelectItem value="all">All Valid Statuses</SelectItem>
                          <SelectItem value="Completed">Completed</SelectItem>
                          <SelectItem value="Shipped">Shipped</SelectItem>
                          <SelectItem value="Processing">Processing</SelectItem>
                          <SelectItem value="Pending Payment">Pending Payment</SelectItem>
                      </SelectContent>
                  </Select>
              </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                </TableRow>
              ))}
              {!isLoading && filteredOrders.length === 0 && (
                <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                        No orders found matching these filters.
                    </TableCell>
                </TableRow>
              )}
              {!isLoading && filteredOrders.map((order) => {
                const orderDate = new Date(order.orderDate);
                const customerName = customerMap.get(order.customerId) || 'Unknown Customer';
                return (
                  <TableRow 
                    key={order.id} 
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => router.push(`/dashboard/orders/${order.id}`)}
                  >
                    <TableCell>
                      {isValid(orderDate) ? format(orderDate, 'MMM dd, yyyy') : 'Unknown'}
                      <div className="text-xs text-muted-foreground">#{order.id.slice(0, 8).toUpperCase()}</div>
                    </TableCell>
                    <TableCell className="font-medium text-primary hover:underline">{customerName}</TableCell>
                    <TableCell>
                        <Badge variant={order.orderStatus === 'Completed' ? 'default' : 'secondary'}>
                            {order.orderStatus}
                        </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">₱{order.totalAmount.toFixed(2)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            <TableFooter>
                <TableRow>
                    <TableCell colSpan={3} className="font-bold">Total Sales ({statusFilter === 'all' ? 'All Valid' : statusFilter})</TableCell>
                    <TableCell className="text-right font-bold text-lg">
                        {isLoading ? <Skeleton className="h-5 w-24 ml-auto" /> : `₱${totalAmount.toFixed(2)}`}
                    </TableCell>
                </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
