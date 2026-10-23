import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { siteKeys, siteMessage } from './messages';
import { COACH_SITE_PHOTOS, FACE_ANCHORS, SITE_MARKS, SITE_PHOTOS, faceProps, type PhotoKey } from './photos';

/** T-SITE1 Part C: the site's photos are keyed, present, light and described. */
const KEYS = Object.keys(SITE_PHOTOS) as PhotoKey[];
const file = (key: PhotoKey) => join(process.cwd(), 'public', SITE_PHOTOS[key]);

describe('site photos (Part C)', () => {
  it('has every key of the photo map (T-SITE1.1 Part B), minus the two Al dropped', () => {
    // 32 photos + door_os, bb_w, fv_w, tv_wod, tv_wil, logo_w, hero_full. The four
    // hand-picked roster portraits left in Part C (the roster is live). Site
    // polish adds hero_coach_m (the phone cut), coach_andres and fv_c.
    expect(KEYS).toHaveLength(42);
    expect(KEYS).not.toContain('hero_tall');
    expect(KEYS).not.toContain('rowers');
  });

  it.each(KEYS)('%s exists in public/', (key) => {
    expect(existsSync(file(key))).toBe(true);
  });

  it('keeps every file light (each under 300 KB before next/image resizes it)', () => {
    for (const key of KEYS) expect(statSync(file(key)).size, key).toBeLessThan(300 * 1024);
  });

  it('describes only real photos: every site.alt key is a registered, non-mark photo, in both languages', () => {
    for (const lang of ['es', 'en'] as const) {
      const alts = siteKeys(lang)
        .filter((k) => k.startsWith('alt.'))
        .map((k) => k.slice(4));
      for (const key of alts) {
        expect(KEYS, `${lang} site.alt.${key}`).toContain(key);
        expect(SITE_MARKS, key).not.toContain(key);
      }
    }
  });
});

describe('one file, one slot (T-SITE1.1 Part A)', () => {
  // The site's own photo map only. public/og/ (T-SHARE1 share card photos) is
  // exempt: a card may show a frame the site also shows (IMG_8942, IMG_0455),
  // because the card is what the link looks like before anyone opens the page.
  it('no file is registered under two keys', () => {
    const byPath = new Map<string, PhotoKey[]>();
    for (const key of KEYS) byPath.set(SITE_PHOTOS[key], [...(byPath.get(SITE_PHOTOS[key]) ?? []), key]);
    const shared = [...byPath.entries()].filter(([, keys]) => keys.length > 1);
    expect(shared).toEqual([]);
  });
});

describe('face anchors (T-SITE1.1 Part A)', () => {
  it('anchors only registered photos, never a mark, inside the image', () => {
    for (const [key, [x, y]] of Object.entries(FACE_ANCHORS) as [PhotoKey, readonly [number, number]][]) {
      expect(KEYS, key).toContain(key);
      expect(SITE_MARKS, key).not.toContain(key);
      expect(x, key).toBeGreaterThanOrEqual(0);
      expect(x, key).toBeLessThanOrEqual(100);
      expect(y, key).toBeGreaterThanOrEqual(0);
      expect(y, key).toBeLessThanOrEqual(100);
    }
  });

  it('positions the photo on its faces and tags it for the face test', () => {
    expect(faceProps('close_team')).toEqual({
      style: { objectPosition: '47% 36%' },
      'data-face-anchor': '47 36',
    });
    expect(faceProps('door_gym')).toEqual({});
  });
});

/**
 * T-SITE1.1 Part B. Frames that must never ship: Zona de Combate IMG_9764 to
 * 9766 and 9776 to 9777 (a person who asked not to appear in Tribe media),
 * BullBox IMG_9856 to 9863 (Leo portraits), Ronald Gallego, Medellín Run Club.
 * The crop script refuses them by source (jobs.json `banned`); this catches a
 * file named after one landing in public/ by any other route.
 */
describe('banned frames (T-SITE1.1 Part B)', () => {
  const BANNED = /(?:^|[^0-9])(?:976[456]|977[67]|985[6-9]|986[0-3])(?:[^0-9]|$)|ronald|run.?club/i;
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]
    );

  it('no file under public/ is named after a banned frame', () => {
    const files = walk(join(process.cwd(), 'public'));
    expect(files.length).toBeGreaterThan(50);
    expect(files.filter((f) => BANNED.test(f.split('/').pop() ?? ''))).toEqual([]);
  });

  // T-SHARE1 Part D: the share card photos are under the same rule. Named on
  // its own so that a walk which ever stopped reaching public/og/ fails here.
  it('covers the share card photos in public/og/ too', () => {
    const og = walk(join(process.cwd(), 'public', 'og'));
    expect(og.length).toBeGreaterThanOrEqual(12);
    expect(og.filter((f) => BANNED.test(f.split('/').pop() ?? ''))).toEqual([]);
    expect(walk(join(process.cwd(), 'public')).filter((f) => f.includes('/public/og/'))).toEqual(og);
  });

  it('the pattern catches the names the old pass used', () => {
    for (const name of ['z9765.jpg', 'IMG_9776.JPG', 'IMG_9860.JPG', 'ronald_01.jpg'])
      expect(BANNED.test(name), name).toBe(true);
    for (const name of ['IMG_9714.JPG', 'z9824.jpg', 'door_ath.jpg']) expect(BANNED.test(name), name).toBe(false);
  });
});

/**
 * T-SITE1.1 (Al, 2026-10-17): every alt text is a sentence that ends with a
 * period; English says "Coach Wil", Spanish "profe Wil".
 */
describe('alt text style', () => {
  it('every alt ends with a period, in both languages', () => {
    for (const lang of ['es', 'en'] as const) {
      const alts = siteKeys(lang).filter((k) => k.startsWith('alt.'));
      expect(alts.length).toBeGreaterThan(20);
      const bad = alts.filter((k) => !siteMessage(lang, 'site.alt', k.slice(4)).endsWith('.'));
      expect(bad, lang).toEqual([]);
    }
  });

  it('Wil is "Coach Wil" in English and "profe Wil" in Spanish', () => {
    for (const k of siteKeys('en').filter((k) => k.startsWith('alt.'))) {
      expect(siteMessage('en', 'site.alt', k.slice(4)), k).not.toMatch(/\b(profe|Profe|coach) Wil\b/);
    }
    for (const k of siteKeys('es').filter((k) => k.startsWith('alt.'))) {
      expect(siteMessage('es', 'site.alt', k.slice(4)), k).not.toMatch(/\b(Coach|coach|Profe) Wil\b/);
    }
  });
});

describe('coach site photos (site polish)', () => {
  it('maps coach ids to registered people photos, never a mark', () => {
    for (const [id, key] of Object.entries(COACH_SITE_PHOTOS)) {
      expect(id).toMatch(/^[0-9a-f-]{36}$/);
      expect(KEYS, id).toContain(key);
      expect(SITE_MARKS, id).not.toContain(key);
      expect(FACE_ANCHORS[key], key).toBeDefined();
    }
  });
});
