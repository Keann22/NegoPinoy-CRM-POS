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
import { fetchOrdersInRange, fetchAllPages, fetchOrderItemsForOrders } from '@/lib/services/report-orders-service';
import { REFUND_VOIDED_SALE_EXPENSE_CATEGORY } from '@/types/customer-returns.types';

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

interface PnlReportProps {
    date?: DateRange | undefined;
    setDate?: (date: DateRange | undefined) => void;
}

export function PnlReport({ date: externalDate, setDate: externalSetDate }: PnlReportProps = {}) {
    const [internalDate, setInternalDate] = useState<DateRange | undefined>({
        from: startOfMonth(new Date()),
        to: endOfMonth(new Date()),
    });

    const date = externalDate ?? internalDate;
    const setDate = externalSetDate ?? setInternalDate;

    const supabase = useSupabase();
    const { user } = useUser();

    const [reportData, setReportData] = useState<ReportData>(EMPTY_REPORT);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!supabase || !user) return;
        if (!date?.from) {
            setReportData(EMPTY_REPORT);
            setIsLoading(false);
            return;
        }

        const fromISO = date.from.toISOString();
        const toDateObj = new Date(date.to || date.from);
        toDateObj.setHours(23, 59, 59, 999);
        const toISO = toDateObj.toISOString();

        let isMounted = true;

        const fetchReport = async () => {
            setIsLoading(true);
            try {
                // Fetch orders using pagination helper to prevent 1000-row cap truncation
                const [ordersData, expensesData] = await Promise.all([
                    fetchOrdersInRange(supabase, {
                        selectCols: 'id, subtotal, total_discount, total_amount, status, order_date',
                        fromISO,
                        toISO,
                        dateColumn: 'order_date',
                        statusesToExclude: [],
                    }),
                    // Expenses also pass 1000 rows over a few months, so page them too.
                    fetchAllPages(() =>
                        supabase
                            .from('expenses')
                            .select('id, amount, category')
                            .gte('expense_date', fromISO)
                            .lte('expense_date', toISO)
                            .order('id')
                    ),
                ]);

                if (!isMounted) return;

                const orders = (ordersData || []).map((o: any) => ({
                    id: o.id,
                    subtotal: Number(o.subtotal) || 0,
                    totalDiscount: Number(o.total_discount) || 0,
                    totalAmount: Number(o.total_amount) || 0,
                    orderStatus: o.status,
                }));

                const validOrders = orders.filter((o: any) => !VOID_ORDER_STATUSES.includes(o.orderStatus));
                const returnedOrders = orders.filter((o: any) => VOID_ORDER_STATUSES.includes(o.orderStatus));

                const grossSales = validOrders.reduce((sum: number, o: any) => sum + (o.subtotal || (o.totalAmount + o.totalDiscount)), 0);
                const salesDiscounts = validOrders.reduce((sum: number, o: any) => sum + o.totalDiscount, 0);
                const salesReturns = returnedOrders.reduce((sum: number, o: any) => sum + o.totalAmount, 0);
                const netSales = grossSales - salesDiscounts;

                // Fetch order_items in chunks keyed off valid orders
                const validOrderIds = validOrders.map((o: any) => o.id);
                const itemsData = await fetchOrderItemsForOrders(supabase, validOrderIds, 'quantity, cost_price_at_sale');
                const cogs = itemsData.reduce((sum: number, item: any) => sum + (Number(item.cost_price_at_sale || 0) * Number(item.quantity || 0)), 0);

                const grossProfit = netSales - cogs;

                const expenses = expensesData.map((e: any) => ({
                    amount: Number(e.amount) || 0,
                    category: (e.category as string) || 'Uncategorized',
                }));
                // A full refund's order is Returned, so its amount is already in "Sales Returns" below;
                // its expense row (for Cash Flow) is skipped here so it isn't counted twice.
                const opBreakdown = expenses.reduce((acc: Record<string, number>, e: { amount: number; category: string }) => {
                    if (e.category.toLowerCase() !== 'cost of goods sold' && e.category !== REFUND_VOIDED_SALE_EXPENSE_CATEGORY) {
                        acc[e.category] = (acc[e.category] || 0) + e.amount;
                    }
                    return acc;
                }, {} as Record<string, number>);
                const operatingExpenses = (Object.values(opBreakdown) as number[]).reduce((s: number, a: number) => s + a, 0);

                const totalOtherLosses = salesReturns;
                const netProfit = grossProfit - operatingExpenses - totalOtherLosses;

                setReportData({
                    grossSales, salesReturns, salesDiscounts, netSales, cogs, grossProfit,
                    operatingExpenses, operatingExpensesBreakdown: opBreakdown,
                    badDebtExpense: 0, refundsExpense: 0, totalOtherLosses, netProfit,
                });
            } catch (err) {
                console.error('P&L fetch error:', err);
                if (isMounted) setReportData(EMPTY_REPORT);
            } finally {
                if (isMounted) setIsLoading(false);
            }
        };
        fetchReport();

        return () => {
            isMounted = false;
        };
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
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <CardTitle className="font-headline">Profit &amp; Loss Statement</CardTitle>
                        <CardDescription>An accrual-based P&amp;L report for the selected period, reflecting your business operations.</CardDescription>
                    </div>
                    <ReportDateFilter date={date} setDate={setDate} className="mb-0" />
                </div>
            </CardHeader>
            <CardContent>
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
