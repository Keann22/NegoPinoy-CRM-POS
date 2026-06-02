/**
 * Barrel re-export for backward compatibility.
 * All implementations now live in @/lib/supabase/*.
 */

// Mappers (pure functions)
export { collection, doc, mapColumnToDb } from '@/lib/supabase/mappers';

// Query builders & data-fetching hooks
export { query, orderBy, where, limit, useCollection, useDoc } from '@/lib/supabase/queries';

// Auth hooks
export { useUser, useAuth, useSupabase } from '@/lib/supabase/hooks';
