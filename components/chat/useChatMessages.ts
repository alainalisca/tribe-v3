'use client';

import { useState, useEffect, useRef } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import { showError, showSuccess, showInfo } from '@/lib/toast';
import { getErrorMessage } from '@/lib/errorMessages';
import {
  fetchUserName,
  fetchUserProfileMaybe,
  insertReportedMessage,
  fetchChatMessagesWithUsers,
  insertChatMessage,
  softDeleteChatMessage,
  fetchParticipantUserIdsForSession,
} from '@/lib/dal';

export interface ChatMessage {
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

interface UseChatMessagesParams {
  supabase: SupabaseClient;
  sessionId: string;
  currentUserId: string;
  language: 'en' | 'es';
}

export function useChatMessages({ supabase, sessionId, currentUserId, language }: UseChatMessagesParams) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportDescription, setReportDescription] = useState('');
  const [reportingMessageId, setReportingMessageId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadMessages();
    const cleanup = subscribeToMessages();
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, [sessionId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function loadMessages() {
    try {
      const result = await fetchChatMessagesWithUsers(supabase, sessionId);
      if (!result.success) throw new Error(result.error);
      const data = result.data as Array<{
        id: string;
        user_id: string;
        message: string;
        created_at: string;
        deleted: boolean;
        user: { name: string; avatar_url: string | null } | Array<{ name: string; avatar_url: string | null }>;
      }>;
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
    const channel = supabase
      .channel(`session:${sessionId}:messages`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `session_id=eq.${sessionId}` },
        async (payload) => {
          const userResult = await fetchUserProfileMaybe(supabase, payload.new.user_id, 'name, avatar_url');
          const userData =
            userResult.success && userResult.data
              ? {
                  name: (userResult.data.name as string) || 'Unknown',
                  avatar_url: userResult.data.avatar_url as string | null,
                }
              : { name: 'Unknown', avatar_url: null };

          const messageWithUser: ChatMessage = {
            id: payload.new.id,
            user_id: payload.new.user_id,
            message: payload.new.message,
            created_at: payload.new.created_at,
            deleted: payload.new.deleted || false,
            user: userData,
          };

          setMessages((prev) => [...prev, messageWithUser]);

          if (payload.new.user_id !== currentUserId) {
            try {
              const audio = new Audio('/sounds/notification.mp3');
              audio.volume = 0.5;
              audio.play().catch(() => {});
            } catch {
              // Audio play is best-effort
            }
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
        { event: 'UPDATE', schema: 'public', table: 'chat_messages', filter: `session_id=eq.${sessionId}` },
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

  async function sendMessage(messageText: string): Promise<boolean> {
    if (!messageText.trim() || sending) return false;
    try {
      setSending(true);
      const insertResult = await insertChatMessage(supabase, {
        session_id: sessionId,
        user_id: currentUserId,
        message: messageText,
      });
      if (!insertResult.success) throw new Error(insertResult.error);

      const participantsResult = await fetchParticipantUserIdsForSession(supabase, sessionId, currentUserId);
      const participantUserIds = participantsResult.success ? (participantsResult.data ?? []) : [];
      const senderResult = await fetchUserName(supabase, currentUserId);
      const sender = senderResult.success ? { name: senderResult.data } : null;
      if (participantUserIds.length > 0) {
        for (const userId of participantUserIds) {
          fetch('/api/notifications/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId,
              title: 'New message in Tribe',
              body: `${sender?.name || 'Someone'}: ${messageText.slice(0, 50)}`,
              url: `/session/${sessionId}/chat`,
            }),
          }).catch(() => {});
        }
      }
      return true;
    } catch (error) {
      logError(error, { action: 'sendMessage', sessionId });
      showError(getErrorMessage(error, 'send_message', language));
      return false;
    } finally {
      setSending(false);
    }
  }

  async function deleteMessage(messageId: string) {
    try {
      const result = await softDeleteChatMessage(supabase, messageId, currentUserId);
      if (!result.success) throw new Error(result.error);
      showSuccess(language === 'es' ? 'Mensaje eliminado' : 'Message deleted');
    } catch (error) {
      logError(error, { action: 'deleteMessage', messageId });
      showError(getErrorMessage(error, 'send_message', language));
    }
  }

  function openReportModal(messageId: string) {
    setReportingMessageId(messageId);
    setShowReportModal(true);
  }

  async function submitReport() {
    if (!reportReason) {
      showInfo(language === 'es' ? 'Selecciona una razón' : 'Please select a reason');
      return;
    }
    try {
      const result = await insertReportedMessage(supabase, {
        message_id: reportingMessageId,
        reporter_id: currentUserId,
        session_id: sessionId,
        reason: reportReason,
        description: reportDescription,
      });
      if (!result.success) throw new Error(result.error);
      showSuccess(
        language === 'es'
          ? 'Mensaje reportado. Los administradores lo revisarán.'
          : 'Message reported. Admins will review it.'
      );
      setShowReportModal(false);
      setReportReason('');
      setReportDescription('');
      setReportingMessageId(null);
    } catch (error) {
      logError(error, { action: 'submitReport', messageId: reportingMessageId ?? undefined });
      showError(getErrorMessage(error, 'send_message', language));
    }
  }

  return {
    messages,
    loading,
    sending,
    messagesEndRef,
    showReportModal,
    reportReason,
    reportDescription,
    confirmDeleteId,
    setShowReportModal,
    setReportReason,
    setReportDescription,
    setConfirmDeleteId,
    sendMessage,
    deleteMessage,
    openReportModal,
    submitReport,
  };
}
