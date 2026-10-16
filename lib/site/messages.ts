/**
 * T-SITE1. Lookup for the marketing site's copy, usable on the server and in
 * the client hook (lib/site/useSiteT.ts).
 *
 * The copy lives in messages/{es,en}.json under "site.<page>". Lookup inside a
 * namespace is flat, exactly as in useTranslations. A key missing in English
 * falls back to Spanish (the site is written Spanish first); a key missing in
 * both renders the key, and lib/site/messages.test.ts fails CI before that can
 * ship.
 */
import en from '@/messages/en.json';
import es from '@/messages/es.json';

export type SiteLanguage = 'es' | 'en';
type MessageNode = string | { [key: string]: MessageNode };
const dicts: Record<SiteLanguage, MessageNode> = { es: es as MessageNode, en: en as MessageNode };

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

/** Every leaf under messages.<lang>.site, as dot paths. For the parity test. */
export function siteKeys(language: SiteLanguage): string[] {
  const out: string[] = [];
  const walk = (node: MessageNode | undefined, prefix: string) => {
    if (typeof node === 'string') out.push(prefix);
    else if (node) for (const [k, v] of Object.entries(node)) walk(v, prefix ? `${prefix}.${k}` : k);
  };
  walk(lookup(dicts[language], ['site']), '');
  return out.sort();
}
