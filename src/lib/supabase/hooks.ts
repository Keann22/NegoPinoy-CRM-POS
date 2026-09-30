'use client';
import { createClient } from '@/lib/supabase/client';
import { useEffect, useState } from 'react';

const supabase = createClient();

let cachedUser: { uid: string; email?: string; photoURL?: string; userMetadata?: Record<string, any> } | null = null;
let isInitialFetchDone = false;

export function useUser() {
    const [user, setUser] = useState<{ uid: string; email?: string; photoURL?: string; userMetadata?: Record<string, any> } | null>(cachedUser);
    const [isLoading, setIsLoading] = useState(!isInitialFetchDone);

    useEffect(() => {
        const fetchUser = async () => {
            try {
                // Just use getUser() instead of forcing a refreshSession on every component mount
                // which causes race conditions and logs the user out.
                const { data } = await supabase.auth.getUser();
                if (data.user) {
                    const userData = {
                        uid: data.user.id,
                        email: data.user.email,
                        photoURL: data.user.user_metadata?.avatar_url,
                        userMetadata: { ...data.user.app_metadata, ...data.user.user_metadata },
                    };
                    cachedUser = userData;
                    setUser(userData);
                } else {
                    cachedUser = null;
                    setUser(null);
                }
            } catch (err) {
                console.warn('Warning fetching user:', err);
                cachedUser = null;
                setUser(null);
            } finally {
                isInitialFetchDone = true;
                setIsLoading(false);
            }
        };
        fetchUser();

        const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
            if (session?.user) {
                const userData = {
                    uid: session.user.id,
                    email: session.user.email,
                    photoURL: session.user.user_metadata?.avatar_url,
                    userMetadata: { ...session.user.app_metadata, ...session.user.user_metadata },
                };
                cachedUser = userData;
                setUser(userData);
            } else {
                cachedUser = null;
                setUser(null);
            }
            isInitialFetchDone = true;
            setIsLoading(false);
        });

        return () => {
            authListener.subscription.unsubscribe();
        };
    }, []);

    return { user, isLoading, isUserLoading: isLoading };
}

export function useAuth() {
    return {
        signOut: async () => {
            cachedUser = null;
            isInitialFetchDone = false;
            return await supabase.auth.signOut();
        }
    };
}

// Re-export supabase for direct use where needed, replacing useStorage stub
export const useSupabase = () => supabase;
