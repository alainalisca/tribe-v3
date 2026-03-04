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
import type { AdminUser, AdminReport, AdminFeedback, AdminBug, AdminSession, AdminMessage } from './types';

interface Setters {
  setUsers: React.Dispatch<React.SetStateAction<AdminUser[]>>;
  setReports: React.Dispatch<React.SetStateAction<AdminReport[]>>;
  setFeedback: React.Dispatch<React.SetStateAction<AdminFeedback[]>>;
  setBugs: React.Dispatch<React.SetStateAction<AdminBug[]>>;
  setSessions: React.Dispatch<React.SetStateAction<AdminSession[]>>;
  setMessages: React.Dispatch<React.SetStateAction<AdminMessage[]>>;
}

export function useAdminActions(
  supabase: SupabaseClient,
  userId: string | undefined,
  language: 'en' | 'es',
  setters: Setters
) {
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  async function deleteMessage(messageId: string) {
    if (!confirm('Delete this message?')) return;
    setActionLoading(messageId);
    try {
      const result = await deleteChatMessage(supabase, messageId);
      if (!result.success) throw new Error(result.error);
      setters.setMessages((prev) => prev.filter((m) => m.id !== messageId));
      showSuccess('Message deleted');
    } catch (error: unknown) {
      showError(getErrorMessage(error, 'admin_action', language));
    } finally {
      setActionLoading(null);
    }
  }

  async function verifySessionPhotos(sessionId: string) {
    if (!confirm('Verify these location photos as authentic?')) return;
    try {
      const result = await updateSession(supabase, sessionId, {
        photo_verified: true,
        verified_by: userId,
        verified_at: new Date().toISOString(),
      });
      if (!result.success) throw new Error(result.error);
      setters.setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, photo_verified: true } : s)));
      showSuccess('Photos verified');
    } catch (error: unknown) {
      showError(getErrorMessage(error, 'admin_action', language));
    }
  }

  async function unverifySessionPhotos(sessionId: string) {
    if (!confirm('Remove verification?')) return;
    try {
      const result = await updateSession(supabase, sessionId, {
        photo_verified: false,
        verified_by: null,
        verified_at: null,
      });
      if (!result.success) throw new Error(result.error);
      setters.setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, photo_verified: false } : s)));
      showSuccess('Verification removed');
    } catch (error: unknown) {
      showError(getErrorMessage(error, 'admin_action', language));
    }
  }

  async function banUser(targetUserId: string) {
    if (!confirm('Ban this user?')) return;
    setActionLoading(targetUserId);
    try {
      const result = await updateUser(supabase, targetUserId, { banned: true });
      if (!result.success) throw new Error(result.error);
      setters.setUsers((prev) => prev.map((u) => (u.id === targetUserId ? { ...u, banned: true } : u)));
      showSuccess('User banned');
    } catch (error: unknown) {
      showError(getErrorMessage(error, 'admin_action', language));
    } finally {
      setActionLoading(null);
    }
  }

  async function unbanUser(targetUserId: string) {
    if (!confirm('Unban this user?')) return;
    setActionLoading(targetUserId);
    try {
      const result = await updateUser(supabase, targetUserId, { banned: false });
      if (!result.success) throw new Error(result.error);
      setters.setUsers((prev) => prev.map((u) => (u.id === targetUserId ? { ...u, banned: false } : u)));
      showSuccess('User unbanned');
    } catch (error: unknown) {
      showError(getErrorMessage(error, 'admin_action', language));
    } finally {
      setActionLoading(null);
    }
  }

  async function deleteUser(targetUserId: string) {
    if (!confirm('DELETE user and ALL data?')) return;
    setActionLoading(targetUserId);
    try {
      await deleteChatMessagesByUser(supabase, targetUserId);
      await deleteParticipantsByUser(supabase, targetUserId);
      await deleteSessionsByCreator(supabase, targetUserId);
      const result = await dalDeleteUser(supabase, targetUserId);
      if (!result.success) throw new Error(result.error);
      setters.setUsers((prev) => prev.filter((u) => u.id !== targetUserId));
      showSuccess('User deleted');
    } catch (error: unknown) {
      showError(getErrorMessage(error, 'admin_action', language));
    } finally {
      setActionLoading(null);
    }
  }

  async function updateReportStatus(reportId: string, status: string) {
    try {
      const result = await dalUpdateReportStatus(supabase, reportId, status);
      if (!result.success) throw new Error(result.error);
      setters.setReports((prev) => prev.map((r) => (r.id === reportId ? { ...r, status } : r)));
      showSuccess(`Report marked as ${status}`);
    } catch (error: unknown) {
      showError(getErrorMessage(error, 'admin_action', language));
    }
  }

  async function updateFeedbackStatus(feedbackId: string, status: string) {
    try {
      const result = await dalUpdateFeedbackStatus(supabase, feedbackId, status);
      if (!result.success) throw new Error(result.error);
      setters.setFeedback((prev) => prev.map((f) => (f.id === feedbackId ? { ...f, status } : f)));
      showSuccess(`Feedback marked as ${status}`);
    } catch (error: unknown) {
      showError(getErrorMessage(error, 'admin_action', language));
    }
  }

  async function updateBugStatus(bugId: string, status: string) {
    try {
      const result = await dalUpdateBugStatus(supabase, bugId, status);
      if (!result.success) throw new Error(result.error);
      setters.setBugs((prev) => prev.map((b) => (b.id === bugId ? { ...b, status } : b)));
      showSuccess(`Bug marked as ${status}`);
    } catch (error: unknown) {
      showError(getErrorMessage(error, 'admin_action', language));
    }
  }

  return {
    actionLoading,
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
