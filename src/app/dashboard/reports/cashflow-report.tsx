'use client';
import { useState, useMemo, useEffect } from 'react';
import { DateRange } from 'react-day-picker';
import { startOfMonth, endOfMonth } from 'date-fns';
import { useUser, useSupabase } from '@/lib/supabase/hooks';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ReportDateFilter } from '@/components/dashboard/reports/report-date-filter';
import { Separator } from '@/components/ui/separator';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import Link from 'next/link';

type Payment = { amount: number; paymentDate: string; method?: string; orderId?: string; };
type Expense = { amount: number; expenseDate: string; category: string; description?: string; };

export function CashFlowReport() {
    const [date, setDate] = useState<DateRange | undefined>({
        from: startOfMonth(new Date()),
        to: endOfMonth(new Date()),
    });

    const supabase = useSupabase();
    const { user } = useUser();

    const [allPayments, setAllPayments] = useState<Payment[]>([]);
    const [allExpenses, setAllExpenses] = useState<Expense[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!supabase || !user) return;
        const fetchAll = async () => {
            setIsLoading(true);
            try {
                const [paymentsRes, expensesRes] = await Promise.all([
                    supabase.from('payments').select('amount, payment_date, created_at, payment_method, order_id'),
                    supabase.from('expenses').select('amount, created_at, category, description'),
                ]);

                setAllPayments((paymentsRes.data || []).map((p: any) => ({
                    amount: Number(p.amount) || 0,
                    paymentDate: p.payment_date || p.created_at,
                    method: p.payment_method || 'Unknown',
                    orderId: p.order_id,
                })));

                setAllExpenses((expensesRes.data || []).map((e: any) => ({
                    amount: Number(e.amount) || 0,
                    expenseDate: e.created_at,
                    category: e.category || 'Uncategorized',
                    description: e.description,
                })));
            } catch (err) {
                console.error('CashFlow fetch error:', err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchAll();
    }, [supabase, user]);

    const reportData = useMemo(() => {
        if (!date?.from || !date?.to) return { cashIn: 0, cashOut: 0, netCash: 0, periodPayments: [], periodExpenses: [] };

        const fromTime = date.from.getTime();
        const toDate = new Date(date.to); toDate.setHours(23, 59, 59, 999);
        const toTime = toDate.getTime();

        const periodPayments = allPayments.filter(p => {
            const t = new Date(p.paymentDate).getTime();
            return t >= fromTime && t <= toTime;
        });
        const periodExpenses = allExpenses.filter(e => {
            const t = new Date(e.expenseDate).getTime();
            return t >= fromTime && t <= toTime;
        });

        const totalCashIn = periodPayments.reduce((sum, p) => sum + p.amount, 0);
        const totalExpenses = periodExpenses.reduce((sum, e) => sum + e.amount, 0);
        const netCash = totalCashIn - totalExpenses;

        const expensesByCategory = periodExpenses.reduce((acc, expense) => {
            if (!acc[expense.category]) acc[expense.category] = { total: 0, items: [] };
            acc[expense.category].total += expense.amount;
            acc[expense.category].items.push(expense);
            return acc;
        }, {} as Record<string, { total: number, items: Expense[] }>);

        return { cashIn: totalCashIn, cashOut: totalExpenses, netCash, periodPayments, periodExpenses, expensesByCategory };
    }, [allPayments, allExpenses, date]);

    const ReportItem = ({ label, value, isBold = false, isNegative = false }: { label: string; value: number; isBold?: boolean; isNegative?: boolean; }) => (
        <div className={`flex justify-between py-3 ${isBold ? 'font-bold text-lg' : 'text-sm'}`}>
            <span className='text-muted-foreground'>{label}</span>
            <span className={isNegative ? 'text-destructive' : ''}>₱{value.toFixed(2)}</span>
        </div>
    );

    return (
        <Card>
            <CardHeader>
                <CardTitle className="font-headline">Cash Flow Tracker</CardTitle>
                <CardDescription>A report on the actual cash that moved in and out of the business.</CardDescription>
            </CardHeader>
            <CardContent>
                <ReportDateFilter date={date} setDate={setDate} />
                {isLoading ? (
                    <div className="space-y-4 mt-4">
                        <Skeleton className="h-8 w-3/4" />
                        <Skeleton className="h-8 w-1/2" />
                        <Skeleton className="h-8 w-full" />
                    </div>
                ) : (
                    <div className="max-w-md mx-auto mt-4">
                        <Accordion type="single" collapsible className="w-full">
                            <AccordionItem value="cash-in">
                                <AccordionTrigger className="hover:no-underline py-3">
                                    <div className="flex justify-between w-full pr-4 text-sm font-normal">
                                        <span className="text-muted-foreground">Total Cash In (Payments Received)</span>
                                        <span>₱{reportData.cashIn.toFixed(2)}</span>
                                    </div>
                                </AccordionTrigger>
                                <AccordionContent>
                                    <div className="space-y-2 pl-4">
                                        {(!reportData.periodPayments || reportData.periodPayments.length === 0) ? (
                                            <p className="text-sm text-muted-foreground">No payments received for this period.</p>
                                        ) : (
                                            reportData.periodPayments.map((payment, i) => (
                                                <div key={i} className="flex justify-between text-sm">
                                                    <span className="text-muted-foreground flex flex-col">
                                                        <span>{new Date(payment.paymentDate).toLocaleDateString()}</span>
                                                        <span className="text-xs opacity-70">
                                                            {payment.method}{payment.orderId ? (
                                                                <>
                                                                    {' • '}
                                                                    <Link href={`/dashboard/orders/${payment.orderId}`} className="hover:underline text-primary">
                                                                        Order #{payment.orderId.substring(0, 7).toUpperCase()}
                                                                    </Link>
                                                                </>
                                                            ) : ''}
                                                        </span>
                                                    </span>
                                                    <span>₱{payment.amount.toFixed(2)}</span>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </AccordionContent>
                            </AccordionItem>
                            <AccordionItem value="cash-out">
                                <AccordionTrigger className="hover:no-underline py-3">
                                    <div className="flex justify-between w-full pr-4 text-sm font-normal">
                                        <span className="text-muted-foreground">Total Cash Out (Expenses)</span>
                                        <span className={reportData.cashOut > 0 ? "text-destructive" : ""}>₱{reportData.cashOut.toFixed(2)}</span>
                                    </div>
                                </AccordionTrigger>
                                <AccordionContent>
                                    <div className="space-y-4 pl-4">
                                        <div>
                                            <h4 className="text-sm font-medium mb-2">Expenses</h4>
                                            {(!reportData.periodExpenses || reportData.periodExpenses.length === 0) ? (
                                                <p className="text-sm text-muted-foreground">No expenses for this period.</p>
                                            ) : (
                                                <Accordion type="multiple" className="w-full">
                                                    {Object.entries(reportData.expensesByCategory || {}).map(([category, data], i) => (
                                                        <AccordionItem value={`cat-${i}`} key={category} className="border-b-0">
                                                            <AccordionTrigger className="hover:no-underline py-2 text-sm font-normal">
                                                                <div className="flex justify-between w-full pr-4">
                                                                    <span className="text-muted-foreground">{category}</span>
                                                                    <span className="text-destructive">₱{data.total.toFixed(2)}</span>
                                                                </div>
                                                            </AccordionTrigger>
                                                            <AccordionContent>
                                                                <div className="space-y-3 pl-4 border-l ml-2 my-2">
                                                                    {data.items.map((expense, j) => (
                                                                        <div key={j} className="flex justify-between text-xs">
                                                                            <span className="text-muted-foreground flex flex-col max-w-[220px]">
                                                                                <span>{new Date(expense.expenseDate).toLocaleDateString()}</span>
                                                                                {expense.description && (
                                                                                    <span className="opacity-70 truncate" title={expense.description}>
                                                                                        {expense.description}
                                                                                    </span>
                                                                                )}
                                                                            </span>
                                                                            <span className="text-destructive">₱{expense.amount.toFixed(2)}</span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </AccordionContent>
                                                        </AccordionItem>
                                                    ))}
                                                </Accordion>
                                            )}
                                        </div>
                                    </div>
                                </AccordionContent>
                            </AccordionItem>
                        </Accordion>
                        <Separator className="my-2" />
                        <ReportItem label="Net Cash Flow" value={reportData.netCash} isBold isNegative={reportData.netCash < 0}/>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
