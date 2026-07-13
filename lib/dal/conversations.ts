/** DAL: conversations, conversation_participants, and DM-related chat_messages */
import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';

export interface DirectConversationRow {
  id: string;
  type: string;
  created_at: string;
  updated_at: string;
}

export interface ConversationWithOtherUser {
  id: string;
  other_user: {
    id: string;
    name: string;
    avatar_url: string | null;
  };
  last_message: {
    message: string;
    created_at: string;
  } | null;
  unread_count: number;
  last_read_at: string;
}

export interface DirectMessage {
  id: string;
  conversation_id: string;
  user_id: string;
  message: string;
  created_at: string;
  deleted: boolean;
  user: {
    id: string;
    name: string;
    avatar_url: string | null;
  };
}

/**
 * Get or create a 1:1 direct conversation between the caller and a target user.
 * Returns the conversation_id.
 *
 * T-DM Gate 2: delegates to the SECURITY DEFINER RPC get_or_create_direct_conversation
 * (migration 124) instead of a client-side create + two-row insert. The RPC:
 *   - creates the conversation + both participant rows ATOMICALLY (no orphan/
 *     duplicate rows on partial failure),
 *   - enforces that the caller (auth.uid()) is ALWAYS one of the two participants,
 *   - dedupes by exact-2-participants {caller, target} — fixing the thread-hijack
 *     privacy bug in the old .in().in() intersection (a DM to a different person
 *     could return an existing thread with someone else).
 * userId1 is the authenticated caller; the RPC derives it from auth.uid(), so only
 * the target is passed. userId1 is kept in the signature for the existing callers
 * and for log context.
 */
export async function getOrCreateDirectConversation(
  supabase: SupabaseClient,
  userId1: string,
  userId2: string
): Promise<DalResult<string>> {
  try {
    const { data, error } = await supabase.rpc('get_or_create_direct_conversation', {
      p_target_user_id: userId2,
    });
    if (error) return { success: false, error: error.message };
    if (!data) return { success: false, error: 'Failed to get or create conversation' };
    return { success: true, data: data as string };
  } catch (error) {
    logError(error, { action: 'getOrCreateDirectConversation', userId1, userId2 });
    return { success: false, error: 'Failed to get or create conversation' };
  }
}

/**
 * Fetch all conversations for a user with other participant info,
 * last message preview, and unread count.
 */
export async function fetchUserConversations(
  supabase: SupabaseClient,
  userId: string
): Promise<DalResult<ConversationWithOtherUser[]>> {
  try {
    // T3 (perf audit H-7): one RPC returns other-participant + latest message +
    // unread count per conversation, replacing the old query that pulled EVERY
    // chat_message for every conversation. RLS-safe — the function uses
    // auth.uid() internally and ignores any client input. See migration 101.
    const { data, error } = await supabase.rpc('get_my_conversations');
    if (error) return { success: false, error: error.message };

    type Row = {
      conversation_id: string;
      other_user_id: string | null;
      other_user_name: string | null;
      other_user_avatar: string | null;
      last_message: string | null;
      last_message_at: string | null;
      unread_count: number;
      last_read_at: string;
    };

    const result: ConversationWithOtherUser[] = ((data as Row[]) || [])
      .filter((r) => r.other_user_id)
      .map((r) => ({
        id: r.conversation_id,
        other_user: {
          id: r.other_user_id as string,
          name: r.other_user_name || 'Unknown',
          avatar_url: r.other_user_avatar ?? null,
        },
        last_message: r.last_message ? { message: r.last_message, created_at: r.last_message_at as string } : null,
        unread_count: Number(r.unread_count) || 0,
        last_read_at: r.last_read_at,
      }));

    return { success: true, data: result };
  } catch (error) {
    logError(error, { action: 'fetchUserConversations', userId });
    return { success: false, error: 'Failed to fetch conversations' };
  }
}

/**
 * Mark a conversation as read by updating last_read_at for the user.
 */
export async function markConversationRead(
  supabase: SupabaseClient,
  conversationId: string,
  userId: string
): Promise<DalResult<null>> {
  try {
    const { error } = await supabase
      .from('conversation_participants')
      .update({ last_read_at: new Date().toISOString() })
      .eq('conversation_id', conversationId)
      .eq('user_id', userId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'markConversationRead', conversationId, userId });
    return { success: false, error: 'Failed to mark conversation as read' };
  }
}

/**
 * Fetch messages for a conversation with user info.
 */
export async function fetchConversationMessages(
  supabase: SupabaseClient,
  conversationId: string,
  limit = 50
): Promise<DalResult<DirectMessage[]>> {
  try {
    const { data, error } = await supabase
      .from('chat_messages')
      .select(
        `
        id,
        conversation_id,
        user_id,
        message,
        created_at,
        deleted,
        user:users!chat_messages_user_id_fkey (
          id,
          name,
          avatar_url
        )
      `
      )
      .eq('conversation_id', conversationId)
      // T0-7: grab the NEWEST `limit` messages, not the oldest. The previous
      // ascending order + limit returned the first 50 messages ever sent in
      // the thread, so opening a long-running DM showed ancient history and
      // hid everything recent. Fetch newest-first, then reverse below so the
      // UI still renders oldest→newest.
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) return { success: false, error: error.message };

    const messages = (data || []).map((msg: Record<string, unknown>) => {
      const msgData = msg as Record<string, unknown>;
      const userField = msgData.user as Record<string, unknown>[] | Record<string, unknown> | null;
      return {
        id: msgData.id as string,
        conversation_id: msgData.conversation_id as string,
        user_id: msgData.user_id as string,
        message: msgData.message as string,
        created_at: msgData.created_at as string,
        deleted: (msgData.deleted as boolean) || false,
        user: Array.isArray(userField)
          ? {
              id: (userField[0]?.id as string) || '',
              name: (userField[0]?.name as string) || 'Unknown',
              avatar_url: (userField[0]?.avatar_url as string | null) || null,
            }
          : {
              id: (userField?.id as string) || '',
              name: (userField?.name as string) || 'Unknown',
              avatar_url: (userField?.avatar_url as string | null) || null,
            },
      };
    });

    // We fetched newest-first to get the most recent slice; reverse so the
    // caller renders chronologically (oldest at top, newest at bottom).
    messages.reverse();

    return { success: true, data: messages };
  } catch (error) {
    logError(error, { action: 'fetchConversationMessages', conversationId });
    return { success: false, error: 'Failed to fetch messages' };
  }
}

/**
 * Send a direct message in a conversation.
 * BUG-204: session_id is intentionally omitted (nullable after migration 103).
 * Uses .select() so a 0-row result (e.g. RLS block) surfaces as a real error
 * instead of a silent false-success.
 */
export async function sendDirectMessage(
  supabase: SupabaseClient,
  conversationId: string,
  userId: string,
  message: string
): Promise<DalResult<null>> {
  try {
    const { data, error } = await supabase
      .from('chat_messages')
      .insert({
        conversation_id: conversationId,
        user_id: userId,
        message,
        // session_id intentionally omitted — DMs are conversation-scoped, not
        // session-scoped. Column is nullable after migration 103.
      })
      .select('id');

    if (error) return { success: false, error: error.message };
    if (!data || data.length === 0) {
      // Insert was silently blocked (e.g. RLS policy rejected the row).
      return { success: false, error: 'Message blocked or failed to save' };
    }
    return { success: true };
  } catch (error) {
    logError(error, { action: 'sendDirectMessage', conversationId, userId });
    return { success: false, error: 'Failed to send message' };
  }
}

/**
 * Get total unread DM count across all conversations for a user.
 */
export async function getUnreadCount(supabase: SupabaseClient, userId: string): Promise<DalResult<number>> {
  try {
    // Get user's conversations with last_read_at
    const { data: participations, error: participError } = await supabase
      .from('conversation_participants')
      .select(
        `
        conversation_id,
        last_read_at,
        conversations!inner (type)
      `
      )
      .eq('user_id', userId)
      .eq('conversations.type', 'direct');

    if (participError) return { success: false, error: participError.message };

    if (!participations || participations.length === 0) {
      return { success: true, data: 0 };
    }

    // T3 (perf audit H-5): replace the per-conversation COUNT loop with ONE
    // message fetch (bounded to messages newer than the OLDEST last_read_at)
    // and aggregate per conversation in memory using each conversation's own
    // threshold.
    const lastReadByConv = new Map<string, string>();
    for (const p of participations) {
      const pData = p as Record<string, unknown>;
      lastReadByConv.set(pData.conversation_id as string, pData.last_read_at as string);
    }
    const convIds = Array.from(lastReadByConv.keys());
    const oldestRead = Array.from(lastReadByConv.values()).sort()[0];

    const { data: msgs, error: msgError } = await supabase
      .from('chat_messages')
      .select('conversation_id, created_at')
      .in('conversation_id', convIds)
      .gt('created_at', oldestRead);

    if (msgError) return { success: false, error: msgError.message };

    let totalUnread = 0;
    for (const m of (msgs as Array<{ conversation_id: string; created_at: string }>) || []) {
      const threshold = lastReadByConv.get(m.conversation_id);
      if (threshold && new Date(m.created_at) > new Date(threshold)) totalUnread += 1;
    }

    return { success: true, data: totalUnread };
  } catch (error) {
    logError(error, { action: 'getUnreadCount', userId });
    return { success: false, error: 'Failed to get unread count' };
  }
}
