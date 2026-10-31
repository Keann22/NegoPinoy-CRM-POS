import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createSessionClient } from '@/lib/supabase/server';
import { normalizeRoles, staffRolesOf, type StaffRole } from '@/lib/auth/staff-roles';

export const dynamic = 'force-dynamic';

// Staff accounts and their roles. Owners/admins only. Roles are written to app_metadata,
// which only this server key can change (users can edit their own user_metadata).

function admin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false } });
}

async function managementCaller() {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  const roles = staffRolesOf(user);
  return user && (roles.includes('owner') || roles.includes('admin')) ? user : null;
}

// A single stored role means more on the dashboard (Admin also gets Sales and Inventory).
function displayRoles(meta: any): StaffRole[] {
  if (Array.isArray(meta?.roles)) return normalizeRoles(meta.roles);
  const [single] = normalizeRoles(meta?.role);
  if (single === 'Owner') return ['Owner', 'Admin', 'Sales', 'Inventory'];
  if (single === 'Admin') return ['Admin', 'Sales', 'Inventory'];
  return single ? [single] : [];
}

export async function GET() {
  try {
    if (!(await managementCaller())) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
    const { data, error } = await admin().auth.admin.listUsers({ perPage: 1000 });
    if (error) throw error;
    const users = data.users.map((u) => ({
      id: u.id,
      email: u.email || '',
      firstName: u.user_metadata?.first_name || '',
      lastName: u.user_metadata?.last_name || '',
      roles: displayRoles(u.app_metadata),
    }));
    return NextResponse.json({ users });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to load users' }, { status: 500 });
  }
}

// New staff account (there is no public sign-up). The owner gives the person the
// temporary password; they can change it later with "Forgot password?".
async function createStaff(body: any) {
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const firstName = String(body.firstName || '').trim();
  const lastName = String(body.lastName || '').trim();
  const roles = normalizeRoles(body.roles);
  if (!email || !firstName) return NextResponse.json({ error: 'Name and email are required.' }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
  if (roles.length === 0) return NextResponse.json({ error: 'Pick a role.' }, { status: 400 });

  const { data, error } = await admin().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { roles },
    user_metadata: { first_name: firstName, last_name: lastName, roles },
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, id: data.user?.id });
}

export async function POST(req: Request) {
  try {
    const caller = await managementCaller();
    if (!caller) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
    const body = await req.json();
    if (body.action === 'create') return createStaff(body);

    const { userId, roles } = body;
    if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    const clean = normalizeRoles(roles);
    if (userId === caller.id && !clean.some((r) => r === 'Owner' || r === 'Admin')) {
      return NextResponse.json({ error: "You can't remove your own Admin role." }, { status: 400 });
    }
    // app_metadata is the source of truth; user_metadata is mirrored only for older
    // screens that show a role label next to staff names.
    const { error } = await admin().auth.admin.updateUserById(userId, {
      app_metadata: { roles: clean, role: null },
      user_metadata: { roles: clean },
    });
    if (error) throw error;
    return NextResponse.json({ ok: true, roles: clean });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to update roles' }, { status: 500 });
  }
}
