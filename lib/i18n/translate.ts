/**
 * T-AV27b. The server-side twin of useTranslations, for copy that is rendered
 * where no React tree exists: a notification written for SOMEONE ELSE, in
 * THEIR language (a coach confirms, the athlete reads it). Same files
 * (messages/en.json, messages/es.json), same flat lookup inside a namespace,
 * same `{name}` interpolation, so a key resolves here exactly as it does in
 * a component.
 *
 * Unlike the hook, an unresolvable key THROWS. A component falls back to the
 * key so a page still renders; a notification that would carry the literal
 * "notify.arrived" to a person's phone is a bug to stop at, not to send.
 */
import en from '@/messages/en.json';
import es from '@/messages/es.json';

export type Language = 'en' | 'es';
type MessageNode = string | { [key: string]: MessageNode };
const dicts: Record<Language, Record<string, MessageNode>> = {
  en: en as Record<string, MessageNode>,
  es: es as Record<string, MessageNode>,
};

/** A stored preference to a supported language. Anything else is Spanish, the market's language. */
export function toLanguage(value: string | null | undefined): Language {
  return value === 'en' ? 'en' : 'es';
}

export function translate(
  language: Language,
  namespace: string,
  key: string,
  vars?: Record<string, string | number>
): string {
  const ns = dicts[language][namespace];
  const template = typeof ns === 'object' && ns !== null ? ns[key] : undefined;
  if (typeof template !== 'string') throw new Error(`translate: ${language} ${namespace}.${key} does not resolve`);
  let out = template;
  for (const [k, v] of Object.entries(vars ?? {})) out = out.replaceAll(`{${k}}`, String(v));
  return out;
}
