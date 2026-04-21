'use client';

/**
 * UI-I01 + UI-I02: centralize i18n behind a namespace-scoped hook.
 *
 * Before: every component had its own `language === 'es' ? ... : ...`
 * ternaries sprinkled through JSX. Translations drifted, strings got
 * missed, and there was no single place to edit copy.
 *
 * After: strings live in `messages/{en,es}.json` under semantic
 * namespaces (e.g. "home", "settings.notifications", "orders"). Components
 * call `const t = useTranslations('home')` and reference keys.
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
 * Nested namespaces (dot-delimited):
 *   const t = useTranslations('settings.notifications');
 *   t('title') // reads messages.{lang}.settings.notifications.title
 *
 * If a key is missing from the active language, the hook falls back to
 * English. If it's missing from both, the raw key is returned (visible
 * to the developer so missing keys get noticed quickly).
 */

import en from '@/messages/en.json';
import es from '@/messages/es.json';
import { useLanguage } from '@/lib/LanguageContext';

// The messages JSON may nest arbitrarily, so model it recursively.
type MessageNode = string | { [key: string]: MessageNode };
type Dict = { [namespace: string]: MessageNode };
const dicts: Record<'en' | 'es', Dict> = { en: en as Dict, es: es as Dict };

type Vars = Record<string, string | number>;

function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replaceAll(`{${k}}`, String(v));
  }
  return out;
}

/**
 * Walk a dot-delimited path through the dictionary. Returns undefined if
 * any segment is missing or if the final value is not an object (we can't
 * index into a string namespace).
 */
function getNamespace(dict: Dict, namespace: string): Record<string, MessageNode> | undefined {
  const parts = namespace.split('.');
  let node: MessageNode | undefined = dict;
  for (const part of parts) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = (node as Record<string, MessageNode>)[part];
  }
  if (typeof node !== 'object' || node === null) return undefined;
  return node as Record<string, MessageNode>;
}

export function useTranslations(namespace: string) {
  const { language } = useLanguage();

  return function t(key: string, vars?: Vars): string {
    const lang = (language as 'en' | 'es') ?? 'en';
    const activeNs = getNamespace(dicts[lang] ?? {}, namespace);
    const fallbackNs = getNamespace(dicts.en, namespace);

    const pick = (ns?: Record<string, MessageNode>): string | undefined => {
      const v = ns?.[key];
      return typeof v === 'string' ? v : undefined;
    };

    const raw = pick(activeNs) ?? pick(fallbackNs) ?? key;
    return interpolate(raw, vars);
  };
}
