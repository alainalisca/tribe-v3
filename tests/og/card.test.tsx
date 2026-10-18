// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { describe, it, expect } from 'vitest';
import { headlineSize, renderCard, type CardProps } from '@/lib/og/card';

/**
 * T-SHARE1 Part A. The share card renderer, drawn for real and compared with
 * checked-in PNGs: a short headline, the long one (Funcional), the paper tag,
 * no photo, and the home tiles. A card may differ from its PNG in at most 0.5
 * percent of its pixels (font antialiasing across machines); a layout change
 * moves far more than that.
 *
 * A changed card is a design change: delete its PNG under tests/og/cards/, run
 * this file to write the new one, and show Al the new contact sheet. In CI a
 * missing PNG fails instead of being written.
 */
const DIR = path.join(__dirname, 'cards');
const TOLERANCE = 0.005;
/** A pixel counts as changed when any channel moves more than this. */
const CHANNEL_DELTA = 24;

const WEEKLY = ['Clases todas las semanas', 'Coaches con nombre', 'Reserva en Tribe'];

const CASES: Record<string, CardProps> = {
  short: { line: ['Boxeo en', 'Medellín'], sub: WEEKLY, tag: 'Boxeo', photo: '/og/og_boxeo.jpg', lang: 'es' },
  long: {
    line: ['Funcional', 'en Medellín'],
    sub: WEEKLY,
    tag: 'Funcional',
    photo: '/og/og_funcional.jpg',
    lang: 'es',
  },
  paper: {
    line: ['Encuentra', 'tu grupo'],
    sub: ['Sesiones cerca de ti', 'Sabes quién da la clase', 'Reserva en Tribe'],
    tag: 'Para atletas',
    tagStyle: 'paper',
    photo: '/og/og_ath.jpg',
    lang: 'es',
  },
  'no-photo': {
    line: ['Tu gimnasio,', 'más lleno'],
    sub: ['Primera clase gratis', 'Pases y reportes', 'Sin comisión'],
    tag: 'Gimnasios',
    lang: 'es',
  },
  tiles: {
    line: ['Entrena en', 'Medellín'],
    sub: WEEKLY,
    tag: 'Tribe',
    tiles: [
      { src: '/og/og_t_boxeo.jpg', label: 'Boxeo' },
      { src: '/og/og_t_crossfit.jpg', label: 'CrossFit' },
      { src: '/og/og_t_hyrox.jpg', label: 'HYROX' },
      { src: '/og/og_t_yoga.jpg', label: 'Yoga' },
    ],
    lang: 'es',
  },
};

async function rgba(png: Buffer) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/** Share of pixels that differ by more than CHANNEL_DELTA in any channel. */
async function changedShare(a: Buffer, b: Buffer): Promise<number> {
  const [x, y] = await Promise.all([rgba(a), rgba(b)]);
  if (x.width !== y.width || x.height !== y.height) return 1;
  let changed = 0;
  for (let i = 0; i < x.data.length; i += 4) {
    for (let c = 0; c < 4; c++) {
      if (Math.abs(x.data[i + c] - y.data[i + c]) > CHANNEL_DELTA) {
        changed++;
        break;
      }
    }
  }
  return changed / (x.width * x.height);
}

describe('renderCard', () => {
  it.each(Object.keys(CASES))(
    'draws the %s card as approved',
    async (name) => {
      const png = Buffer.from(await (await renderCard(CASES[name])).arrayBuffer());
      const meta = await sharp(png).metadata();
      expect([meta.format, meta.width, meta.height]).toEqual(['png', 1200, 630]);

      const file = path.join(DIR, `${name}.png`);
      if (!fs.existsSync(file)) {
        if (process.env.CI) throw new Error(`${file} is missing; render it locally and commit it`);
        fs.mkdirSync(DIR, { recursive: true });
        fs.writeFileSync(file, png);
      }
      expect(await changedShare(png, fs.readFileSync(file))).toBeLessThanOrEqual(TOLERANCE);
    },
    30_000
  );

  it('drops to the long size only when a line runs past 11 characters, the dot included', () => {
    expect(headlineSize(['Funcional', 'en Medellín'])).toBe(88);
    expect(headlineSize(['CrossFit en', 'Medellín'])).toBe(101);
    expect(headlineSize(['Entrena en', 'Medellín'])).toBe(101);
    expect(headlineSize(['Encuentra', 'tu grupo'])).toBe(101);
  });

  it('refuses a photo and tiles together', async () => {
    await expect(renderCard({ ...CASES.tiles, photo: '/og/og_boxeo.jpg' })).rejects.toThrow(/mutually exclusive/);
  });

  it('reads only from public/', async () => {
    await expect(renderCard({ ...CASES.short, photo: '/../.env.local' })).rejects.toThrow(/leaves public/);
  });
});

describe('public/og', () => {
  it('holds only 696 x 630 card photos and 300 x 300 home tiles', async () => {
    const dir = path.join(process.cwd(), 'public', 'og');
    const files = fs.readdirSync(dir).filter((f) => !f.startsWith('.'));
    expect(files.length).toBeGreaterThanOrEqual(12);
    for (const f of files) {
      expect(f, 'card photos are JPG').toMatch(/\.jpg$/);
      const { width, height } = await sharp(path.join(dir, f)).metadata();
      expect(
        [
          [696, 630],
          [300, 300],
        ],
        f
      ).toContainEqual([width, height]);
    }
  });
});
