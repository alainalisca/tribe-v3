/**
 * Private session media: recap photos and stories.
 *
 * Since migration 199 both live in PRIVATE Storage buckets, readable only by
 * the session's host, its confirmed participants, the uploader and admins.
 * Rows still store each file's URL in public form (what getPublicUrl returns),
 * because that string identifies the file. It no longer serves it: a reader
 * turns it into a signed URL here, and Storage mints one only for a caller the
 * bucket's SELECT policy admits. That policy is the access control; this
 * module is just how the app asks.
 *
 * Recap rows written before 199 point into the PUBLIC session-photos bucket
 * until scripts/moveRecapPhotosToPrivateBucket.ts moves them. Those URLs are
 * not in a private bucket, so they pass through unchanged.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';

export const RECAP_PHOTOS_BUCKET = 'session-recap-photos';
export const STORIES_BUCKET = 'session-stories';

/** One hour: long enough for a screen to be read, short enough that a copied link dies. */
export const SIGNED_URL_TTL_SECONDS = 60 * 60;

/**
 * The object path inside `bucket` that a Storage URL points at, or null when
 * the URL is not a Storage URL for that bucket. Accepts all three URL forms
 * Storage produces: /object/public/, /object/sign/ (with a token query) and
 * /object/authenticated/.
 */
export function storagePathFromUrl(url: string | null | undefined, bucket: string): string | null {
  if (!url) return null;
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return null;
  }
  const match = pathname.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/);
  if (!match || match[1] !== bucket) return null;
  return decodeURIComponent(match[2]);
}

/**
 * Signed URLs for every URL in `urls` that points into `bucket`, keyed by the
 * original URL. URLs outside the bucket, and any the caller may not read, are
 * absent from the map, so `map.get(url) ?? url` keeps them as they were.
 */
export async function signStorageUrls(
  supabase: SupabaseClient,
  bucket: string,
  urls: ReadonlyArray<string | null | undefined>
): Promise<Map<string, string>> {
  const signed = new Map<string, string>();
  const pathByUrl = new Map<string, string>();
  for (const url of urls) {
    const path = storagePathFromUrl(url, bucket);
    if (url && path) pathByUrl.set(url, path);
  }
  if (pathByUrl.size === 0) return signed;

  const paths = [...new Set(pathByUrl.values())];
  const { data, error } = await supabase.storage.from(bucket).createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
  if (error || !data) {
    logError(error ?? new Error('createSignedUrls returned no data'), {
      action: 'signStorageUrls',
      bucket,
      count: paths.length,
    });
    return signed;
  }

  const signedByPath = new Map<string, string>();
  for (const item of data) {
    if (item.path && item.signedUrl && !item.error) signedByPath.set(item.path, item.signedUrl);
  }
  for (const [url, path] of pathByUrl) {
    const s = signedByPath.get(path);
    if (s) signed.set(url, s);
  }
  return signed;
}

/** Replace each story's media and thumbnail URL with a signed one. */
export async function signStoryMedia<T extends { media_url: string; thumbnail_url: string | null }>(
  supabase: SupabaseClient,
  stories: T[]
): Promise<T[]> {
  if (stories.length === 0) return stories;
  const signed = await signStorageUrls(
    supabase,
    STORIES_BUCKET,
    stories.flatMap((s) => [s.media_url, s.thumbnail_url])
  );
  return stories.map((s) => ({
    ...s,
    media_url: signed.get(s.media_url) ?? s.media_url,
    thumbnail_url: s.thumbnail_url ? (signed.get(s.thumbnail_url) ?? s.thumbnail_url) : s.thumbnail_url,
  }));
}

/** Replace each recap photo URL with a signed one. Legacy session-photos URLs pass through. */
export async function signRecapPhotoUrls(supabase: SupabaseClient, urls: string[]): Promise<Map<string, string>> {
  return signStorageUrls(supabase, RECAP_PHOTOS_BUCKET, urls);
}
