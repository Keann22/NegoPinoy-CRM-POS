'use client';

import { useMemo, useState } from 'react';
import { useCollection, useSupabase, useUser, collection, query, orderBy } from '@/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { DateRange } from 'react-day-picker';
import Link from 'next/link';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { AddExpenseDialog } from '@/components/dashboard/accounting/add-expense-dialog';
import { PostRecurringExpensesButton } from '@/components/dashboard/accounting/post-recurring-expenses-button';
import { useUserProfile } from '@/hooks/useUserProfile';
import { ReportDateFilter } from '@/components/dashboard/reports/report-date-filter';

// Matches the Firestore document structure for an expense
type Expense = {
  id: string;
  expenseDate: string; // ISO string
  amount: number;
  category: string;
  description?: string;
};

const renderDescription = (desc?: string) => {
    if (!desc) return 'N/A';
    
    // Split by `#` followed by 5+ alphanumeric chars
    const parts = desc.split(/(#[a-zA-Z0-9]{5,})/gi);
    
    return parts.map((part, index) => {
        const match = part.match(/^#([a-zA-Z0-9]{5,})$/i);
        if (match) {
            const shortId = match[1];
            return (
                <Link key={index} href={`/dashboard/orders?search=${shortId}`} className="text-primary hover:underline font-semibold">
                    {part}
                </Link>
            );
        }
        return <span key={index}>{part}</span>;
    });
};

export default function ExpensesPage() {
  const supabase = useSupabase();
  const { user } = useUser();
  const { userProfile } = useUserProfile();

  const [date, setDate] = useState<DateRange | undefined>({
      from: startOfMonth(new Date()),
      to: endOfMonth(new Date()),
  });

  const isManagement = useMemo(() => userProfile?.roles.some(r => ['Admin', 'Owner'].includes(r)), [userProfile]);

  // CRITICAL: Strict role check before query
  const expensesQuery = useMemo(
    () => (supabase && user && isManagement ? query(collection(supabase, 'expenses'), orderBy('expenseDate', 'desc')) : null),
    [supabase, user, isManagement]
  );
  const { data: expenses, isLoading } = useCollection<Omit<Expense, 'id'>>(expensesQuery);

  const filteredExpenses = useMemo(() => {
      if (!expenses) return null;
      if (!date?.from || !date?.to) return expenses;

      const fromTime = date.from.getTime();
      const toDate = new Date(date.to);
      toDate.setHours(23, 59, 59, 999);
      const toTime = toDate.getTime();

      return expenses.filter(exp => {
          const t = new Date(exp.expenseDate).getTime();
          return t >= fromTime && t <= toTime;
      });
  }, [expenses, date]);

  const totalExpenses = useMemo(() => {
    if (!filteredExpenses) return 0;
    return filteredExpenses.reduce((sum, exp) => sum + exp.amount, 0);
  }, [filteredExpenses]);

  const expensesByCategory = useMemo(() => {
    if (!filteredExpenses) return null;
    return filteredExpenses.reduce((acc, exp) => {
        if (!acc[exp.category]) acc[exp.category] = { total: 0, items: [] };
        acc[exp.category].total += exp.amount;
        acc[exp.category].items.push(exp);
        return acc;
    }, {} as Record<string, { total: number, items: any[] }>);
  }, [filteredExpenses]);

  if (userProfile && !isManagement) {
    return (
        <Card className="m-6 border-destructive/20 bg-destructive/5">
            <CardHeader>
                <CardTitle className="text-destructive">Access Denied</CardTitle>
                <CardDescription>You do not have permission to view financial records or expenses.</CardDescription>
            </CardHeader>
        </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle className="font-headline">Expenses</CardTitle>
          <CardDescription>
            View and record your business's operational costs.
          </CardDescription>
        </div>
        <div className='flex gap-2'>
          <PostRecurringExpensesButton />
          <AddExpenseDialog />
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <ReportDateFilter date={date} setDate={setDate} />
        </div>
        {isLoading ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Total Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 5 }).map((_, i) => (
                   <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                   </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : !filteredExpenses || filteredExpenses.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center border-2 border-dashed rounded-lg p-12 mt-4">
                <p className="text-lg font-semibold">No expenses found</p>
                <p className="text-muted-foreground mt-2">
                    Click "Add Expense" to get started.
                </p>
            </div>
        ) : (
            <Accordion type="multiple" className="w-full border rounded-md">
              {expensesByCategory && Object.entries(expensesByCategory).map(([category, data], i) => (
                  <AccordionItem value={`cat-${i}`} key={category} className="last:border-b-0">
                    <AccordionTrigger className="hover:no-underline px-4 py-3 bg-muted/30">
                      <div className="flex justify-between w-full font-semibold pr-4">
                        <span>{category}</span>
                        <span className="text-destructive">₱{data.total.toFixed(2)}</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pt-2 px-2">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[150px]">Date</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.items.map((expense) => (
                            <TableRow key={expense.id}>
                              <TableCell className="w-[150px]">{format(new Date(expense.expenseDate), 'MMM d, yyyy')}</TableCell>
                              <TableCell className="font-medium">{renderDescription(expense.description)}</TableCell>
                              <TableCell className="text-right">₱{expense.amount.toFixed(2)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </AccordionContent>
                  </AccordionItem>
              ))}
            </Accordion>
        )}
      </CardContent>
      {filteredExpenses && filteredExpenses.length > 0 && (
        <CardFooter className="justify-end space-x-2 font-semibold">
           <span>Total Expenses:</span> 
           <span>₱{totalExpenses.toFixed(2)}</span>
        </CardFooter>
      )}
    </Card>
  );
}
