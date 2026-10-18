// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { describe, it, expect } from 'vitest';
import { SITE_CARDS, siteCardImage, siteCardProps } from '@/lib/og/siteCards';
import { SITE_SPORT_SLUGS } from '@/lib/site/paths';

/**
 * T-SHARE1 Part B. Every site page's share card, as its route serves it: a
 * 1200 x 630 JPEG under 250 KB (Al, 2026-10-17: WhatsApp drops a preview image
 * much past 300 KB), in both languages. And every card route is there,
 * prerendered and cached for a day.
 */
const MAX_BYTES = 250 * 1024;
const SITE = path.join(process.cwd(), 'app', 'sitio', '[lang]');
const ROUTE_DIR: Record<string, string> = {
  home: '',
  'para-atletas': 'para-atletas',
  coaches: 'coaches',
  gimnasios: 'gimnasios',
  'tribe-os': 'tribe-os',
  tv: 'tv',
  preguntas: 'preguntas',
};

describe('site share cards', () => {
  it('covers the seven carded pages and the six sports', () => {
    expect(SITE_CARDS).toHaveLength(13);
    for (const s of SITE_SPORT_SLUGS) expect(SITE_CARDS).toContain(`deportes/${s}`);
    expect(SITE_CARDS).not.toContain('deportes');
  });

  it.each(SITE_CARDS.flatMap((card) => (['es', 'en'] as const).map((lang) => [card, lang] as const)))(
    '%s (%s) is a 1200 x 630 JPEG under 250 KB',
    async (card, lang) => {
      const res = await siteCardImage(card, lang);
      expect(res.headers.get('Content-Type')).toBe('image/jpeg');
      const body = Buffer.from(await res.arrayBuffer());
      expect(body.length).toBeLessThan(MAX_BYTES);
      const meta = await sharp(body).metadata();
      expect([meta.format, meta.width, meta.height]).toEqual(['jpeg', 1200, 630]);
    },
    30_000
  );

  it('uses the approved copy: no message key ever reaches a card', () => {
    for (const card of SITE_CARDS) {
      for (const lang of ['es', 'en'] as const) {
        const p = siteCardProps(card, lang);
        const text = [...p.line, ...p.sub, p.tag, ...(p.tiles ?? []).map((t) => t.label)];
        expect(
          text.filter((s) => s.startsWith('site.') || s.trim() === ''),
          `${card} ${lang}`
        ).toEqual([]);
      }
    }
    expect(siteCardProps('para-atletas', 'es').sub).toEqual([
      'Sesiones cerca de ti',
      'Sabes quién da la clase',
      'Reserva en Tribe',
    ]);
    expect(siteCardProps('coaches', 'es')).toMatchObject({ tagStyle: 'paper', photo: '/og/og_coach.jpg' });
    expect(siteCardProps('gimnasios', 'es').photo).toBeUndefined();
  });

  it('never types a product name into a headline (Al, 2026-10-17): the logo rule needs the real wordmark', () => {
    for (const card of SITE_CARDS) {
      for (const lang of ['es', 'en'] as const) {
        expect(siteCardProps(card, lang).line.join(' '), `${card} ${lang}`).not.toMatch(/tribe\s*\.?\s*(os|tv)\b/i);
      }
    }
    expect(siteCardProps('tribe-os', 'es').line).toEqual(['Clientes que', 'vuelven']);
    expect(siteCardProps('tv', 'es')).toMatchObject({ line: ['Historias', 'reales'], tag: 'Tribe.TV' });
  });

  it('every carded page has its card route, prerendered and cached a day', () => {
    const dirs = [...Object.values(ROUTE_DIR), path.join('deportes', '[sport]')];
    for (const dir of dirs) {
      const route = fs.readFileSync(path.join(SITE, dir, 'card', 'route.ts'), 'utf8');
      expect(route, dir).toMatch(/export const revalidate = 86400;/);
      expect(route, dir).toMatch(/export const dynamicParams = false;/);
      expect(route, dir).toMatch(/export function generateStaticParams\(\)/);
      expect(route, dir).toMatch(/siteCardImage\(/);
      // Never the file convention: Next names it without the trailing slash, and the app 308s that URL.
      expect(fs.existsSync(path.join(SITE, dir, 'opengraph-image.tsx')), dir).toBe(false);
    }
    // /deportes/ keeps its T-SITE1 photo until Al picks one (spec, Part B).
    expect(fs.existsSync(path.join(SITE, 'deportes', 'card'))).toBe(false);
  });
});
