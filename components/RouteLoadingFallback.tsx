'use client';

import { usePathname } from 'next/navigation';
import { SkeletonProfile, SkeletonCard } from '@/components/Skeleton';
import { cookieNames, hasAuthCookieName } from '@/lib/site/authCookie';
import { siteSlugOf } from '@/lib/site/paths';

/**
 * T-SSR1: the root loading fallback (app/loading.tsx), chosen by path.
 *
 * Public pages in the Jornada frame (a session or a coach page, and the
 * marketing site) get a plain paper-coloured blank: they render on the server
 * and arrive in the same response, so the app's skeleton would only flash app
 * chrome over a page that does not have any. Every other route keeps today's
 * skeleton exactly.
 *
 * `/` is the site only for a visitor with no session cookie (middleware
 * decides the same way); the browser can read the cookie, the server render
 * cannot, so on the server `/` keeps the skeleton (the signed-in feed).
 */
export const PAPER = '#f4f3ee';

export function isPublicFramePath(pathname: string, cookieHeader: string | null): boolean {
  if (/^\/session\/[^/]+\/?$/.test(pathname)) return true;
  if (/^\/i\/[^/]+\/?$/.test(pathname)) return true;
  if (pathname.startsWith('/sitio/')) return true;
  const slug = siteSlugOf(pathname);
  if (slug === null) return false;
  if (slug !== '') return true;
  return cookieHeader !== null && !hasAuthCookieName(cookieNames(cookieHeader));
}

export default function RouteLoadingFallback() {
  const pathname = usePathname() ?? '';
  const cookieHeader = typeof document === 'undefined' ? null : document.cookie;
  if (isPublicFramePath(pathname, cookieHeader)) {
    return <div className="min-h-screen" style={{ background: PAPER }} aria-hidden="true" data-fallback="paper" />;
  }
  return (
    <div className="min-h-screen bg-theme-page" data-fallback="app">
      <div className="max-w-2xl md:max-w-4xl mx-auto px-4 pt-20 pb-24 space-y-4">
        <SkeletonProfile />
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
