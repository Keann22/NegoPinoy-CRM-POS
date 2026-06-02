'use client';
import { createClient } from '@/lib/supabase/client';
import { useEffect, useState } from 'react';

const supabase = createClient();

export function useUser() {
    const [user, setUser] = useState<{ uid: string; email?: string; photoURL?: string; userMetadata?: Record<string, any> } | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchUser = async () => {
            try {
                // Just use getUser() instead of forcing a refreshSession on every component mount
                // which causes race conditions and logs the user out.
                const { data } = await supabase.auth.getUser();
                if (data.user) {
                    setUser({
                        uid: data.user.id,
                        email: data.user.email,
                        photoURL: data.user.user_metadata?.avatar_url,
                        userMetadata: data.user.user_metadata,
                    });
                } else {
                    setUser(null);
                }
            } catch (err) {
                console.warn('Warning fetching user:', err);
                setUser(null);
            } finally {
                setIsLoading(false);
            }
        };
        fetchUser();

        const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
            if (session?.user) {
                setUser({
                    uid: session.user.id,
                    email: session.user.email,
                    photoURL: session.user.user_metadata?.avatar_url,
                    userMetadata: session.user.user_metadata,
                });
            } else {
                setUser(null);
            }
        });

        return () => {
            authListener.subscription.unsubscribe();
        };
    }, []);

    return { user, isLoading, isUserLoading: isLoading };
}

export function useAuth() {
    return {
        signOut: async () => await supabase.auth.signOut()
    };
}

// Re-export supabase for direct use where needed, replacing useStorage stub
export const useSupabase = () => supabase;
