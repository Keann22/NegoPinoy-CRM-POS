'use client';
import { useUser } from '@/lib/supabase/hooks';
import { useMemo } from 'react';

export type UserProfile = {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    roles: ('Owner' | 'Admin' | 'Inventory' | 'Sales')[];
}

// Maps a single role string from Supabase user_metadata to the roles array
// used by the dashboard layout.
function buildRolesFromMetadata(metadata: any): ('Owner' | 'Admin' | 'Inventory' | 'Sales')[] {
    if (!metadata) return [];

    // If roles array already exists in metadata, use it directly, but normalize casing
    if (Array.isArray(metadata.roles)) {
        return metadata.roles.map((r: string) => {
            const lower = String(r).toLowerCase();
            if (lower === 'owner') return 'Owner';
            if (lower === 'admin') return 'Admin';
            if (lower === 'sales') return 'Sales';
            if (lower === 'inventory') return 'Inventory';
            return r as any;
        });
    }

    // Map single role string to roles array
    const role = metadata.role as string | undefined;
    if (!role) return [];

    switch (role.toLowerCase()) {
        case 'owner':   return ['Owner', 'Admin', 'Sales', 'Inventory'];
        case 'admin':   return ['Admin', 'Sales', 'Inventory'];
        case 'sales':   return ['Sales'];
        case 'inventory': return ['Inventory'];
        default:        return [];
    }
}

export function useUserProfile() {
    const { user } = useUser();

    const userProfile = useMemo<UserProfile | null>(() => {
        if (!user) return null;

        const meta = (user as any).userMetadata ?? {};

        return {
            id: user.uid,
            firstName: meta.first_name ?? '',
            lastName: meta.last_name ?? '',
            email: user.email ?? '',
            roles: buildRolesFromMetadata(meta),
        };
    }, [user]);

    return { userProfile, isLoading: false };
}
