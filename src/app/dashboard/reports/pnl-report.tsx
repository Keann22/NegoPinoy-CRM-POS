'use client';
import { useState, useEffect } from 'react';
import { DateRange } from 'react-day-picker';
import { startOfMonth, endOfMonth } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ReportDateFilter } from '@/components/dashboard/reports/report-date-filter';
import { Separator } from '@/components/ui/separator';
import { useUser, useSupabase } from '@/lib/supabase/hooks';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from '@/lib/utils';

type ReportData = {
    grossSales: number;
    salesReturns: number;
    salesDiscounts: number;
    netSales: number;
    cogs: number;
    grossProfit: number;
    operatingExpenses: number;
    operatingExpensesBreakdown: Record<string, number>;
    badDebtExpense: number;
    refundsExpense: number;
    totalOtherLosses: number;
    netProfit: number;
};

const EMPTY_REPORT: ReportData = {
    grossSales: 0, salesReturns: 0, salesDiscounts: 0, netSales: 0,
    cogs: 0, grossProfit: 0, operatingExpenses: 0,
    operatingExpensesBreakdown: {},
    badDebtExpense: 0, refundsExpense: 0, totalOtherLosses: 0, netProfit: 0,
};

const VOID_ORDER_STATUSES = ['Cancelled', 'Returned'];

export function PnlReport() {
    const [date, setDate] = useState<DateRange | undefined>({
        from: startOfMonth(new Date()),
        to: endOfMonth(new Date()),
    });

    const supabase = useSupabase();
    const { user } = useUser();

    const [reportData, setReportData] = useState<ReportData>(EMPTY_REPORT);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!supabase || !user) return;
        if (!date?.from || !date?.to) {
            setReportData(EMPTY_REPORT);
            setIsLoading(false);
            return;
        }

        const fromISO = date.from.toISOString();
        const toDate = new Date(date.to);
        toDate.setHours(23, 59, 59, 999);
        const toISO = toDate.toISOString();

        const fetchReport = async () => {
            setIsLoading(true);
            try {
                // Scope both queries to the selected period at the database level -
                // an unbounded select() silently caps at 1000 rows, which previously
                // made this report drop the majority of the business's order history.
                const [ordersRes, expensesRes] = await Promise.all([
                    supabase
                        .from('orders')
                        .select('id, subtotal, total_discount, total_amount, status')
                        .gte('order_date', fromISO)
                        .lte('order_date', toISO),
                    supabase
                        .from('expenses')
                        .select('amount, category')
                        .gte('expense_date', fromISO)
                        .lte('expense_date', toISO),
                ]);

                const orders = (ordersRes.data || []).map((o: any) => ({
                    id: o.id,
                    subtotal: Number(o.subtotal) || 0,
                    totalDiscount: Number(o.total_discount) || 0,
                    totalAmount: Number(o.total_amount) || 0,
                    orderStatus: o.status,
                }));

                const validOrders = orders.filter(o => !VOID_ORDER_STATUSES.includes(o.orderStatus));
                const returnedOrders = orders.filter(o => VOID_ORDER_STATUSES.includes(o.orderStatus));

                const grossSales = validOrders.reduce((sum, o) => sum + (o.subtotal || (o.totalAmount + o.totalDiscount)), 0);
                const salesDiscounts = validOrders.reduce((sum, o) => sum + o.totalDiscount, 0);
                const salesReturns = returnedOrders.reduce((sum, o) => sum + o.totalAmount, 0);
                const netSales = grossSales - salesDiscounts;

                // Fetch order_items in chunks keyed off the already date-scoped orders,
                // same pattern the dashboard home page uses, to stay under row limits.
                let cogs = 0;
                const validOrderIds = validOrders.map(o => o.id);
                const chunkSize = 500;
                for (let i = 0; i < validOrderIds.length; i += chunkSize) {
                    const chunk = validOrderIds.slice(i, i + chunkSize);
                    const { data: itemsData } = await supabase
                        .from('order_items')
                        .select('quantity, cost_price_at_sale')
                        .in('order_id', chunk);
                    if (itemsData) {
                        cogs += itemsData.reduce((sum: number, item: any) => sum + (Number(item.cost_price_at_sale || 0) * Number(item.quantity || 0)), 0);
                    }
                }

                const grossProfit = netSales - cogs;

                const expenses = (expensesRes.data || []).map((e: any) => ({
                    amount: Number(e.amount) || 0,
                    category: e.category || 'Uncategorized',
                }));
                const opBreakdown = expenses.reduce((acc, e) => {
                    if (e.category.toLowerCase() !== 'cost of goods sold') {
                        acc[e.category] = (acc[e.category] || 0) + e.amount;
                    }
                    return acc;
                }, {} as Record<string, number>);
                const operatingExpenses = Object.values(opBreakdown).reduce((s, a) => s + a, 0);

                const totalOtherLosses = salesReturns;
                const netProfit = grossProfit - operatingExpenses - totalOtherLosses;

                setReportData({
                    grossSales, salesReturns, salesDiscounts, netSales, cogs, grossProfit,
                    operatingExpenses, operatingExpensesBreakdown: opBreakdown,
                    badDebtExpense: 0, refundsExpense: 0, totalOtherLosses, netProfit,
                });
            } catch (err) {
                console.error('P&L fetch error:', err);
                setReportData(EMPTY_REPORT);
            } finally {
                setIsLoading(false);
            }
        };
        fetchReport();
    }, [supabase, user, date]);

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
                        <ReportItem label="Total COGS" value={-reportData.cogs} />

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
