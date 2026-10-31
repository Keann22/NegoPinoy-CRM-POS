import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { isStaffUser } from '@/lib/auth/staff-roles';

// Every API route and dashboard page needs a logged-in staff member (a role in
// app_metadata, which only the server can set). Most API routes use the service-role
// key, which skips database permissions, so this check is what keeps them private.
//
// Open paths check their own secret instead (Vercel cron sends CRON_SECRET).
const OPEN_PATHS = ['/api/cron/'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (OPEN_PATHS.some((p) => pathname.startsWith(p))) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        // Keep refreshed session cookies on both the request and the response.
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  // getUser() asks Supabase, so roles changed by the owner apply right away.
  const { data: { user } } = await supabase.auth.getUser();
  if (isStaffUser(user)) return response;

  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { error: user ? 'Not allowed' : 'Please log in' },
      { status: user ? 403 : 401 },
    );
  }
  const login = request.nextUrl.clone();
  login.pathname = '/';
  login.search = '';
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ['/api/:path*', '/dashboard/:path*', '/inventory-fix/:path*'],
};
