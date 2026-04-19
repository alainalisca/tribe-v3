/** DAL: chat_messages + reported_messages tables */
import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';
import type { Database } from '@/lib/database.types';

type ReportedMessageInsert = Database['public']['Tables']['reported_messages']['Insert'];

export async function deleteChatMessage(supabase: SupabaseClient, messageId: string): Promise<DalResult<null>> {
  try {
    const { error } = await supabase.from('chat_messages').delete().eq('id', messageId);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'deleteChatMessage' });
    return { success: false, error: 'Failed to delete message' };
  }
}

export async function deleteChatMessagesByUser(supabase: SupabaseClient, userId: string): Promise<DalResult<null>> {
  try {
    const { error } = await supabase.from('chat_messages').delete().eq('user_id', userId);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'deleteChatMessagesByUser' });
    return { success: false, error: 'Failed to delete messages' };
  }
}

export async function insertReportedMessage(
  supabase: SupabaseClient,
  data: ReportedMessageInsert
): Promise<DalResult<null>> {
  try {
    const { error } = await supabase.from('reported_messages').insert(data);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'insertReportedMessage' });
    return { success: false, error: 'Failed to report message' };
  }
}

// REASON: returns raw Supabase join shape — callers handle type narrowing
export async function fetchChatMessagesWithUsers(
  supabase: SupabaseClient,
  sessionId: string
): Promise<DalResult<unknown[]>> {
  try {
    const { data, error } = await supabase
      .from('chat_messages')
      .select(`id, user_id, message, created_at, deleted, user:users!chat_messages_user_id_fkey (name, avatar_url)`)
      .eq('session_id', sessionId)
      .eq('deleted', false)
      .order('created_at', { ascending: true })
      .limit(200);
    if (error) return { success: false, error: error.message };
    return { success: true, data: data || [] };
  } catch (error) {
    logError(error, { action: 'fetchChatMessagesWithUsers' });
    return { success: false, error: 'Failed' };
  }
}

export async function insertChatMessage(
  supabase: SupabaseClient,
  data: { session_id: string; user_id: string; message: string }
): Promise<DalResult<null>> {
  try {
    const { error } = await supabase.from('chat_messages').insert(data);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'insertChatMessage' });
    return { success: false, error: 'Failed' };
  }
}

export async function softDeleteChatMessage(
  supabase: SupabaseClient,
  messageId: string,
  deletedBy: string
): Promise<DalResult<null>> {
  try {
    const { error } = await supabase
      .from('chat_messages')
      .update({ deleted: true, deleted_by: deletedBy, deleted_at: new Date().toISOString() })
      .eq('id', messageId);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'softDeleteChatMessage' });
    return { success: false, error: 'Failed' };
  }
}

export async function fetchLatestChatMessage(
  supabase: SupabaseClient,
  sessionId: string
): Promise<DalResult<{ message: string; created_at: string } | null>> {
  try {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('message, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return { success: false, error: error.message };
    return { success: true, data: data || null };
  } catch (error) {
    logError(error, { action: 'fetchLatestChatMessage' });
    return { success: false, error: 'Failed' };
  }
}

export async function fetchChatMessageCount(supabase: SupabaseClient, sessionId: string): Promise<DalResult<number>> {
  try {
    const { count, error } = await supabase
      .from('chat_messages')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', sessionId);
    if (error) return { success: false, error: error.message };
    return { success: true, data: count ?? 0 };
  } catch (error) {
    logError(error, { action: 'fetchChatMessageCount' });
    return { success: false, error: 'Failed' };
  }
}
