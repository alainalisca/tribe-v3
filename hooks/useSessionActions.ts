'use client';

import { useState } from 'react';
import { showSuccess, showError, showInfo } from '@/lib/toast';
import { getErrorMessage } from '@/lib/errorMessages';
import { celebrateJoin } from '@/lib/confetti';
import { joinSession } from '@/lib/sessions';
import { cancelSession, updateParticipantCount, deleteParticipantBySessionAndUser } from '@/lib/dal';
import type { UseSessionActionsParams, ConfirmAction, GuestData } from './sessionActionTypes';
import { getJoinErrorMessages } from './sessionActionTypes';
import {
  insertGuestParticipant,
  storeGuestLocally,
  notifyHostOfGuestJoin,
  removeGuestParticipant,
  checkGuestStatus,
  removeUserFromSession,
} from './sessionActionHelpers';

export type { Participant, UseSessionActionsParams } from './sessionActionTypes';

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
  const [guestData, setGuestData] = useState<GuestData>({ name: '', phone: '', email: '' });
  const [guestHasJoined, setGuestHasJoined] = useState(false);
  const [guestParticipantId, setGuestParticipantId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);

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
        const errorMessages = getJoinErrorMessages(language);
        showInfo(
          errorMessages[result.error!] ||
            result.error ||
            (language === 'es' ? 'No se pudo unir a la sesión' : 'Could not join session')
        );
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
      const data = await insertGuestParticipant(supabase, session, guestData);
      storeGuestLocally(session.id, guestData, data.guest_token);
      setGuestHasJoined(true);
      setGuestParticipantId(data.id);
      notifyHostOfGuestJoin(session, guestData.name);
      showSuccess(language === 'es' ? '¡Confirmado! Te esperamos' : 'Confirmed! See you there');
      setShowGuestModal(false);
      celebrateJoin();
      onSessionUpdated();
    } catch (error) {
      if (error instanceof Error && error.message === 'SESSION_FULL') {
        showError(language === 'es' ? 'Esta sesión está llena' : 'This session is full');
      } else {
        showError(getErrorMessage(error, 'join_session', language));
      }
    } finally {
      setJoiningAsGuest(false);
    }
  }

  function handleGuestLeave() {
    setConfirmAction({
      title: language === 'es' ? 'Salir de la sesión' : 'Leave session',
      message:
        language === 'es'
          ? '¿Seguro que quieres salir de esta sesión?'
          : 'Are you sure you want to leave this session?',
      onConfirm: () => doGuestLeave(),
    });
  }

  async function doGuestLeave() {
    try {
      const removed = await removeGuestParticipant(supabase, session, sessionId, language);
      if (!removed) return;
      setGuestHasJoined(false);
      setGuestParticipantId(null);
      showSuccess(language === 'es' ? 'Has salido de la sesión' : 'You have left the session');
      onSessionUpdated();
    } catch (error) {
      showError(getErrorMessage(error, 'join_session', language));
    }
  }

  function handleLeave() {
    setConfirmAction({
      title: language === 'es' ? 'Salir de la sesión' : 'Leave session',
      message:
        language === 'es'
          ? '¿Seguro que quieres salir de esta sesión?'
          : 'Are you sure you want to leave this session?',
      onConfirm: () => doLeave(),
    });
  }

  async function doLeave() {
    if (!user) return;
    try {
      await removeUserFromSession(supabase, session, user.id, language, onNavigate);
    } catch (error) {
      showError(getErrorMessage(error, 'join_session', language));
    }
  }

  function handleCancel() {
    setConfirmAction({
      title: language === 'es' ? 'Cancelar sesión' : 'Cancel session',
      message:
        language === 'es'
          ? '¿Cancelar esta sesión? Todos los participantes serán notificados. Esto no se puede deshacer.'
          : 'Cancel this session? All participants will be notified. This cannot be undone.',
      onConfirm: () => doCancel(),
    });
  }

  async function doCancel() {
    try {
      const result = await cancelSession(supabase, session.id);
      if (!result.success) throw new Error(result.error);
      showSuccess(language === 'es' ? 'Sesión cancelada' : 'Session cancelled');
      onNavigate('/sessions');
    } catch (error) {
      showError(getErrorMessage(error, 'delete_session', language));
    }
  }

  function handleKickUser(userId: string, userName: string) {
    setConfirmAction({
      title: language === 'es' ? 'Eliminar participante' : 'Remove participant',
      message: language === 'es' ? `¿Eliminar a ${userName} de esta sesión?` : `Remove ${userName} from this session?`,
      onConfirm: () => doKickUser(userId),
    });
  }

  async function doKickUser(kickUserId: string) {
    try {
      const deleteResult = await deleteParticipantBySessionAndUser(supabase, session.id, kickUserId);
      if (!deleteResult.success) throw new Error(deleteResult.error);
      const newCount = Math.max(0, (session.current_participants ?? 0) - 1);
      const updateResult = await updateParticipantCount(supabase, session.id, newCount);
      if (!updateResult.success) throw new Error(updateResult.error);
      setParticipants((prev) => prev.filter((p) => p.user_id !== kickUserId));
      setSession((prev) =>
        prev ? { ...prev, current_participants: Math.max(0, (prev.current_participants ?? 0) - 1) } : prev
      );
      showSuccess(language === 'es' ? 'Usuario eliminado de la sesión' : 'User removed from session');
    } catch (error) {
      showError(getErrorMessage(error, 'join_session', language));
    }
  }

  function checkGuestParticipation(paramId: string) {
    checkGuestStatus(supabase, paramId).then(({ hasJoined, participantId }) => {
      setGuestHasJoined(hasJoined);
      setGuestParticipantId(participantId);
    });
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
    confirmAction,
    setConfirmAction,
    handleJoin,
    handleGuestJoin,
    handleGuestLeave,
    handleLeave,
    handleCancel,
    handleKickUser,
    checkGuestParticipation,
  };
}
