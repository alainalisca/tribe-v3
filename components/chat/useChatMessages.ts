'use client';

import { useState, useEffect, useRef } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import { showError, showSuccess, showInfo } from '@/lib/toast';
import { getErrorMessage } from '@/lib/errorMessages';

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
      const { data, error } = await supabase
        .from('chat_messages')
        .select(
          `id, user_id, message, created_at, deleted,
          user:users!chat_messages_user_id_fkey (name, avatar_url)`
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
    const channel = supabase
      .channel(`session:${sessionId}:messages`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `session_id=eq.${sessionId}` },
        async (payload) => {
          const { data: userData } = await supabase
            .from('users')
            .select('name, avatar_url')
            .eq('id', payload.new.user_id)
            .single();

          const messageWithUser: ChatMessage = {
            id: payload.new.id,
            user_id: payload.new.user_id,
            message: payload.new.message,
            created_at: payload.new.created_at,
            deleted: payload.new.deleted || false,
            user: userData || { name: 'Unknown', avatar_url: null },
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

  async function sendMessage(messageText: string) {
    if (!messageText.trim() || sending) return;
    try {
      setSending(true);
      const { error } = await supabase
        .from('chat_messages')
        .insert({ session_id: sessionId, user_id: currentUserId, message: messageText });
      if (error) throw error;

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
        .update({ deleted: true, deleted_by: currentUserId, deleted_at: new Date().toISOString() })
        .eq('id', messageId);
      if (error) throw error;
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
