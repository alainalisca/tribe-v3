/**
 * The one way a recap photo file is stored. Both recap uploaders (the session
 * page's recap grid and the post-session flow) call this, so the bucket and the
 * path shape live in one place.
 *
 * Path: <session_id>/<uploader_id>/<timestamp>-recap-<label>.<ext>, in the
 * PRIVATE session-recap-photos bucket (migration 199). The bucket's policies
 * read the first folder as the session and the second as the uploader, so the
 * order is load-bearing: swap them and every upload is refused.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { RECAP_PHOTOS_BUCKET } from './privateMedia';

export function recapPhotoPath(sessionId: string, userId: string, label: string, fileExt: string): string {
  return `${sessionId}/${userId}/${Date.now()}-recap-${label}.${fileExt}`;
}

/**
 * Uploads one compressed recap photo and returns the URL to store on the
 * session_recap_photos row. Throws the Storage error, as the callers already
 * expect.
 */
export async function uploadRecapPhotoFile(
  supabase: SupabaseClient,
  args: { sessionId: string; userId: string; blob: Blob; fileExt: string; label: string }
): Promise<string> {
  const path = recapPhotoPath(args.sessionId, args.userId, args.label, args.fileExt);
  const { error } = await supabase.storage.from(RECAP_PHOTOS_BUCKET).upload(path, args.blob, {
    cacheControl: '3600',
    upsert: false,
  });
  if (error) throw error;
  return supabase.storage.from(RECAP_PHOTOS_BUCKET).getPublicUrl(path).data.publicUrl;
}
