/** DAL: session_stories + session_recap_photos tables */
import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';
import type { Database } from '@/lib/database.types';

type SessionStoryInsert = Database['public']['Tables']['session_stories']['Insert'];
type RecapPhotoInsert = Database['public']['Tables']['session_recap_photos']['Insert'];

export async function insertSessionStory(supabase: SupabaseClient, data: SessionStoryInsert): Promise<DalResult<null>> {
  try {
    const { error } = await supabase.from('session_stories').insert(data);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'insertSessionStory' });
    return { success: false, error: 'Failed to insert story' };
  }
}

export async function deleteSessionStory(supabase: SupabaseClient, storyId: string): Promise<DalResult<null>> {
  try {
    const { error } = await supabase.from('session_stories').delete().eq('id', storyId);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'deleteSessionStory' });
    return { success: false, error: 'Failed to delete story' };
  }
}

export async function insertRecapPhoto(supabase: SupabaseClient, data: RecapPhotoInsert): Promise<DalResult<null>> {
  try {
    const { error } = await supabase.from('session_recap_photos').insert(data);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'insertRecapPhoto' });
    return { success: false, error: 'Failed to insert recap photo' };
  }
}

export async function deleteRecapPhoto(supabase: SupabaseClient, photoId: string): Promise<DalResult<null>> {
  try {
    const { error } = await supabase.from('session_recap_photos').delete().eq('id', photoId);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'deleteRecapPhoto' });
    return { success: false, error: 'Failed to delete recap photo' };
  }
}

export async function updateRecapPhotoReport(
  supabase: SupabaseClient,
  photoId: string,
  data: { reported: boolean; reported_by: string; reported_reason: string }
): Promise<DalResult<null>> {
  try {
    const { error } = await supabase.from('session_recap_photos').update(data).eq('id', photoId);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'updateRecapPhotoReport' });
    return { success: false, error: 'Failed' };
  }
}

// REASON: returns raw Supabase join shape — callers handle type narrowing
export async function fetchRecapPhotosForSession(
  supabase: SupabaseClient,
  sessionId: string
): Promise<DalResult<unknown[]>> {
  try {
    const { data, error } = await supabase
      .from('session_recap_photos')
      .select('id, photo_url, user_id, reported, user:users(id, name, avatar_url)')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false });
    if (error) return { success: false, error: error.message };
    return { success: true, data: data || [] };
  } catch (error) {
    logError(error, { action: 'fetchRecapPhotosForSession' });
    return { success: false, error: 'Failed' };
  }
}

// REASON: returns raw Supabase join shape — callers handle type narrowing
export async function fetchStoriesForSessions(
  supabase: SupabaseClient,
  sessionIds: string[]
): Promise<DalResult<unknown[]>> {
  try {
    const { data, error } = await supabase
      .from('session_stories')
      .select('*, user:users(id, name, avatar_url), session:sessions(id, sport, location)')
      .in('session_id', sessionIds)
      .order('created_at', { ascending: false });
    if (error) return { success: false, error: error.message };
    return { success: true, data: data || [] };
  } catch (error) {
    logError(error, { action: 'fetchStoriesForSessions' });
    return { success: false, error: 'Failed' };
  }
}

// REASON: returns raw Supabase join shape — callers handle type narrowing
export async function fetchStoriesForSession(
  supabase: SupabaseClient,
  sessionId: string
): Promise<DalResult<unknown[]>> {
  try {
    const { data, error } = await supabase
      .from('session_stories')
      .select('*, user:users(id, name, avatar_url)')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false });
    if (error) return { success: false, error: error.message };
    return { success: true, data: data || [] };
  } catch (error) {
    logError(error, { action: 'fetchStoriesForSession' });
    return { success: false, error: 'Failed' };
  }
}
