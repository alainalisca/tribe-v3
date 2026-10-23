import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { stripJsComments } from '@/lib/stripJsComments';

/**
 * T-POLISH1 PR 3b-2: the app links to a coach's /i/ and a gym's /g/ page, never
 * to /storefront/ (which now only redirects there, for links already printed
 * or sent). The four frozen features (products, promote) keep theirs until
 * they are unfrozen; this list is exact, so a new /storefront link fails here
 * and a frozen file that stops linking must leave the list.
 */
const ROOT = join(__dirname, '..', '..');
const FROZEN = [
  'app/create-product/page.tsx',
  'app/product/[id]/ProductDetailClient.tsx',
  'app/promote/page.tsx',
  'components/products/StorefrontProductsSection.tsx',
].sort();

// A string or template literal that starts a /storefront/ path.
const STOREFRONT_LINK = /[`'"]\/storefront\//;

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sources(full));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

describe('no in-app link goes to /storefront', () => {
  const offenders = ['app', 'components', 'lib', 'hooks']
    .flatMap((d) => sources(join(ROOT, d)))
    .filter((f) => STOREFRONT_LINK.test(stripJsComments(readFileSync(f, 'utf8'))))
    .map((f) => relative(ROOT, f))
    .sort();

  it('reads some files (a scan that read nothing would pass vacuously)', () => {
    expect(sources(join(ROOT, 'components')).length).toBeGreaterThan(100);
  });

  it('only the frozen features still link there', () => {
    expect(offenders).toEqual(FROZEN);
  });
});
