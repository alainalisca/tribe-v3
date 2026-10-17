/**
 * T-SITE1. The one language cookie the marketing site and the app share.
 *
 * The site's copy is rendered on the server, so the server has to know the
 * language before it renders: middleware reads this cookie and serves the
 * prerendered Spanish or English page (default Spanish, the market's language).
 * LanguageContext reads and writes the same cookie, so a choice made in the app
 * holds on the site and the other way round.
 *
 * No imports: middleware (edge), server components and the browser all use it.
 */
export type CookieLanguage = 'es' | 'en';

export const LANGUAGE_COOKIE = 'tribe_lang';

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/** The site language for a cookie value: English only when it says so. */
export function languageFromCookie(value: string | null | undefined): CookieLanguage {
  return value === 'en' ? 'en' : 'es';
}

/** The cookie's value in a `document.cookie` string, or null when unset or unknown. */
export function readLanguageCookie(cookieHeader: string): CookieLanguage | null {
  for (const part of cookieHeader.split(';')) {
    const i = part.indexOf('=');
    if (i < 0 || part.slice(0, i).trim() !== LANGUAGE_COOKIE) continue;
    const value = part.slice(i + 1).trim();
    return value === 'en' || value === 'es' ? value : null;
  }
  return null;
}

/** The `document.cookie` assignment that stores `lang` for a year, site wide. */
export function languageCookieString(lang: CookieLanguage): string {
  return `${LANGUAGE_COOKIE}=${lang}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax`;
}

/** Store `lang` in this browser. No-op on the server. */
export function writeLanguageCookie(lang: CookieLanguage): void {
  if (typeof document === 'undefined') return;
  document.cookie = languageCookieString(lang);
}
