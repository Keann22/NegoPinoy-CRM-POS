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
    /** Server-controlled metadata. Staff roles are read from here only. */
    appMetadata?: Record<string, any>;
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
        appMetadata: user.app_metadata ?? {},
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

// Supabase re-sends SIGNED_IN every time the tab becomes visible again. Keep the
// existing user object when nothing changed, so effects that depend on `user`
// don't all re-run (and restart their data loads) on every tab switch.
function setUser(user: User) {
    const next = formatUserData(user);
    const prev = state.user;
    if (prev && !state.isLoading && JSON.stringify(prev) === JSON.stringify(next)) return;
    updateState({ user: next, isLoading: false });
}

let isInitialized = false;

function initAuth() {
    if (isInitialized || typeof window === 'undefined') return;
    isInitialized = true;

    // Single unified listener for auth state changes
    supabase.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
        if (session?.user) {
            setUser(session.user);
        } else if (event === 'SIGNED_OUT') {
            updateState({ user: null, isLoading: false });
        }
    });

    // Resolve initial session / user
    supabase.auth.getUser().then(async ({ data }: { data: { user: User | null } }) => {
        if (data?.user) {
            setUser(data.user);
            // The saved session keeps a copy of the user from log-in time. If the owner
            // changed this person's roles since then, refresh it once so later auth
            // events (e.g. on tab focus) don't bring back the old roles.
            const { data: s } = await supabase.auth.getSession();
            const saved = s?.session?.user?.app_metadata;
            const sorted = (o: any) => JSON.stringify(o ?? {}, Object.keys(o ?? {}).sort());
            if (s?.session && sorted(saved) !== sorted(data.user.app_metadata)) {
                await supabase.auth.refreshSession().catch(() => {});
            }
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
