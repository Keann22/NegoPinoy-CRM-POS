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
            const lower = String(r).toLowerCase().trim();
            if (lower === 'owner') return 'Owner';
            if (lower === 'admin') return 'Admin';
            if (lower === 'sales') return 'Sales';
            if (lower === 'inventory' || lower === 'inventory staff' || lower === 'inventory_staff' || lower === 'inventory-staff' || lower === 'staff') return 'Inventory';
            return r as any;
        });
    }

    // Map single role string to roles array
    const role = (metadata.role as string | undefined)?.toLowerCase()?.trim();
    if (!role) return [];

    switch (role) {
        case 'owner':   return ['Owner', 'Admin', 'Sales', 'Inventory'];
        case 'admin':   return ['Admin', 'Sales', 'Inventory'];
        case 'sales':   return ['Sales'];
        case 'inventory':
        case 'inventory staff':
        case 'inventory_staff':
        case 'inventory-staff':
        case 'staff':   return ['Inventory'];
        default:        return [];
    }
}

export function useUserProfile() {
    const { user, isLoading } = useUser();

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

    return { userProfile, isLoading };
}
