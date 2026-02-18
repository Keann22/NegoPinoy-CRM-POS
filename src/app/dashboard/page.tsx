'use client';

import { Activity, CreditCard, DollarSign, TrendingUp } from 'lucide-react';
import { useMemo, useEffect } from 'react';
import { useCollection, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import { collection } from 'firebase/firestore';
import { useRouter } from 'next/navigation';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { RecentSales } from '@/components/dashboard/recent-sales';
import { AiRecommendations } from '@/components/dashboard/ai-recommendations';
import { Skeleton } from '@/components/ui/skeleton';
import { useUserProfile } from '@/hooks/useUserProfile';

// Types based on backend.json
type Order = {
  id: string;
  totalAmount: number;
  balanceDue: number;
  orderStatus: 'Pending Payment' | 'Processing' | 'Shipped' | 'Completed' | 'Cancelled' | 'Returned';
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
    const firestore = useFirestore();
    const { user } = useUser();
    const { userProfile } = useUserProfile();
    const router = useRouter();

    const isManagement = useMemo(() => userProfile?.roles.some(r => ['Admin', 'Owner'].includes(r)), [userProfile]);
    const isSales = useMemo(() => userProfile?.roles.includes('Sales'), [userProfile]);
    const isInventoryOnly = useMemo(() => userProfile?.roles.includes('Inventory') && !userProfile?.roles.includes('Sales') && !userProfile?.roles.includes('Admin') && !userProfile?.roles.includes('Owner'), [userProfile]);

    // Redirect Inventory users away from the dashboard immediately
    useEffect(() => {
        if (isInventoryOnly) {
            router.replace('/dashboard/products');
        }
    }, [isInventoryOnly, router]);

    // Queries - STRICT conditional checks based on role to prevent permission errors
    const ordersQuery = useMemoFirebase(
        () => (firestore && user && (isManagement || isSales) ? collection(firestore, 'orders') : null),
        [firestore, user, isManagement, isSales]
    );

    const orderItemsQuery = useMemoFirebase(
        () => (firestore && user && (isManagement || isSales) ? collection(firestore, 'orderItems') : null),
        [firestore, user, isManagement, isSales]
    );

    const expensesQuery = useMemoFirebase(
        () => (firestore && user && isManagement ? collection(firestore, 'expenses') : null),
        [firestore, user, isManagement]
    );
    
    // Data fetching
    const { data: orders, isLoading: isLoadingOrders } = useCollection<Order>(ordersQuery);
    const { data: orderItems, isLoading: isLoadingOrderItems } = useCollection<OrderItem>(orderItemsQuery);
    const { data: expenses, isLoading: isLoadingExpenses } = useCollection<Expense>(expensesQuery);

    const isLoading = isLoadingOrders || isLoadingOrderItems || (isManagement && isLoadingExpenses);

    const dashboardMetrics = useMemo(() => {
        if (!orders || !orderItems || (isManagement && !expenses)) {
            return {
                totalRevenue: 0,
                netProfit: 0,
                salesCount: 0,
                accountsReceivable: 0,
                arCount: 0,
            };
        }

        const validOrders = orders.filter(o => o.orderStatus !== 'Cancelled' && o.orderStatus !== 'Returned');
        const totalRevenue = validOrders.reduce((sum, order) => sum + order.totalAmount, 0);
        const salesCount = validOrders.length;
        
        const accountsReceivableData = orders.filter(o => o.balanceDue > 0);
        const accountsReceivable = accountsReceivableData.reduce((sum, order) => sum + order.balanceDue, 0);
        const arCount = accountsReceivableData.length;

        // Net Profit Calculation (Only if management can see expenses)
        let netProfit = 0;
        if (isManagement && expenses) {
            const validOrderIds = new Set(validOrders.map(o => o.id));
            const relevantOrderItems = orderItems.filter(item => validOrderIds.has(item.orderId));
            const totalCogs = relevantOrderItems.reduce((sum, item) => sum + ((item.costPriceAtSale || 0) * (item.quantity || 0)), 0);
            const operatingExpenses = expenses.reduce((sum, expense) => {
                if (expense.category.toLowerCase() !== 'cost of goods sold') {
                    return sum + expense.amount;
                }
                return sum;
            }, 0);
            const grossProfit = totalRevenue - totalCogs;
            netProfit = grossProfit - operatingExpenses;
        }

        return {
            totalRevenue,
            netProfit,
            salesCount,
            accountsReceivable,
            arCount,
        }

    }, [orders, orderItems, expenses, isManagement]);

  if (isInventoryOnly) {
    return (
        <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
            <Skeleton className="h-8 w-48" />
            <p className="text-muted-foreground">Redirecting to Inventory workspace...</p>
        </div>
    );
  }

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 md:gap-8 lg:grid-cols-4">
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
                    {isManagement ? `₱${dashboardMetrics.netProfit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'Restricted'}
                </div>
            )}
            <p className="text-xs text-muted-foreground">
              Revenue minus COGS and operating expenses.
            </p>
          </CardContent>
        </Card>
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
        <Card className="xl:col-span-3">
          <CardHeader>
            <CardTitle className="font-headline">Recent Sales</CardTitle>
          </CardHeader>
          <CardContent>
            <RecentSales />
          </CardContent>
        </Card>
      </div>
      {(isManagement || isSales) && (
        <div className="grid gap-4 md:gap-8">
            <AiRecommendations />
        </div>
      )}
    </>
  );
}
