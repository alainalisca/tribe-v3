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

const SLUG_SET: ReadonlySet<string> = new Set(SITE_SLUGS);

/** "coaches" for /coaches or /coaches/, "" for Inicio's `/`, null for anything else. */
export function siteSlugOf(pathname: string): SiteSlug | '' | null {
  if (pathname === '/') return '';
  const m = /^\/([a-z-]+)\/?$/.exec(pathname);
  return m && SLUG_SET.has(m[1]) ? (m[1] as SiteSlug) : null;
}

/** /sitio/es/coaches/ for ("coaches", "es"); /sitio/es/ for Inicio. */
export function internalSitePath(slug: SiteSlug | '', lang: CookieLanguage): string {
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
