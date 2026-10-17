import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { cookieNames, hasAuthCookieName } from './authCookie';
import { siteKeys, siteMessage } from './messages';
import { SITE_SLUGS } from './paths';
import { SITE_SPORT_COUNT } from './sportCount';
import { SPORTS_LIST } from '@/lib/sports';
import { storeUrlFor, APP_STORE_URL, PLAY_STORE_URL } from './links';
import { formatPrice, weekdayIndex } from './weekFormat';

describe('site copy (messages/{es,en}.json, site.*)', () => {
  it('has the same keys in Spanish and English', () => {
    expect(siteKeys('en')).toEqual(siteKeys('es'));
  });

  it('has no em or en dashes in either language', () => {
    for (const lang of ['es', 'en'] as const) {
      for (const path of siteKeys(lang)) {
        const i = path.lastIndexOf('.');
        const text = siteMessage(lang, `site.${path.slice(0, i)}`, path.slice(i + 1));
        expect(text, `${lang} site.${path}`).not.toMatch(/[–—]/);
      }
    }
  });

  it('resolves every literal key the site components use', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(name) && !/\.test\./.test(name)) files.push(p);
      }
    };
    walk(join(process.cwd(), 'components/site'));
    walk(join(process.cwd(), 'app/sitio'));
    const keys = new Set<string>();
    for (const f of files) {
      for (const m of readFileSync(f, 'utf8').matchAll(/["'](site\.[a-zA-Z0-9_.]+)["']/g)) keys.add(m[1]);
    }
    expect(keys.size).toBeGreaterThan(50);
    const leaves = siteKeys('es').map((k) => `site.${k}`);
    const isNamespace = (key: string) => leaves.some((leaf) => leaf.startsWith(`${key}.`));
    for (const key of keys) {
      if (isNamespace(key)) continue;
      const i = key.lastIndexOf('.');
      expect(siteMessage('es', key.slice(0, i), key.slice(i + 1)), key).not.toBe(key);
    }
  });

  it('has a title and description for every site page, in both languages', () => {
    for (const lang of ['es', 'en'] as const) {
      for (const slug of SITE_SLUGS) {
        for (const key of ['title', 'description'])
          expect(siteMessage(lang, `site.meta.${slug}`, key), `${lang} meta ${slug}.${key}`).not.toMatch(/^site\./);
      }
    }
  });

  it('never writes the sport count as a literal: it comes from lib/sports.ts (Al, 2026-10-17)', () => {
    expect(SITE_SPORT_COUNT).toBe(SPORTS_LIST.length - 1);
    for (const lang of ['es', 'en'] as const) {
      for (const path of siteKeys(lang)) {
        const i = path.lastIndexOf('.');
        const text = siteMessage(lang, `site.${path.slice(0, i)}`, path.slice(i + 1));
        expect(text, `${lang} site.${path}`).not.toMatch(
          new RegExp(`\\b(${SITE_SPORT_COUNT}|${SITE_SPORT_COUNT - 6})\\b`)
        );
      }
    }
  });

  it('falls back to Spanish, then to the key', () => {
    expect(siteMessage('en', 'site.home', 'h1a')).toBe('Never');
    expect(siteMessage('es', 'site.home', 'h1a')).toBe('Nunca');
    expect(siteMessage('es', 'site.home', 'nope')).toBe('site.home.nope');
    expect(siteMessage('es', 'site.week', 'spots', { n: 4 })).toBe('4 cupos');
  });
});

describe('auth cookie detection', () => {
  it('matches the Supabase session cookie, chunked or whole', () => {
    expect(hasAuthCookieName(['sb-abc-auth-token'])).toBe(true);
    expect(hasAuthCookieName(['sb-abc-auth-token.1'])).toBe(true);
    expect(hasAuthCookieName(['sb-abc-auth-token-code-verifier'])).toBe(false);
    expect(hasAuthCookieName(['language', 'ph_phc_x_posthog'])).toBe(false);
  });

  it('reads names out of document.cookie', () => {
    expect(cookieNames('a=1; sb-x-auth-token.0=base64-eyJ; b=2')).toEqual(['a', 'sb-x-auth-token.0', 'b']);
    expect(cookieNames('')).toEqual([]);
  });
});

describe('store link by device', () => {
  it('sends Android to Play and everyone else to the App Store', () => {
    expect(storeUrlFor('Mozilla/5.0 (Linux; Android 14; Pixel 8)')).toBe(PLAY_STORE_URL);
    expect(storeUrlFor('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe(APP_STORE_URL);
    expect(storeUrlFor('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)')).toBe(APP_STORE_URL);
  });
});

describe('week board formatting', () => {
  it('names the weekday of the calendar date, not of the viewer timezone', () => {
    expect(weekdayIndex('2026-10-16')).toBe(5); // Friday
    expect(weekdayIndex('2026-10-18')).toBe(0); // Sunday
  });

  it('formats COP without decimals', () => {
    expect(formatPrice({ cents: 2500000, currency: 'COP' }, 'es')).toMatch(/25\.000/);
  });
});

/**
 * Al's rule (2026-10-16): all marketing copy renders on the server; nothing
 * from messages/*.json ships to the browser on site routes. A client component
 * under the site takes its strings as props.
 */
describe('no message file in the site client bundle', () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(name) && !/\.test\./.test(name)) files.push(p);
    }
  };
  walk(join(process.cwd(), 'components/site'));
  walk(join(process.cwd(), 'app/sitio'));
  const clientFiles = files.filter((f) => /^\s*['"]use client['"]/.test(readFileSync(f, 'utf8')));

  it('found the client leaves (the scan read something)', () => {
    expect(clientFiles.length).toBeGreaterThanOrEqual(4);
  });

  it.each(clientFiles.map((f) => [f.replace(process.cwd() + '/', '')]))('%s imports no copy', (file) => {
    const src = readFileSync(join(process.cwd(), file), 'utf8');
    expect(src).not.toMatch(
      /from ['"][^'"]*(messages\/(es|en)\.json|lib\/site\/(messages|i18n)|i18n\/useTranslations)['"]/
    );
  });

  it('no site page is a client component', () => {
    const pages = files.filter((f) => /app\/sitio\/.*(page|layout)\.tsx$/.test(f));
    expect(pages.length).toBeGreaterThanOrEqual(9);
    for (const f of pages) expect(clientFiles, f).not.toContain(f);
  });
});
