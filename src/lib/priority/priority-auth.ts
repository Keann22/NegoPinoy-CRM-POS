import { createClient as createSessionClient } from '@/lib/supabase/server';
import { editorFromUser } from '@/lib/services/receipt-correction-service';
import { JAS_EMAILS } from './priority-rules';
import { staffRolesOf } from '@/lib/auth/staff-roles';

/** Who is calling a priority-list route, and what they may do. Server only. */
export interface PriorityCaller {
  id: string;
  name: string;
  isAdmin: boolean;
  isJas: boolean;
  /** Sales, admin or jas: send-today marks, OS decisions, to-follow items. */
  canDecide: boolean;
}

const rolesOf = staffRolesOf;

export async function getPriorityCaller(): Promise<PriorityCaller | null> {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  const editor = editorFromUser(user);
  if (!editor) return null;
  const roles = rolesOf(user);
  const isAdmin = roles.includes('owner') || roles.includes('admin');
  const isJas = JAS_EMAILS.includes(String(user?.email || '').toLowerCase().trim());
  return { id: editor.id, name: editor.name, isAdmin, isJas, canDecide: isAdmin || isJas || roles.includes('sales') };
}
