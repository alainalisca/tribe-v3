// No 'server-only': scripts run it too. It holds no secret; the caller passes
// the service-role client.
import type { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import { MOMENTS_BUCKET, MOMENTS_SIGNED_URL_TTL_SECONDS, momentVariantPath, type MomentVariant } from './paths';
import type { ProcessedMoment } from './process';

/**
 * T-MOM1: the `moments` bucket is private with no storage policy, so only the
 * service role touches it. Callers check permission first (canUploadToSession
 * for writes; the tagged-user, uploader or manager rule for reads).
 */
export async function storeMoment(service: SupabaseClient, storagePath: string, m: ProcessedMoment): Promise<void> {
  const bucket = service.storage.from(MOMENTS_BUCKET);
  const put = (path: string, body: Buffer, contentType: string) =>
    bucket.upload(path, body, { contentType, upsert: false, cacheControl: '3600' }).then(({ error }) => {
      if (error) throw error;
    });
  await put(storagePath, m.original, 'image/jpeg');
  await Promise.all([
    put(momentVariantPath(storagePath, 'viewer'), m.viewer, 'image/webp'),
    put(momentVariantPath(storagePath, 'grid'), m.grid, 'image/webp'),
  ]);
}

/** Signed URLs (1 hour) for a variant of each original path; a path that fails maps to null. */
export async function signMoments(
  service: SupabaseClient,
  storagePaths: string[],
  variant: MomentVariant,
  download = false
): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  if (storagePaths.length === 0) return out;
  const files = storagePaths.map((p) => momentVariantPath(p, variant));
  if (download) {
    await Promise.all(
      storagePaths.map(async (p, i) => {
        const { data } = await service.storage
          .from(MOMENTS_BUCKET)
          .createSignedUrl(files[i], MOMENTS_SIGNED_URL_TTL_SECONDS, { download: true });
        out[p] = data?.signedUrl ?? null;
      })
    );
    return out;
  }
  const { data, error } = await service.storage
    .from(MOMENTS_BUCKET)
    .createSignedUrls(files, MOMENTS_SIGNED_URL_TTL_SECONDS);
  if (error) logError(error, { action: 'moments.signMoments' });
  storagePaths.forEach((p, i) => {
    out[p] = data?.[i]?.signedUrl ?? null;
  });
  return out;
}
