import { createClient as createSessionClient } from '@/lib/supabase/server';
import { isManagementUser } from '@/lib/services/purchase-summary-service';
import { staffRolesOf } from '@/lib/auth/staff-roles';
import { JAS_EMAILS } from '@/lib/priority/priority-rules';

export interface SupplierFlagCaller {
  name: string;
  isManagement: boolean;
  /** Owners, admins and Jas (owner, 2026-11-20) set and clear the status. */
  canSetStatus: boolean;
  isSales: boolean;
}

/** The signed-in staff member and what they may do with supplier statuses. */
export async function getSupplierFlagCaller(): Promise<SupplierFlagCaller | null> {
  const sessionClient = await createSessionClient();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) return null;
  const meta = (user.user_metadata || {}) as { first_name?: string; last_name?: string };
  const roles = staffRolesOf(user);
  const isManagement = isManagementUser(user);
  const isJas = JAS_EMAILS.includes(String(user.email || '').toLowerCase().trim());
  return {
    name: `${meta.first_name || ''} ${meta.last_name || ''}`.trim() || user.email || 'Staff',
    isManagement,
    canSetStatus: isManagement || isJas,
    isSales: roles.includes('sales'),
  };
}
