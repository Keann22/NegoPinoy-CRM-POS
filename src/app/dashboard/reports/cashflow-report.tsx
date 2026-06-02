'use client';
import { useState, useMemo, useEffect } from 'react';
import { DateRange } from 'react-day-picker';
import { startOfMonth, endOfMonth } from 'date-fns';
import { useUser, useSupabase } from '@/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ReportDateFilter } from '@/components/dashboard/reports/report-date-filter';
import { Separator } from '@/components/ui/separator';

type Payment = { amount: number; paymentDate: string; };
type Expense = { amount: number; expenseDate: string; category: string; };

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
                    supabase.from('payments').select('amount, payment_date, created_at'),
                    supabase.from('expenses').select('amount, created_at, category'),
                ]);

                setAllPayments((paymentsRes.data || []).map((p: any) => ({
                    amount: Number(p.amount) || 0,
                    paymentDate: p.payment_date || p.created_at,
                })));

                setAllExpenses((expensesRes.data || []).map((e: any) => ({
                    amount: Number(e.amount) || 0,
                    expenseDate: e.created_at,
                    category: e.category || 'Uncategorized',
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
        if (!date?.from || !date?.to) return { cashIn: 0, cashOut: 0, netCash: 0 };

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

        return { cashIn: totalCashIn, cashOut: totalExpenses, netCash };
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
                        <ReportItem label="Total Cash In (Payments Received)" value={reportData.cashIn} />
                        <ReportItem label="Total Cash Out (Expenses)" value={-reportData.cashOut} isNegative={reportData.cashOut > 0} />
                        <Separator />
                        <ReportItem label="Net Cash Flow" value={reportData.netCash} isBold isNegative={reportData.netCash < 0}/>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
