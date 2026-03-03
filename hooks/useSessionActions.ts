'use client';

import { logError } from '@/lib/logger';
import { useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { showSuccess, showError, showInfo } from '@/lib/toast';
import { getErrorMessage } from '@/lib/errorMessages';
import { celebrateJoin } from '@/lib/confetti';
import { joinSession } from '@/lib/sessions';
import { cancelSession, fetchConfirmedCount } from '@/lib/dal';
import type { Session } from '@/lib/database.types';

interface Participant {
  user_id: string | null;
  status: string | null;
  is_guest?: boolean | null;
  guest_name?: string | null;
  user?: { id: string; name: string; avatar_url: string | null } | null;
}

interface UseSessionActionsParams {
  supabase: SupabaseClient;
  sessionId: string;
  session: Session;
  user: { id: string; email?: string; user_metadata?: { name?: string } } | null;
  language: 'en' | 'es';
  onSessionUpdated: () => Promise<void>;
  onNavigate: (path: string) => void;
  setParticipants: React.Dispatch<React.SetStateAction<Participant[]>>;
  setSession: React.Dispatch<React.SetStateAction<Session | null>>;
}

export function useSessionActions({
  supabase,
  sessionId,
  session,
  user,
  language,
  onSessionUpdated,
  onNavigate,
  setParticipants,
  setSession,
}: UseSessionActionsParams) {
  const [joining, setJoining] = useState(false);
  const [joiningAsGuest, setJoiningAsGuest] = useState(false);
  const [showGuestModal, setShowGuestModal] = useState(false);
  const [guestData, setGuestData] = useState({ name: '', phone: '', email: '' });
  const [guestHasJoined, setGuestHasJoined] = useState(false);
  const [guestParticipantId, setGuestParticipantId] = useState<string | null>(null);

  async function handleJoin() {
    if (!user) {
      setShowGuestModal(true);
      return;
    }
    if (joining) return;
    setJoining(true);
    try {
      const result = await joinSession({
        supabase,
        sessionId: session.id,
        userId: user.id,
        userName: user.user_metadata?.name || user.email || 'Someone',
      });
      if (!result.success) {
        const errorMessages: Record<string, string> = {
          session_not_found: language === 'es' ? 'Sesión no encontrada' : 'Session not found',
          session_not_active: language === 'es' ? 'Esta sesión ya no está activa' : 'This session is no longer active',
          self_join: language === 'es' ? '¡No puedes unirte a tu propia sesión!' : 'You cannot join your own session!',
          already_joined: language === 'es' ? '¡Ya te uniste a esta sesión!' : 'You already joined this session!',
          capacity_full: language === 'es' ? 'Esta sesión está llena' : 'This session is full',
          invite_only:
            language === 'es'
              ? 'Sesión privada. Necesitas una invitación del organizador.'
              : 'This is a private session. You need a direct invitation from the host.',
        };
        showInfo(errorMessages[result.error!] || result.error || 'Could not join session');
        return;
      }
      if (result.status === 'pending') {
        showSuccess(
          language === 'es'
            ? '¡Solicitud enviada! El organizador revisará tu perfil.'
            : 'Request sent! The host will review your profile and decide.'
        );
      } else {
        celebrateJoin();
        showSuccess(
          language === 'es' ? '¡Estás dentro! Nunca entrenarás solo.' : "You're in! You'll never train alone."
        );
      }
      await onSessionUpdated();
    } catch (error) {
      showError(getErrorMessage(error, 'join_session', language));
    } finally {
      setJoining(false);
    }
  }

  async function handleGuestJoin() {
    if (!guestData.name || !guestData.phone) {
      showError(language === 'es' ? 'Completa nombre y teléfono' : 'Fill in name and phone');
      return;
    }
    try {
      setJoiningAsGuest(true);
      const countResult = await fetchConfirmedCount(supabase, session.id);
      if (countResult.success && (countResult.data ?? 0) >= session.max_participants) {
        showError(language === 'es' ? 'Esta sesión está llena' : 'This session is full');
        return;
      }
      const { data, error } = await supabase
        .from('session_participants')
        .insert({
          session_id: session.id,
          user_id: null,
          is_guest: true,
          guest_name: guestData.name,
          guest_phone: guestData.phone,
          guest_email: guestData.email || null,
          status: 'confirmed',
        })
        .select('id')
        .single();
      if (error) throw error;
      await supabase
        .from('sessions')
        .update({ current_participants: (session.current_participants ?? 0) + 1 })
        .eq('id', session.id);
      localStorage.setItem(`guest_phone_${session.id}`, guestData.phone);
      if (guestData.email) localStorage.setItem(`guest_email_${session.id}`, guestData.email);
      setGuestHasJoined(true);
      setGuestParticipantId(data.id);
      fetch('/api/notifications/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: session.creator_id,
          title: 'New Training Partner!',
          body: `${guestData.name} (guest) joined your ${session.sport} session`,
          url: `/session/${session.id}`,
          data: { sessionId: session.id, type: 'guest_join' },
        }),
      }).catch((err) => logError(err, { action: 'handleGuestJoin', sessionId: session.id }));
      showSuccess(language === 'es' ? '¡Confirmado! Te esperamos' : 'Confirmed! See you there');
      setShowGuestModal(false);
      celebrateJoin();
      onSessionUpdated();
    } catch (error) {
      showError(getErrorMessage(error, 'join_session', language));
    } finally {
      setJoiningAsGuest(false);
    }
  }

  async function handleGuestLeave() {
    if (
      !confirm(
        language === 'es' ? '¿Seguro que quieres salir de esta sesión?' : 'Are you sure you want to leave this session?'
      )
    )
      return;
    const storedGuestPhone = localStorage.getItem(`guest_phone_${sessionId}`);
    if (!storedGuestPhone) {
      showError(language === 'es' ? 'No se encontró la información del invitado' : 'Guest information not found');
      return;
    }
    try {
      const { error } = await supabase
        .from('session_participants')
        .delete()
        .eq('session_id', sessionId)
        .eq('is_guest', true)
        .eq('guest_phone', storedGuestPhone);
      if (error) throw error;
      await supabase
        .from('sessions')
        .update({ current_participants: Math.max(0, (session.current_participants ?? 0) - 1) })
        .eq('id', session.id);
      localStorage.removeItem(`guest_phone_${sessionId}`);
      localStorage.removeItem(`guest_email_${sessionId}`);
      setGuestHasJoined(false);
      setGuestParticipantId(null);
      showSuccess(language === 'es' ? 'Has salido de la sesión' : 'You have left the session');
      onSessionUpdated();
    } catch (error) {
      showError(getErrorMessage(error, 'join_session', language));
    }
  }

  async function handleLeave() {
    if (
      !confirm(
        language === 'es' ? '¿Seguro que quieres salir de esta sesión?' : 'Are you sure you want to leave this session?'
      )
    )
      return;
    if (!user) return;
    try {
      const { error } = await supabase
        .from('session_participants')
        .delete()
        .eq('session_id', session.id)
        .eq('user_id', user.id);
      if (error) throw error;
      await supabase
        .from('sessions')
        .update({ current_participants: (session.current_participants ?? 0) - 1 })
        .eq('id', session.id);
      showSuccess(language === 'es' ? 'Has salido de la sesión' : 'You have left the session');
      onNavigate('/sessions');
    } catch (error) {
      showError(getErrorMessage(error, 'join_session', language));
    }
  }

  async function handleCancel() {
    if (
      !confirm(
        language === 'es'
          ? '¿Cancelar esta sesión? Todos los participantes serán notificados. Esto no se puede deshacer.'
          : 'Cancel this session? All participants will be notified. This cannot be undone.'
      )
    )
      return;
    try {
      const result = await cancelSession(supabase, session.id);
      if (!result.success) throw new Error(result.error);
      showSuccess(language === 'es' ? 'Sesión cancelada' : 'Session cancelled');
      onNavigate('/sessions');
    } catch (error) {
      showError(getErrorMessage(error, 'delete_session', language));
    }
  }

  async function handleKickUser(userId: string, userName: string) {
    if (
      !confirm(language === 'es' ? `¿Eliminar a ${userName} de esta sesión?` : `Remove ${userName} from this session?`)
    )
      return;
    try {
      const { error: deleteError } = await supabase
        .from('session_participants')
        .delete()
        .eq('session_id', session.id)
        .eq('user_id', userId);
      if (deleteError) throw deleteError;
      await supabase
        .from('sessions')
        .update({ current_participants: Math.max(0, (session.current_participants ?? 0) - 1) })
        .eq('id', session.id);
      setParticipants((prev) => prev.filter((p) => p.user_id !== userId));
      setSession((prev) =>
        prev ? { ...prev, current_participants: Math.max(0, (prev.current_participants ?? 0) - 1) } : prev
      );
      showSuccess(language === 'es' ? 'Usuario eliminado de la sesión' : 'User removed from session');
    } catch (error) {
      showError(getErrorMessage(error, 'join_session', language));
    }
  }

  function checkGuestParticipation(paramId: string) {
    const storedGuestPhone = localStorage.getItem(`guest_phone_${paramId}`);
    const storedGuestEmail = localStorage.getItem(`guest_email_${paramId}`);
    if (!storedGuestPhone && !storedGuestEmail) return;

    (async () => {
      try {
        let query = supabase.from('session_participants').select('id').eq('session_id', paramId).eq('is_guest', true);
        if (storedGuestPhone) query = query.eq('guest_phone', storedGuestPhone);
        else if (storedGuestEmail) query = query.eq('guest_email', storedGuestEmail);
        const { data, error } = await query.single();
        if (!error && data) {
          setGuestHasJoined(true);
          setGuestParticipantId(data.id);
        } else {
          localStorage.removeItem(`guest_phone_${paramId}`);
          localStorage.removeItem(`guest_email_${paramId}`);
          setGuestHasJoined(false);
          setGuestParticipantId(null);
        }
      } catch (error) {
        logError(error, { action: 'checkGuestParticipation', sessionId: paramId });
      }
    })();
  }

  return {
    joining,
    joiningAsGuest,
    showGuestModal,
    setShowGuestModal,
    guestData,
    setGuestData,
    guestHasJoined,
    guestParticipantId,
    handleJoin,
    handleGuestJoin,
    handleGuestLeave,
    handleLeave,
    handleCancel,
    handleKickUser,
    checkGuestParticipation,
  };
}
