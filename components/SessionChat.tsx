'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Send, MoreVertical, Trash2, Flag, Shield } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useLanguage } from '@/lib/LanguageContext';
import ConfirmDialog from '@/components/ConfirmDialog';
import Link from 'next/link';

import { getChatTranslations } from './chat/chatTranslations';
import { useChatMessages } from './chat/useChatMessages';
import ReportModal from './chat/ReportModal';

interface SessionChatProps {
  sessionId: string;
  currentUserId: string;
  isHost?: boolean;
  isAdmin?: boolean;
}

export default function SessionChat({ sessionId, currentUserId, isHost = false, isAdmin = false }: SessionChatProps) {
  const [newMessage, setNewMessage] = useState('');
  const [selectedMessage, setSelectedMessage] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number; showAbove: boolean } | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const supabase = createClient();
  const { t, language } = useLanguage();
  const tr = getChatTranslations(language);
  const canModerate = isHost || isAdmin;

  const chat = useChatMessages({ supabase, sessionId, currentUserId, language });

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
          chat.messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        });
        const hideListener = await Keyboard.addListener('keyboardWillHide', () => {});
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

  function formatTime(timestamp: string) {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function getInitials(name: string) {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }

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

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!newMessage.trim()) return;
    const success = await chat.sendMessage(newMessage.trim());
    if (success) setNewMessage('');
  }

  const selectedMsg = selectedMessage ? chat.messages.find((m) => m.id === selectedMessage) : null;
  const isSelectedOwn = selectedMsg?.user_id === currentUserId;

  if (chat.loading) {
    return (
      <Card className="dark:bg-tribe-card border-stone-300 dark:border-[#52575D] shadow-none">
        <CardContent className="p-4">
          <p className="text-center text-stone-600 dark:text-gray-300">{tr.loadingChat}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="dark:bg-tribe-card border-stone-300 dark:border-[#52575D] overflow-hidden flex flex-col h-[calc(100dvh-6rem)] shadow-none">
      {/* Chat Header */}
      <div className="bg-stone-100 dark:bg-tribe-mid px-4 py-3 border-b border-stone-300 dark:border-[#52575D] flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-stone-900 dark:text-white">{tr.groupChat}</h3>
            <p className="text-xs text-stone-600 dark:text-gray-300">
              {chat.messages.filter((m) => !m.deleted).length} {tr.messages}
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
        {chat.messages.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-4">💬</div>
            <h3 className="text-lg font-semibold text-stone-900 dark:text-white mb-2">{t('noMessagesYet')}</h3>
            <p className="text-stone-500 dark:text-gray-400 text-sm">{t('startConversation')}</p>
          </div>
        ) : (
          chat.messages.map((msg) => {
            const isOwnMessage = msg.user_id === currentUserId;
            if (msg.deleted) {
              return (
                <div key={msg.id} className="flex gap-2">
                  <div className="flex-1 p-3 bg-stone-100 dark:bg-tribe-mid rounded-lg opacity-50">
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
                <Link href={`/profile/${msg.user_id}`} className="flex-shrink-0">
                  <Avatar className="w-8 h-8 cursor-pointer hover:opacity-80">
                    <AvatarImage src={msg.user?.avatar_url || undefined} alt={msg.user?.name || ''} />
                    <AvatarFallback className="bg-[#C0E863] text-[#272D34] text-xs font-semibold">
                      {getInitials(msg.user?.name || 'U')}
                    </AvatarFallback>
                  </Avatar>
                </Link>
                <div className={`flex flex-col ${isOwnMessage ? 'items-end' : 'items-start'} max-w-[70%]`}>
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-xs font-medium text-stone-700 dark:text-gray-300">
                      {isOwnMessage ? tr.you : msg.user?.name}
                    </span>
                    <span className="text-xs text-stone-500 dark:text-gray-400">{formatTime(msg.created_at)}</span>
                  </div>
                  <div className="flex items-start gap-1">
                    <div
                      className={`rounded-2xl px-4 py-2 ${isOwnMessage ? 'bg-[#C0E863] text-[#272D34]' : 'bg-stone-200 dark:bg-tribe-mid text-stone-900 dark:text-white'}`}
                    >
                      <p className="text-sm whitespace-pre-wrap break-words">{msg.message}</p>
                    </div>
                    {(canModerate || isOwnMessage) && (
                      <button
                        onClick={(e) => {
                          const row = (e.currentTarget as HTMLElement).closest('.group') as HTMLElement;
                          if (selectedMessage === msg.id) dismissMenu();
                          else openMessageMenu(msg.id, row);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-stone-200 dark:hover:bg-tribe-mid rounded transition"
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
        <div ref={chat.messagesEndRef} />
      </div>

      {/* Fixed action menu */}
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
                  chat.setConfirmDeleteId(selectedMessage);
                  dismissMenu();
                }}
                className="w-full px-4 py-2.5 text-left text-sm hover:bg-stone-100 dark:hover:bg-tribe-mid flex items-center gap-2 text-red-600"
              >
                <Trash2 className="w-4 h-4" />
                {tr.delete}
              </button>
            )}
            {!isSelectedOwn && (
              <button
                onClick={() => {
                  chat.openReportModal(selectedMessage);
                  dismissMenu();
                }}
                className="w-full px-4 py-2.5 text-left text-sm hover:bg-stone-100 dark:hover:bg-tribe-mid flex items-center gap-2 text-orange-600"
              >
                <Flag className="w-4 h-4" />
                {tr.report}
              </button>
            )}
          </div>
        </>
      )}

      {/* Message Input */}
      <div className="p-4 bg-stone-50 dark:bg-tribe-mid border-t border-stone-300 dark:border-[#52575D] flex-shrink-0">
        <form onSubmit={handleSend} className="flex gap-2">
          <Input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder={tr.typeMessage}
            disabled={chat.sending}
            autoComplete="off"
            enterKeyHint="send"
            className="flex-1 px-4 py-2 bg-white dark:bg-[#404549] dark:border-[#52575D] rounded-full text-stone-900 dark:text-white placeholder-gray-500 focus:ring-[#C0E863] disabled:opacity-50"
          />
          <Button
            type="submit"
            disabled={!newMessage.trim() || chat.sending}
            size="icon"
            className="p-2 bg-[#C0E863] text-[#272D34] rounded-full hover:opacity-90"
          >
            <Send className="w-5 h-5" />
          </Button>
        </form>
      </div>

      <ConfirmDialog
        open={!!chat.confirmDeleteId}
        title={t('deleteMessage')}
        message={t('deleteThisMessage')}
        confirmLabel={tr.delete}
        cancelLabel={tr.cancel}
        variant="danger"
        onConfirm={() => {
          if (chat.confirmDeleteId) chat.deleteMessage(chat.confirmDeleteId);
          chat.setConfirmDeleteId(null);
        }}
        onCancel={() => chat.setConfirmDeleteId(null)}
      />

      {chat.showReportModal && (
        <ReportModal
          tr={tr}
          reportReason={chat.reportReason}
          reportDescription={chat.reportDescription}
          onReasonChange={chat.setReportReason}
          onDescriptionChange={chat.setReportDescription}
          onClose={() => chat.setShowReportModal(false)}
          onSubmit={chat.submitReport}
        />
      )}
    </Card>
  );
}
