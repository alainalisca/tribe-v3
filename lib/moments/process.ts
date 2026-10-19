// No 'server-only': scripts/moveRecapPhotosToMoments.ts runs it under plain
// Node. sharp is native, so a client bundle could not import this anyway.
import sharp from 'sharp';
import { MOMENT_VARIANTS } from './paths';
import { exifCaptureDate } from './exifDate';

/**
 * T-MOM1: one uploaded photo into what the bucket stores. The browser already
 * resized to 2400 px (Part B); this is the server's guarantee whatever arrives:
 *
 *   original  EXIF orientation applied, then every bit of metadata dropped
 *             (GPS, camera, owner), long side at most 2400 px, JPEG q85.
 *   viewer    WebP, long side at most 1200 px.
 *   grid      WebP, long side at most 400 px.
 *
 * Never enlarges, never crops. `takenAt` is read from EXIF before it is
 * stripped, when the camera recorded it.
 */
export const ORIGINAL_MAX = 2400;

export type ProcessedMoment = {
  original: Buffer;
  viewer: Buffer;
  grid: Buffer;
  width: number;
  height: number;
  takenAt: Date | null;
};

export async function processMoment(input: Buffer): Promise<ProcessedMoment> {
  const meta = await sharp(input).metadata();
  const takenAt = meta.exif ? exifCaptureDate(meta.exif.toString('latin1')) : null;
  const fit = (max: number) => ({ width: max, height: max, fit: 'inside' as const, withoutEnlargement: true });
  // rotate() with no argument applies the EXIF orientation; sharp writes no
  // metadata unless asked (withMetadata), so every output is stripped.
  const original = await sharp(input)
    .rotate()
    .resize(fit(ORIGINAL_MAX))
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();
  const { width = 0, height = 0 } = await sharp(original).metadata();
  const [viewer, grid] = await Promise.all([
    sharp(original).resize(fit(MOMENT_VARIANTS.viewer)).webp({ quality: 80 }).toBuffer(),
    sharp(original).resize(fit(MOMENT_VARIANTS.grid)).webp({ quality: 75 }).toBuffer(),
  ]);
  return { original, viewer, grid, width, height, takenAt };
}
