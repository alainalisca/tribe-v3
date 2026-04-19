'use client';

/**
 * Athlete-facing waitlist UI for a single session. Shown when the session is
 * full OR when the current user has an outstanding waitlist offer.
 *
 * Behaviors:
 *   - not on waitlist: "Join Waitlist — position #N" CTA
 *   - waiting: "You're #N on the waitlist" + Leave link
 *   - offered: urgent banner with Accept / Pass and expiry countdown
 *   - accepted/expired/cancelled: nothing rendered
 */

import { useCallback, useEffect, useState } from 'react';
import { Clock, Users, X, Check } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  joinWaitlist,
  leaveWaitlist,
  getWaitlistPosition,
  acceptWaitlistOffer,
  type WaitlistStatus,
} from '@/lib/dal/waitlist';
import { showSuccess, showError } from '@/lib/toast';
import { haptic } from '@/lib/haptics';

interface WaitlistPanelProps {
  sessionId: string;
  userId: string | null;
  /** true when session.current_participants >= session.max_participants */
  isFull: boolean;
  /** true when the user is already a confirmed participant. Hides panel. */
  hasJoined: boolean;
  /** true when session.date < today. Hides panel. */
  isPast: boolean;
  /** true when the viewer is the session creator. Hides panel. */
  isCreator: boolean;
  language: 'en' | 'es';
  /** Called after the user accepts an offer, so the parent can refresh session state. */
  onAccepted?: () => void;
}

interface WaitlistSnapshot {
  position: number;
  status: WaitlistStatus;
  /** Present only when status==='offered'. ISO string. */
  offerExpiresAt?: string | null;
}

function formatCountdown(expiresIso: string, language: 'en' | 'es'): string {
  const msLeft = new Date(expiresIso).getTime() - Date.now();
  if (msLeft <= 0) {
    return language === 'es' ? 'expirado' : 'expired';
  }
  const hours = Math.floor(msLeft / 3600000);
  const minutes = Math.floor((msLeft % 3600000) / 60000);
  if (language === 'es') {
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  }
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export default function WaitlistPanel({
  sessionId,
  userId,
  isFull,
  hasJoined,
  isPast,
  isCreator,
  language,
  onAccepted,
}: WaitlistPanelProps) {
  const supabase = createClient();
  const [snapshot, setSnapshot] = useState<WaitlistSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [, setTick] = useState(0);

  const refresh = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    const res = await getWaitlistPosition(supabase, sessionId, userId);
    if (!res.success) {
      setSnapshot(null);
      setLoading(false);
      return;
    }
    if (res.data) {
      // Also fetch offer_expires_at for 'offered' status
      if (res.data.status === 'offered') {
        const { data: row } = await supabase
          .from('session_waitlist')
          .select('offer_expires_at')
          .eq('session_id', sessionId)
          .eq('user_id', userId)
          .maybeSingle();
        setSnapshot({
          position: res.data.position,
          status: res.data.status,
          offerExpiresAt: (row as { offer_expires_at: string | null } | null)?.offer_expires_at ?? null,
        });
      } else {
        setSnapshot({ position: res.data.position, status: res.data.status });
      }
    } else {
      setSnapshot(null);
    }
    setLoading(false);
  }, [sessionId, userId, supabase]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Tick the countdown every 30s while an offer is open.
  useEffect(() => {
    if (snapshot?.status !== 'offered' || !snapshot.offerExpiresAt) return;
    const id = setInterval(() => setTick((n) => n + 1), 30000);
    return () => clearInterval(id);
  }, [snapshot?.status, snapshot?.offerExpiresAt]);

  // Visibility rules
  if (!userId || isCreator || isPast || hasJoined) return null;

  const t = {
    joinCta: language === 'es' ? 'Unirse a la lista de espera' : 'Join waitlist',
    leaveCta: language === 'es' ? 'Salir de la lista' : 'Leave waitlist',
    fullTitle: language === 'es' ? 'Esta sesión está llena' : 'This session is full',
    onWaitlistTitle: language === 'es' ? 'Estás en la lista de espera' : "You're on the waitlist",
    position: (n: number) => (language === 'es' ? `Posición #${n}` : `Position #${n}`),
    willNotify: language === 'es' ? 'Te avisaremos si se abre un lugar.' : "We'll notify you if a spot opens up.",
    offerTitle: language === 'es' ? '🎉 ¡Se abrió un lugar!' : '🎉 A spot opened up!',
    offerSub: (left: string) =>
      language === 'es' ? `Tienes ${left} para reclamarlo.` : `You have ${left} to claim it.`,
    accept: language === 'es' ? 'Reclamar lugar' : 'Claim spot',
    pass: language === 'es' ? 'Rechazar' : 'Pass',
    joined: language === 'es' ? '¡Estás dentro!' : "You're in!",
    leaveError: language === 'es' ? 'No se pudo salir de la lista' : 'Could not leave waitlist',
    joinError: language === 'es' ? 'No se pudo unir a la lista' : 'Could not join waitlist',
    acceptError: language === 'es' ? 'No se pudo aceptar la oferta' : 'Could not accept the offer',
    loading: language === 'es' ? 'Cargando…' : 'Loading…',
  };

  // Hide when not full AND not offered. If the user has an active offer we always show the banner.
  if (!isFull && snapshot?.status !== 'offered') return null;

  if (loading) {
    return (
      <div className="mt-4 rounded-xl p-4 bg-stone-100 dark:bg-tribe-surface text-xs text-theme-secondary text-center">
        {t.loading}
      </div>
    );
  }

  const handleJoin = async () => {
    if (!userId) return;
    setBusy(true);
    const res = await joinWaitlist(supabase, sessionId, userId);
    setBusy(false);
    if (!res.success) {
      showError(res.error || t.joinError);
      return;
    }
    await haptic('success');
    await refresh();
  };

  const handleLeave = async () => {
    if (!userId) return;
    setBusy(true);
    const res = await leaveWaitlist(supabase, sessionId, userId);
    setBusy(false);
    if (!res.success) {
      showError(res.error || t.leaveError);
      return;
    }
    setSnapshot(null);
  };

  const handleAccept = async () => {
    if (!userId) return;
    setBusy(true);
    const res = await acceptWaitlistOffer(supabase, sessionId, userId);
    setBusy(false);
    if (!res.success) {
      showError(res.error || t.acceptError);
      return;
    }
    await haptic('success');
    showSuccess(t.joined);
    setSnapshot({ position: snapshot?.position ?? 0, status: 'accepted' });
    onAccepted?.();
  };

  const handlePass = async () => {
    // Passing = leaving the waitlist entirely.
    await handleLeave();
  };

  // 1. Active offer — top-priority CTA
  if (snapshot?.status === 'offered') {
    const countdown = snapshot.offerExpiresAt ? formatCountdown(snapshot.offerExpiresAt, language) : '';
    return (
      <div className="mt-4 rounded-xl p-4 border-2 border-[#84cc16] bg-[#84cc16]/10">
        <p className="font-bold text-theme-primary">{t.offerTitle}</p>
        <p className="text-sm text-theme-secondary mt-1 flex items-center gap-1">
          <Clock className="w-3.5 h-3.5" /> {t.offerSub(countdown)}
        </p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={handleAccept}
            disabled={busy}
            className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg bg-[#84cc16] hover:bg-[#A3E635] text-slate-900 text-sm font-bold disabled:opacity-50"
          >
            <Check className="w-4 h-4" /> {t.accept}
          </button>
          <button
            type="button"
            onClick={handlePass}
            disabled={busy}
            className="px-4 py-2 rounded-lg bg-stone-200 dark:bg-[#272D34] text-theme-secondary text-sm font-semibold disabled:opacity-50"
          >
            {t.pass}
          </button>
        </div>
      </div>
    );
  }

  // 2. On waitlist, waiting — show position + leave
  if (snapshot?.status === 'waiting') {
    return (
      <div className="mt-4 rounded-xl p-4 bg-stone-100 dark:bg-tribe-surface border border-stone-200 dark:border-tribe-mid">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-tribe-green" />
          <p className="text-sm font-semibold text-theme-primary">{t.onWaitlistTitle}</p>
        </div>
        <p className="text-sm font-bold text-tribe-green mt-1">{t.position(snapshot.position)}</p>
        <p className="text-xs text-theme-secondary mt-1">{t.willNotify}</p>
        <button
          type="button"
          onClick={handleLeave}
          disabled={busy}
          className="mt-3 text-xs text-theme-secondary hover:text-red-500 flex items-center gap-1 disabled:opacity-50"
        >
          <X className="w-3 h-3" /> {t.leaveCta}
        </button>
      </div>
    );
  }

  // 3. Session full, not on waitlist — join CTA
  return (
    <div className="mt-4 rounded-xl p-4 bg-stone-100 dark:bg-tribe-surface border border-stone-200 dark:border-tribe-mid text-center">
      <p className="text-sm font-semibold text-theme-primary">{t.fullTitle}</p>
      <p className="text-xs text-theme-secondary mt-1 mb-3">{t.willNotify}</p>
      <button
        type="button"
        onClick={handleJoin}
        disabled={busy}
        className="w-full py-2.5 rounded-lg bg-[#84cc16] hover:bg-[#A3E635] text-slate-900 text-sm font-bold disabled:opacity-50"
      >
        {busy ? '…' : t.joinCta}
      </button>
    </div>
  );
}
