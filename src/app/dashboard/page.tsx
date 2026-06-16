'use client';

import { Activity, CreditCard, DollarSign, TrendingUp, CalendarIcon, Filter } from 'lucide-react';
import { useMemo, useEffect, useState } from 'react';
import { useUser, useSupabase } from '@/lib/supabase/hooks';
import { useRouter } from 'next/navigation';
import { DateRange } from 'react-day-picker';
import { startOfMonth, endOfMonth, format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { RecentSales } from '@/components/dashboard/recent-sales';
import { TopCustomers } from '@/components/dashboard/top-customers';
import { TopProducts } from '@/components/dashboard/top-products';
import { CollectionsDueSoon } from '@/components/dashboard/collections-due-soon';
import { ProcurementIssues } from '@/components/dashboard/procurement-issues';
import { InventoryDashboard } from '@/components/dashboard/inventory-dashboard';
import { Skeleton } from '@/components/ui/skeleton';
import { useUserProfile } from '@/hooks/useUserProfile';

// Types based on backend.json
type Order = {
  id: string;
  totalAmount: number;
  balanceDue: number;
  orderStatus: 'Pending Payment' | 'Processing' | 'Packed' | 'Shipped' | 'Completed' | 'Cancelled' | 'Returned';
};

type OrderItem = {
  orderId: string;
  quantity: number;
  costPriceAtSale: number;
};

type Expense = {
  amount: number;
  category: string;
};


export default function DashboardPage() {
    const { user } = useUser();
    const { userProfile } = useUserProfile();
    const router = useRouter();

    const isManagement = useMemo(() => userProfile?.roles.some(r => ['Admin', 'Owner'].includes(r)), [userProfile]);
    const isSales = useMemo(() => userProfile?.roles.includes('Sales'), [userProfile]);
    const isInventoryOnly = useMemo(() => userProfile?.roles.includes('Inventory') && !userProfile?.roles.includes('Sales') && !userProfile?.roles.includes('Admin') && !userProfile?.roles.includes('Owner'), [userProfile]);

    const supabase = useSupabase();
    const [dateRange, setDateRange] = useState<DateRange | undefined>({
        from: startOfMonth(new Date()),
        to: endOfMonth(new Date()),
    });
    const [selectedSalesperson, setSelectedSalesperson] = useState<string>('all');
    const [salespeople, setSalespeople] = useState<{id: string, name: string}[]>([]);

    useEffect(() => {
        if (!supabase) return;
        const fetchUsers = async () => {
            const { data } = await supabase.rpc('get_all_users');
            if (data) {
                const reps = data.map((u: any) => ({
                    id: u.id,
                    name: `${u.raw_user_meta_data?.first_name || ''} ${u.raw_user_meta_data?.last_name || ''}`.trim() || u.email
                }));
                setSalespeople(reps);
            }
        };
        fetchUsers();
    }, [supabase]);

    useEffect(() => {
        if (userProfile && selectedSalesperson === 'all' && !isManagement) {
            setSelectedSalesperson(userProfile.id);
        }
    }, [userProfile, isManagement, selectedSalesperson]);

    // We no longer redirect Inventory users. They have their own dashboard now.

    const [dashboardMetrics, setDashboardMetrics] = useState({
        totalRevenue: 0,
        netProfit: 0,
        salesCount: 0,
        accountsReceivable: 0,
        arCount: 0,
    });
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!supabase || !user) return;
        
        if (!isManagement && !isSales) {
            setIsLoading(false);
            return;
        }

        const fetchMetrics = async () => {
            setIsLoading(true);
            try {
                let query = supabase.from('orders').select('id, total_amount, balance_due, status');
                
                if (dateRange?.from) {
                    query = query.gte('order_date', dateRange.from.toISOString());
                }
                if (dateRange?.to) {
                    const toDate = new Date(dateRange.to);
                    toDate.setHours(23, 59, 59, 999);
                    query = query.lte('order_date', toDate.toISOString());
                }
                if (selectedSalesperson !== 'all') {
                    query = query.eq('sales_person_id', selectedSalesperson);
                }

                const { data: ordersData, error: ordersError } = await query;
                if (ordersError) throw ordersError;

                const validOrders = (ordersData || []).filter((o: any) => o.status !== 'Cancelled' && o.status !== 'Returned');
                const totalRevenue = validOrders.reduce((sum: number, order: any) => sum + Number(order.total_amount || 0), 0);
                const salesCount = validOrders.length;
                
                const accountsReceivableData = validOrders.filter((o: any) => Number(o.balance_due || 0) > 0);
                const accountsReceivable = accountsReceivableData.reduce((sum: number, order: any) => sum + Number(order.balance_due || 0), 0);
                const arCount = accountsReceivableData.length;

                let netProfit = 0;
                if (isManagement) {
                    const validOrderIds = validOrders.map((o: any) => o.id);
                    let totalCogs = 0;
                    
                    if (validOrderIds.length > 0) {
                        const chunkSize = 500;
                        for (let i = 0; i < validOrderIds.length; i += chunkSize) {
                            const chunk = validOrderIds.slice(i, i + chunkSize);
                            const { data: itemsData } = await supabase
                                .from('order_items')
                                .select('quantity, cost_price_at_sale')
                                .in('order_id', chunk);
                                
                            if (itemsData) {
                                totalCogs += itemsData.reduce((sum: number, item: any) => sum + (Number(item.cost_price_at_sale || 0) * Number(item.quantity || 0)), 0);
                            }
                        }
                    }

                    let expenseQuery = supabase.from('expenses').select('amount, category');
                    if (dateRange?.from) {
                        expenseQuery = expenseQuery.gte('date', dateRange.from.toISOString());
                    }
                    if (dateRange?.to) {
                        const toDate = new Date(dateRange.to);
                        toDate.setHours(23, 59, 59, 999);
                        expenseQuery = expenseQuery.lte('date', toDate.toISOString());
                    }

                    const { data: expensesData } = await expenseQuery;
                    const operatingExpenses = (expensesData || []).reduce((sum: number, expense: any) => {
                        if (expense.category?.toLowerCase() !== 'cost of goods sold') {
                            return sum + Number(expense.amount || 0);
                        }
                        return sum;
                    }, 0);

                    const grossProfit = totalRevenue - totalCogs;
                    netProfit = grossProfit - operatingExpenses;
                }

                setDashboardMetrics({
                    totalRevenue,
                    netProfit,
                    salesCount,
                    accountsReceivable,
                    arCount,
                });
            } catch (err) {
                console.error("Error fetching metrics:", err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchMetrics();
    }, [supabase, user, isManagement, isSales, dateRange, selectedSalesperson]);

  if (isInventoryOnly) {
    return <InventoryDashboard />;
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <h1 className="text-2xl font-bold font-headline tracking-tight">Dashboard Overview</h1>
        <div className="flex items-center gap-2">
            {isManagement && (
                <Select value={selectedSalesperson} onValueChange={setSelectedSalesperson}>
                    <SelectTrigger className="w-[200px] bg-background">
                        <Filter className="w-4 h-4 mr-2" />
                        <SelectValue placeholder="Filter by User" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Company Overall</SelectItem>
                        {salespeople.map(rep => (
                            <SelectItem key={rep.id} value={rep.id}>{rep.id === userProfile?.id ? 'My Sales' : rep.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            )}

            <Popover>
                <PopoverTrigger asChild>
                    <Button variant={"outline"} size="sm" className={cn("w-[240px] justify-start text-left font-normal bg-background h-10", !dateRange && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dateRange?.from ? (dateRange.to ? <>{format(dateRange.from, "LLL dd, y")} - {format(dateRange.to, "LLL dd, y")}</> : format(dateRange.from, "LLL dd, y")) : <span>Pick a date range</span>}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                    <Calendar initialFocus mode="range" defaultMonth={dateRange?.from} selected={dateRange} onSelect={setDateRange} numberOfMonths={2} />
                </PopoverContent>
            </Popover>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 md:gap-8 lg:grid-cols-4">
        {(!isSales || isManagement) && <ProcurementIssues isAdmin={isManagement} />}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Revenue
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-3/4 mt-1" /> : (
                <div className="text-2xl font-bold">₱{dashboardMetrics.totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            )}
            <p className="text-xs text-muted-foreground">
              Total revenue from all non-cancelled orders.
            </p>
          </CardContent>
        </Card>
        {isManagement && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Net Profit
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
               {isLoading ? <Skeleton className="h-8 w-3/4 mt-1" /> : (
                  <div className="text-2xl font-bold">
                      ₱{dashboardMetrics.netProfit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
              )}
              <p className="text-xs text-muted-foreground">
                Revenue minus COGS and operating expenses.
              </p>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sales</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
             {isLoading ? <Skeleton className="h-8 w-1/2 mt-1" /> : (
                <div className="text-2xl font-bold">+{dashboardMetrics.salesCount.toLocaleString()}</div>
            )}
            <p className="text-xs text-muted-foreground">
              Total number of non-cancelled orders.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Accounts Receivable
            </CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-3/4 mt-1" /> : (
                <div className="text-2xl font-bold">₱{dashboardMetrics.accountsReceivable.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            )}
            <p className="text-xs text-muted-foreground">
              {dashboardMetrics.arCount} active installments
            </p>
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-4 md:gap-8 lg:grid-cols-2 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="font-headline">Recent Sales</CardTitle>
          </CardHeader>
          <CardContent>
            <RecentSales dateRange={dateRange} salespersonId={selectedSalesperson} />
          </CardContent>
        </Card>
        <Card className="xl:col-span-1">
          <CardHeader>
            <CardTitle className="font-headline text-destructive">Collections Due Soon</CardTitle>
          </CardHeader>
          <CardContent>
            <CollectionsDueSoon />
          </CardContent>
        </Card>
      </div>
      {(isManagement || isSales) && (
        <div className="grid gap-4 md:gap-8 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="font-headline">Top Customers</CardTitle>
              </CardHeader>
              <CardContent>
                <TopCustomers dateRange={dateRange} salespersonId={selectedSalesperson} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="font-headline">Top Products</CardTitle>
              </CardHeader>
              <CardContent>
                <TopProducts dateRange={dateRange} salespersonId={selectedSalesperson} />
              </CardContent>
            </Card>
        </div>
      )}
    </>
  );
}
