'use client';

import { useMemo, useState, useEffect } from 'react';
import { useSupabase, useUser } from '@/lib/supabase/hooks';
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
import { AddExpenseDialog } from '@/components/dashboard/accounting/add-expense-dialog';
import { PostRecurringExpensesButton } from '@/components/dashboard/accounting/post-recurring-expenses-button';
import { useUserProfile } from '@/hooks/useUserProfile';
import { ReportDateFilter } from '@/components/dashboard/reports/report-date-filter';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';

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

  const [expenses, setExpenses] = useState<Omit<Expense, 'id'>[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!supabase || !user || !isManagement) return;
    const fetch = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('expenses')
          .select('*')
          .order('expense_date', { ascending: false });
        if (error) throw error;
        setExpenses((data || []).map((e: any) => ({
          id: e.id,
          expenseDate: e.expense_date,
          amount: e.amount,
          category: e.category,
          description: e.description,
        })));
      } catch (err) { console.error('Expenses fetch error:', err); }
      finally { setIsLoading(false); }
    };
    fetch();
  }, [supabase, user, isManagement]);

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

  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  useEffect(() => {
    setCurrentPage(1);
  }, [date]);

  const totalPages = Math.ceil((filteredExpenses?.length || 0) / rowsPerPage) || 1;
  const paginatedData = useMemo(() => {
    if (!filteredExpenses) return [];
    const startIndex = (currentPage - 1) * rowsPerPage;
    return filteredExpenses.slice(startIndex, startIndex + rowsPerPage);
  }, [filteredExpenses, currentPage, rowsPerPage]);

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
                <TableHead className="w-[150px]">Date</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 5 }).map((_, i) => (
                   <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[150px]">Date</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedData.map((expense) => (
                  <TableRow key={expense.id}>
                    <TableCell className="w-[150px]">{format(new Date(expense.expenseDate), 'MMM d, yyyy')}</TableCell>
                    <TableCell>{expense.category}</TableCell>
                    <TableCell className="font-medium">{renderDescription(expense.description)}</TableCell>
                    <TableCell className="text-right">₱{expense.amount.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
        )}
      </CardContent>
      {filteredExpenses && filteredExpenses.length > 0 && (
        <CardFooter className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-2">
            <div className="text-sm text-muted-foreground flex items-center gap-4">
              <span>Showing <strong>{(currentPage - 1) * rowsPerPage + 1}-{Math.min(currentPage * rowsPerPage, filteredExpenses.length)}</strong> of <strong>{filteredExpenses.length}</strong> expenses</span>
              <span className="font-semibold text-foreground">Total: ₱{totalExpenses.toFixed(2)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Select value={rowsPerPage.toString()} onValueChange={(val) => { setRowsPerPage(Number(val)); setCurrentPage(1); }}>
                <SelectTrigger className="w-[70px] h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex items-center border rounded-md h-9 px-1">
                <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>Prev</Button>
                <span className="text-sm mx-2 min-w-[3rem] text-center">{currentPage} / {totalPages}</span>
                <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>Next</Button>
              </div>
            </div>
        </CardFooter>
      )}
    </Card>
  );
}
