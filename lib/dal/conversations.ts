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
 * Get or create a direct conversation between two users.
 * If it exists, returns the conversation_id.
 * If not, creates it with both users as participants and returns the id.
 */
export async function getOrCreateDirectConversation(
  supabase: SupabaseClient,
  userId1: string,
  userId2: string
): Promise<DalResult<string>> {
  try {
    // Check if conversation already exists (either direction)
    const { data: existing, error: queryError } = await supabase
      .from('conversation_participants')
      .select('conversation_id')
      .eq('user_id', userId1);

    if (queryError) return { success: false, error: queryError.message };

    if (existing && existing.length > 0) {
      // Find a direct conversation that has userId2 as the other participant
      for (const row of existing) {
        const { data: participants, error: checkError } = await supabase
          .from('conversation_participants')
          .select('user_id')
          .eq('conversation_id', row.conversation_id);

        if (checkError) continue;

        // Check if this conversation has exactly userId1 and userId2
        const userIds = new Set(participants?.map((p) => p.user_id) || []);
        if (userIds.size === 2 && userIds.has(userId1) && userIds.has(userId2)) {
          // Verify it's a direct conversation type
          const { data: conv } = await supabase
            .from('conversations')
            .select('id, type')
            .eq('id', row.conversation_id)
            .single();

          if (conv?.type === 'direct') {
            return { success: true, data: row.conversation_id };
          }
        }
      }
    }

    // Create new conversation
    const { data: newConv, error: createError } = await supabase
      .from('conversations')
      .insert({ type: 'direct' })
      .select('id')
      .single();

    if (createError || !newConv) {
      return { success: false, error: createError?.message || 'Failed to create conversation' };
    }

    // Add both users as participants
    const { error: participantError } = await supabase.from('conversation_participants').insert([
      { conversation_id: newConv.id, user_id: userId1, last_read_at: new Date().toISOString() },
      { conversation_id: newConv.id, user_id: userId2, last_read_at: new Date().toISOString() },
    ]);

    if (participantError) {
      return { success: false, error: participantError.message };
    }

    return { success: true, data: newConv.id };
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
    // Get all conversations for this user
    const { data: participations, error: participError } = await supabase
      .from('conversation_participants')
      .select(
        `
        conversation_id,
        last_read_at,
        conversations!inner (
          id,
          type,
          created_at,
          updated_at
        )
      `
      )
      .eq('user_id', userId)
      .eq('conversations.type', 'direct')
      .order('conversations(updated_at)', { ascending: false });

    if (participError) return { success: false, error: participError.message };
    if (!participations || participations.length === 0) {
      return { success: true, data: [] };
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- used below in multiple .in() calls
    const conversationIds = participations.map((p) => p.conversation_id);

    // Get all participants for these conversations to find the "other" user
    const { data: allParticipants, error: allParticError } = await supabase
      .from('conversation_participants')
      .select(
        `
        conversation_id,
        user_id,
        users!inner (
          id,
          name,
          avatar_url
        )
      `
      )
      .in('conversation_id', conversationIds);

    if (allParticError) return { success: false, error: allParticError.message };

    // Get latest message for each conversation
    const { data: latestMessages, error: msgError } = await supabase
      .from('chat_messages')
      .select('id, conversation_id, message, created_at')
      .in('conversation_id', conversationIds)
      .order('created_at', { ascending: false });

    if (msgError) return { success: false, error: msgError.message };

    // Build result
    const result: ConversationWithOtherUser[] = participations
      .map((participation) => {
        const convId = participation.conversation_id;
        const participationData = participation as Record<string, unknown>;
        const lastReadAt = participationData.last_read_at as string;

        // Find the other participant
        const participants = allParticipants?.filter((p) => p.conversation_id === convId) || [];
        const otherParticipant = participants.find((p) => p.user_id !== userId);

        if (!otherParticipant || !otherParticipant.users) {
          return null;
        }

        const userData = Array.isArray(otherParticipant.users)
          ? otherParticipant.users[0]
          : otherParticipant.users;

        // Find latest message
        const lastMsg = latestMessages?.find((m) => m.conversation_id === convId);

        // Count unread messages
        let unreadCount = 0;
        if (lastReadAt && lastMsg) {
          const unreadMsgs = latestMessages?.filter(
            (m) => m.conversation_id === convId && new Date(m.created_at) > new Date(lastReadAt)
          ) || [];
          unreadCount = unreadMsgs.length;
        }

        return {
          id: convId,
          other_user: {
            id: userData.id as string,
            name: (userData.name as string) || 'Unknown',
            avatar_url: (userData.avatar_url as string | null) || null,
          },
          last_message: lastMsg
            ? {
                message: lastMsg.message,
                created_at: lastMsg.created_at,
              }
            : null,
          unread_count: unreadCount,
          last_read_at: lastReadAt,
        };
      })
      .filter((item) => item !== null) as ConversationWithOtherUser[];

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
      .order('created_at', { ascending: true })
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

    return { success: true, data: messages };
  } catch (error) {
    logError(error, { action: 'fetchConversationMessages', conversationId });
    return { success: false, error: 'Failed to fetch messages' };
  }
}

/**
 * Send a direct message in a conversation.
 */
export async function sendDirectMessage(
  supabase: SupabaseClient,
  conversationId: string,
  userId: string,
  message: string
): Promise<DalResult<null>> {
  try {
    const { error } = await supabase.from('chat_messages').insert({
      conversation_id: conversationId,
      user_id: userId,
      message,
    });

    if (error) return { success: false, error: error.message };
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

    // Count messages after last_read_at
    let totalUnread = 0;
    for (const p of participations) {
      const pData = p as Record<string, unknown>;
      const lastReadAt = pData.last_read_at as string;

      const { count, error: countError } = await supabase
        .from('chat_messages')
        .select('id', { count: 'exact', head: true })
        .eq('conversation_id', pData.conversation_id)
        .gt('created_at', lastReadAt);

      if (!countError && count !== null) {
        totalUnread += count;
      }
    }

    return { success: true, data: totalUnread };
  } catch (error) {
    logError(error, { action: 'getUnreadCount', userId });
    return { success: false, error: 'Failed to get unread count' };
  }
}
