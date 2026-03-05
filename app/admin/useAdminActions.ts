'use client';

import { useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { showSuccess, showError } from '@/lib/toast';
import { getErrorMessage } from '@/lib/errorMessages';
import {
  deleteChatMessage,
  deleteChatMessagesByUser,
  deleteParticipantsByUser,
  deleteSessionsByCreator,
  deleteUser as dalDeleteUser,
  updateUser,
  updateSession,
  updateReportStatus as dalUpdateReportStatus,
  updateFeedbackStatus as dalUpdateFeedbackStatus,
  updateBugStatus as dalUpdateBugStatus,
} from '@/lib/dal';
import type { TranslationKey } from '@/lib/translations';
import type { AdminUser, AdminReport, AdminFeedback, AdminBug, AdminSession, AdminMessage } from './types';

interface Setters {
  setUsers: React.Dispatch<React.SetStateAction<AdminUser[]>>;
  setReports: React.Dispatch<React.SetStateAction<AdminReport[]>>;
  setFeedback: React.Dispatch<React.SetStateAction<AdminFeedback[]>>;
  setBugs: React.Dispatch<React.SetStateAction<AdminBug[]>>;
  setSessions: React.Dispatch<React.SetStateAction<AdminSession[]>>;
  setMessages: React.Dispatch<React.SetStateAction<AdminMessage[]>>;
}

export interface ConfirmActionState {
  title: string;
  message: string;
  confirmLabel?: string;
  variant?: 'danger' | 'default';
  onConfirm: () => void;
}

export function useAdminActions(
  supabase: SupabaseClient,
  userId: string | undefined,
  language: 'en' | 'es',
  t: (key: TranslationKey) => string,
  setters: Setters
) {
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmActionState | null>(null);

  function deleteMessage(messageId: string) {
    setConfirmAction({
      title: t('deleteMessage'),
      message: t('deleteMessageConfirm'),
      confirmLabel: t('delete'),
      variant: 'danger',
      onConfirm: async () => {
        setConfirmAction(null);
        setActionLoading(messageId);
        try {
          const result = await deleteChatMessage(supabase, messageId);
          if (!result.success) throw new Error(result.error);
          setters.setMessages((prev) => prev.filter((m) => m.id !== messageId));
          showSuccess(language === 'es' ? 'Mensaje eliminado' : 'Message deleted');
        } catch (error: unknown) {
          showError(getErrorMessage(error, 'admin_action', language));
        } finally {
          setActionLoading(null);
        }
      },
    });
  }

  function verifySessionPhotos(sessionId: string) {
    setConfirmAction({
      title: t('verifyPhotos'),
      message: t('verifyPhotosConfirm'),
      confirmLabel: t('confirmAction'),
      variant: 'default',
      onConfirm: async () => {
        setConfirmAction(null);
        try {
          const result = await updateSession(supabase, sessionId, {
            photo_verified: true,
            verified_by: userId,
            verified_at: new Date().toISOString(),
          });
          if (!result.success) throw new Error(result.error);
          setters.setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, photo_verified: true } : s)));
          showSuccess(language === 'es' ? 'Fotos verificadas' : 'Photos verified');
        } catch (error: unknown) {
          showError(getErrorMessage(error, 'admin_action', language));
        }
      },
    });
  }

  function unverifySessionPhotos(sessionId: string) {
    setConfirmAction({
      title: t('removeVerification'),
      message: t('removeVerificationConfirm'),
      confirmLabel: t('confirmAction'),
      variant: 'default',
      onConfirm: async () => {
        setConfirmAction(null);
        try {
          const result = await updateSession(supabase, sessionId, {
            photo_verified: false,
            verified_by: null,
            verified_at: null,
          });
          if (!result.success) throw new Error(result.error);
          setters.setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, photo_verified: false } : s)));
          showSuccess(language === 'es' ? 'Verificación eliminada' : 'Verification removed');
        } catch (error: unknown) {
          showError(getErrorMessage(error, 'admin_action', language));
        }
      },
    });
  }

  function banUser(targetUserId: string) {
    setConfirmAction({
      title: t('banUser'),
      message: t('banUserConfirm'),
      confirmLabel: t('banUser'),
      variant: 'danger',
      onConfirm: async () => {
        setConfirmAction(null);
        setActionLoading(targetUserId);
        try {
          const result = await updateUser(supabase, targetUserId, { banned: true });
          if (!result.success) throw new Error(result.error);
          setters.setUsers((prev) => prev.map((u) => (u.id === targetUserId ? { ...u, banned: true } : u)));
          showSuccess(language === 'es' ? 'Usuario baneado' : 'User banned');
        } catch (error: unknown) {
          showError(getErrorMessage(error, 'admin_action', language));
        } finally {
          setActionLoading(null);
        }
      },
    });
  }

  function unbanUser(targetUserId: string) {
    setConfirmAction({
      title: t('unbanUser'),
      message: t('unbanUserConfirm'),
      confirmLabel: t('unbanUser'),
      variant: 'default',
      onConfirm: async () => {
        setConfirmAction(null);
        setActionLoading(targetUserId);
        try {
          const result = await updateUser(supabase, targetUserId, { banned: false });
          if (!result.success) throw new Error(result.error);
          setters.setUsers((prev) => prev.map((u) => (u.id === targetUserId ? { ...u, banned: false } : u)));
          showSuccess(language === 'es' ? 'Usuario desbaneado' : 'User unbanned');
        } catch (error: unknown) {
          showError(getErrorMessage(error, 'admin_action', language));
        } finally {
          setActionLoading(null);
        }
      },
    });
  }

  function deleteUser(targetUserId: string) {
    setConfirmAction({
      title: t('deleteUserBtn'),
      message: t('deleteUserConfirm'),
      confirmLabel: t('delete'),
      variant: 'danger',
      onConfirm: async () => {
        setConfirmAction(null);
        setActionLoading(targetUserId);
        try {
          await deleteChatMessagesByUser(supabase, targetUserId);
          await deleteParticipantsByUser(supabase, targetUserId);
          await deleteSessionsByCreator(supabase, targetUserId);
          const result = await dalDeleteUser(supabase, targetUserId);
          if (!result.success) throw new Error(result.error);
          setters.setUsers((prev) => prev.filter((u) => u.id !== targetUserId));
          showSuccess(language === 'es' ? 'Usuario eliminado' : 'User deleted');
        } catch (error: unknown) {
          showError(getErrorMessage(error, 'admin_action', language));
        } finally {
          setActionLoading(null);
        }
      },
    });
  }

  async function updateReportStatus(reportId: string, status: string) {
    try {
      const result = await dalUpdateReportStatus(supabase, reportId, status);
      if (!result.success) throw new Error(result.error);
      setters.setReports((prev) => prev.map((r) => (r.id === reportId ? { ...r, status } : r)));
      showSuccess(language === 'es' ? `Reporte marcado como ${status}` : `Report marked as ${status}`);
    } catch (error: unknown) {
      showError(getErrorMessage(error, 'admin_action', language));
    }
  }

  async function updateFeedbackStatus(feedbackId: string, status: string) {
    try {
      const result = await dalUpdateFeedbackStatus(supabase, feedbackId, status);
      if (!result.success) throw new Error(result.error);
      setters.setFeedback((prev) => prev.map((f) => (f.id === feedbackId ? { ...f, status } : f)));
      showSuccess(language === 'es' ? `Comentario marcado como ${status}` : `Feedback marked as ${status}`);
    } catch (error: unknown) {
      showError(getErrorMessage(error, 'admin_action', language));
    }
  }

  async function updateBugStatus(bugId: string, status: string) {
    try {
      const result = await dalUpdateBugStatus(supabase, bugId, status);
      if (!result.success) throw new Error(result.error);
      setters.setBugs((prev) => prev.map((b) => (b.id === bugId ? { ...b, status } : b)));
      showSuccess(language === 'es' ? `Bug marcado como ${status}` : `Bug marked as ${status}`);
    } catch (error: unknown) {
      showError(getErrorMessage(error, 'admin_action', language));
    }
  }

  return {
    actionLoading,
    confirmAction,
    setConfirmAction,
    deleteMessage,
    verifySessionPhotos,
    unverifySessionPhotos,
    banUser,
    unbanUser,
    deleteUser,
    updateReportStatus,
    updateFeedbackStatus,
    updateBugStatus,
  };
}
