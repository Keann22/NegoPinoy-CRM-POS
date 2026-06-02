'use client';
import React from 'react';

export function FirebaseClientProvider({ children }: { children: React.ReactNode }) {
    // With Supabase, we don't necessarily need a top-level provider for hooks
    // as our compat hooks use the singleton client directly.
    return <>{children}</>;
}
