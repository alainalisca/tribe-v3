import sharp from 'sharp';

/**
 * T-SHARE1 Part C. Cutting a coach's photo to the share card's 696 x 630.
 * Shared by the /i/ card route and scripts/seed-card-photos.ts, so the seed's
 * dry run shows exactly the crop the card will draw.
 */
export const CARD_PHOTO_W = 696;
export const CARD_PHOTO_H = 630;
export const CARD_PHOTO_RATIO = CARD_PHOTO_W / CARD_PHOTO_H;

/** Fractions of the oriented photo, left-top to right-bottom (users.card_photo_box). */
export type CardBox = { x0: number; y0: number; x1: number; y1: number };
export type PixelBox = { left: number; top: number; width: number; height: number };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function isCardBox(v: unknown): v is CardBox {
  if (!v || typeof v !== 'object') return false;
  const b = v as Record<string, unknown>;
  const n = (k: string) => typeof b[k] === 'number' && Number.isFinite(b[k]);
  if (!['x0', 'y0', 'x1', 'y1'].every(n)) return false;
  const { x0, y0, x1, y1 } = b as CardBox;
  return x0 >= 0 && y0 >= 0 && x1 <= 1 && y1 <= 1 && x0 < x1 && y0 < y1;
}

/**
 * The pixel box for a photo of W x H: `box` grown around its centre to exactly
 * the card's ratio (the same rule as scripts/site-crops.mjs, so nothing is ever
 * stretched), or with no box the largest card-shaped crop, centred across and
 * with its middle on the photo's upper third (faces sit high in a portrait).
 */
export function cardPixelBox(W: number, H: number, box?: CardBox | null): PixelBox {
  const r = CARD_PHOTO_RATIO;
  let w: number;
  let h: number;
  let cx: number;
  let cy: number;
  if (box) {
    w = (box.x1 - box.x0) * W;
    h = (box.y1 - box.y0) * H;
    cx = ((box.x0 + box.x1) / 2) * W;
    cy = ((box.y0 + box.y1) / 2) * H;
    if (w / h > r) h = w / r;
    else w = h * r;
  } else {
    if (W / H > r) {
      h = H;
      w = H * r;
    } else {
      w = W;
      h = W / r;
    }
    cx = W / 2;
    cy = H / 3;
  }
  if (h > H) [w, h] = [H * r, H];
  if (w > W) [w, h] = [W, W / r];
  w = Math.round(w);
  h = Math.round(h);
  return {
    left: Math.round(clamp(cx - w / 2, 0, W - w)),
    top: Math.round(clamp(cy - h / 2, 0, H - h)),
    width: w,
    height: h,
  };
}

/** Width and height as the photo is seen (EXIF orientation applied). */
export async function orientedSize(image: Buffer): Promise<{ width: number; height: number }> {
  const meta = await sharp(image).metadata();
  const turned = (meta.orientation ?? 1) >= 5;
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  return turned ? { width: height, height: width } : { width, height };
}

/** The 696 x 630 JPEG the card draws: orientation applied, EXIF stripped, quality 82. */
export async function cropCardPhoto(image: Buffer, box?: CardBox | null): Promise<Buffer> {
  const { width, height } = await orientedSize(image);
  const px = cardPixelBox(width, height, box);
  return sharp(image)
    .rotate()
    .extract(px)
    .resize(CARD_PHOTO_W, CARD_PHOTO_H)
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
}
