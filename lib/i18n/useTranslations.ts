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

/**
 * Dev-only notice that a lookup fell through to `?? key`.
 *
 * WHY THIS EXISTS. The fallback below returns the KEY when nothing resolves, so
 * an unresolved lookup renders as `fields.photo` and is indistinguishable at
 * runtime from a deliberate literal. That is how T-AUD3 shipped: the banner
 * listed raw keys to instructors in both languages and nothing anywhere said so.
 * The fallback is the right behaviour -- a missing string must not blank the UI
 * -- but it must not be silent in development.
 *
 * lib/i18n/i18nGuards.test.ts is the primary guard and fails CI. It can only see
 * LITERAL keys, so the nine call sites that pass a variable -- t(weather.condition),
 * tPartner(typeKey) and the rest -- are invisible to it. Only a runtime check
 * sees those, which is why both exist.
 *
 * NO ALLOWLIST, DELIBERATELY. Every message in en.json and es.json resolves
 * today, so this starts silent and any noise is a real defect. If a message is
 * ever legitimately key-shaped -- where `raw === key` is the intended copy --
 * this will warn falsely and will need an explicit allowlist keyed on
 * `namespace + '.' + key`. Do not add that mechanism before it has a member: an
 * empty allowlist is a place for the next false positive to be silenced rather
 * than understood.
 *
 * Warns once per namespace+key so a key inside a list does not flood the console.
 */
const warnedKeys = new Set<string>();

function warnUnresolved(namespace: string, key: string): void {
  const id = `${namespace}.${key}`;
  if (warnedKeys.has(id)) return;
  warnedKeys.add(id);
  // eslint-disable-next-line no-console -- dev-only diagnostic; see the docblock
  console.warn(
    `[i18n] useTranslations('${namespace}') could not resolve t('${key}'), so the KEY ITSELF will render. ` +
      (key.includes('.')
        ? `The key contains a dot: a nested message is addressed through the NAMESPACE, ` +
          `e.g. useTranslations('${namespace}.${key.split('.')[0]}') then t('${key
            .split('.')
            .slice(1)
            .join('.')}'). The lookup inside a namespace is flat.`
        : `Add it to messages/en.json under "${namespace}", or correct the key.`)
  );
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

    const resolved = pick(activeNs) ?? pick(fallbackNs);

    if (resolved === undefined && process.env.NODE_ENV !== 'production') {
      warnUnresolved(namespace, key);
    }

    const raw = resolved ?? key;
    return interpolate(raw, vars);
  };
}
