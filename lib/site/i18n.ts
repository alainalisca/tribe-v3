/**
 * T-SITE1. The marketing site's translator, for SERVER components only.
 *
 * Every page is prerendered once per language (app/sitio/[lang]) and the copy is
 * looked up here, at render time, so no message file reaches the browser. A
 * client component on the site takes its strings as props; it never imports
 * this module or messages/*.json (lib/site/site.test.ts enforces that).
 *
 *   const t = siteT(lang);
 *   t('site.home.h1a')
 */
import { siteMessage, type SiteLanguage } from './messages';

export type { SiteLanguage };

/** Looks up a full dot path ("site.home.h1a") with optional {var} substitution. */
export type SiteT = (key: string, vars?: Record<string, string | number>) => string;

export function siteT(lang: SiteLanguage): SiteT {
  return (key, vars) => {
    const i = key.lastIndexOf('.');
    return siteMessage(lang, key.slice(0, i), key.slice(i + 1), vars);
  };
}

export const SITE_LANGUAGES: readonly SiteLanguage[] = ['es', 'en'];

/** The `[lang]` route param as a language; anything unknown is Spanish. */
export function siteLanguage(param: string): SiteLanguage {
  return param === 'en' ? 'en' : 'es';
}
