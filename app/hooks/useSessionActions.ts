/** Hook: useSessionActions — join, delete, share, waiver handlers */
'use client';

import { useState, useCallback } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import { joinSession } from '@/lib/sessions';
import { getErrorMessage } from '@/lib/errorMessages';
import { deleteSession as dalDeleteSession, updateUser } from '@/lib/dal';
import { logError } from '@/lib/logger';
import { showSuccess, showError, showInfo } from '@/lib/toast';
import { formatDistance, calculateDistance } from '@/lib/distance';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { User } from '@supabase/supabase-js';
import type { SessionWithRelations } from '@/lib/dal';
import type { UserProfile } from '../useHomeFeed';

interface UseSessionActionsArgs {
  supabase: SupabaseClient;
  user: User | null;
  userProfile: UserProfile | null;
  setUserProfile: (p: UserProfile | null) => void;
  userLocation: { latitude: number; longitude: number } | null;
  loadSessions: () => Promise<void>;
}

export function useSessionActions({
  supabase,
  user,
  userProfile,
  setUserProfile,
  userLocation,
  loadSessions,
}: UseSessionActionsArgs) {
  const { t, language } = useLanguage();
  const [showSafetyWaiver, setShowSafetyWaiver] = useState(false);
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    message: string;
    confirmLabel?: string;
    variant?: 'danger' | 'default';
    onConfirm: () => void;
  } | null>(null);

  const handleShareSession = useCallback(
    (session: SessionWithRelations) => {
      const shareText =
        language === 'es'
          ? `¡Únete a ${session.sport} el ${new Date(session.date + 'T00:00:00').toLocaleDateString('es-ES')}! Nunca entrenes solo 💪`
          : `Join me for ${session.sport} on ${new Date(session.date + 'T00:00:00').toLocaleDateString('en-US')}! Never train alone 💪`;
      const shareUrl = `${window.location.origin}/session/${session.id}`;
      if (navigator.share) {
        navigator.share({ title: 'Tribe - ' + session.sport, text: shareText, url: shareUrl }).catch(() => {});
      } else {
        navigator.clipboard.writeText(shareText + '\n' + shareUrl);
        showInfo(language === 'es' ? 'Enlace copiado' : 'Link copied!');
      }
    },
    [language]
  );

  const handleJoinSession = useCallback(
    async (sessionId: string) => {
      if (!user) return;
      if (userProfile && !userProfile.safety_waiver_accepted) {
        setPendingSessionId(sessionId);
        setShowSafetyWaiver(true);
        return;
      }
      try {
        const result = await joinSession({
          supabase,
          sessionId,
          userId: user.id,
          userName: userProfile?.name || user.email || 'Someone',
        });
        if (!result.success) {
          const errorMessages: Record<string, string> = {
            session_not_found: language === 'es' ? 'Sesión no encontrada' : 'Session not found',
            session_not_active:
              language === 'es' ? 'Esta sesión ya no está activa' : 'This session is no longer active',
            self_join:
              language === 'es' ? '¡No puedes unirte a tu propia sesión!' : 'You cannot join your own session!',
            already_joined: t('alreadyJoined'),
            capacity_full: t('sessionFullMsg'),
            invite_only:
              language === 'es'
                ? 'Esta es una sesión privada. Necesitas una invitación directa del anfitrión.'
                : 'This is a private session. You need a direct invitation from the host.',
          };
          showInfo(
            errorMessages[result.error!] ||
              result.error ||
              (language === 'es' ? 'No se pudo unir a la sesión' : 'Could not join session')
          );
          return;
        }
        showSuccess(
          result.status === 'pending'
            ? language === 'es'
              ? '¡Solicitud enviada! El anfitrión revisará tu perfil y decidirá.'
              : 'Request sent! The host will review your profile and decide.'
            : t('joinedSuccessfully')
        );
        await loadSessions();
      } catch (error: unknown) {
        logError(error, { action: 'handleJoinSession' });
        showError(getErrorMessage(error, 'join_session', language));
      }
    },
    [user, userProfile, supabase, language, t, loadSessions]
  );

  const handleWaiverAccepted = useCallback(async () => {
    if (!user) return;
    try {
      const result = await updateUser(supabase, user.id, {
        safety_waiver_accepted: true,
        safety_waiver_accepted_at: new Date().toISOString(),
      });
      if (!result.success) throw new Error(result.error);
      if (userProfile) setUserProfile({ ...userProfile, safety_waiver_accepted: true });
      setShowSafetyWaiver(false);
      if (pendingSessionId) {
        await handleJoinSession(pendingSessionId);
        setPendingSessionId(null);
      }
    } catch (error) {
      logError(error, { action: 'handleWaiverAccepted' });
      showError(getErrorMessage(error, 'accept_waiver', language));
    }
  }, [user, userProfile, supabase, pendingSessionId, handleJoinSession, setUserProfile, language]);

  const handleDeleteSession = useCallback(
    (id: string) => {
      setConfirmAction({
        title: t('delete'),
        message: t('deleteSessionConfirm'),
        confirmLabel: t('delete'),
        variant: 'danger',
        onConfirm: async () => {
          setConfirmAction(null);
          try {
            const result = await dalDeleteSession(supabase, id);
            if (!result.success) throw new Error(result.error);
            showSuccess(language === 'es' ? '¡Sesión eliminada exitosamente!' : 'Session deleted successfully!');
            await loadSessions();
          } catch (error: unknown) {
            showError(getErrorMessage(error, 'delete_session', language));
          }
        },
      });
    },
    [supabase, t, language, loadSessions]
  );

  const getDistanceText = useCallback(
    (session: SessionWithRelations): string | undefined => {
      if (!userLocation || !session.latitude || !session.longitude) return undefined;
      return formatDistance(
        calculateDistance(userLocation.latitude, userLocation.longitude, session.latitude, session.longitude),
        language
      );
    },
    [userLocation, language]
  );

  return {
    showSafetyWaiver,
    setShowSafetyWaiver,
    setPendingSessionId,
    confirmAction,
    setConfirmAction,
    handleShareSession,
    handleJoinSession,
    handleWaiverAccepted,
    handleDeleteSession,
    getDistanceText,
  };
}
