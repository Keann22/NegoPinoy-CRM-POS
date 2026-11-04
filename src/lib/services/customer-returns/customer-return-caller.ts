import { createClient as createSessionClient } from '@/lib/supabase/server';
import { isManagementUser } from '@/lib/services/purchase-summary-service';
import { staffRolesOf } from '@/lib/auth/staff-roles';

// Inventory, warehouse staff and sales agents can open and work on customer
// return cases; owners/admins also make the decisions.
const RETURN_ROLES = ['owner', 'admin', 'inventory', 'inventory staff', 'inventory_staff', 'inventory-staff', 'staff', 'sales'];
/** Roles that handle the parcels themselves (log, check, put back, re-send). */
const WAREHOUSE_ROLES = ['inventory', 'inventory staff', 'inventory_staff', 'inventory-staff', 'staff'];

/** The signed-in user, whether they may use customer returns, and the name to log. */
export async function getReturnsCaller() {
  const sessionClient = await createSessionClient();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) return null;
  const meta: any = user.user_metadata || {};
  const roles = staffRolesOf(user);
  const isManagement = isManagementUser(user);
  return {
    name: `${meta.first_name || ''} ${meta.last_name || ''}`.trim() || user.email || 'Staff',
    isManagement,
    /** Sales agents decide resend / cancel on courier returns. */
    isSales: roles.includes('sales'),
    /** Owners and warehouse staff see the parcel buttons; sales-only accounts don't. */
    isWarehouse: isManagement || roles.some((r) => WAREHOUSE_ROLES.includes(r)),
    canUse: isManagement || roles.some((r) => RETURN_ROLES.includes(r)),
  };
}
