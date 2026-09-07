'use client';

import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { translations, Language, TranslationKey } from './translations';
import { trackEvent } from '@/lib/analytics';
import { createClient } from '@/lib/supabase/client';
import { updateUser } from '@/lib/dal';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LANGUAGE_STORAGE_KEY = 'language';

function isLanguage(value: unknown): value is Language {
  return value === 'en' || value === 'es';
}

/**
 * The language this device has already settled on, if any.
 *
 * Priority 1. An explicit choice made in this browser outranks everything,
 * including the stored server preference, because it is the most recent thing
 * the user actually said. It is also what the pre-paint script in
 * app/layout.tsx reads, so the two must stay in step.
 */
export function readStoredLanguage(): Language | null {
  if (typeof window === 'undefined') return null;
  try {
    const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isLanguage(saved) ? saved : null;
  } catch {
    // localStorage throws in private browsing on some Safari versions.
    return null;
  }
}

/**
 * Priority 3, then 4. Browser locale when it gives a usable answer, Spanish
 * when it does not.
 *
 * Tribe is a Medellín-first product, so an absent or unrecognised locale
 * defaults to Spanish rather than English. A browser that explicitly says
 * English still gets English: this fallback is for the no-signal case, not a
 * blanket override, because it also governs anonymous visitors on the public
 * marketing pages.
 */
function pickBrowserLanguage(): Language {
  if (typeof navigator === 'undefined') return 'es';
  const langs: string[] = [
    ...((navigator.languages as readonly string[] | undefined) ?? []),
    navigator.language,
  ].filter(Boolean) as string[];
  for (const raw of langs) {
    const tag = raw.toLowerCase();
    if (tag.startsWith('es')) return 'es';
    if (tag.startsWith('en')) return 'en';
  }
  return 'es';
}

/** Keep the document language in step so assistive tech and SEO agree with the UI. */
function applyDocumentLanguage(lang: Language) {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = lang;
}

/**
 * Priority 2. The signed-in user's stored preference.
 *
 * Only consulted when the device has no explicit choice of its own, so a
 * returning user costs no query at all. Returns null on any failure: an
 * unreachable database must leave the browser-locale answer standing rather
 * than throwing inside a provider that wraps the whole app.
 */
async function fetchStoredPreference(): Promise<Language | null> {
  try {
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) return null;
    const { data: row } = await supabase
      .from('users')
      .select('preferred_language')
      .eq('id', data.user.id)
      .maybeSingle();
    const stored = (row as { preferred_language?: string | null } | null)?.preferred_language;
    return isLanguage(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>('en');
  /**
   * Set the moment the user touches the toggle. The profile read below is
   * async, so without this a preference arriving late could overwrite a choice
   * the user made while it was in flight. Priority 1 has to survive the race.
   */
  const explicitChoiceRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;

    // Tier 1, synchronous. A device that has already settled needs no query,
    // which is why a returning user never pays for this feature.
    const saved = readStoredLanguage();
    if (saved) {
      setLanguageState(saved);
      applyDocumentLanguage(saved);
      return;
    }

    // Tier 2. Show the browser's answer immediately rather than holding the
    // render, then reconcile if the account says otherwise. The reconciled
    // value is cached below, so this happens at most once per device.
    const browserLanguage = pickBrowserLanguage();
    setLanguageState(browserLanguage);
    applyDocumentLanguage(browserLanguage);

    void fetchStoredPreference().then((preferred) => {
      if (cancelled || !preferred) return;
      if (explicitChoiceRef.current) return;
      setLanguageState(preferred);
      applyDocumentLanguage(preferred);
      try {
        // Cache it so this device resolves synchronously from now on and never
        // shows the wrong language again while the profile loads.
        window.localStorage.setItem(LANGUAGE_STORAGE_KEY, preferred);
      } catch {
        // Private browsing. The in-memory value is still correct for this visit.
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const setLanguage = (lang: Language) => {
    const previousLang = language;
    explicitChoiceRef.current = true;
    setLanguageState(lang);
    applyDocumentLanguage(lang);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
      } catch {
        // Private browsing; the choice still holds for this visit.
      }
    }
    if (previousLang !== lang) {
      trackEvent('language_changed', { from: previousLang, to: lang });

      // Persist the preference server-side so notification senders can honour it.
      // Fire-and-forget: a DB hiccup must not block the UI language switch.
      const supabase = createClient();
      supabase.auth.getUser().then(({ data }) => {
        if (data.user) {
          updateUser(supabase, data.user.id, { preferred_language: lang }).catch(() => {
            // Intentionally silent — the localStorage value still works client-side.
          });
        }
      });
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
