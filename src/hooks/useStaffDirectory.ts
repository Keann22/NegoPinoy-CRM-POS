import { useState, useEffect } from 'react';
import { useSupabase } from '@/lib/supabase/hooks';
import { useUserProfile } from '@/hooks/useUserProfile';

export type StaffUser = { id: string; fullName: string; email: string; roles: string[] };

/** Staff directory via get_all_users, excluding the current user. Shared by StaffSearch and MentionInput. */
export function useStaffDirectory() {
  const supabase = useSupabase();
  const { userProfile } = useUserProfile();

  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    const currentFullName = userProfile ? `${userProfile.firstName} ${userProfile.lastName}`.trim() : '';

    const loadStaff = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase.rpc('get_all_users');
        if (error) throw error;

        const parsed: StaffUser[] = (data || [])
          .map((u: any) => {
            const meta = u.raw_user_meta_data || {};
            const fullName = `${meta.first_name || ''} ${meta.last_name || ''}`.trim() || u.email;
            const roles = Array.isArray(meta.roles) ? meta.roles : (meta.role ? [meta.role] : []);
            return { id: u.id, fullName, email: u.email || '', roles };
          })
          .filter((u: StaffUser) => u.fullName && u.fullName.toLowerCase() !== currentFullName.toLowerCase());

        setStaff(parsed);
      } catch (err) {
        console.error('Error loading staff list:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadStaff();
  }, [supabase, userProfile]);

  return { staff, isLoading };
}
