'use client';

import { useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { showSuccess, showError } from '@/lib/toast';
import { getErrorMessage } from '@/lib/errorMessages';
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
      const { error } = await supabase.from('chat_messages').delete().eq('id', messageId);
      if (error) throw error;
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
      const { error } = await supabase
        .from('sessions')
        .update({ photo_verified: true, verified_by: userId, verified_at: new Date().toISOString() })
        .eq('id', sessionId);
      if (error) throw error;
      setters.setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, photo_verified: true } : s)));
      showSuccess('Photos verified');
    } catch (error: unknown) {
      showError(getErrorMessage(error, 'admin_action', language));
    }
  }

  async function unverifySessionPhotos(sessionId: string) {
    if (!confirm('Remove verification?')) return;
    try {
      const { error } = await supabase
        .from('sessions')
        .update({ photo_verified: false, verified_by: null, verified_at: null })
        .eq('id', sessionId);
      if (error) throw error;
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
      const { error } = await supabase.from('users').update({ banned: true }).eq('id', targetUserId);
      if (error) throw error;
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
      const { error } = await supabase.from('users').update({ banned: false }).eq('id', targetUserId);
      if (error) throw error;
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
      await supabase.from('chat_messages').delete().eq('user_id', targetUserId);
      await supabase.from('session_participants').delete().eq('user_id', targetUserId);
      await supabase.from('sessions').delete().eq('creator_id', targetUserId);
      const { error } = await supabase.from('users').delete().eq('id', targetUserId);
      if (error) throw error;
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
      const { error } = await supabase.from('reported_users').update({ status }).eq('id', reportId);
      if (error) throw error;
      setters.setReports((prev) => prev.map((r) => (r.id === reportId ? { ...r, status } : r)));
      showSuccess(`Report marked as ${status}`);
    } catch (error: unknown) {
      showError(getErrorMessage(error, 'admin_action', language));
    }
  }

  async function updateFeedbackStatus(feedbackId: string, status: string) {
    try {
      const { error } = await supabase.from('user_feedback').update({ status }).eq('id', feedbackId);
      if (error) throw error;
      setters.setFeedback((prev) => prev.map((f) => (f.id === feedbackId ? { ...f, status } : f)));
      showSuccess(`Feedback marked as ${status}`);
    } catch (error: unknown) {
      showError(getErrorMessage(error, 'admin_action', language));
    }
  }

  async function updateBugStatus(bugId: string, status: string) {
    try {
      const { error } = await supabase.from('bug_reports').update({ status }).eq('id', bugId);
      if (error) throw error;
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
