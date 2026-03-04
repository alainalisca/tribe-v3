'use client';

import { logError } from '@/lib/logger';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/lib/LanguageContext';
import { sportTranslations } from '@/lib/translations';
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

export function useMessages() {
  const router = useRouter();
  const supabase = createClient();
  const { t, language } = useLanguage();
  const [, setUser] = useState<User | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  async function checkUser() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push('/auth');
      return;
    }
    setUser(user);
    await loadConversations(user.id);
  }

  async function loadConversations(userId: string) {
    try {
      setLoading(true);

      // Get all sessions where user is a participant (including as creator)
      const { data: participantSessions, error: participantError } = await supabase
        .from('session_participants')
        .select('session_id')
        .eq('user_id', userId)
        .eq('status', 'confirmed');

      if (participantError) throw participantError;

      // Get sessions created by user
      const { data: createdSessions, error: createdError } = await supabase
        .from('sessions')
        .select('id')
        .eq('creator_id', userId);

      if (createdError) throw createdError;

      // Combine session IDs
      const sessionIds = [
        ...new Set([
          ...(participantSessions?.map((p) => p.session_id) || []),
          ...(createdSessions?.map((s) => s.id) || []),
        ]),
      ];

      if (sessionIds.length === 0) {
        setConversations([]);
        setLoading(false);
        return;
      }

      // Batch: get all sessions in one query
      const { data: sessions } = await supabase
        .from('sessions')
        .select(
          `
          id,
          sport,
          date,
          location,
          creator:users!sessions_creator_id_fkey(id, name, avatar_url)
        `
        )
        .in('id', sessionIds);

      if (!sessions || sessions.length === 0) {
        setConversations([]);
        setLoading(false);
        return;
      }

      // Batch: get the latest message per session in one query
      const { data: allMessages } = await supabase
        .from('chat_messages')
        .select(
          `
          session_id,
          message,
          created_at,
          user:users!chat_messages_user_id_fkey(name)
        `
        )
        .in('session_id', sessionIds)
        .eq('deleted', false)
        .order('created_at', { ascending: false });

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
      for (const msg of allMessages || []) {
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
    } catch (error) {
      logError(error, { action: 'loadConversations' });
    } finally {
      setLoading(false);
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

    return date.toLocaleDateString(language === 'es' ? 'es-ES' : 'en-US', {
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
    loading,
    formatTime,
    getTranslatedSport,
  };
}
