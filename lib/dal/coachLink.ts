/** DAL: a coach's own link (users.handle) and their share-card photo (T-SHARE1 Part C, migration 220). */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CardBox } from '@/lib/og/cardCrop';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';

/** The columns the "Tu link" block and the photo picker read; all granted to clients by 220. */
export type CoachLinkRow = {
  id: string;
  name: string | null;
  handle: string | null;
  card_photo_url: string | null;
  card_photo_box: CardBox | null;
  cover_image_url: string | null;
  photos: string[] | null;
};

const SELECT = 'id, name, handle, card_photo_url, card_photo_box, cover_image_url, photos';

export async function fetchCoachLink(supabase: SupabaseClient, userId: string): Promise<DalResult<CoachLinkRow>> {
  const { data, error } = await supabase.from('users').select(SELECT).eq('id', userId).maybeSingle();
  if (error) {
    logError(error, { action: 'fetchCoachLink', userId });
    return { success: false, error: error.message };
  }
  if (!data) return { success: false, error: 'user_not_found' };
  return { success: true, data: data as unknown as CoachLinkRow };
}

/** Is this handle someone else's? Unknown on error, so the caller lets the save decide. */
export async function isHandleTaken(supabase: SupabaseClient, handle: string, selfId: string): Promise<boolean | null> {
  const { data, error } = await supabase.from('users').select('id').eq('handle', handle).neq('id', selfId).limit(1);
  if (error) {
    logError(error, { action: 'isHandleTaken' });
    return null;
  }
  return (data ?? []).length > 0;
}

/**
 * Save the coach's handle. `taken` is the unique index (23505), `format` the
 * check constraint (23514), so the editor can say which, in the coach's words.
 */
export async function saveHandle(
  supabase: SupabaseClient,
  userId: string,
  handle: string
): Promise<DalResult<null> & { reason?: 'taken' | 'format' }> {
  const { data, error } = await supabase.from('users').update({ handle }).eq('id', userId).select('id');
  if (error) {
    if (error.code === '23505') return { success: false, error: error.message, reason: 'taken' };
    if (error.code === '23514') return { success: false, error: error.message, reason: 'format' };
    logError(error, { action: 'saveHandle', userId });
    return { success: false, error: error.message };
  }
  if (!data || data.length === 0) return { success: false, error: 'no_rows_updated' };
  return { success: true };
}

/** Save the photo the coach picked for their card and where the crop sits in it. */
export async function saveCardPhoto(
  supabase: SupabaseClient,
  userId: string,
  url: string,
  box: CardBox
): Promise<DalResult<null>> {
  const { data, error } = await supabase
    .from('users')
    .update({ card_photo_url: url, card_photo_box: box })
    .eq('id', userId)
    .select('id');
  if (error) {
    logError(error, { action: 'saveCardPhoto', userId });
    return { success: false, error: error.message };
  }
  if (!data || data.length === 0) return { success: false, error: 'no_rows_updated' };
  return { success: true };
}
