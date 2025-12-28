'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Send, MoreVertical, Trash2, Flag, X, Shield } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import Link from 'next/link';

interface Message {
  id: string;
  user_id: string;
  message: string;
  created_at: string;
  deleted: boolean;
  user: {
    name: string;
    avatar_url: string | null;
  };
}

interface SessionChatProps {
  sessionId: string;
  currentUserId: string;
  isHost?: boolean;
  isAdmin?: boolean;
}

export default function SessionChat({ sessionId, currentUserId, isHost = false, isAdmin = false }: SessionChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<string | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportDescription, setReportDescription] = useState('');
  const [reportingMessageId, setReportingMessageId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();
  const { t } = useLanguage();

  const canModerate = isHost || isAdmin;

  useEffect(() => {
    loadMessages();
    const cleanup = subscribeToMessages();
    return cleanup;
  }, [sessionId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  async function loadMessages() {
    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .select(`
          id,
          user_id,
          message,
          created_at,
          deleted,
          user:users!chat_messages_user_id_fkey (
            name,
            avatar_url
          )
        `)
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      const messagesWithUser = data?.map(msg => ({
        ...msg,
        user: Array.isArray(msg.user) ? msg.user[0] : msg.user
      })) || [];
      setMessages(messagesWithUser);
    } catch (error) {
      console.error('Error loading messages:', error);
    } finally {
      setLoading(false);
    }
  }

  function subscribeToMessages() {
    const channelName = `session:${sessionId}:messages`;
    
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `session_id=eq.${sessionId}`,
        },
        async (payload) => {
          const { data: userData } = await supabase
            .from('users')
            .select('name, avatar_url')
            .eq('id', payload.new.user_id)
            .single();

          const messageWithUser = {
            id: payload.new.id,
            user_id: payload.new.user_id,
            message: payload.new.message,
            created_at: payload.new.created_at,
            deleted: payload.new.deleted || false,
            user: userData || { name: 'Unknown', avatar_url: null }
          };
          
          setMessages((prev) => [...prev, messageWithUser]);

          // Play notification sound for messages from others
          if (payload.new.user_id !== currentUserId) {
            try {
              const audio = new Audio("/sounds/notification.mp3");
              audio.volume = 0.5;
              audio.play().catch(() => {});
            } catch (e) {}
            
            // Browser notification if tab not focused
            if (document.hidden && Notification.permission === "granted") {
              new Notification("New message in Tribe", {
                body: `${userData?.name || "Someone"}: ${payload.new.message.slice(0, 50)}`,
                icon: "/icon-192.png"
              });
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'chat_messages',
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          setMessages((prev) => 
            prev.map(msg => 
              msg.id === payload.new.id 
                ? { ...msg, deleted: payload.new.deleted }
                : msg
            )
          );
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

    const messageText = newMessage.trim();

    try {
      setSending(true);

      const { error } = await supabase
        .from('chat_messages')
        .insert({
          session_id: sessionId,
          user_id: currentUserId,
          message: messageText,
        });

      if (error) throw error;

      // Notify other participants via push notification
      const { data: participants } = await supabase
        .from('session_participants')
        .select('user_id')
        .eq('session_id', sessionId)
        .neq('user_id', currentUserId);

      const { data: sender } = await supabase
        .from('users')
        .select('name')
        .eq('id', currentUserId)
        .single();

      if (participants) {
        for (const p of participants) {
          fetch('/api/notifications/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: p.user_id,
              title: 'New message in Tribe',
              body: `${sender?.name || 'Someone'}: ${messageText.slice(0, 50)}`,
              url: `/session/${sessionId}/chat`
            })
          }).catch(() => {});
        }
      }

      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
      alert('Failed to send message');
    } finally {
      setSending(false);
    }
  }

  async function deleteMessage(messageId: string) {
    if (!confirm('Delete this message?')) return;

    try {
      const { error } = await supabase
        .from('chat_messages')
        .update({ 
          deleted: true,
          deleted_by: currentUserId,
          deleted_at: new Date().toISOString()
        })
        .eq('id', messageId);

      if (error) {
        console.error('Delete error:', error);
        throw error;
      }
      
      setSelectedMessage(null);
      alert('✅ Message deleted');
    } catch (error: any) {
      console.error('Full error:', error);
      alert('❌ Error: ' + error.message);
    }
  }

  async function reportMessage(messageId: string) {
    setReportingMessageId(messageId);
    setShowReportModal(true);
    setSelectedMessage(null);
  }

  async function submitReport() {
    if (!reportReason) {
      alert('Please select a reason');
      return;
    }

    try {
      const { error } = await supabase
        .from('reported_messages')
        .insert({
          message_id: reportingMessageId,
          reporter_id: currentUserId,
          session_id: sessionId,
          reason: reportReason,
          description: reportDescription,
        });

      if (error) throw error;

      alert('✅ Message reported. Admins will review it.');
      setShowReportModal(false);
      setReportReason('');
      setReportDescription('');
      setReportingMessageId(null);
    } catch (error: any) {
      alert('❌ Error: ' + error.message);
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
    <div className="bg-white dark:bg-[#6B7178] rounded-xl border border-stone-300 dark:border-[#52575D] overflow-hidden flex flex-col h-[600px]">
      {/* Chat Header */}
      <div className="bg-stone-100 dark:bg-[#52575D] px-4 py-3 border-b border-stone-300 dark:border-[#52575D] flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-stone-900 dark:text-white">Group Chat</h3>
            <p className="text-xs text-stone-600 dark:text-gray-300">
              {messages.filter(m => !m.deleted).length} messages
            </p>
          </div>
          {canModerate && (
            <div className="flex items-center gap-1 text-xs">
              <Shield className="w-4 h-4 text-tribe-green" />
              <span className="text-tribe-green font-medium">
                {isAdmin ? 'Admin' : 'Host'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Messages List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-4">💬</div>
            <h3 className="text-lg font-semibold text-stone-900 dark:text-white mb-2">
              {t('noMessagesYet')}
            </h3>
            <p className="text-stone-500 dark:text-gray-400 text-sm">
              {t('startConversation')}
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isOwnMessage = msg.user_id === currentUserId;
            
            if (msg.deleted) {
              return (
                <div key={msg.id} className="flex gap-2">
                  <div className="flex-1 p-3 bg-stone-100 dark:bg-[#52575D] rounded-lg opacity-50">
                    <p className="text-xs text-stone-500 italic">Message deleted</p>
                  </div>
                </div>
              );
            }
            
            return (
              <div
                key={msg.id}
                className={`flex gap-2 ${isOwnMessage ? 'flex-row-reverse' : 'flex-row'} group relative`}
              >
                {/* Avatar */}
                <Link href={`/profile/${msg.user_id}`} className="flex-shrink-0">
                  {msg.user?.avatar_url ? (
                    <img
                      src={msg.user.avatar_url}
                      alt={msg.user.name}
                      className="w-8 h-8 rounded-full cursor-pointer hover:opacity-80"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-[#C0E863] flex items-center justify-center text-xs font-semibold text-[#272D34] cursor-pointer hover:opacity-80">
                      {getInitials(msg.user?.name || 'U')}
                    </div>
                  )}
                </Link>

                {/* Message Bubble */}
                <div className={`flex flex-col ${isOwnMessage ? 'items-end' : 'items-start'} max-w-[70%]`}>
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-xs font-medium text-stone-700 dark:text-gray-300">
                      {isOwnMessage ? 'You' : msg.user?.name}
                    </span>
                    <span className="text-xs text-stone-500 dark:text-gray-400">
                      {formatTime(msg.created_at)}
                    </span>
                  </div>
                  <div className="flex items-start gap-1">
                    <div
                      className={`rounded-2xl px-4 py-2 ${
                        isOwnMessage
                          ? 'bg-[#C0E863] text-[#272D34]'
                          : 'bg-stone-200 dark:bg-[#52575D] text-stone-900 dark:text-white'
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap break-words">{msg.message}</p>
                    </div>
                    
                    {/* Message Actions Menu */}
                    {(canModerate || isOwnMessage) && (
                      <button
                        onClick={() => setSelectedMessage(selectedMessage === msg.id ? null : msg.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-stone-200 dark:hover:bg-[#52575D] rounded transition"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Actions Dropdown */}
                  {selectedMessage === msg.id && (
                    <div className={`absolute ${isOwnMessage ? 'right-0' : 'left-0'} top-full mt-1 bg-white dark:bg-[#404549] border border-stone-300 dark:border-[#52575D] rounded-lg shadow-lg z-10 min-w-[120px]`}>
                      {canModerate && (
                        <button
                          onClick={() => deleteMessage(msg.id)}
                          className="w-full px-3 py-2 text-left text-sm hover:bg-stone-100 dark:hover:bg-[#52575D] flex items-center gap-2 text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                          Delete
                        </button>
                      )}
                      {!isOwnMessage && !canModerate && (
                        <button
                          onClick={() => reportMessage(msg.id)}
                          className="w-full px-3 py-2 text-left text-sm hover:bg-stone-100 dark:hover:bg-[#52575D] flex items-center gap-2 text-orange-600"
                        >
                          <Flag className="w-4 h-4" />
                          Report
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Message Input */}
      <div className="p-4 bg-stone-50 dark:bg-[#52575D] border-t border-stone-300 dark:border-[#52575D] flex-shrink-0">
        <form onSubmit={sendMessage} className="flex gap-2">
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
        </form>
      </div>

      {/* Report Modal */}
      {showReportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#404549] rounded-lg p-6 max-w-md w-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">Report Message</h3>
              <button onClick={() => setShowReportModal(false)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Reason *</label>
                <select
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  className="w-full p-2 border rounded-lg"
                >
                  <option value="">Select a reason</option>
                  <option value="spam">Spam</option>
                  <option value="harassment">Harassment</option>
                  <option value="inappropriate">Inappropriate content</option>
                  <option value="offensive">Offensive language</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Details (optional)</label>
                <textarea
                  value={reportDescription}
                  onChange={(e) => setReportDescription(e.target.value)}
                  placeholder="Provide more context..."
                  className="w-full p-2 border rounded-lg h-20 resize-none"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowReportModal(false)}
                className="flex-1 px-4 py-2 border rounded-lg hover:bg-stone-50"
              >
                Cancel
              </button>
              <button
                onClick={submitReport}
                disabled={!reportReason}
                className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50"
              >
                Submit Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
