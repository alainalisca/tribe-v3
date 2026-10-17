'use client';

import { useLanguage } from '@/lib/LanguageContext';
import { writeLanguageCookie, type CookieLanguage } from '@/lib/languageCookie';
import c from './chrome.module.css';

/**
 * ES | EN, the site's only client piece that knows about language.
 *
 * The site's copy is rendered on the server in the language of the tribe_lang
 * cookie, so a switch writes the cookie and reloads: middleware then serves the
 * other prerendered page at the same URL. It also goes through LanguageContext,
 * which keeps the app's choice (and the account's preference) in step.
 */
export default function LanguageToggle({ current }: { current: CookieLanguage }) {
  const { setLanguage } = useLanguage();
  const choose = (lang: CookieLanguage) => {
    if (lang === current) return;
    writeLanguageCookie(lang);
    setLanguage(lang);
    window.location.reload();
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
