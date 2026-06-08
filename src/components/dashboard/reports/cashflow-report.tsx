'use client';
import { useState, useMemo } from 'react';
import { DateRange } from 'react-day-picker';
import { startOfMonth, endOfMonth } from 'date-fns';
import { useCollection, useSupabase, useUser, collection, query, where } from '@/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ReportDateFilter } from './report-date-filter';
import { Separator } from '@/components/ui/separator';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';

type Payment = {
    amount: number;
    paymentDate: string;
};

type Expense = {
    amount: number;
    expenseDate: string;
};

type Refund = {
    amount: number;
    refundDate: string;
};

export function CashFlowReport() {
    const [date, setDate] = useState<DateRange | undefined>({
        from: startOfMonth(new Date()),
        to: endOfMonth(new Date()),
    });

    const supabase = useSupabase();
    const { user } = useUser();

    // Queries
    const paymentsQuery = useMemo(() => {
        if (!supabase || !user || !date?.from || !date?.to) return null;
        return query(
            collection(supabase, 'payments'),
            where('paymentDate', '>=', date.from.toISOString()),
            where('paymentDate', '<=', date.to.toISOString())
        );
    }, [supabase, user, date]);
    
    const expensesQuery = useMemo(() => {
        if (!supabase || !user || !date?.from || !date?.to) return null;
        return query(
            collection(supabase, 'expenses'),
            where('expenseDate', '>=', date.from.toISOString()),
            where('expenseDate', '<=', date.to.toISOString())
        );
    }, [supabase, user, date]);
    
    const refundsQuery = useMemo(() => {
        if (!supabase || !user || !date?.from || !date?.to) return null;
        return query(
            collection(supabase, 'refunds'),
            where('refundDate', '>=', date.from.toISOString()),
            where('refundDate', '<=', date.to.toISOString())
        );
    }, [supabase, user, date]);


    // Fetch data
    const { data: payments, isLoading: isLoadingPayments } = useCollection<Payment>(paymentsQuery);
    const { data: expenses, isLoading: isLoadingExpenses } = useCollection<Expense>(expensesQuery);
    const { data: refunds, isLoading: isLoadingRefunds } = useCollection<Refund>(refundsQuery);

    const isLoading = isLoadingPayments || isLoadingExpenses || isLoadingRefunds;

    const reportData = useMemo(() => {
        if (!payments || !expenses || !refunds) {
            return { cashIn: 0, cashOut: 0, netCash: 0 };
        }

        const totalCashIn = payments.reduce((sum, payment) => sum + payment.amount, 0);
        const totalExpenses = expenses.reduce((sum, expense) => sum + expense.amount, 0);
        const totalRefunds = refunds.reduce((sum, refund) => sum + refund.amount, 0);
        
        const totalCashOut = totalExpenses + totalRefunds;
        const netCash = totalCashIn - totalCashOut;

        return {
            cashIn: totalCashIn,
            cashOut: totalCashOut,
            netCash,
        };
    }, [payments, expenses, refunds]);

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
                                        {(!payments || payments.length === 0) ? (
                                            <p className="text-sm text-muted-foreground">No payments received for this period.</p>
                                        ) : (
                                            payments.map((payment, i) => (
                                                <div key={i} className="flex justify-between text-sm">
                                                    <span className="text-muted-foreground">{new Date(payment.paymentDate).toLocaleDateString()}</span>
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
                                        <span className="text-destructive">₱{reportData.cashOut.toFixed(2)}</span>
                                    </div>
                                </AccordionTrigger>
                                <AccordionContent>
                                    <div className="space-y-4 pl-4">
                                        <div>
                                            <h4 className="text-sm font-medium mb-2">Expenses</h4>
                                            {(!expenses || expenses.length === 0) ? (
                                                <p className="text-sm text-muted-foreground">No expenses for this period.</p>
                                            ) : (
                                                <div className="space-y-2">
                                                    {expenses.map((expense, i) => (
                                                        <div key={i} className="flex justify-between text-sm">
                                                            <span className="text-muted-foreground">{new Date(expense.expenseDate).toLocaleDateString()}</span>
                                                            <span className="text-destructive">₱{expense.amount.toFixed(2)}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-medium mb-2">Refunds</h4>
                                            {(!refunds || refunds.length === 0) ? (
                                                <p className="text-sm text-muted-foreground">No refunds for this period.</p>
                                            ) : (
                                                <div className="space-y-2">
                                                    {refunds.map((refund, i) => (
                                                        <div key={i} className="flex justify-between text-sm">
                                                            <span className="text-muted-foreground">{new Date(refund.refundDate).toLocaleDateString()}</span>
                                                            <span className="text-destructive">₱{refund.amount.toFixed(2)}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </AccordionContent>
                            </AccordionItem>
                        </Accordion>
                        <Separator className="my-2" />
                        <ReportItem label="Net Cash Flow" value={reportData.netCash} isBold isNegative={reportData.netCash < 0} />
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
