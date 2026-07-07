'use client';

/**
 * Host-only panel: lists pending join requests for a curated session
 * and allows the instructor to approve or decline each athlete.
 *
 * Visibility: only rendered when isCreator=true and join_policy='curated'.
 * State: local list updates immediately after each action (no full page refresh).
 */

import { useCallback, useEffect, useState } from 'react';
import { Check, X, User } from 'lucide-react';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import {
  fetchPendingParticipantsForSession,
  updateParticipantStatus,
  deleteParticipant,
  createNotification,
} from '@/lib/dal';
import { showSuccess, showError } from '@/lib/toast';
import { logError } from '@/lib/logger';
import type { PendingParticipantWithUser } from '@/lib/dal/types';
import type { TranslationKey } from '@/lib/translations';

interface PendingRequestsPanelProps {
  sessionId: string;
  sessionTitle: string;
  /** The authenticated user ID — must be the session creator. */
  hostId: string;
  language: 'en' | 'es';
  t: (key: TranslationKey) => string;
  /** Called after an approve so the parent can refresh the session count. */
  onApproved?: () => void;
  /**
   * T-PAY1: when the session is paid, approving means "I received payment
   * directly from this athlete" — so the copy shifts to payment confirmation.
   * The action is otherwise identical (pending → confirmed).
   */
  isPaid?: boolean;
}

export default function PendingRequestsPanel({
  sessionId,
  sessionTitle,
  hostId,
  language,
  t,
  onApproved,
  isPaid = false,
}: PendingRequestsPanelProps) {
  const supabase = createClient();
  const es = language === 'es';
  // Paid sessions reuse the same approve flow with payment-confirmation copy.
  const headerLabel = isPaid ? (es ? 'Confirmaciones de pago' : 'Payment confirmations') : t('pendingJoinRequests');
  const approveLabel = isPaid ? (es ? 'Confirmar pago' : 'Confirm payment') : t('approveAthlete');
  const emptyLabel = isPaid
    ? es
      ? 'No hay pagos por confirmar'
      : 'No payments to confirm'
    : t('noPendingJoinRequests');
  const approveToast = isPaid ? (es ? 'Pago confirmado' : 'Payment confirmed') : t('approveSuccess');
  const [requests, setRequests] = useState<PendingParticipantWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  // Track which participant IDs are currently processing (approve/decline in-flight)
  const [busy, setBusy] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    const result = await fetchPendingParticipantsForSession(supabase, sessionId);
    if (result.success) {
      setRequests(result.data ?? []);
    } else {
      logError(new Error(result.error), { action: 'PendingRequestsPanel.load', sessionId });
    }
    setLoading(false);
  }, [sessionId, supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleApprove(req: PendingParticipantWithUser) {
    setBusy((prev) => new Set(prev).add(req.id));
    try {
      const result = await updateParticipantStatus(supabase, req.id, 'confirmed');
      if (!result.success) {
        showError(t('approvalFailed'));
        return;
      }
      // Optimistically remove from list
      setRequests((prev) => prev.filter((r) => r.id !== req.id));
      showSuccess(approveToast);
      // In-app notification to the athlete
      if (req.user_id) {
        const athleteName = req.user?.name ?? (es ? 'Atleta' : 'Athlete');
        const message = isPaid
          ? es
            ? `Tu pago para "${sessionTitle}" fue confirmado. ¡Nos vemos!`
            : `Your payment for "${sessionTitle}" was confirmed. See you there!`
          : es
            ? `Tu solicitud para "${sessionTitle}" fue aprobada.`
            : `Your request to join "${sessionTitle}" was approved.`;
        await createNotification(supabase, {
          recipient_id: req.user_id,
          actor_id: hostId,
          type: 'join_request_approved',
          entity_type: 'session',
          entity_id: sessionId,
          message,
        }).catch((err) =>
          logError(err, {
            action: 'PendingRequestsPanel.notify_approve',
            athleteName,
          })
        );
      }
      onApproved?.();
    } finally {
      setBusy((prev) => {
        const next = new Set(prev);
        next.delete(req.id);
        return next;
      });
    }
  }

  async function handleDecline(req: PendingParticipantWithUser) {
    setBusy((prev) => new Set(prev).add(req.id));
    try {
      const result = await deleteParticipant(supabase, req.id);
      if (!result.success) {
        showError(t('declineFailed'));
        return;
      }
      setRequests((prev) => prev.filter((r) => r.id !== req.id));
      showSuccess(t('declineSuccess'));
    } finally {
      setBusy((prev) => {
        const next = new Set(prev);
        next.delete(req.id);
        return next;
      });
    }
  }

  if (loading) {
    return (
      <div className="mt-4 rounded-xl p-4 bg-theme-surface border border-theme text-center text-sm text-theme-secondary">
        {language === 'es' ? 'Cargando solicitudes...' : 'Loading requests...'}
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <div className="mt-4 rounded-xl p-4 bg-theme-surface border border-theme text-center text-sm text-theme-secondary">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-tribe-green/40 bg-tribe-green/5 overflow-hidden">
      <div className="px-4 py-3 border-b border-tribe-green/20">
        <h3 className="text-sm font-semibold text-theme-primary">
          {headerLabel}
          <span className="ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-tribe-green text-slate-900 text-xs font-bold">
            {requests.length}
          </span>
        </h3>
      </div>

      <ul className="divide-y divide-tribe-green/10">
        {requests.map((req) => {
          const isBusy = busy.has(req.id);
          const name = req.user?.name ?? (language === 'es' ? 'Atleta' : 'Athlete');
          const avatar = req.user?.avatar_url ?? null;
          return (
            <li key={req.id} className="flex items-center gap-3 px-4 py-3">
              {/* Avatar */}
              <div className="w-10 h-10 rounded-full bg-theme-surface border border-theme overflow-hidden flex-shrink-0 flex items-center justify-center">
                {avatar ? (
                  <Image src={avatar} alt={name} width={40} height={40} className="object-cover w-full h-full" />
                ) : (
                  <User className="w-5 h-5 text-theme-tertiary" />
                )}
              </div>

              {/* Name */}
              <span className="flex-1 text-sm font-medium text-theme-primary truncate">{name}</span>

              {/* Actions */}
              <div className="flex gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => handleApprove(req)}
                  disabled={isBusy}
                  aria-label={`${approveLabel} ${name}`}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-tribe-green text-slate-900 text-xs font-bold hover:bg-lime-400 transition disabled:opacity-50"
                >
                  <Check className="w-3.5 h-3.5" />
                  {approveLabel}
                </button>
                <button
                  type="button"
                  onClick={() => handleDecline(req)}
                  disabled={isBusy}
                  aria-label={`${t('declineAthlete')} ${name}`}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-theme-surface border border-theme text-theme-secondary text-xs font-semibold hover:text-red-500 hover:border-red-400 transition disabled:opacity-50"
                >
                  <X className="w-3.5 h-3.5" />
                  {t('declineAthlete')}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
