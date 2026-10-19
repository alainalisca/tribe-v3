'use client';

import { exifCaptureDate } from './exifDate';

/**
 * T-MOM1: a picked photo, ready to upload, in the browser.
 *
 *   HEIC/HEIF   converted to JPEG by heic2any, loaded only when such a file is
 *               picked (it is large and most phones send JPEG through a web
 *               picker anyway).
 *   orientation applied (createImageBitmap from-image), then the photo is
 *               redrawn on a canvas, which drops every bit of EXIF (GPS,
 *               camera) before anything leaves the phone.
 *   size        long side at most 2400 px, JPEG 0.85: about 1 MB, well under
 *               the 4.5 MB serverless body limit.
 *   takenAt     read from the original bytes BEFORE the redraw strips it.
 */
export const BROWSER_MAX = 2400;

export function isHeic(file: { type: string; name: string }): boolean {
  return /hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
}

/** The scale that brings the long side to `max` without enlarging. */
export function fitScale(width: number, height: number, max = BROWSER_MAX): number {
  return Math.min(1, max / Math.max(width, height));
}

async function readTakenAt(file: Blob): Promise<string | null> {
  const head = new Uint8Array(await file.slice(0, 256 * 1024).arrayBuffer());
  let text = '';
  for (let i = 0; i < head.length; i++) text += String.fromCharCode(head[i]);
  return exifCaptureDate(text)?.toISOString() ?? null;
}

export async function prepareImage(file: File): Promise<{ blob: Blob; takenAt: string | null }> {
  const takenAt = await readTakenAt(file);
  let source: Blob = file;
  if (isHeic(file)) {
    const { default: heic2any } = await import('heic2any');
    const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
    source = Array.isArray(out) ? out[0] : out;
  }
  const bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' });
  const scale = fitScale(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode_failed'))), 'image/jpeg', 0.85)
  );
  return { blob, takenAt };
}
