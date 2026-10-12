import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { canonicalUrlFor, canonicalLinkHeader, OWN_CANONICAL_PREFIXES } from './canonicalLink';

describe('canonicalUrlFor', () => {
  it('names tribelatam.com for the home page', () => {
    expect(canonicalUrlFor('/')).toBe('https://tribelatam.com/');
  });

  it('serves one trailing slash, the way trailingSlash: true does', () => {
    expect(canonicalUrlFor('/about')).toBe('https://tribelatam.com/about/');
    expect(canonicalUrlFor('/about/')).toBe('https://tribelatam.com/about/');
    expect(canonicalUrlFor('/s/7410b018-ea39-4904-85e4-40acb90c41b4/')).toBe(
      'https://tribelatam.com/s/7410b018-ea39-4904-85e4-40acb90c41b4/'
    );
  });

  it('gives no canonical to API routes, Next internals or files', () => {
    for (const p of [
      '/api',
      '/api/cron/weekly/',
      '/_next/static/chunks/a.js',
      '/robots.txt',
      '/sitemap.xml',
      '/manifest.json',
    ]) {
      expect(canonicalUrlFor(p), p).toBeNull();
    }
  });

  it('leaves routes that declare their own canonical alone', () => {
    expect(canonicalUrlFor('/g/bullbox/')).toBeNull();
    expect(canonicalUrlFor('/g/bullbox')).toBeNull();
    // a different route that merely starts with the same letter is not exempt
    expect(canonicalUrlFor('/guides/')).toBe('https://tribelatam.com/guides/');
  });

  it('formats the Link header Google reads', () => {
    expect(canonicalLinkHeader('/faq')).toBe('<https://tribelatam.com/faq/>; rel="canonical"');
    expect(canonicalLinkHeader('/api/x')).toBeNull();
  });
});

/**
 * The exemption list must match reality in both directions: a page declaring
 * `alternates: { canonical }` outside it would get a SECOND, conflicting
 * canonical from the header, and an entry with no such page left is a hole
 * that silently drops the header from a whole route.
 */
describe('OWN_CANONICAL_PREFIXES matches the pages that declare a canonical', () => {
  const ROOT = path.resolve(__dirname, '..', '..');
  const APP = path.join(ROOT, 'app');

  function walk(dir: string, out: string[] = []): string[] {
    for (const e of readdirSync(dir)) {
      const p = path.join(dir, e);
      if (statSync(p).isDirectory()) walk(p, out);
      else if (/\.(tsx?)$/.test(e) && !/\.test\.tsx?$/.test(e)) out.push(p);
    }
    return out;
  }

  /** True when the file has an object property `alternates` holding a `canonical` key. */
  function declaresCanonical(file: string): boolean {
    const src = readFileSync(file, 'utf8');
    if (!src.includes('canonical')) return false;
    const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true);
    let found = false;
    const visit = (n: ts.Node) => {
      if (
        ts.isPropertyAssignment(n) &&
        n.name.getText(sf) === 'alternates' &&
        ts.isObjectLiteralExpression(n.initializer) &&
        n.initializer.properties.some((p) => p.name?.getText(sf) === 'canonical')
      )
        found = true;
      if (!found) ts.forEachChild(n, visit);
    };
    visit(sf);
    return found;
  }

  /** app/g/[id]/page.tsx -> /g/ */
  const routeOf = (file: string) =>
    '/' +
    path
      .relative(APP, path.dirname(file))
      .split(path.sep)
      .filter((s) => !s.startsWith('('))
      .join('/') +
    '/';

  const declaring = walk(APP).filter(declaresCanonical);

  it('found the known declaring page (the scan read something)', () => {
    expect(declaring.map((f) => path.relative(ROOT, f))).toContain(path.join('app', 'g', '[id]', 'page.tsx'));
  });

  it('every page with its own canonical is under an exempt prefix', () => {
    const uncovered = declaring
      .map(routeOf)
      .filter((route) => !Object.keys(OWN_CANONICAL_PREFIXES).some((prefix) => route.startsWith(prefix)));
    expect(uncovered, 'add the route to OWN_CANONICAL_PREFIXES with its reason').toEqual([]);
  });

  it('every exempt prefix still has a page declaring its own canonical', () => {
    const routes = declaring.map(routeOf);
    const stale = Object.keys(OWN_CANONICAL_PREFIXES).filter((prefix) => !routes.some((r) => r.startsWith(prefix)));
    expect(stale, 'remove these from OWN_CANONICAL_PREFIXES').toEqual([]);
  });

  it('every exemption carries a reason', () => {
    for (const [prefix, reason] of Object.entries(OWN_CANONICAL_PREFIXES))
      expect(reason.length, prefix).toBeGreaterThan(40);
  });
});
