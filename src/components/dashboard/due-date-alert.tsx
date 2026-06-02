'use client';

import { useEffect, useState } from 'react';
import { useSupabase, useUser } from '@/firebase';
import { useUserProfile } from '@/hooks/useUserProfile';
import { startOfDay, endOfDay } from 'date-fns';
import { AlertCircle, X } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export function DueDateAlert() {
    const supabase = useSupabase();
    const { user } = useUser();
    const { userProfile } = useUserProfile();
    
    const [dueCount, setDueCount] = useState(0);
    const [isVisible, setIsVisible] = useState(true);

    useEffect(() => {
        if (!supabase || !user) return;

        const checkDueToday = async () => {
            try {
                const todayStart = startOfDay(new Date()).toISOString();
                const todayEnd = endOfDay(new Date()).toISOString();

                // Look for orders due today OR overdue (lte todayEnd) where balance > 0
                let query = supabase
                    .from('orders')
                    .select('id', { count: 'exact' })
                    .gt('balance_due', 0)
                    .not('next_due_date', 'is', null)
                    .lte('next_due_date', todayEnd);

                if (userProfile && !userProfile.roles.some(r => ['Admin', 'Owner'].includes(r))) {
                    query = query.eq('sales_person_id', userProfile.id);
                }

                const { count, error } = await query;
                if (error) throw error;
                
                if (count !== null && count > 0) {
                    setDueCount(count);
                }
            } catch (error) {
                console.error("Failed to check due dates", error);
            }
        };

        checkDueToday();
    }, [supabase, user, userProfile]);

    if (dueCount === 0 || !isVisible) return null;

    return (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-md animate-in slide-in-from-top-4 fade-in">
            <Alert variant="destructive" className="bg-destructive/10 border-destructive/50 text-destructive shadow-lg relative">
                <AlertCircle className="h-5 w-5" />
                <AlertTitle className="text-base font-bold">Action Required!</AlertTitle>
                <AlertDescription>
                    You have <strong>{dueCount}</strong> accounts due for collection today or past due! <br />
                    <em>(May kailangan ka na singilin)</em>
                </AlertDescription>
                <button 
                    onClick={() => setIsVisible(false)}
                    className="absolute top-2 right-2 p-1 rounded-full hover:bg-destructive/20 transition-colors"
                    aria-label="Close"
                >
                    <X className="h-4 w-4" />
                </button>
            </Alert>
        </div>
    );
}
