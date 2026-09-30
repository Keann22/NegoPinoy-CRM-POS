'use client';
import { createClient } from '@/lib/supabase/client';
import { useSyncExternalStore } from 'react';
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';

const supabase = createClient();

export type UserData = {
    uid: string;
    email?: string;
    photoURL?: string;
    userMetadata?: Record<string, any>;
};

type AuthState = {
    user: UserData | null;
    isLoading: boolean;
};

function formatUserData(user: User): UserData {
    return {
        uid: user.id,
        email: user.email,
        photoURL: user.user_metadata?.avatar_url,
        userMetadata: { ...user.app_metadata, ...user.user_metadata },
    };
}

let state: AuthState = {
    user: null,
    isLoading: true,
};

const serverSnapshot: AuthState = {
    user: null,
    isLoading: true,
};

const listeners = new Set<() => void>();

function emitChange() {
    for (const listener of listeners) {
        listener();
    }
}

function updateState(newState: Partial<AuthState>) {
    state = { ...state, ...newState };
    emitChange();
}

let isInitialized = false;

function initAuth() {
    if (isInitialized || typeof window === 'undefined') return;
    isInitialized = true;

    // Single unified listener for auth state changes
    supabase.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
        if (session?.user) {
            updateState({
                user: formatUserData(session.user),
                isLoading: false,
            });
        } else if (event === 'SIGNED_OUT') {
            updateState({ user: null, isLoading: false });
        }
    });

    // Resolve initial session / user
    supabase.auth.getUser().then(({ data }: { data: { user: User | null } }) => {
        if (data?.user) {
            updateState({
                user: formatUserData(data.user),
                isLoading: false,
            });
        } else {
            updateState({ user: null, isLoading: false });
        }
    }).catch((err: unknown) => {
        console.warn('Warning fetching user:', err);
        updateState({ user: null, isLoading: false });
    });
}

function subscribe(callback: () => void) {
    listeners.add(callback);
    initAuth();
    return () => {
        listeners.delete(callback);
    };
}

function getSnapshot(): AuthState {
    return state;
}

function getServerSnapshot(): AuthState {
    return serverSnapshot;
}

export function useUser() {
    const current = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
    return {
        user: current.user,
        isLoading: current.isLoading,
        isUserLoading: current.isLoading,
    };
}

export function useAuth() {
    return {
        signOut: async () => {
            updateState({ user: null, isLoading: false });
            return await supabase.auth.signOut();
        }
    };
}

// Re-export supabase for direct use where needed, replacing useStorage stub
export const useSupabase = () => supabase;
