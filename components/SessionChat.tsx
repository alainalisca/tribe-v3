'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Send, MoreVertical, Trash2, Flag, X, Shield } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { logError } from '@/lib/logger';
import { showError, showSuccess, showInfo } from '@/lib/toast';
import { getErrorMessage } from '@/lib/errorMessages';
import ConfirmDialog from '@/components/ConfirmDialog';
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
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number; showAbove: boolean } | null>(null);
  const supabase = createClient();
  const { t, language } = useLanguage();

  const canModerate = isHost || isAdmin;

  const tr =
    language === 'es'
      ? {
          loadingChat: 'Cargando chat...',
          groupChat: 'Chat grupal',
          messages: 'mensajes',
          messageDeleted: 'Mensaje eliminado',
          you: 'Tú',
          typeMessage: 'Escribe un mensaje...',
          reportMessage: 'Reportar mensaje',
          reason: 'Razón *',
          selectReason: 'Selecciona una razón',
          spam: 'Spam',
          harassment: 'Acoso',
          inappropriate: 'Contenido inapropiado',
          offensive: 'Lenguaje ofensivo',
          other: 'Otro',
          details: 'Detalles (opcional)',
          moreContext: 'Proporciona más contexto...',
          cancel: 'Cancelar',
          submitReport: 'Enviar reporte',
          admin: 'Admin',
          host: 'Anfitrión',
        }
      : {
          loadingChat: 'Loading chat...',
          groupChat: 'Group Chat',
          messages: 'messages',
          messageDeleted: 'Message deleted',
          you: 'You',
          typeMessage: 'Type a message...',
          reportMessage: 'Report Message',
          reason: 'Reason *',
          selectReason: 'Select a reason',
          spam: 'Spam',
          harassment: 'Harassment',
          inappropriate: 'Inappropriate content',
          offensive: 'Offensive language',
          other: 'Other',
          details: 'Details (optional)',
          moreContext: 'Provide more context...',
          cancel: 'Cancel',
          submitReport: 'Submit Report',
          admin: 'Admin',
          host: 'Host',
        };

  useEffect(() => {
    loadMessages();
    const cleanup = subscribeToMessages();
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, [sessionId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Capacitor Keyboard plugin — scroll chat on keyboard show
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    (async () => {
      try {
        const { Capacitor } = await import('@capacitor/core');
        if (!Capacitor.isNativePlatform()) return;
        const { Keyboard } = await import('@capacitor/keyboard');
        Keyboard.setAccessoryBarVisible({ isVisible: true });
        Keyboard.setScroll({ isDisabled: false });
        const showListener = await Keyboard.addListener('keyboardWillShow', () => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        });
        const hideListener = await Keyboard.addListener('keyboardWillHide', () => {
          /* no-op — layout reflows naturally */
        });
        cleanup = () => {
          showListener.remove();
          hideListener.remove();
        };
      } catch {
        /* Keyboard plugin not available */
      }
    })();
    return () => cleanup?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  async function loadMessages() {
    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .select(
          `
          id,
          user_id,
          message,
          created_at,
          deleted,
          user:users!chat_messages_user_id_fkey (
            name,
            avatar_url
          )
        `
        )
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true })
        .limit(200);

      if (error) throw error;
      const messagesWithUser =
        data?.map((msg) => ({
          ...msg,
          user: Array.isArray(msg.user) ? msg.user[0] : msg.user,
        })) || [];
      setMessages(messagesWithUser);
    } catch (error) {
      logError(error, { action: 'loadMessages', sessionId });
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
            user: userData || { name: 'Unknown', avatar_url: null },
          };

          setMessages((prev) => [...prev, messageWithUser]);

          // Play notification sound for messages from others
          if (payload.new.user_id !== currentUserId) {
            try {
              const audio = new Audio('/sounds/notification.mp3');
              audio.volume = 0.5;
              audio.play().catch(() => {});
            } catch {
              // Audio play is best-effort; silent fail is fine
            }

            // Browser notification if tab not focused
            if (document.hidden && Notification.permission === 'granted') {
              new Notification('New message in Tribe', {
                body: `${userData?.name || 'Someone'}: ${payload.new.message.slice(0, 50)}`,
                icon: '/icon-192.png',
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
            prev.map((msg) => (msg.id === payload.new.id ? { ...msg, deleted: payload.new.deleted } : msg))
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

      const { error } = await supabase.from('chat_messages').insert({
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

      const { data: sender } = await supabase.from('users').select('name').eq('id', currentUserId).single();

      if (participants) {
        for (const p of participants) {
          fetch('/api/notifications/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: p.user_id,
              title: 'New message in Tribe',
              body: `${sender?.name || 'Someone'}: ${messageText.slice(0, 50)}`,
              url: `/session/${sessionId}/chat`,
            }),
          }).catch(() => {});
        }
      }

      setNewMessage('');
    } catch (error) {
      logError(error, { action: 'sendMessage', sessionId });
      showError(getErrorMessage(error, 'send_message', language));
    } finally {
      setSending(false);
    }
  }

  async function deleteMessage(messageId: string) {
    try {
      const { error } = await supabase
        .from('chat_messages')
        .update({
          deleted: true,
          deleted_by: currentUserId,
          deleted_at: new Date().toISOString(),
        })
        .eq('id', messageId);

      if (error) {
        logError(error, { action: 'deleteMessage', messageId });
        throw error;
      }

      setSelectedMessage(null);
      showSuccess(language === 'es' ? 'Mensaje eliminado' : 'Message deleted');
    } catch (error: unknown) {
      logError(error, { action: 'deleteMessage', messageId });
      showError(getErrorMessage(error, 'send_message', language));
    }
  }

  async function reportMessage(messageId: string) {
    setReportingMessageId(messageId);
    setShowReportModal(true);
    setSelectedMessage(null);
  }

  async function submitReport() {
    if (!reportReason) {
      showInfo(language === 'es' ? 'Selecciona una razón' : 'Please select a reason');
      return;
    }

    try {
      const { error } = await supabase.from('reported_messages').insert({
        message_id: reportingMessageId,
        reporter_id: currentUserId,
        session_id: sessionId,
        reason: reportReason,
        description: reportDescription,
      });

      if (error) throw error;

      showSuccess(
        language === 'es'
          ? 'Mensaje reportado. Los administradores lo revisarán.'
          : 'Message reported. Admins will review it.'
      );
      setShowReportModal(false);
      setReportReason('');
      setReportDescription('');
      setReportingMessageId(null);
    } catch (error: unknown) {
      logError(error, { action: 'submitReport', messageId: reportingMessageId ?? undefined });
      showError(getErrorMessage(error, 'send_message', language));
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

  // --- Long-press menu helpers ---
  function openMessageMenu(msgId: string, element: HTMLElement) {
    const rect = element.getBoundingClientRect();
    const showAbove = rect.bottom > window.innerHeight * 0.6;
    setMenuPosition({
      top: showAbove ? rect.top - 4 : rect.bottom + 4,
      left: Math.min(rect.left, window.innerWidth - 160),
      showAbove,
    });
    setSelectedMessage(msgId);
  }

  function dismissMenu() {
    setSelectedMessage(null);
    setMenuPosition(null);
  }

  function handleTouchStart(msgId: string, e: React.TouchEvent) {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    const target = e.currentTarget as HTMLElement;
    longPressTimerRef.current = setTimeout(() => {
      openMessageMenu(msgId, target);
      longPressTimerRef.current = null;
    }, 500);
  }

  function handleTouchEnd() {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  function handleTouchMove() {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  // Computed values for the fixed action menu
  const selectedMsg = selectedMessage ? messages.find((m) => m.id === selectedMessage) : null;
  const isSelectedOwn = selectedMsg?.user_id === currentUserId;

  if (loading) {
    return (
      <div className="bg-white dark:bg-[#6B7178] rounded-xl p-4 border border-stone-300 dark:border-[#52575D]">
        <p className="text-center text-stone-600 dark:text-gray-300">{tr.loadingChat}</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-[#6B7178] rounded-xl border border-stone-300 dark:border-[#52575D] overflow-hidden flex flex-col h-[calc(100dvh-6rem)]">
      {/* Chat Header */}
      <div className="bg-stone-100 dark:bg-[#52575D] px-4 py-3 border-b border-stone-300 dark:border-[#52575D] flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-stone-900 dark:text-white">{tr.groupChat}</h3>
            <p className="text-xs text-stone-600 dark:text-gray-300">
              {messages.filter((m) => !m.deleted).length} {tr.messages}
            </p>
          </div>
          {canModerate && (
            <div className="flex items-center gap-1 text-xs">
              <Shield className="w-4 h-4 text-tribe-green" />
              <span className="text-tribe-green font-medium">{isAdmin ? tr.admin : tr.host}</span>
            </div>
          )}
        </div>
      </div>

      {/* Messages List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-4">💬</div>
            <h3 className="text-lg font-semibold text-stone-900 dark:text-white mb-2">{t('noMessagesYet')}</h3>
            <p className="text-stone-500 dark:text-gray-400 text-sm">{t('startConversation')}</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isOwnMessage = msg.user_id === currentUserId;

            if (msg.deleted) {
              return (
                <div key={msg.id} className="flex gap-2">
                  <div className="flex-1 p-3 bg-stone-100 dark:bg-[#52575D] rounded-lg opacity-50">
                    <p className="text-xs text-stone-500 italic">{tr.messageDeleted}</p>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={msg.id}
                className={`flex gap-2 ${isOwnMessage ? 'flex-row-reverse' : 'flex-row'} group relative`}
                onTouchStart={(e) => handleTouchStart(msg.id, e)}
                onTouchEnd={handleTouchEnd}
                onTouchMove={handleTouchMove}
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
                      {isOwnMessage ? tr.you : msg.user?.name}
                    </span>
                    <span className="text-xs text-stone-500 dark:text-gray-400">{formatTime(msg.created_at)}</span>
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
                        onClick={(e) => {
                          const row = (e.currentTarget as HTMLElement).closest('.group') as HTMLElement;
                          if (selectedMessage === msg.id) dismissMenu();
                          else openMessageMenu(msg.id, row);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-stone-200 dark:hover:bg-[#52575D] rounded transition"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Fixed action menu (long-press on mobile, hover-click on desktop) */}
      {selectedMessage && menuPosition && selectedMsg && !selectedMsg.deleted && (
        <>
          <div className="fixed inset-0 z-40" onClick={dismissMenu} />
          <div
            className="fixed z-50 bg-white dark:bg-[#404549] border border-stone-300 dark:border-[#52575D] rounded-xl shadow-lg min-w-[160px] py-1"
            style={{
              ...(menuPosition.showAbove
                ? { bottom: `${window.innerHeight - menuPosition.top}px` }
                : { top: `${menuPosition.top}px` }),
              left: `${menuPosition.left}px`,
            }}
          >
            {(isSelectedOwn || canModerate) && (
              <button
                onClick={() => {
                  setConfirmDeleteId(selectedMessage);
                  dismissMenu();
                }}
                className="w-full px-4 py-2.5 text-left text-sm hover:bg-stone-100 dark:hover:bg-[#52575D] flex items-center gap-2 text-red-600"
              >
                <Trash2 className="w-4 h-4" />
                {language === 'es' ? 'Eliminar' : 'Delete'}
              </button>
            )}
            {!isSelectedOwn && (
              <button
                onClick={() => reportMessage(selectedMessage)}
                className="w-full px-4 py-2.5 text-left text-sm hover:bg-stone-100 dark:hover:bg-[#52575D] flex items-center gap-2 text-orange-600"
              >
                <Flag className="w-4 h-4" />
                {language === 'es' ? 'Reportar' : 'Report'}
              </button>
            )}
          </div>
        </>
      )}

      {/* Message Input */}
      <div className="p-4 bg-stone-50 dark:bg-[#52575D] border-t border-stone-300 dark:border-[#52575D] flex-shrink-0">
        <form onSubmit={sendMessage} className="flex gap-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder={tr.typeMessage}
            disabled={sending}
            autoComplete="off"
            enterKeyHint="send"
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

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={!!confirmDeleteId}
        title={language === 'es' ? 'Eliminar mensaje' : 'Delete message'}
        message={language === 'es' ? '¿Eliminar este mensaje?' : 'Delete this message?'}
        confirmLabel={language === 'es' ? 'Eliminar' : 'Delete'}
        cancelLabel={language === 'es' ? 'Cancelar' : 'Cancel'}
        variant="danger"
        onConfirm={() => {
          if (confirmDeleteId) deleteMessage(confirmDeleteId);
          setConfirmDeleteId(null);
        }}
        onCancel={() => setConfirmDeleteId(null)}
      />

      {/* Report Modal */}
      {showReportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#404549] rounded-lg p-6 max-w-md w-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-stone-900 dark:text-white">{tr.reportMessage}</h3>
              <button onClick={() => setShowReportModal(false)}>
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-stone-700 dark:text-gray-300 mb-2">{tr.reason}</label>
                <select
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  className="w-full p-2 border border-stone-300 dark:border-[#52575D] rounded-lg bg-white dark:bg-[#52575D] text-stone-900 dark:text-white"
                >
                  <option value="">{tr.selectReason}</option>
                  <option value="spam">{tr.spam}</option>
                  <option value="harassment">{tr.harassment}</option>
                  <option value="inappropriate">{tr.inappropriate}</option>
                  <option value="offensive">{tr.offensive}</option>
                  <option value="other">{tr.other}</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-stone-700 dark:text-gray-300 mb-2">{tr.details}</label>
                <textarea
                  value={reportDescription}
                  onChange={(e) => setReportDescription(e.target.value)}
                  placeholder={tr.moreContext}
                  className="w-full p-2 border border-stone-300 dark:border-[#52575D] rounded-lg bg-white dark:bg-[#52575D] text-stone-900 dark:text-white h-20 resize-none"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowReportModal(false)}
                className="flex-1 px-4 py-2 border border-stone-300 dark:border-[#52575D] rounded-lg text-stone-700 dark:text-gray-300 hover:bg-stone-50 dark:hover:bg-[#52575D]"
              >
                {tr.cancel}
              </button>
              <button
                onClick={submitReport}
                disabled={!reportReason}
                className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50"
              >
                {tr.submitReport}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
