import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { siteKeys } from './messages';
import { SITE_MARKS, SITE_PHOTOS, type PhotoKey } from './photos';

/** T-SITE1 Part C: the site's photos are keyed, present, light and described. */
const KEYS = Object.keys(SITE_PHOTOS) as PhotoKey[];
const file = (key: PhotoKey) => join(process.cwd(), 'public', SITE_PHOTOS[key]);

describe('site photos (Part C)', () => {
  it('has every key of the spec, minus the two Al dropped', () => {
    // 29 crops + hero_full, pad_tall, barbell, bb_w, fv_w, tv_wod, tv_wil, logo_w.
    expect(KEYS).toHaveLength(37);
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
