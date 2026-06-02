'use client';
import { useState, useMemo, useEffect } from 'react';
import { DateRange } from 'react-day-picker';
import { startOfMonth, endOfMonth } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ReportDateFilter } from '@/components/dashboard/reports/report-date-filter';
import { Separator } from '@/components/ui/separator';
import { useUser, useSupabase } from '@/firebase';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from '@/lib/utils';

type Order = {
    id: string;
    subtotal: number;
    totalDiscount: number;
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

export function PnlReport() {
    const [date, setDate] = useState<DateRange | undefined>({
        from: startOfMonth(new Date()),
        to: endOfMonth(new Date()),
    });

    const supabase = useSupabase();
    const { user } = useUser();

    const [allOrders, setAllOrders] = useState<Order[]>([]);
    const [allOrderItems, setAllOrderItems] = useState<OrderItem[]>([]);
    const [allExpenses, setAllExpenses] = useState<Expense[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!supabase || !user) return;
        const fetchAll = async () => {
            setIsLoading(true);
            try {
                const [ordersRes, itemsRes, expensesRes] = await Promise.all([
                    supabase.from('orders').select('id, subtotal, total_discount, total_amount, status, order_date, created_at'),
                    supabase.from('order_items').select('order_id, quantity, cost_price_at_sale'),
                    supabase.from('expenses').select('amount, created_at, category'),
                ]);

                setAllOrders((ordersRes.data || []).map((o: any) => ({
                    id: o.id,
                    subtotal: Number(o.subtotal) || 0,
                    totalDiscount: Number(o.total_discount) || 0,
                    totalAmount: Number(o.total_amount) || 0,
                    orderStatus: o.status,
                    orderDate: o.order_date || o.created_at,
                })));

                setAllOrderItems((itemsRes.data || []).map((i: any) => ({
                    orderId: i.order_id,
                    quantity: Number(i.quantity) || 0,
                    costPriceAtSale: Number(i.cost_price_at_sale) || 0,
                })));

                setAllExpenses((expensesRes.data || []).map((e: any) => ({
                    amount: Number(e.amount) || 0,
                    expenseDate: e.created_at,
                    category: e.category || 'Uncategorized',
                })));
            } catch (err) {
                console.error('P&L fetch error:', err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchAll();
    }, [supabase, user]);

    const reportData = useMemo(() => {
        const defaults = {
            grossSales: 0, salesReturns: 0, salesDiscounts: 0, netSales: 0,
            cogs: 0, grossProfit: 0, operatingExpenses: 0,
            operatingExpensesBreakdown: {} as Record<string, number>,
            badDebtExpense: 0, refundsExpense: 0, totalOtherLosses: 0, netProfit: 0,
        };

        if (!date?.from || !date?.to) return defaults;

        const fromTime = date.from.getTime();
        const toDate = new Date(date.to); toDate.setHours(23, 59, 59, 999);
        const toTime = toDate.getTime();

        const periodOrders = allOrders.filter(o => {
            const t = new Date(o.orderDate).getTime();
            return t >= fromTime && t <= toTime;
        });

        const periodExpenses = allExpenses.filter(e => {
            const t = new Date(e.expenseDate).getTime();
            return t >= fromTime && t <= toTime;
        });

        const validOrders = periodOrders.filter(o => o.orderStatus !== 'Cancelled' && o.orderStatus !== 'Returned');
        const returnedOrders = periodOrders.filter(o => o.orderStatus === 'Cancelled' || o.orderStatus === 'Returned');

        const grossSales = validOrders.reduce((sum, o) => sum + (o.subtotal || (o.totalAmount + (o.totalDiscount || 0))), 0);
        const salesDiscounts = validOrders.reduce((sum, o) => sum + (o.totalDiscount || 0), 0);
        const salesReturns = returnedOrders.reduce((sum, o) => sum + o.totalAmount, 0);
        const netSales = grossSales - salesDiscounts;

        const validOrderIds = new Set(validOrders.map(o => o.id));
        const relevantItems = allOrderItems.filter(i => validOrderIds.has(i.orderId));
        const cogs = relevantItems.reduce((sum, i) => sum + (i.costPriceAtSale * i.quantity), 0);
        const grossProfit = netSales - cogs;

        const opBreakdown = periodExpenses.reduce((acc, e) => {
            if (e.category.toLowerCase() !== 'cost of goods sold') {
                acc[e.category] = (acc[e.category] || 0) + e.amount;
            }
            return acc;
        }, {} as Record<string, number>);
        const operatingExpenses = Object.values(opBreakdown).reduce((s, a) => s + a, 0);

        const totalOtherLosses = salesReturns;
        const netProfit = grossProfit - operatingExpenses - totalOtherLosses;

        return { grossSales, salesReturns, salesDiscounts, netSales, cogs, grossProfit, operatingExpenses, operatingExpensesBreakdown: opBreakdown, badDebtExpense: 0, refundsExpense: 0, totalOtherLosses, netProfit };
    }, [allOrders, allOrderItems, allExpenses, date]);

    const ReportItem = ({ label, value, isBold = false, isNegative = false, isSubItem = false, isFinal = false }: { label: string; value: number; isBold?: boolean; isNegative?: boolean; isSubItem?: boolean; isFinal?: boolean }) => (
        <div className={cn("flex justify-between py-2", isBold && "font-bold", isSubItem && "pl-4 text-sm")}>
            <span>{label}</span>
            <span className={cn(isNegative && 'text-destructive', isFinal && 'border-t-2 border-b-4 double border-foreground py-1 my-1')}>{`₱${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</span>
        </div>
    );

    return (
        <Card>
            <CardHeader>
                <CardTitle className="font-headline">Profit &amp; Loss Statement</CardTitle>
                <CardDescription>An accrual-based P&amp;L report for the selected period, reflecting your business operations.</CardDescription>
            </CardHeader>
            <CardContent>
                <ReportDateFilter date={date} setDate={setDate} />
                {isLoading ? (
                    <div className="space-y-4 mt-4 max-w-2xl mx-auto">
                        <Skeleton className="h-8 w-full" />
                        <Skeleton className="h-8 w-full" />
                        <Skeleton className="h-8 w-full" />
                        <Separator />
                        <Skeleton className="h-8 w-full" />
                        <Skeleton className="h-8 w-full" />
                        <Separator />
                        <Skeleton className="h-10 w-full" />
                    </div>
                ) : (
                    <div className="max-w-2xl mx-auto mt-4 text-base">
                        <h3 className='font-bold text-lg mb-2'>Revenue</h3>
                        <ReportItem label="Gross Sales" value={reportData.grossSales} isSubItem />
                        <ReportItem label="Less: Sales Discounts" value={-reportData.salesDiscounts} isSubItem />
                        <ReportItem label="Net Sales" value={reportData.netSales} isBold />

                        <Separator className='my-4'/>

                        <h3 className='font-bold text-lg mb-2'>Cost of Goods Sold</h3>
                        <ReportItem label="Total FIFO COGS" value={-reportData.cogs} />

                        <Separator className='my-4' />

                        <ReportItem label="Gross Profit" value={reportData.grossProfit} isBold />

                        <Separator className='my-4' />

                        <h3 className='font-bold text-lg mb-2'>Operating Expenses</h3>
                        <Accordion type="single" collapsible className="w-full">
                            <AccordionItem value="operating-expenses" className="border-b-0 -my-2">
                                <AccordionTrigger className="py-2 font-normal hover:no-underline">
                                <div className="flex flex-1 justify-between">
                                    <span>Total Operating Expenses</span>
                                    <span>{`₱${(-reportData.operatingExpenses).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</span>
                                </div>
                                </AccordionTrigger>
                                <AccordionContent className="pl-8 pt-2">
                                {Object.entries(reportData.operatingExpensesBreakdown)
                                    .sort(([a], [b]) => a.localeCompare(b))
                                    .map(([category, amount]) => (
                                    <div key={category} className="flex justify-between py-1 text-sm text-muted-foreground">
                                        <span>{category}</span>
                                        <span>{`₱${(-amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</span>
                                    </div>
                                    ))}
                                </AccordionContent>
                            </AccordionItem>
                        </Accordion>

                        <Separator className='my-4' />

                        <h3 className='font-bold text-lg mb-2'>Other Losses &amp; Adjustments</h3>
                        <ReportItem label="Sales Returns &amp; Allowances" value={-reportData.salesReturns} isSubItem />

                        <Separator className='my-4' />

                        <ReportItem label="Net Profit" value={reportData.netProfit} isBold isNegative={reportData.netProfit < 0} isFinal/>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
