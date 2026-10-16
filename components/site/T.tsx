'use client';

import Image, { type ImageProps } from 'next/image';
import { useSiteT } from '@/lib/site/useSiteT';

/**
 * T-SITE1. The site's pages are server components; the copy is not, because
 * the visitor's language is client state. <T> is the one client leaf every
 * string goes through, so the page structure, layout and images stay server
 * rendered and only the text hydrates.
 *
 *   <T k="site.home.h1a" />
 *
 * `k` is the full dot path; the last segment is the key, the rest the namespace.
 */
function split(k: string): [string, string] {
  const i = k.lastIndexOf('.');
  return [k.slice(0, i), k.slice(i + 1)];
}

export function T({ k, vars }: { k: string; vars?: Record<string, string | number> }) {
  const [ns, key] = split(k);
  const t = useSiteT(ns);
  return <>{t(key, vars)}</>;
}

/** next/image with its alt text looked up in the site messages. */
export function SiteImage({ altKey, ...props }: Omit<ImageProps, 'alt'> & { altKey: string | null }) {
  const [ns, key] = altKey ? split(altKey) : ['site', ''];
  const t = useSiteT(ns);
  return <Image alt={altKey ? t(key) : ''} {...props} />;
}
