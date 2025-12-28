'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { MessageCircle, ChevronRight } from 'lucide-react';
import BottomNav from '@/components/BottomNav';
import { useLanguage } from '@/lib/LanguageContext';
import { sportTranslations } from '@/lib/translations';

interface Conversation {
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

export default function MessagesPage() {
  const router = useRouter();
  const supabase = createClient();
  const { t, language } = useLanguage();
  const [user, setUser] = useState<any>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkUser();
  }, []);

  async function checkUser() {
    const { data: { user } } = await supabase.auth.getUser();
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
          ...(participantSessions?.map(p => p.session_id) || []),
          ...(createdSessions?.map(s => s.id) || [])
        ])
      ];

      if (sessionIds.length === 0) {
        setConversations([]);
        setLoading(false);
        return;
      }

      // Get sessions with their last message
      const conversationsData: Conversation[] = [];

      for (const sessionId of sessionIds) {
        // Get session details
        const { data: session } = await supabase
          .from('sessions')
          .select(`
            id,
            sport,
            date,
            location,
            creator:users!sessions_creator_id_fkey(id, name, avatar_url)
          `)
          .eq('id', sessionId)
          .single();

        if (!session) continue;

        // Get last message for this session
        const { data: lastMessage } = await supabase
          .from('chat_messages')
          .select(`
            message,
            created_at,
            user:users!chat_messages_user_id_fkey(name)
          `)
          .eq('session_id', sessionId)
          .eq('deleted', false)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        // Get message count (for sessions with messages)
        const { count } = await supabase
          .from('chat_messages')
          .select('*', { count: 'exact', head: true })
          .eq('session_id', sessionId)
          .eq('deleted', false);

        // Only include sessions that have messages
        if (count && count > 0) {
          conversationsData.push({
            session_id: sessionId,
            session: {
              id: session.id,
              sport: session.sport,
              date: session.date,
              location: session.location,
              creator: Array.isArray(session.creator) ? session.creator[0] : session.creator
            },
            last_message: lastMessage ? {
              message: lastMessage.message,
              created_at: lastMessage.created_at,
              user: Array.isArray(lastMessage.user) ? lastMessage.user[0] : lastMessage.user
            } : null,
            unread_count: 0 // TODO: Implement unread tracking
          });
        }
      }

      // Sort by last message date
      conversationsData.sort((a, b) => {
        if (!a.last_message) return 1;
        if (!b.last_message) return -1;
        return new Date(b.last_message.created_at).getTime() - new Date(a.last_message.created_at).getTime();
      });

      setConversations(conversationsData);
    } catch (error) {
      console.error('Error loading conversations:', error);
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
      day: 'numeric'
    });
  }

  function getTranslatedSport(sport: string) {
    if (sportTranslations[sport]) {
      return sportTranslations[sport][language];
    }
    return sport;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-[#52575D] pb-32">
        <div className="bg-stone-200 dark:bg-[#272D34] p-4 border-b border-stone-300 dark:border-black">
          <div className="max-w-2xl mx-auto">
            <h1 className="text-xl font-bold text-stone-900 dark:text-white">
              {t('messages')}
            </h1>
          </div>
        </div>
        <div className="max-w-2xl mx-auto p-4">
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white dark:bg-[#6B7178] rounded-xl p-4 animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-stone-200 dark:bg-[#52575D] rounded-full" />
                  <div className="flex-1">
                    <div className="h-4 bg-stone-200 dark:bg-[#52575D] rounded w-1/3 mb-2" />
                    <div className="h-3 bg-stone-200 dark:bg-[#52575D] rounded w-2/3" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-[#52575D] pb-32">
      <div className="bg-stone-200 dark:bg-[#272D34] p-4 border-b border-stone-300 dark:border-black">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-xl font-bold text-stone-900 dark:text-white">
            {t('messages')}
          </h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4">
        {conversations.length === 0 ? (
          <div className="bg-white dark:bg-[#6B7178] rounded-xl p-8 text-center border border-stone-200 dark:border-[#52575D]">
            <div className="w-16 h-16 bg-stone-100 dark:bg-[#52575D] rounded-full flex items-center justify-center mx-auto mb-4">
              <MessageCircle className="w-8 h-8 text-stone-400" />
            </div>
            <h3 className="text-lg font-semibold text-stone-900 dark:text-white mb-2">
              {t('noConversations')}
            </h3>
            <p className="text-stone-500 dark:text-gray-400 mb-4">
              {t('joinSessionToChat')}
            </p>
            <Link href="/">
              <button className="px-6 py-3 bg-tribe-green text-slate-900 font-bold rounded-lg hover:bg-lime-500 transition">
                {t('findSessions')}
              </button>
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {conversations.map((conv) => (
              <Link
                key={conv.session_id}
                href={`/session/${conv.session_id}/chat`}
              >
                <div className="bg-white dark:bg-[#6B7178] rounded-xl p-4 border border-stone-200 dark:border-[#52575D] hover:border-tribe-green transition cursor-pointer">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-tribe-green rounded-full flex items-center justify-center text-lg flex-shrink-0">
                      {conv.session.sport === 'Running' ? '🏃' :
                       conv.session.sport === 'Cycling' ? '🚴' :
                       conv.session.sport === 'Swimming' ? '🏊' :
                       conv.session.sport === 'CrossFit' ? '🏋️' :
                       conv.session.sport === 'Boxing' ? '🥊' :
                       conv.session.sport === 'Yoga' ? '🧘' :
                       conv.session.sport === 'Hiking' ? '🥾' :
                       conv.session.sport === 'Basketball' ? '🏀' :
                       conv.session.sport === 'Soccer' ? '⚽' :
                       conv.session.sport === 'Tennis' ? '🎾' : '💪'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="font-semibold text-stone-900 dark:text-white truncate">
                          {getTranslatedSport(conv.session.sport)}
                        </h3>
                        {conv.last_message && (
                          <span className="text-xs text-stone-500 dark:text-gray-400 flex-shrink-0 ml-2">
                            {formatTime(conv.last_message.created_at)}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-stone-500 dark:text-gray-400 truncate mb-1">
                        {conv.session.location}
                      </p>
                      {conv.last_message && (
                        <p className="text-sm text-stone-600 dark:text-gray-300 truncate">
                          <span className="font-medium">{conv.last_message.user.name}:</span>{' '}
                          {conv.last_message.message}
                        </p>
                      )}
                    </div>
                    <ChevronRight className="w-5 h-5 text-stone-400 flex-shrink-0" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
