import type { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';
import { updateCommunityCoverImage } from './communities';

/**
 * Community banners (T-COMM1).
 *
 * Every community has exactly one banner file, at a fixed path in its own
 * folder: `<communityId>/banner.jpg`. A new banner replaces it in place
 * (upsert), so changing a banner no longer leaves the previous file behind.
 * The row stores the public URL with `?v=<timestamp>`, because the path never
 * changes and a browser or CDN would otherwise keep showing the old picture.
 *
 * Migration 192 decides who may write the folder: the creator, or an admin
 * member, of a community that is not deleted. The same rule as the
 * communities UPDATE policy, so a caller refused here is refused there too.
 */

export const COMMUNITY_BANNER_BUCKET = 'community-banners';
export const COMMUNITY_BANNER_FILE = 'banner.jpg';

export function communityBannerPath(communityId: string): string {
  return `${communityId}/${COMMUNITY_BANNER_FILE}`;
}

/** The public URL plus a version marker, replacing any marker already there. */
export function versionedBannerUrl(publicUrl: string, version: number): string {
  const base = publicUrl.split('?')[0];
  return `${base}?v=${version}`;
}

/**
 * Uploads `image` as the community's banner, points the row at it, then
 * removes any other file left in the folder by the old timestamped naming.
 * Resolves to the URL now stored on the row.
 *
 * The cleanup is best effort: a failure there is logged and the save still
 * succeeds, because the banner the user chose is already live.
 */
export async function setCommunityBanner(
  supabase: SupabaseClient,
  communityId: string,
  image: Blob,
  now: number = Date.now()
): Promise<DalResult<string>> {
  try {
    const path = communityBannerPath(communityId);
    const bucket = supabase.storage.from(COMMUNITY_BANNER_BUCKET);

    const { error: uploadError } = await bucket.upload(path, image, {
      contentType: 'image/jpeg',
      upsert: true,
    });
    if (uploadError) return { success: false, error: uploadError.message };

    const { data } = bucket.getPublicUrl(path);
    const url = versionedBannerUrl(data.publicUrl, now);

    const updated = await updateCommunityCoverImage(supabase, communityId, url);
    if (!updated.success) return { success: false, error: updated.error };

    await removeStaleBannerFiles(supabase, communityId);
    return { success: true, data: url };
  } catch (error) {
    logError(error, { action: 'setCommunityBanner' });
    return { success: false, error: 'Failed to upload community banner' };
  }
}

/**
 * Deletes every file in the community's folder except the fixed banner.
 * Returns how many were removed. Never throws and never fails the caller.
 */
export async function removeStaleBannerFiles(supabase: SupabaseClient, communityId: string): Promise<number> {
  try {
    const bucket = supabase.storage.from(COMMUNITY_BANNER_BUCKET);
    const { data: files, error: listError } = await bucket.list(communityId);
    if (listError) {
      logError(new Error(listError.message), { action: 'removeStaleBannerFiles.list', communityId });
      return 0;
    }

    const stale = (files ?? [])
      .map((f) => f.name)
      .filter((name) => name && name !== COMMUNITY_BANNER_FILE)
      .map((name) => `${communityId}/${name}`);
    if (stale.length === 0) return 0;

    const { error: removeError } = await bucket.remove(stale);
    if (removeError) {
      logError(new Error(removeError.message), { action: 'removeStaleBannerFiles.remove', communityId });
      return 0;
    }
    return stale.length;
  } catch (error) {
    logError(error, { action: 'removeStaleBannerFiles', communityId });
    return 0;
  }
}
