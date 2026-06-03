'use client';

import { useMemo, useState } from 'react';
import { useCollection, useSupabase, useUser, collection, query, orderBy } from '@/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { DateRange } from 'react-day-picker';
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
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && Array.from({ length: 5 }).map((_, i) => (
                 <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                 </TableRow>
            ))}
            {filteredExpenses && filteredExpenses.map((expense) => (
              <TableRow key={expense.id}>
                <TableCell>{format(new Date(expense.expenseDate), 'MMM d, yyyy')}</TableCell>
                <TableCell className="font-medium">{expense.description || 'N/A'}</TableCell>
                <TableCell>{expense.category}</TableCell>
                <TableCell className="text-right">₱{expense.amount.toFixed(2)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!isLoading && (!filteredExpenses || filteredExpenses.length === 0) && (
            <div className="flex flex-col items-center justify-center text-center border-2 border-dashed rounded-lg p-12 mt-4">
                <p className="text-lg font-semibold">No expenses found</p>
                <p className="text-muted-foreground mt-2">
                    Click "Add Expense" to get started.
                </p>
            </div>
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
