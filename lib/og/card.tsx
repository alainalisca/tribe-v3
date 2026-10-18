import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import sharp from 'sharp';
import { logError } from '@/lib/logger';

/**
 * T-SHARE1 Part A. The one share card every public link renders: charcoal,
 * the Tribe wordmark, a two-line headline that ends in the lime dot, up to
 * three lime sub lines, a tag, and either one photo on the right, four photo
 * tiles (the home card), or nothing (the no-photo card).
 *
 * Every number below is the approved mock's percentage of a 1200 x 630 canvas
 * (Al, 2026-10-17, https://claude.ai/artifact/DS4vcFzryk2m7hwLkPjNm7). Do not
 * eyeball them.
 *
 * Server only: it reads the fonts, the wordmark and the site's own photos from
 * disk (node:fs keeps it out of any client bundle). A route that uses it runs
 * on the Node runtime, and a route that re-renders on Vercel (revalidate) needs
 * public/fonts, public/og and the wordmark traced into its function
 * (next.config.ts outputFileTracingIncludes).
 *
 * Routes serve cardResponse(): the same card as a JPEG at quality 82. The PNG
 * renderCard() makes is 650 to 850 KB with a photo, and WhatsApp drops preview
 * images much past 300 KB; the JPEG is a fraction of that (Al, 2026-10-17:
 * every card under 250 KB, tested in tests/og/siteCards.test.ts).
 */

export type CardLang = 'es' | 'en';
export type Tile = { src: string; label: string };

export type CardProps = {
  /** Two headline lines; the renderer uppercases them. */
  line: [string, string];
  /** Up to three short lines. */
  sub: string[];
  tag: string;
  /** `paper` only on the two why-me cards (Para atletas, Para coaches). */
  tagStyle?: 'lime' | 'paper';
  /**
   * A 696 x 630 photo, drawn whole (the renderer never crops). A site path
   * ('/og/og_boxeo.jpg') is read from public/; an https URL (a coach's crop in
   * storage) is loaded by the renderer.
   */
  photo?: string;
  /** The home card's four 300 x 300 tiles. Not with `photo`. */
  tiles?: [Tile, Tile, Tile, Tile];
  lang: CardLang;
};

export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;

const CHARCOAL = '#22272D';
const LIME = '#A8DA36';
const PAPER = '#F1EFE8';
const INK = '#121417';

const PAD = 66;
const PHOTO_W = 696;
const HEADLINE = 101;
const HEADLINE_LONG = 88;
/** Longer than this, counting the dot as the last character of line 2, drops to HEADLINE_LONG. */
const LONG_AFTER = 11;
const LINE_HEIGHT = 0.87;
/** Line 2 with an accented capital: its accent would touch line 1's letters at 0.87 (Al, 2026-10-17). */
const LINE_HEIGHT_ACCENT = 0.92;
const ACCENTED_CAPITAL = /[ÁÉÍÓÚÑ]/;
/** The text block's width; it may run the card's width when nothing is drawn on the right. */
const TEXT_W = 624;
const TEXT_W_BARE = CARD_WIDTH - 2 * PAD;

const TILE = 300;
const TILES_LEFT = 588;
const TILES_TOP = 15;
const TILE_GAP = 12;

/**
 * The headline size. "Funcional / en Medellín" is the one approved card at the
 * smaller size: its second line is 11 letters plus the dot. "CrossFit en" is
 * also 11 letters but carries no dot, and the mock keeps it at full size.
 */
export function headlineSize([first, second]: [string, string]): number {
  return first.length > LONG_AFTER || second.length + 1 > LONG_AFTER ? HEADLINE_LONG : HEADLINE;
}

const upperFor = (lang: CardLang) => (s: string) => s.toLocaleUpperCase(lang === 'en' ? 'en-US' : 'es-CO');

/** 0.92 when line 2, uppercased, carries Á É Í Ó Ú or Ñ ("MÁS", "MEDELLÍN"); else the mock's 0.87. */
export function headlineLineHeight(second: string, lang: CardLang): number {
  return ACCENTED_CAPITAL.test(upperFor(lang)(second)) ? LINE_HEIGHT_ACCENT : LINE_HEIGHT;
}

// The static cuts from scripts/buildCardFonts.py (Satori ignores a variable
// font's weight axis). Literal paths, so file tracing can see them. Loaded on
// the first card and kept; a failed read is retried on the next card rather
// than cached, and it fails the render loudly: a card in the wrong typeface
// would be cached by WhatsApp for days.
const publicFile = (...parts: string[]) => join(process.cwd(), 'public', ...parts);
type CardFont = { name: string; data: Buffer; weight: 500 | 700 | 900; style: 'normal' };
let fontsPromise: Promise<CardFont[]> | null = null;
function loadFonts() {
  fontsPromise ??= Promise.all([
    readFile(publicFile('fonts', 'BigShoulders-Black.ttf')),
    readFile(publicFile('fonts', 'JetBrainsMono-Medium.ttf')),
    readFile(publicFile('fonts', 'JetBrainsMono-Bold.ttf')),
  ]).then(
    ([display, mono, monoBold]) =>
      [
        { name: 'Big Shoulders', data: display, weight: 900, style: 'normal' },
        { name: 'JetBrains Mono', data: mono, weight: 500, style: 'normal' },
        { name: 'JetBrains Mono', data: monoBold, weight: 700, style: 'normal' },
      ] satisfies CardFont[],
    (error) => {
      fontsPromise = null;
      throw error;
    }
  );
  return fontsPromise;
}

const MIME: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' };

/** A site path becomes a data URL read from public/; anything else is passed through. */
async function imageSource(src: string): Promise<string> {
  if (!src.startsWith('/')) return src;
  const clean = src.replace(/^\/+/, '');
  if (clean.split('/').includes('..')) throw new Error(`renderCard: ${src} leaves public/`);
  const mime = MIME[clean.slice(clean.lastIndexOf('.')).toLowerCase()];
  if (!mime) throw new Error(`renderCard: ${src} is not a JPG or PNG`);
  const data = await readFile(publicFile(clean));
  return `data:${mime};base64,${data.toString('base64')}`;
}

/** The white wordmark with the lime dot (public/tribe-wordmark.png, 1709 x 564). */
const WORDMARK = { src: '/tribe-wordmark.png', width: 180, height: Math.round((180 * 564) / 1709) };

export async function renderCard(props: CardProps): Promise<ImageResponse> {
  const { line, sub, tag, tagStyle = 'lime', photo, tiles, lang } = props;
  if (photo && tiles) throw new Error('renderCard: photo and tiles are mutually exclusive');
  const upper = upperFor(lang);
  const size = headlineSize(line);
  const lineHeight = headlineLineHeight(line[1], lang);

  const [fonts, wordmark, photoSrc, tileSrcs] = await Promise.all([
    loadFonts(),
    imageSource(WORDMARK.src),
    photo ? imageSource(photo) : null,
    tiles ? Promise.all(tiles.map((t) => imageSource(t.src))) : null,
  ]);

  return new ImageResponse(
    <div style={{ display: 'flex', position: 'relative', width: '100%', height: '100%', background: CHARCOAL }}>
      {photoSrc && (
        // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
        <img src={photoSrc} width={PHOTO_W} height={CARD_HEIGHT} style={{ position: 'absolute', top: 0, right: 0 }} />
      )}
      {photoSrc && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 456,
            width: 264,
            height: CARD_HEIGHT,
            backgroundImage: `linear-gradient(90deg, ${CHARCOAL}, rgba(34,39,45,0))`,
          }}
        />
      )}
      {tiles &&
        tileSrcs &&
        tiles.map((t, i) => (
          <div
            key={t.label}
            style={{
              display: 'flex',
              position: 'absolute',
              left: TILES_LEFT + (i % 2) * (TILE + TILE_GAP),
              top: TILES_TOP + Math.floor(i / 2) * (TILE + TILE_GAP),
              width: TILE,
              height: TILE,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
            <img src={tileSrcs[i]} width={TILE} height={TILE} />
            <div
              style={{
                position: 'absolute',
                left: 0,
                bottom: 0,
                padding: '4px 8px',
                background: INK,
                color: '#FFFFFF',
                fontFamily: 'JetBrains Mono',
                fontWeight: 500,
                fontSize: 18,
              }}
            >
              {upper(t.label)}
            </div>
          </div>
        ))}
      {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
      <img
        src={wordmark}
        width={WORDMARK.width}
        height={WORDMARK.height}
        style={{ position: 'absolute', left: PAD, top: 57 }}
      />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          position: 'absolute',
          left: PAD,
          top: 170,
          width: photo || tiles ? TEXT_W : TEXT_W_BARE,
          color: '#FFFFFF',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            fontFamily: 'Big Shoulders',
            fontWeight: 900,
            fontSize: size,
            lineHeight: `${Math.round(size * lineHeight)}px`,
          }}
        >
          <div style={{ display: 'flex' }}>{upper(line[0])}</div>
          <div style={{ display: 'flex', alignItems: 'baseline' }}>
            {upper(line[1])}
            {/* The Tribe dot: a lime circle, never the font's square full stop. */}
            <div style={{ width: 16, height: 16, borderRadius: 999, background: LIME, marginLeft: 6 }} />
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            marginTop: 19,
            fontFamily: 'JetBrains Mono',
            fontWeight: 500,
            fontSize: 25,
            letterSpacing: 2,
            lineHeight: 1.45,
            color: LIME,
          }}
        >
          {sub.slice(0, 3).map((s) => (
            <div key={s} style={{ display: 'flex' }}>
              {upper(s)}
            </div>
          ))}
        </div>
      </div>
      <div
        style={{
          position: 'absolute',
          left: PAD,
          bottom: 44,
          padding: '8px 16px',
          background: tagStyle === 'paper' ? PAPER : LIME,
          color: INK,
          fontFamily: 'JetBrains Mono',
          fontWeight: 700,
          fontSize: 26,
          letterSpacing: 2.6,
        }}
      >
        {upper(tag)}
      </div>
    </div>,
    { width: CARD_WIDTH, height: CARD_HEIGHT, fonts }
  );
}

export const CARD_JPEG_QUALITY = 82;

/**
 * The card as a JPEG response, for every card route (the header says why not
 * PNG). If sharp cannot run where the card is redrawn, the PNG goes out
 * instead: too heavy for some WhatsApp previews, but never an error a scraper
 * would cache.
 */
export async function cardResponse(props: CardProps): Promise<Response> {
  const png = Buffer.from(await (await renderCard(props)).arrayBuffer());
  try {
    const jpeg = await sharp(png).jpeg({ quality: CARD_JPEG_QUALITY, mozjpeg: true }).toBuffer();
    return new Response(new Uint8Array(jpeg), { headers: { 'Content-Type': 'image/jpeg' } });
  } catch (error) {
    logError(error, { action: 'og.cardResponse.jpeg' });
    return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } });
  }
}
