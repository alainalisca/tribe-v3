'use client';

/**
 * UI-I01 + UI-I02: centralize i18n behind a namespace-scoped hook.
 *
 * Before: every component had its own `language === 'es' ? ... : ...`
 * ternaries sprinkled through JSX. Translations drifted, strings got
 * missed, and there was no single place to edit copy.
 *
 * After: strings live in `messages/{en,es}.json` under semantic
 * namespaces (e.g. "home", "settings", "bulletin"). Components call
 * `const t = useTranslations('home')` and reference keys.
 *
 * Usage
 * ─────
 *   const t = useTranslations('home');
 *   return <h1>{t('title')}</h1>;
 *
 * With interpolation:
 *   t('greeting', { name: user.name })
 *   // "Good morning, {name}" -> "Good morning, Al"
 *
 * If a key is missing from the active language, the hook falls back to
 * English. If it's missing from both, the raw key is returned (visible
 * to the developer so missing keys get noticed quickly).
 */

import en from '@/messages/en.json';
import es from '@/messages/es.json';
import { useLanguage } from '@/lib/LanguageContext';

type Dict = Record<string, Record<string, string>>;
const dicts = { en: en as Dict, es: es as Dict };

type Vars = Record<string, string | number>;

function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replaceAll(`{${k}}`, String(v));
  }
  return out;
}

export function useTranslations(namespace: string) {
  const { language } = useLanguage();

  return function t(key: string, vars?: Vars): string {
    const activeNs = dicts[language as 'en' | 'es']?.[namespace];
    const fallbackNs = dicts.en[namespace];

    const raw = activeNs?.[key] ?? fallbackNs?.[key] ?? key;
    return interpolate(raw, vars);
  };
}
