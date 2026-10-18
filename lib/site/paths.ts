/**
 * T-SITE1. Where the marketing site's pages live, publicly and internally.
 *
 * PUBLIC: the Spanish slugs people see and share (/coaches/, /tv/...). INTERNAL:
 * app/sitio/[lang]/..., prerendered once per language. Middleware reads the
 * `tribe_lang` cookie and rewrites a public path to its internal page, so the
 * URL never changes and every page is static HTML in the visitor's language.
 * An internal URL requested directly is redirected to its public path.
 *
 * No runtime imports: middleware (edge) uses this.
 */
import type { CookieLanguage } from '@/lib/languageCookie';

export const SITE_INTERNAL_PREFIX = '/sitio';

/** The site's pages other than Inicio, as public paths without slashes. */
export const SITE_SLUGS = ['para-atletas', 'deportes', 'coaches', 'gimnasios', 'tribe-os', 'tv', 'preguntas'] as const;
export type SiteSlug = (typeof SITE_SLUGS)[number];

/**
 * T-SHARE1 Part B. The six sports with a page of their own, /deportes/<slug>/,
 * each the link Ana sends with its share card (lib/site/sportPages.ts says
 * which app sports each one shows).
 */
export const SITE_SPORT_SLUGS = ['boxeo', 'mma', 'crossfit', 'hyrox', 'yoga', 'funcional'] as const;
export type SiteSportSlug = (typeof SITE_SPORT_SLUGS)[number];

/** A site page: a slug, or "deportes/<sport>". */
export type SitePage = SiteSlug | `deportes/${string}`;

const SLUG_SET: ReadonlySet<string> = new Set(SITE_SLUGS);

/**
 * "coaches" for /coaches or /coaches/, "" for Inicio's `/`, null for anything
 * else. Any /deportes/<word>/ is a site page: an unknown sport reaches the
 * prerendered route, which has no such page and answers 404.
 */
export function siteSlugOf(pathname: string): SitePage | '' | null {
  if (pathname === '/') return '';
  const m = /^\/([a-z-]+)\/?$/.exec(pathname);
  if (m) return SLUG_SET.has(m[1]) ? (m[1] as SiteSlug) : null;
  const sport = /^\/deportes\/([a-z0-9-]+)\/?$/.exec(pathname);
  return sport ? `deportes/${sport[1]}` : null;
}

/**
 * A site page's share card (T-SHARE1): app/sitio/[lang]/.../card/, named in
 * the page's og:image. Middleware serves it as it is instead of sending the
 * internal URL back to its page.
 */
export function isSiteCardPath(pathname: string): boolean {
  return /^\/sitio\/(?:es|en)(?:\/[a-z0-9-]+)*\/card\/?$/.test(pathname);
}

/** A page's share card, with the trailing slash the app serves: /sitio/es/coaches/card/. */
export function siteCardPath(slug: SitePage | '', lang: CookieLanguage): string {
  return `${internalSitePath(slug, lang)}card/`;
}

/** /sitio/es/coaches/ for ("coaches", "es"); /sitio/es/ for Inicio. */
export function internalSitePath(slug: SitePage | '', lang: CookieLanguage): string {
  return `${SITE_INTERNAL_PREFIX}/${lang}/${slug ? `${slug}/` : ''}`;
}

/**
 * The public path for a direct request to an internal URL (/sitio/en/tv/ -> /tv/),
 * or null when `pathname` is not under the internal prefix.
 */
export function publicPathForInternal(pathname: string): string | null {
  if (pathname !== SITE_INTERNAL_PREFIX && !pathname.startsWith(`${SITE_INTERNAL_PREFIX}/`)) return null;
  const rest = pathname.slice(SITE_INTERNAL_PREFIX.length).replace(/^\/(es|en)(?=\/|$)/, '');
  const slug = siteSlugOf(rest === '' ? '/' : rest);
  if (slug === null) return '/';
  return slug ? `/${slug}/` : '/';
}
