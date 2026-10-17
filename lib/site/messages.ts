/**
 * T-SITE1. Lookup for the marketing site's copy. SERVER ONLY in practice: the
 * site renders its copy on the server (lib/site/i18n.ts) and no client
 * component may import this file (lib/site/site.test.ts enforces it).
 *
 * The copy lives in messages/site/{es,en}.json, keyed "site.<page>" here.
 * It is kept out of messages/{es,en}.json because lib/i18n/useTranslations
 * ships those two files whole to the browser on every app page: the site's
 * copy there cost the app's home page 35 KB and failed CI's bundle budget
 * (T-SITE1.1). Nothing on the client imports these files (lib/site/site.test.ts
 * enforces it). Lookup inside a
 * namespace is flat, exactly as in useTranslations. A key missing in English
 * falls back to Spanish (the site is written Spanish first); a key missing in
 * both renders the key, and lib/site/site.test.ts fails CI before that can
 * ship.
 */
import en from '@/messages/site/en.json';
import es from '@/messages/site/es.json';

export type SiteLanguage = 'es' | 'en';
type MessageNode = string | { [key: string]: MessageNode };
const dicts: Record<SiteLanguage, MessageNode> = { es: { site: es as MessageNode }, en: { site: en as MessageNode } };

function lookup(root: MessageNode, path: string[]): MessageNode | undefined {
  let node: MessageNode | undefined = root;
  for (const part of path) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = node[part];
  }
  return node;
}

export function siteMessage(
  language: SiteLanguage,
  namespace: string,
  key: string,
  vars?: Record<string, string | number>
): string {
  const path = [...namespace.split('.'), key];
  const hit = lookup(dicts[language], path);
  const raw = typeof hit === 'string' ? hit : lookup(dicts.es, path);
  let out = typeof raw === 'string' ? raw : `${namespace}.${key}`;
  for (const [k, v] of Object.entries(vars ?? {})) out = out.replaceAll(`{${k}}`, String(v));
  return out;
}

/** Every leaf of messages/site/<lang>.json, as dot paths. For the parity test. */
export function siteKeys(language: SiteLanguage): string[] {
  const out: string[] = [];
  const walk = (node: MessageNode | undefined, prefix: string) => {
    if (typeof node === 'string') out.push(prefix);
    else if (node) for (const [k, v] of Object.entries(node)) walk(v, prefix ? `${prefix}.${k}` : k);
  };
  walk(lookup(dicts[language], ['site']), '');
  return out.sort();
}
