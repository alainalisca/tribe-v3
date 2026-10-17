'use client';

import { useLanguage } from '@/lib/LanguageContext';
import { writeLanguageCookie, type CookieLanguage } from '@/lib/languageCookie';
import c from './chrome.module.css';

/**
 * ES | EN, the site's only client piece that knows about language.
 *
 * The site's copy is rendered on the server in the language of the tribe_lang
 * cookie, so a switch writes the cookie and loads the same URL again: middleware
 * then serves the other prerendered page. It also goes through LanguageContext,
 * which keeps the app's choice (and the account's preference) in step.
 */
export default function LanguageToggle({ current }: { current: CookieLanguage }) {
  const { setLanguage } = useLanguage();
  const choose = async (lang: CookieLanguage) => {
    if (lang === current) return;
    writeLanguageCookie(lang);
    setLanguage(lang);
    // A full navigation to the same URL. The hash is dropped: a same-URL hash
    // change would not load the page at all.
    const url = window.location.pathname + window.location.search;
    // Site responses say Vary: Cookie, but Next's page renderer overwrites Vary,
    // and `next start` lets the browser reuse a cached page (stale-while-revalidate)
    // without asking the server. So refetch the page first, bypassing the cache:
    // the browser's copy of this URL is then the new language, and the navigation
    // paints it on the first frame wherever the site is hosted. On Vercel the
    // navigation's revalidation is a 304.
    try {
      await fetch(url, { cache: 'reload', credentials: 'same-origin' });
    } catch {
      // Offline or blocked: navigate anyway; the server still picks by cookie.
    }
    window.location.assign(url);
  };
  return (
    <div className={c.lang} role="group" aria-label="Idioma / Language">
      <button type="button" aria-pressed={current === 'es'} onClick={() => choose('es')} lang="es">
        ES
      </button>
      <button type="button" aria-pressed={current === 'en'} onClick={() => choose('en')} lang="en">
        EN
      </button>
    </div>
  );
}
