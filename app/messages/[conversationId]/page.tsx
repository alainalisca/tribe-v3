/** Page: /messages/[conversationId] — Direct message thread view */
'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { logError } from '@/lib/logger';
import { showError } from '@/lib/toast';
import { trackEvent } from '@/lib/analytics';
import ChatView, { ChatMessage } from '@/components/ChatView';
import { useLanguage } from '@/lib/LanguageContext';
import {
  fetchConversationMessages,
  markConversationRead,
  sendDirectMessage,
  fetchUserConversations,
} from '@/lib/dal/conversations';
import type { User } from '@supabase/supabase-js';

// Guard so a bad/missing path param never becomes an `eq.undefined` query —
// it must surface as a real "not found" error instead (see the loaders below).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ConversationInfo {
  otherUserName: string;
  otherUserId: string;
}

interface ChatMessagePayload {
  id: string;
  conversation_id: string;
  user_id: string;
  message: string;
  created_at: string;
  is_system?: boolean;
}

export default function ConversationPage() {
  const router = useRouter();
  // Stable client instance: createClient() returns a NEW client per call, so a
  // bare `const supabase = createClient()` here changed identity every render and
  // (being in the realtime effect's deps) tore down + re-created the subscription
  // on every render — it never stabilized, so live messages never arrived. Memoize
  // it once, matching the pattern the working NotificationBell relies on.
  const [supabase] = useState(() => createClient());
  const { language } = useLanguage();
  // Next 16: `params` is a Promise, so reading it as a synchronous prop yielded
  // `undefined` — which became conversation_id=eq.undefined and broke every DM
  // thread (the "DMs don't exist" bug). Read the path segment via useParams(),
  // matching session/[id], storefront/[id], invite/[token].
  const params = useParams();
  const conversationId = typeof params?.conversationId === 'string' ? params.conversationId : '';

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [conversationInfo, setConversationInfo] = useState<ConversationInfo | null>(null);

  // Initialize: check user, load conversation info and messages
  useEffect(() => {
    checkUserAndLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, [conversationId]);

  // Subscribe to new messages in this conversation
  useEffect(() => {
    if (!currentUser || !conversationId) return;

    const channel = supabase
      .channel(`dm-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload: { new: ChatMessagePayload }) => {
          // Fetch full message with user info
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
              user:users!chat_messages_user_id_fkey (id, name, avatar_url)
            `
            )
            .eq('id', payload.new.id)
            .single();

          if (!error && data) {
            const messageData = data as Record<string, any>;
            const newMsg: ChatMessage = {
              id: messageData.id,
              user_id: messageData.user_id,
              message: messageData.message,
              created_at: messageData.created_at,
              deleted: messageData.deleted || false,
              user: Array.isArray(messageData.user)
                ? {
                    id: messageData.user[0]?.id || '',
                    name: messageData.user[0]?.name || 'Unknown',
                    avatar_url: messageData.user[0]?.avatar_url || null,
                  }
                : {
                    id: messageData.user?.id || '',
                    name: messageData.user?.name || 'Unknown',
                    avatar_url: messageData.user?.avatar_url || null,
                  },
            };

            setMessages((prev) => [...prev, newMsg]);

            // Mark conversation as read
            if (payload.new.user_id !== currentUser.id) {
              await markConversationRead(supabase, conversationId, currentUser.id);

              // Play notification sound
              try {
                const audio = new Audio('/sounds/notification.mp3');
                audio.volume = 0.5;
                audio.play().catch(() => {});
              } catch {
                // Best effort
              }

              // Show notification
              if (document.hidden && Notification.permission === 'granted') {
                new Notification('New DM', {
                  body: `${newMsg.user.name}: ${newMsg.message.slice(0, 50)}`,
                  icon: '/icon-192.png',
                });
              }
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser, conversationId, supabase]);

  async function checkUserAndLoad() {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push('/auth');
        return;
      }

      setCurrentUser(user);

      // Load conversation info and messages
      await loadConversationData(user.id);
    } catch (error) {
      logError(error, { action: 'checkUserAndLoad' });
      showError(language === 'es' ? 'No se pudo cargar la conversación' : 'Failed to load conversation');
      setLoading(false);
    }
  }

  async function loadConversationData(userId: string) {
    // Never fire a query with a missing/invalid id (would send eq.undefined and
    // surface as an opaque 22P02). Fail loudly with a real error instead.
    if (!conversationId || !UUID_RE.test(conversationId)) {
      logError(new Error('Missing/invalid conversationId in path'), { action: 'loadConversationData', conversationId });
      showError(language === 'es' ? 'Conversación no encontrada' : 'Conversation not found');
      setLoading(false);
      return;
    }
    try {
      setLoading(true);

      // Get conversation info (other user name)
      const convResult = await fetchUserConversations(supabase, userId);
      if (convResult.success && convResult.data) {
        const conv = convResult.data.find((c) => c.id === conversationId);
        if (conv) {
          setConversationInfo({
            otherUserName: conv.other_user.name,
            otherUserId: conv.other_user.id,
          });
        }
      }

      // Get messages
      const msgResult = await fetchConversationMessages(supabase, conversationId);
      if (!msgResult.success) throw new Error(msgResult.error);

      setMessages(msgResult.data || []);

      // Mark as read
      await markConversationRead(supabase, conversationId, userId);
    } catch (error) {
      logError(error, { action: 'loadConversationData' });
      showError(language === 'es' ? 'No se pudieron cargar los mensajes' : 'Failed to load messages');
    } finally {
      setLoading(false);
    }
  }

  async function handleSendMessage(text: string): Promise<boolean> {
    if (!currentUser) return false;
    if (!conversationId || !UUID_RE.test(conversationId)) {
      showError(language === 'es' ? 'Conversación no encontrada' : 'Conversation not found');
      return false;
    }

    try {
      const result = await sendDirectMessage(supabase, conversationId, currentUser.id, text);
      if (!result.success) {
        showError(result.error || (language === 'es' ? 'No se pudo enviar el mensaje' : 'Failed to send message'));
        return false;
      }
      trackEvent('message_sent', { conversation_id: conversationId });
      return true;
    } catch (error) {
      logError(error, { action: 'handleSendMessage' });
      showError(language === 'es' ? 'No se pudo enviar el mensaje' : 'Failed to send message');
      return false;
    }
  }

  return (
    <ChatView
      messages={messages}
      currentUserId={currentUser?.id || ''}
      onSend={handleSendMessage}
      loading={loading}
      header={
        <div className="flex items-center gap-3">
          <Link href="/messages" className="hover:opacity-70">
            <ArrowLeft className="w-5 h-5 text-stone-900 dark:text-white" />
          </Link>
          <div>
            <h2 className="text-lg font-semibold text-stone-900 dark:text-white">
              {conversationInfo?.otherUserName || 'Loading...'}
            </h2>
          </div>
        </div>
      }
    />
  );
}
