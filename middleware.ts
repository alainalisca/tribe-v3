import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const publicPaths = ['/', '/auth', '/legal', '/invite', '/session', '/api', '/_next', '/sw.js', '/manifest.json'];

function isPublicPath(pathname: string): boolean {
  return publicPaths.some((path) => {
    if (path === '/') return pathname === '/';
    return pathname === path || pathname.startsWith(path + '/');
  });
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public routes — no auth check needed
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // Static files (images, fonts, etc.)
  if (pathname.match(/\.\w+$/)) {
    return NextResponse.next();
  }

  // Check auth for all other routes
  const response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          response.cookies.set({ name, value: '', ...options });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const returnTo = encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search);
    const redirectUrl = new URL(`/auth?returnTo=${returnTo}`, request.url);
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
