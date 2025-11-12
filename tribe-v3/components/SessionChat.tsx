'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Send } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';

interface Message {
  id: string;
  user_id: string;
  message: string;
  created_at: string;
  user: {
    name: string;
    avatar_url: string | null;
  };
}

interface SessionChatProps {
  sessionId: string;
  currentUserId: string;
}

export default function SessionChat({ sessionId, currentUserId }: SessionChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();
  const { t } = useLanguage();

  useEffect(() => {
    loadMessages();
    subscribeToMessages();
  }, [sessionId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  async function loadMessages() {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select(`
          id,
          user_id,
          message,
          created_at,
          user:users!messages_user_id_fkey (
            name,
            avatar_url
          )
        `)
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages(data || []);
    } catch (error) {
      console.error('Error loading messages:', error);
    } finally {
      setLoading(false);
    }
  }

  function subscribeToMessages() {
    const channel = supabase
      .channel(`session-${sessionId}-messages`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `session_id=eq.${sessionId}`,
        },
        async (payload) => {
          // Fetch the complete message with user data
          const { data } = await supabase
            .from('messages')
            .select(`
              id,
              user_id,
              message,
              created_at,
              user:users!messages_user_id_fkey (
                name,
                avatar_url
              )
            `)
            .eq('id', payload.new.id)
            .single();

          if (data) {
            setMessages((prev) => [...prev, data]);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    
    if (!newMessage.trim() || sending) return;

    try {
      setSending(true);

      const { error } = await supabase
        .from('messages')
        .insert({
          session_id: sessionId,
          user_id: currentUserId,
          message: newMessage.trim(),
        });

      if (error) throw error;

      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
      alert('Failed to send message');
    } finally {
      setSending(false);
    }
  }

  function scrollToBottom() {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }

  function formatTime(timestamp: string) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function getInitials(name: string) {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }

  if (loading) {
    return (
      <div className="bg-white dark:bg-[#6B7178] rounded-xl p-4 border border-stone-300 dark:border-[#52575D]">
        <p className="text-center text-stone-600 dark:text-gray-300">Loading chat...</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-[#6B7178] rounded-xl border border-stone-300 dark:border-[#52575D] overflow-hidden flex flex-col" style={{ height: '400px' }}>
      {/* Chat Header */}
      <div className="bg-stone-100 dark:bg-[#52575D] px-4 py-3 border-b border-stone-300 dark:border-[#52575D]">
        <h3 className="font-semibold text-stone-900 dark:text-white">Group Chat</h3>
        <p className="text-xs text-stone-600 dark:text-gray-300">{messages.length} messages</p>
      </div>

      {/* Messages List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-stone-500 dark:text-gray-400 text-sm">No messages yet. Start the conversation!</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isOwnMessage = msg.user_id === currentUserId;
            
            return (
              <div
                key={msg.id}
                className={`flex gap-2 ${isOwnMessage ? 'flex-row-reverse' : 'flex-row'}`}
              >
                {/* Avatar */}
                <div className="flex-shrink-0">
                  {msg.users?.avatar_url ? (
                    <img
                      src={msg.users.avatar_url}
                      alt={msg.users.name}
                      className="w-8 h-8 rounded-full"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-[#C0E863] flex items-center justify-center text-xs font-semibold text-[#272D34]">
                      {getInitials(msg.users?.name || 'U')}
                    </div>
                  )}
                </div>

                {/* Message Bubble */}
                <div className={`flex flex-col ${isOwnMessage ? 'items-end' : 'items-start'} max-w-[70%]`}>
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-xs font-medium text-stone-700 dark:text-gray-300">
                      {isOwnMessage ? 'You' : msg.users?.name}
                    </span>
                    <span className="text-xs text-stone-500 dark:text-gray-400">
                      {formatTime(msg.created_at)}
                    </span>
                  </div>
                  <div
                    className={`rounded-2xl px-4 py-2 ${
                      isOwnMessage
                        ? 'bg-[#C0E863] text-[#272D34]'
                        : 'bg-stone-200 dark:bg-[#52575D] text-stone-900 dark:text-white'
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap break-words">{msg.message}</p>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Message Input */}
      <form onSubmit={sendMessage} className="p-4 bg-stone-50 dark:bg-[#52575D] border-t border-stone-300 dark:border-[#52575D]">
        <div className="flex gap-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message..."
            disabled={sending}
            className="flex-1 px-4 py-2 bg-white dark:bg-[#404549] border border-stone-300 dark:border-[#52575D] rounded-full text-stone-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#C0E863] disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!newMessage.trim() || sending}
            className="p-2 bg-[#C0E863] text-[#272D34] rounded-full hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </form>
    </div>
  );
}
