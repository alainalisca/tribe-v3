import { describe, it, expect } from 'vitest';
import sharp from 'sharp';

import { processMoment, ORIGINAL_MAX } from './process';

/** T-MOM1: originals capped at 2400 px, EXIF orientation applied then stripped, two WebP variants. */
async function photo(
  width: number,
  height: number,
  opts: { orientation?: number; exif?: Record<string, Record<string, string>> } = {}
) {
  let img = sharp({ create: { width, height, channels: 3, background: { r: 200, g: 120, b: 40 } } }).jpeg();
  // The orientation tag needs withMetadata; withExif alone writes 1.
  if (opts.orientation) img = img.withMetadata({ orientation: opts.orientation });
  if (opts.exif) img = img.withExifMerge(opts.exif);
  return img.toBuffer();
}

describe('processMoment', () => {
  it('caps the long side at 2400, keeps the ratio, and makes 1200 and 400 WebP variants', async () => {
    const out = await processMoment(await photo(4000, 3000));
    expect([out.width, out.height]).toEqual([ORIGINAL_MAX, 1800]);
    const viewer = await sharp(out.viewer).metadata();
    const grid = await sharp(out.grid).metadata();
    expect([viewer.format, viewer.width, viewer.height]).toEqual(['webp', 1200, 900]);
    expect([grid.format, grid.width, grid.height]).toEqual(['webp', 400, 300]);
    expect((await sharp(out.original).metadata()).format).toBe('jpeg');
  });

  it('never enlarges a small photo', async () => {
    const out = await processMoment(await photo(800, 600));
    expect([out.width, out.height]).toEqual([800, 600]);
    expect((await sharp(out.grid).metadata()).width).toBe(400);
  });

  it('applies EXIF orientation, reads the capture time, then strips every bit of metadata', async () => {
    const input = await photo(3000, 2000, {
      orientation: 6,
      exif: {
        IFD0: { DateTime: '2026:10:20 09:00:00', Make: 'TestCam' },
        IFD2: { DateTimeOriginal: '2026:10:18 18:31:05' },
      },
    });
    expect((await sharp(input).metadata()).orientation).toBe(6);
    const out = await processMoment(input);
    // Orientation 6 = rotate 90°: the landscape file is a portrait photo.
    expect([out.width, out.height]).toEqual([1600, 2400]);
    expect(out.takenAt?.toISOString()).toBe(new Date('2026-10-18T18:31:05').toISOString());
    for (const buf of [out.original, out.viewer, out.grid]) {
      const meta = await sharp(buf).metadata();
      expect(meta.exif).toBeUndefined();
      expect(meta.orientation).toBeUndefined();
    }
  });

  it('a photo without EXIF has no capture time', async () => {
    expect((await processMoment(await photo(1000, 1000))).takenAt).toBeNull();
  });
});
