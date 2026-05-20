/** DAL: release_notes table — "What's New" bottom sheet content. */
import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';

export interface ReleaseNote {
  id: string;
  version: string;
  title: string;
  title_es: string;
  bullets: string[];
  bullets_es: string[];
  image_url: string | null;
  published_at: string;
}

/**
 * Fetch the most recently published release note.
 * Returns success with `data: null` when the table is empty (e.g. fresh DB,
 * migration not yet applied) so callers can distinguish "nothing to show"
 * from a real RLS / network error.
 */
export async function getLatestReleaseNote(supabase: SupabaseClient): Promise<DalResult<ReleaseNote | null>> {
  try {
    const { data, error } = await supabase
      .from('release_notes')
      .select('id, version, title, title_es, bullets, bullets_es, image_url, published_at')
      .order('published_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) return { success: false, error: error.message };
    return { success: true, data: (data as ReleaseNote | null) ?? null };
  } catch (error) {
    logError(error, { action: 'getLatestReleaseNote' });
    return { success: false, error: 'Failed to fetch release note' };
  }
}

/** Read the `users.last_seen_release` column for a single user. */
export async function getUserLastSeenRelease(
  supabase: SupabaseClient,
  userId: string
): Promise<DalResult<string | null>> {
  try {
    if (!userId || userId === 'undefined' || userId === 'null') {
      return { success: false, error: 'user_not_found' };
    }
    const { data, error } = await supabase.from('users').select('last_seen_release').eq('id', userId).maybeSingle();

    if (error) return { success: false, error: error.message };
    return { success: true, data: (data?.last_seen_release as string | null) ?? null };
  } catch (error) {
    logError(error, { action: 'getUserLastSeenRelease', userId });
    return { success: false, error: 'Failed to fetch last_seen_release' };
  }
}

/** Persist that the user has dismissed the WhatsNewSheet for `version`. */
export async function markReleaseSeen(
  supabase: SupabaseClient,
  userId: string,
  version: string
): Promise<DalResult<null>> {
  try {
    if (!userId || !version) {
      return { success: false, error: 'userId and version are required' };
    }
    const { error } = await supabase.from('users').update({ last_seen_release: version }).eq('id', userId);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'markReleaseSeen', userId, version });
    return { success: false, error: 'Failed to update last_seen_release' };
  }
}
