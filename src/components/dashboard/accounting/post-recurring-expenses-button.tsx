'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { startOfMonth, endOfMonth } from 'date-fns';

type RecurringExpense = {
    id: string;
    name: string;
    amount: number;
    category: string;
    day_of_month: number;
};

export function PostRecurringExpensesButton() {
    const [isLoading, setIsLoading] = useState(false);
    const { toast } = useToast();

    const handlePostExpenses = async () => {
        setIsLoading(true);
        toast({
            title: "Posting Expenses...",
            description: "Checking for recurring expenses to post for this month.",
        });

        const supabase = createClient();

        try {
            const now = new Date();
            const currentYear = now.getFullYear();
            const currentMonth = now.getMonth();
            const monthStart = startOfMonth(now);
            const monthEnd = endOfMonth(now);

            // 1. Get all recurring expense definitions
            const { data: recurringExpenses, error: recurringError } = await supabase
                .from('recurring_expenses')
                .select('*');

            if (recurringError) throw recurringError;
            if (!recurringExpenses || recurringExpenses.length === 0) {
                toast({
                    title: "No Recurring Expenses",
                    description: "There are no recurring expenses configured.",
                });
                return;
            }

            // 2. Get all expenses already posted this month to avoid duplicates
            const { data: monthlyExpenses, error: monthlyError } = await supabase
                .from('expenses')
                .select('description')
                .gte('expense_date', monthStart.toISOString())
                .lte('expense_date', monthEnd.toISOString());

            if (monthlyError) throw monthlyError;

            const postedDescriptions = new Set((monthlyExpenses || []).map(e => e.description));

            // 3. Build list of expenses to insert
            const toInsert = [];
            let skippedCount = 0;

            for (const recurring of recurringExpenses as RecurringExpense[]) {
                const description = `Recurring: ${recurring.name}`;
                if (postedDescriptions.has(description)) {
                    skippedCount++;
                    continue;
                }

                let dayToUse = recurring.day_of_month;
                const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
                if (dayToUse > daysInMonth) {
                    dayToUse = daysInMonth;
                }
                const expenseDate = new Date(currentYear, currentMonth, dayToUse);

                toInsert.push({
                    expense_date: expenseDate.toISOString(),
                    amount: recurring.amount,
                    category: recurring.category,
                    description: description,
                });
            }

            if (toInsert.length > 0) {
                const { error: insertError } = await supabase
                    .from('expenses')
                    .insert(toInsert);

                if (insertError) throw insertError;
            }

            toast({
                title: "Processing Complete",
                description: `${toInsert.length} expenses posted. ${skippedCount} were already posted and skipped.`,
            });

        } catch (error: any) {
            console.error("Failed to post recurring expenses:", error);
            toast({
                variant: 'destructive',
                title: 'Posting Failed',
                description: error.message || 'An unexpected error occurred.',
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Button onClick={handlePostExpenses} disabled={isLoading} variant="outline">
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Post Monthly Expenses
        </Button>
    );
}
