'use client';

/**
 * BlockReportControls — the single block-and-report mechanism used across the
 * app. Extracted from the profile page (app/profile/[userId]/ProfilePageClient)
 * so the athlete profile and the instructor storefront call one implementation
 * instead of two. Writes to the existing blocked_users / reported_users tables
 * through the existing DAL (lib/dal/social + lib/dal/users).
 *
 * Self-gating: renders nothing unless a signed-in viewer is looking at someone
 * else, so callers can drop it in unconditionally.
 */

import { useEffect, useState } from 'react';
import { Shield, Flag } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/LanguageContext';
import { blockUser, unblockUser, reportUser, fetchBlockedStatus } from '@/lib/dal';
import { showSuccess, showError, showInfo } from '@/lib/toast';
import { getErrorMessage } from '@/lib/errorMessages';
import { logError } from '@/lib/logger';
import { getProfileTranslations } from '@/app/profile/[userId]/translations';
import ReportUserModal from '@/components/ReportUserModal';
import ConfirmDialog from '@/components/ConfirmDialog';

interface BlockReportControlsProps {
  /** The user being viewed (the block/report target). */
  targetUserId: string;
  /** The signed-in viewer, or null if logged out. */
  viewerId: string | null;
  /** Optional wrapper classes for layout placement. */
  className?: string;
}

interface ConfirmState {
  title: string;
  message: string;
  confirmLabel?: string;
  variant?: 'danger' | 'default';
  onConfirm: () => void;
}

export default function BlockReportControls({ targetUserId, viewerId, className }: BlockReportControlsProps) {
  const { language } = useLanguage();
  const t = getProfileTranslations(language);
  const [supabase] = useState(() => createClient());

  const [isBlocked, setIsBlocked] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportDescription, setReportDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmState | null>(null);

  const active = !!viewerId && viewerId !== targetUserId;

  useEffect(() => {
    if (!active || !viewerId) return;
    let cancelled = false;
    (async () => {
      const result = await fetchBlockedStatus(supabase, viewerId, targetUserId);
      if (!cancelled) setIsBlocked(result.success ? !!result.data : false);
    })();
    return () => {
      cancelled = true;
    };
  }, [active, viewerId, targetUserId, supabase]);

  if (!active || !viewerId) return null;

  async function handleBlock() {
    if (!viewerId) return;
    try {
      if (isBlocked) {
        const result = await unblockUser(supabase, viewerId, targetUserId);
        if (!result.success) throw new Error(result.error);
        setIsBlocked(false);
        showSuccess(t.userUnblocked);
      } else {
        setConfirmAction({
          title: t.block,
          message: t.blockConfirm,
          confirmLabel: t.block,
          variant: 'danger',
          onConfirm: async () => {
            setConfirmAction(null);
            try {
              const result = await blockUser(supabase, { user_id: viewerId, blocked_user_id: targetUserId });
              if (!result.success) throw new Error(result.error);
              setIsBlocked(true);
              showSuccess(t.userBlocked);
            } catch (error: unknown) {
              logError(error, { action: 'blockUser', targetUserId });
              showError(getErrorMessage(error, 'admin_action', language));
            }
          },
        });
      }
    } catch (error: unknown) {
      logError(error, { action: 'unblockUser', targetUserId });
      showError(getErrorMessage(error, 'admin_action', language));
    }
  }

  async function handleReport() {
    if (!viewerId) return;
    if (!reportReason.trim()) {
      showInfo(t.selectReasonError);
      return;
    }
    setSubmitting(true);
    try {
      const reportResult = await reportUser(supabase, {
        reporter_id: viewerId,
        reported_user_id: targetUserId,
        reason: reportReason,
        description: reportDescription,
      });
      if (!reportResult.success) throw new Error(reportResult.error);
      showSuccess(t.reportSuccess);
      setShowReportModal(false);
      setReportReason('');
      setReportDescription('');
    } catch (error: unknown) {
      logError(error, { action: 'reportUser', targetUserId });
      showError(getErrorMessage(error, 'submit_feedback', language));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className={`flex gap-2 ${className ?? ''}`}>
        <button
          onClick={handleBlock}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${isBlocked ? 'bg-stone-200 text-stone-700 hover:bg-stone-300' : 'bg-stone-100 dark:bg-tribe-mid text-stone-600 dark:text-gray-300 hover:bg-stone-200 dark:hover:bg-tribe-mid'}`}
        >
          <Shield className="w-4 h-4 inline mr-1" />
          {isBlocked ? t.unblock : t.block}
        </button>
        <button
          onClick={() => setShowReportModal(true)}
          className="px-3 py-1.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg text-sm font-medium hover:bg-red-200 dark:hover:bg-red-900/50 transition"
        >
          <Flag className="w-4 h-4 inline mr-1" />
          {t.report}
        </button>
      </div>

      {showReportModal && (
        <ReportUserModal
          t={t}
          reportReason={reportReason}
          reportDescription={reportDescription}
          submitting={submitting}
          onReasonChange={setReportReason}
          onDescriptionChange={setReportDescription}
          onClose={() => setShowReportModal(false)}
          onSubmit={handleReport}
        />
      )}

      <ConfirmDialog
        open={!!confirmAction}
        title={confirmAction?.title ?? ''}
        message={confirmAction?.message ?? ''}
        confirmLabel={confirmAction?.confirmLabel ?? t.submit}
        cancelLabel={t.cancel}
        variant={confirmAction?.variant ?? 'default'}
        onConfirm={() => confirmAction?.onConfirm()}
        onCancel={() => setConfirmAction(null)}
      />
    </>
  );
}
