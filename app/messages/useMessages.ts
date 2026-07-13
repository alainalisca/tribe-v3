'use client';

import { logError } from '@/lib/logger';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/lib/LanguageContext';
import { sportTranslations } from '@/lib/translations';
import {
  fetchParticipantSessionIds,
  fetchSessionsByCreator,
  fetchSessionsByIds,
  fetchChatMessagesForSessions,
  fetchUserConversations,
  getOrCreateDirectConversation,
  ConversationWithOtherUser,
} from '@/lib/dal';
import { showError } from '@/lib/toast';
import type { User } from '@supabase/supabase-js';

export interface Conversation {
  session_id: string;
  session: {
    id: string;
    sport: string;
    date: string;
    location: string;
    creator: {
      id: string;
      name: string;
      avatar_url: string | null;
    };
  };
  last_message: {
    message: string;
    created_at: string;
    user: {
      name: string;
    };
  } | null;
  unread_count: number;
}

interface UseMessagesOptions {
  /** When set, immediately get-or-create a DM with this user ID and navigate in */
  targetUserId?: string | null;
}

export function useMessages({ targetUserId }: UseMessagesOptions = {}) {
  const router = useRouter();
  // Stable client instance (createClient() returns a new client per call) so the
  // realtime subscription below doesn't churn on every render.
  const [supabase] = useState(() => createClient());
  const { t, language } = useLanguage();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [directConversations, setDirectConversations] = useState<ConversationWithOtherUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    checkUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  // When targetUserId changes after mount (e.g., after auth resolves), open DM
  useEffect(() => {
    if (targetUserId && currentUser) {
      openDirectMessage(currentUser.id, targetUserId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: run when both are ready
  }, [targetUserId, currentUser]);

  // Live-update the list off chat_messages inserts. chat_messages IS in the
  // realtime publication; conversations is not (and its updated_at doesn't move),
  // so we drive the list from message activity. RLS scopes delivery to the
  // current user's conversations/sessions, so reloading here refreshes the
  // affected thread's preview / timestamp / unread without a page refresh.
  useEffect(() => {
    if (!currentUser) return;
    const channel = supabase
      .channel(`messages-list-${currentUser.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, () => {
        loadConversations(currentUser.id);
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-subscribe only when the user or client changes
  }, [currentUser, supabase]);

  async function openDirectMessage(userId: string, targetId: string) {
    // Do nothing if trying to message yourself
    if (userId === targetId) return;

    const result = await getOrCreateDirectConversation(supabase, userId, targetId);
    if (!result.success || !result.data) {
      logError(new Error(result.error ?? 'getOrCreateDirectConversation failed'), {
        action: 'openDirectMessage',
        userId,
        targetId,
      });
      showError(language === 'es' ? 'No se pudo abrir la conversación' : 'Could not open the conversation');
      return;
    }
    // Replace so the ?user= URL is not left in history
    router.replace(`/messages/${result.data}`);
  }

  async function checkUser() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push('/auth');
      return;
    }
    setCurrentUser(user);
    await loadConversations(user.id);
  }

  async function loadConversations(userId: string) {
    try {
      setLoading(true);
      setError(null);

      // Load session conversations
      await loadSessionConversations(userId);

      // Load direct message conversations
      await loadDirectConversations(userId);
    } catch (err) {
      logError(err, { action: 'loadConversations' });
      setError('load_failed');
    } finally {
      setLoading(false);
    }
  }

  async function loadSessionConversations(userId: string) {
    try {
      // Get all sessions where user is an athlete (including as creator)
      const participantResult = await fetchParticipantSessionIds(supabase, userId);
      if (!participantResult.success) throw new Error(participantResult.error);

      // Get sessions created by user
      const createdResult = await fetchSessionsByCreator(supabase, userId, { fields: 'id' });
      if (!createdResult.success) throw new Error(createdResult.error);

      // Combine session IDs
      // REASON: DAL returns unknown[] for flexible field queries — cast for field access
      const createdSessions = (createdResult.data || []) as Array<{ id: string }>;
      const sessionIds = [...new Set([...(participantResult.data || []), ...createdSessions.map((s) => s.id)])];

      if (sessionIds.length === 0) {
        setConversations([]);
        return;
      }

      // Batch: get all sessions in one query
      const sessionsResult = await fetchSessionsByIds(
        supabase,
        sessionIds,
        'id, sport, date, location, creator:users!sessions_creator_id_fkey(id, name, avatar_url)'
      );
      // REASON: DAL returns unknown[] — cast for field access on session rows with creator join
      const sessions = (sessionsResult.success ? sessionsResult.data : []) as Array<{
        id: string;
        sport: string;
        date: string;
        location: string;
        creator:
          | { id: string; name: string; avatar_url: string | null }
          | Array<{ id: string; name: string; avatar_url: string | null }>;
      }>;

      if (!sessions || sessions.length === 0) {
        setConversations([]);
        return;
      }

      // Batch: get the latest message per session in one query
      const messagesResult = await fetchChatMessagesForSessions(supabase, sessionIds);
      // REASON: DAL returns unknown[] — cast for field access on chat message rows
      const allMessages = (messagesResult.success ? messagesResult.data : []) as Array<{
        session_id: string;
        message: string;
        created_at: string | null;
        user: { name: string | null } | { name: string | null }[] | null;
      }>;

      // Group: find the last message per session and check if messages exist
      const lastMessageBySession = new Map<
        string,
        {
          session_id: string;
          message: string;
          created_at: string | null;
          user: { name: string | null } | { name: string | null }[] | null;
        }
      >();
      for (const msg of allMessages) {
        if (!lastMessageBySession.has(msg.session_id)) {
          lastMessageBySession.set(msg.session_id, msg);
        }
      }

      // Build conversations — only include sessions that have messages
      const conversationsData: Conversation[] = [];
      for (const session of sessions) {
        const lastMessage = lastMessageBySession.get(session.id);
        if (!lastMessage) continue; // Skip sessions with no messages

        conversationsData.push({
          session_id: session.id,
          session: {
            id: session.id,
            sport: session.sport,
            date: session.date,
            location: session.location,
            creator: Array.isArray(session.creator) ? session.creator[0] : session.creator,
          },
          last_message: {
            message: lastMessage.message,
            created_at: lastMessage.created_at ?? '',
            user: (() => {
              const u = Array.isArray(lastMessage.user) ? lastMessage.user[0] : lastMessage.user;
              return { name: u?.name ?? '' };
            })(),
          },
          unread_count: 0,
        });
      }

      // Sort by last message date
      conversationsData.sort((a, b) => {
        if (!a.last_message) return 1;
        if (!b.last_message) return -1;
        return new Date(b.last_message.created_at).getTime() - new Date(a.last_message.created_at).getTime();
      });

      setConversations(conversationsData);
    } catch (err) {
      logError(err, { action: 'loadSessionConversations' });
    }
  }

  async function loadDirectConversations(userId: string) {
    try {
      const result = await fetchUserConversations(supabase, userId);
      if (!result.success) throw new Error(result.error);
      setDirectConversations(result.data || []);
    } catch (err) {
      logError(err, { action: 'loadDirectConversations' });
    }
  }

  function formatTime(dateString: string) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return language === 'es' ? 'ahora' : 'now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;

    return date.toLocaleDateString(language === 'es' ? 'es-CO' : 'en-US', {
      month: 'short',
      day: 'numeric',
    });
  }

  function getTranslatedSport(sport: string) {
    if (sportTranslations[sport]) {
      return sportTranslations[sport][language];
    }
    return sport;
  }

  return {
    t,
    language,
    conversations,
    directConversations,
    loading,
    error,
    formatTime,
    getTranslatedSport,
    retry: checkUser,
  };
}
