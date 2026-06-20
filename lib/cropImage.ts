import type { Area } from 'react-easy-crop';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    // The source is a local object/data URL, but set crossOrigin defensively so
    // the canvas never becomes tainted (which would make toBlob throw).
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image for cropping'));
    img.src = src;
  });
}

/**
 * Crop `src` to `area` and return a JPEG File ready to hand to
 * compressImage()/upload.
 *
 * `area` is the pixel rectangle in the image's NATURAL coordinate space, exactly
 * as produced by react-easy-crop's `onCropComplete` `croppedAreaPixels`. We draw
 * just that rectangle onto a canvas sized to the crop, then export it.
 */
export async function getCroppedImageFile(src: string, area: Area, filename = 'banner.jpg'): Promise<File> {
  const image = await loadImage(src);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(area.width));
  canvas.height = Math.max(1, Math.round(area.height));

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get canvas 2D context');

  ctx.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, canvas.width, canvas.height);

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas export failed'))), 'image/jpeg', 0.92);
  });

  return new File([blob], filename, { type: 'image/jpeg' });
}
