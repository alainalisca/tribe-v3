/**
 * T-MOM1: where a Moment's files live in the private `moments` bucket.
 *
 *   <session_id>/<media_id>.jpg         the original (max 2400 px, EXIF stripped)
 *   <session_id>/<media_id>.jpg.1200.webp   the viewer variant
 *   <session_id>/<media_id>.jpg.400.webp    the grid variant
 *
 * Pure, so client code can name a variant without importing the processor.
 */
export const MOMENTS_BUCKET = 'moments';

/** Signed URLs live one hour: long enough to read a screen, short enough that a copied link dies. */
export const MOMENTS_SIGNED_URL_TTL_SECONDS = 60 * 60;

export const MOMENT_VARIANTS = { viewer: 1200, grid: 400 } as const;
export type MomentVariant = keyof typeof MOMENT_VARIANTS | 'original';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function momentOriginalPath(sessionId: string, mediaId: string): string {
  if (!UUID.test(sessionId) || !UUID.test(mediaId)) throw new Error('moment path needs two UUIDs');
  return `${sessionId.toLowerCase()}/${mediaId.toLowerCase()}.jpg`;
}

/** The file for a variant of the original at `storagePath`. */
export function momentVariantPath(storagePath: string, variant: MomentVariant): string {
  return variant === 'original' ? storagePath : `${storagePath}.${MOMENT_VARIANTS[variant]}.webp`;
}

/** Every file a Moment owns (for the nightly delete of soft-deleted rows). */
export function momentAllPaths(storagePath: string): string[] {
  return [storagePath, momentVariantPath(storagePath, 'viewer'), momentVariantPath(storagePath, 'grid')];
}
