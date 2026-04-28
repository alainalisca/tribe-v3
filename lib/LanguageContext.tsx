'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { translations, Language, TranslationKey } from './translations';
import { trackEvent } from '@/lib/analytics';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

/**
 * Pick the default language for a first-time visitor (no localStorage value).
 *
 * Tribe is a Medellín-first product, and most of our supply-side audience is
 * Colombia-based. Browser language is the cheap, in-band signal we already
 * have — anything starting with "es-*" (es-CO, es-MX, plain es) defaults to
 * Spanish. Everything else stays English. IP-geolocation defaulting is a
 * deliberate non-goal here; if/when we ship a server-side header lookup we
 * can fold it in.
 */
function pickInitialLanguage(): Language {
  if (typeof navigator === 'undefined') return 'en';
  const langs: string[] = [
    ...((navigator.languages as readonly string[] | undefined) ?? []),
    navigator.language,
  ].filter(Boolean) as string[];
  if (langs.some((l) => l.toLowerCase().startsWith('es'))) return 'es';
  return 'en';
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>('en');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedLang = localStorage.getItem('language') as Language;
      if (savedLang && (savedLang === 'en' || savedLang === 'es')) {
        // Explicit user choice always wins over heuristics.
        setLanguageState(savedLang);
      } else {
        // First-time visitor — pick from browser locale.
        setLanguageState(pickInitialLanguage());
      }
    }
  }, []);

  const setLanguage = (lang: Language) => {
    const previousLang = language;
    setLanguageState(lang);
    if (typeof window !== 'undefined') {
      localStorage.setItem('language', lang);
    }
    if (previousLang !== lang) {
      trackEvent('language_changed', { from: previousLang, to: lang });
    }
  };

  const t = (key: TranslationKey): string => {
    return translations[language][key] || translations.en[key] || key;
  };

  return <LanguageContext.Provider value={{ language, setLanguage, t }}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return context;
}
