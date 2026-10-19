import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import sharp from 'sharp';

/**
 * T-MOM1 Part D: "Compartir", a 1080 x 1920 story image of one photo.
 *
 *   the photo whole, never cropped: scaled to fit and centred on a charcoal
 *     #121417 field (letterboxed or pillarboxed when it is not 9:16)
 *   the white Tribe wordmark, 120 px wide, 48 px from the left and the bottom
 *   one mono line beside it: "con <coach>", plus " · <gym>" when the session
 *     has an approved gym
 *
 * No solid bands and no lime slab (Al's photo branding rules). The person
 * posts it themselves; Tribe never posts for anyone.
 *
 * Server only: it reads the font and the wordmark from public/ (traced into
 * the story route by next.config.ts outputFileTracingIncludes).
 */
export const STORY_WIDTH = 1080;
export const STORY_HEIGHT = 1920;
export const STORY_FIELD = '#121417';
const MARGIN = 48;
const WORDMARK_W = 120;
const WORDMARK_H = Math.round((WORDMARK_W * 564) / 1709);
const LINE_PX = 28;
const LINE_GAP = 24;
/** JetBrains Mono is 0.6 em wide: what fits beside the wordmark at 28 px. */
const LINE_MAX_CHARS = Math.floor((STORY_WIDTH - MARGIN * 2 - WORDMARK_W - LINE_GAP) / (LINE_PX * 0.6));

export type StoryBox = { left: number; top: number; width: number; height: number };

/** Where the photo sits: as large as fits, whole, centred. Pure. */
export function storyPhotoBox(width: number, height: number): StoryBox {
  const scale = Math.min(STORY_WIDTH / width, STORY_HEIGHT / height);
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  return { left: Math.round((STORY_WIDTH - w) / 2), top: Math.round((STORY_HEIGHT - h) / 2), width: w, height: h };
}

/** "con Salomón · BullBox" / "with Salomón · BullBox", cut to one line. Pure. */
export function storyLine(coach: string, gym: string | null, lang: 'es' | 'en'): string {
  const parts = [coach ? `${lang === 'en' ? 'with' : 'con'} ${coach}` : '', gym?.trim() ?? ''].filter(Boolean);
  const line = parts.join(' · ');
  return line.length > LINE_MAX_CHARS ? `${line.slice(0, LINE_MAX_CHARS - 1).trimEnd()}…` : line;
}

const publicFile = (...parts: string[]) => join(process.cwd(), 'public', ...parts);
let assets: Promise<{ font: Buffer; wordmark: string }> | null = null;
function loadAssets() {
  assets ??= Promise.all([
    readFile(publicFile('fonts', 'JetBrainsMono-Medium.ttf')),
    readFile(publicFile('tribe-wordmark.png')),
  ]).then(
    ([font, png]) => ({ font, wordmark: `data:image/png;base64,${png.toString('base64')}` }),
    (error) => {
      assets = null;
      throw error;
    }
  );
  return assets;
}

/** The story as a JPEG. `photo` is any image sharp reads (the w1200 WebP in production). */
export async function renderStory(args: {
  photo: Buffer;
  coach: string;
  gym: string | null;
  lang: 'es' | 'en';
}): Promise<Buffer> {
  // Orientation was applied when the photo was processed; rotate() again is a no-op then,
  // and keeps a hand-fed file upright.
  const upright = await sharp(args.photo).rotate().jpeg({ quality: 92 }).toBuffer({ resolveWithObject: true });
  const box = storyPhotoBox(upright.info.width, upright.info.height);
  const [{ font, wordmark }] = await Promise.all([loadAssets()]);
  const line = storyLine(args.coach, args.gym, args.lang);
  const png = await new ImageResponse(
    <div style={{ display: 'flex', position: 'relative', width: '100%', height: '100%', background: STORY_FIELD }}>
      {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
      <img
        src={`data:image/jpeg;base64,${upright.data.toString('base64')}`}
        width={box.width}
        height={box.height}
        style={{ position: 'absolute', left: box.left, top: box.top }}
      />
      <div
        style={{
          position: 'absolute',
          left: MARGIN,
          bottom: MARGIN,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
        <img src={wordmark} width={WORDMARK_W} height={WORDMARK_H} />
        {line && (
          <div
            style={{
              display: 'flex',
              marginLeft: LINE_GAP,
              color: '#FFFFFF',
              fontFamily: 'JetBrains Mono',
              fontSize: LINE_PX,
              letterSpacing: '0.04em',
              textShadow: '0 1px 6px rgba(0,0,0,0.55)',
            }}
          >
            {line}
          </div>
        )}
      </div>
    </div>,
    {
      width: STORY_WIDTH,
      height: STORY_HEIGHT,
      fonts: [{ name: 'JetBrains Mono', data: font, weight: 500, style: 'normal' }],
    }
  ).arrayBuffer();
  return sharp(Buffer.from(png)).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
}
