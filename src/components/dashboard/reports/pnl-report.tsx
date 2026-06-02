'use client';
import { useState, useMemo } from 'react';
import { DateRange } from 'react-day-picker';
import { startOfMonth, endOfMonth } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ReportDateFilter } from './report-date-filter';
import { Separator } from '@/components/ui/separator';
import { useCollection, useSupabase, useUser, collection, query, where } from '@/firebase';

type Order = {
    id: string;
    totalAmount: number;
    orderDate: string;
    orderStatus: string;
};

type OrderItem = {
    orderId: string;
    quantity: number;
    costPriceAtSale: number;
};

type Expense = {
    amount: number;
    expenseDate: string;
    category: string;
};

type BadDebt = {
    amount: number;
    writeOffDate: string;
}

export function PnlReport() {
    const [date, setDate] = useState<DateRange | undefined>({
        from: startOfMonth(new Date()),
        to: endOfMonth(new Date()),
    });

    const supabase = useSupabase();
    const { user } = useUser();

    // Queries - Fetch all data and filter on the client
    const allOrdersQuery = useMemo(() => {
        if (!supabase || !user) return null;
        return query(collection(supabase, 'orders'), where('orderStatus', '!=', 'Cancelled'));
    }, [supabase, user]);
    const { data: allOrders, isLoading: isLoadingOrders } = useCollection<Order>(allOrdersQuery);

    const allExpensesQuery = useMemo(() => {
        if (!supabase || !user) return null;
        return collection(supabase, 'expenses');
    }, [supabase, user]);
    const { data: allExpenses, isLoading: isLoadingExpenses } = useCollection<Expense>(allExpensesQuery);

    const allBadDebtsQuery = useMemo(() => {
        if (!supabase || !user) return null;
        return collection(supabase, 'badDebts');
    }, [supabase, user]);
    const { data: allBadDebts, isLoading: isLoadingBadDebts } = useCollection<BadDebt>(allBadDebtsQuery);

    const allOrderItemsQuery = useMemo(() => {
        if (!supabase || !user) return null;
        return collection(supabase, 'orderItems');
    }, [supabase, user]);
    const { data: allOrderItems, isLoading: isLoadingOrderItems } = useCollection<OrderItem>(allOrderItemsQuery);

    const isLoading = isLoadingOrders || isLoadingExpenses || isLoadingBadDebts || isLoadingOrderItems;

    // Client-side filtering
    const orders = useMemo(() => {
        if (!allOrders || !date?.from || !date?.to) return null;
        const fromTime = date.from.getTime();
        const toTime = date.to.getTime();
        return allOrders.filter(order => {
            const orderTime = new Date(order.orderDate).getTime();
            return orderTime >= fromTime && orderTime <= toTime;
        });
    }, [allOrders, date]);

    const expenses = useMemo(() => {
        if (!allExpenses || !date?.from || !date?.to) return null;
        const fromTime = date.from.getTime();
        const toTime = date.to.getTime();
        return allExpenses.filter(expense => {
            const expenseTime = new Date(expense.expenseDate).getTime();
            return expenseTime >= fromTime && expenseTime <= toTime;
        });
    }, [allExpenses, date]);
    
    const badDebts = useMemo(() => {
        if (!allBadDebts || !date?.from || !date?.to) return null;
        const fromTime = date.from.getTime();
        const toTime = date.to.getTime();
        return allBadDebts.filter(debt => {
            const debtTime = new Date(debt.writeOffDate).getTime();
            return debtTime >= fromTime && debtTime <= toTime;
        });
    }, [allBadDebts, date]);


    const reportData = useMemo(() => {
        if (!orders || !allOrderItems || !expenses || !badDebts) {
             return { revenue: 0, cogs: 0, grossProfit: 0, operatingExpenses: 0, badDebtExpense: 0, netProfit: 0 };
        }
        
        const totalRevenue = orders.reduce((sum, order) => sum + order.totalAmount, 0);

        const orderIds = new Set(orders.map(o => o.id));
        const relevantOrderItems = allOrderItems.filter(item => orderIds.has(item.orderId));
        
        const totalCogs = relevantOrderItems.reduce((sum, item) => sum + ((item.costPriceAtSale || 0) * (item.quantity || 0)), 0);

        const operatingExpenses = expenses.reduce((sum, expense) => {
            if (expense.category.toLowerCase() !== 'cost of goods sold') {
                return sum + expense.amount;
            }
            return sum;
        }, 0);
        
        const totalBadDebt = badDebts.reduce((sum, debt) => sum + debt.amount, 0);

        const grossProfit = totalRevenue - totalCogs;
        const netProfit = grossProfit - operatingExpenses - totalBadDebt;

        return {
            revenue: totalRevenue,
            cogs: totalCogs,
            grossProfit,
            operatingExpenses,
            badDebtExpense: totalBadDebt,
            netProfit,
        };
    }, [orders, allOrderItems, expenses, badDebts]);

    const ReportItem = ({ label, value, isBold = false, isNegative = false }: { label: string; value: number; isBold?: boolean; isNegative?: boolean; }) => (
        <div className={`flex justify-between py-2 ${isBold ? 'font-bold' : ''}`}>
            <span>{label}</span>
            <span className={isNegative ? 'text-destructive' : ''}>₱{value.toFixed(2)}</span>
        </div>
    );
    
    return (
        <Card>
            <CardHeader>
                <CardTitle className="font-headline">Profit &amp; Loss Statement</CardTitle>
                <CardDescription>An accrual-based P&amp;L report for the selected period.</CardDescription>
            </CardHeader>
            <CardContent>
                <ReportDateFilter date={date} setDate={setDate} />
                {isLoading ? (
                    <div className="space-y-4 mt-4">
                        <Skeleton className="h-8 w-3/4" />
                        <Skeleton className="h-8 w-1/2" />
                        <Skeleton className="h-8 w-3/4" />
                        <Skeleton className="h-8 w-full" />
                        <Skeleton className="h-8 w-1/2" />
                        <Skeleton className="h-8 w-3/4" />
                    </div>
                ) : (
                    <div className="max-w-2xl mx-auto mt-4">
                        <ReportItem label="Total Revenue" value={reportData.revenue} />
                        <ReportItem label="Cost of Goods Sold (COGS)" value={-reportData.cogs} />
                        <Separator />
                        <ReportItem label="Gross Profit" value={reportData.grossProfit} isBold />
                        <Separator />
                        <ReportItem label="Operating Expenses" value={-reportData.operatingExpenses} />
                        <ReportItem label="Bad Debt Expense" value={-reportData.badDebtExpense} />
                        <Separator />
                        <ReportItem label="Net Profit" value={reportData.netProfit} isBold isNegative={reportData.netProfit < 0} />
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
