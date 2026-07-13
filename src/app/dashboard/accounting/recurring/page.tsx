'use client';

import { useMemo, useEffect, useState } from 'react';
import { useSupabase, useUser } from '@/lib/supabase/hooks';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Card,
  CardContent,
  CardDescription,
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
import { AddRecurringExpenseDialog } from '@/components/dashboard/accounting/add-recurring-expense-dialog';
import { useUserProfile } from '@/hooks/useUserProfile';

// Matches the Firestore document structure for a recurring expense
type RecurringExpense = {
  id: string;
  name: string;
  amount: number;
  category: string;
  dayOfMonth: number;
};

export default function RecurringExpensesPage() {
  const supabase = useSupabase();
  const { user } = useUser();
  const { userProfile } = useUserProfile();

  const isManagement = useMemo(() => userProfile?.roles.some(r => ['Admin', 'Owner'].includes(r)), [userProfile]);

  const [recurringExpenses, setRecurringExpenses] = useState<RecurringExpense[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!supabase || !user || !isManagement) return;
    const fetch = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('recurring_expenses')
          .select('*')
          .order('day_of_month', { ascending: true });
        if (error) throw error;
        setRecurringExpenses((data || []).map((e: any) => ({
          id: e.id,
          name: e.name,
          amount: e.amount,
          category: e.category,
          dayOfMonth: e.day_of_month,
        })));
      } catch (err) { console.error('Recurring expenses fetch error:', err); }
      finally { setIsLoading(false); }
    };
    fetch();
  }, [supabase, user, isManagement]);

  if (userProfile && !isManagement) {
    return (
        <Card className="m-6 border-destructive/20 bg-destructive/5">
            <CardHeader>
                <CardTitle className="text-destructive">Access Denied</CardTitle>
                <CardDescription>You do not have permission to view recurring expenses.</CardDescription>
            </CardHeader>
        </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle className="font-headline">Recurring Expenses</CardTitle>
          <CardDescription>
            Define monthly expenses that can be posted in one click.
          </CardDescription>
        </div>
        <AddRecurringExpenseDialog />
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Day of Month</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead><span className='sr-only'>Actions</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && Array.from({ length: 3 }).map((_, i) => (
                 <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-4 w-24 ml-auto" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-8 ml-auto" /></TableCell>
                 </TableRow>
            ))}
            {recurringExpenses && recurringExpenses.map((expense) => (
              <TableRow key={expense.id}>
                <TableCell className='font-medium'>{expense.dayOfMonth}</TableCell>
                <TableCell>{expense.name}</TableCell>
                <TableCell>{expense.category}</TableCell>
                <TableCell className="text-right">₱{expense.amount.toFixed(2)}</TableCell>
                <TableCell>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!isLoading && (!recurringExpenses || recurringExpenses.length === 0) && (
            <div className="flex flex-col items-center justify-center text-center border-2 border-dashed rounded-lg p-12 mt-4">
                <p className="text-lg font-semibold">No recurring expenses defined</p>
                <p className="text-muted-foreground mt-2">
                    Click &quot;Add Recurring Expense&quot; to get started.
                </p>
            </div>
        )}
      </CardContent>
    </Card>
  );
}
