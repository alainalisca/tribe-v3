'use client';

import { useLanguage } from '@/lib/LanguageContext';
import { useSiteLanguage } from '@/lib/site/useSiteT';
import c from './chrome.module.css';

/** ES | EN. Writes through LanguageContext, so the choice is the app's too. */
export default function LanguageToggle() {
  const { setLanguage } = useLanguage();
  const current = useSiteLanguage();
  return (
    <div className={c.lang} role="group" aria-label="Idioma / Language">
      <button type="button" aria-pressed={current === 'es'} onClick={() => setLanguage('es')} lang="es">
        ES
      </button>
      <button type="button" aria-pressed={current === 'en'} onClick={() => setLanguage('en')} lang="en">
        EN
      </button>
    </div>
  );
}
