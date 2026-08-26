'use client';

import { useState } from 'react';
import { Clock, Users, Zap, Loader2, CheckCircle, Repeat } from 'lucide-react';
import { formatPrice } from '@/lib/formatCurrency';
import { formatPattern } from '@/lib/recurrence';
import { formatTime12Hour } from '@/lib/utils';
import type { Currency } from '@/lib/payments/config';
import { createClient } from '@/lib/supabase/client';
import { showSuccess, showError } from '@/lib/toast';
import { celebrateJoin } from '@/lib/confetti';
import { joinSession } from '@/lib/sessions';
import { getJoinErrorMessages } from '@/hooks/sessionActionTypes';
import PaidSessionRequest from '@/components/session/PaidSessionRequest';
import type { Session } from '@/app/storefront/[id]/useStorefrontData';

interface StorefrontSessionCardProps {
  session: Session;
  language: 'en' | 'es';
  currentUserId: string | null;
  joinedSessionIds: Set<string>;
  onJoined: (sessionId: string) => void;
}

/**
 * Date formatter copied verbatim from AvailabilityPreview.formatDayLabel: parse
 * the bare YYYY-MM-DD as UTC midnight (`+ 'T00:00:00Z'`) and render in UTC
 * (`timeZone: 'UTC'`) so the wall-clock date never shifts. A bare
 * `new Date('2026-08-23')` parses as UTC then renders local; in Medellin (UTC-5)
 * that lands the previous evening and prints the day before. The tab and the
 * sidebar AvailabilityPreview show the same sessions on one screen and MUST
 * format identically, so keep this in sync with that component.
 */
function formatSessionDay(iso: string, language: 'en' | 'es'): string {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString(language === 'es' ? 'es-CO' : 'en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export default function StorefrontSessionCard({
  session,
  language,
  currentUserId,
  joinedSessionIds,
  onJoined,
}: StorefrontSessionCardProps): React.JSX.Element {
  const [joiningFree, setJoiningFree] = useState(false);
  const [requesting, setRequesting] = useState(false);

  const currency = (session.currency || 'COP') as Currency;
  const isPaid = !!session.is_paid && (session.price_cents ?? 0) > 0;
  const isFree = !isPaid;
  // Spots come from the real counter columns (current_participants is maintained
  // by the 087 trigger). The card used to read session.spots_available, which is
  // not a DB column and is not selected, so it rendered "undefined spots left"
  // and never went full.
  const spotsAvailable = Math.max(0, session.max_participants - (session.current_participants ?? 0));
  const isFull = spotsAvailable <= 0;
  const spotsUrgent = spotsAvailable > 0 && spotsAvailable <= 3;
  const isOwn = currentUserId === session.creator_id;
  const hasJoined = joinedSessionIds.has(session.id);

  // Recurring cadence line, e.g. "Every Monday at 7:00 PM" / "Cada lunes a las
  // 7:00 PM". Shown only for a series member; recurrence_pattern is the resolved
  // series cadence (a child's parent pattern, or a parent's own) supplied by
  // useStorefrontData. Rendered nothing for a one-off session.
  const isSeries = !!session.is_recurring || session.recurring_parent_id != null;
  const cadenceLabel = isSeries
    ? `${formatPattern(session.recurrence_pattern, language)} ${language === 'es' ? 'a las' : 'at'} ${formatTime12Hour(session.start_time)}`
    : null;

  const priceDisplay =
    isPaid && session.price_cents ? formatPrice(session.price_cents, currency) : language === 'es' ? 'Gratis' : 'Free';

  const t = {
    boosted: language === 'es' ? 'IMPULSADO' : 'BOOSTED',
    spotsLeft: language === 'es' ? `${spotsAvailable} cupos disponibles` : `${spotsAvailable} spots left`,
    full: language === 'es' ? 'Lleno' : 'Full',
    joinFree: language === 'es' ? 'Unirse Gratis' : 'Join Free',
    requestToJoin: language === 'es' ? 'Solicitar unirse' : 'Request to join',
    joined: language === 'es' ? 'Inscrito' : 'Joined',
    ownSession: language === 'es' ? 'Tu sesion' : 'Your session',
    loginRequired: language === 'es' ? 'Inicia sesion para unirte' : 'Log in to join',
  };

  async function handleJoinFree(): Promise<void> {
    if (!currentUserId) {
      showError(t.loginRequired);
      return;
    }
    setJoiningFree(true);
    try {
      const supabase = createClient();

      // Check not already joined
      const { data: existing } = await supabase
        .from('session_participants')
        .select('id')
        .eq('session_id', session.id)
        .eq('user_id', currentUserId)
        .maybeSingle();

      if (existing) {
        onJoined(session.id);
        return;
      }

      // T-SEC1 Gate 2.5a: join via the SECURITY DEFINER RPC, not a direct insert
      // (Gate 3 removes the direct-insert RLS). The RPC derives status from the
      // session's join_policy server-side, enforces capacity atomically, requires
      // p_user_id = auth.uid() (satisfied — currentUserId is the logged-in user),
      // and is idempotent. p_status is ignored server-side; kept for compat.
      const { data: joinResult, error: joinError } = await supabase.rpc('join_session', {
        p_session_id: session.id,
        p_user_id: currentUserId,
        p_status: session.join_policy === 'curated' ? 'pending' : 'confirmed',
        p_invite_token: null,
      });

      if (joinError) {
        showError(joinError.message || (language === 'es' ? 'No se pudo unir' : 'Could not join'));
        return;
      }
      const joinData = typeof joinResult === 'string' ? JSON.parse(joinResult) : joinResult;
      if (!joinData?.success) {
        showError(
          joinData?.error === 'Session is full'
            ? language === 'es'
              ? 'La sesion esta llena'
              : 'Session is full'
            : joinData?.error || (language === 'es' ? 'No se pudo unir' : 'Could not join')
        );
        return;
      }

      celebrateJoin();
      onJoined(session.id);

      const sessionName = session.title || session.sport;
      showSuccess(language === 'es' ? `Te vemos en ${sessionName}` : `You're in! See you at ${sessionName}`);
    } catch {
      showError(language === 'es' ? 'Error al unirse' : 'Failed to join');
    } finally {
      setJoiningFree(false);
    }
  }

  // T-PAY1: paid sessions are OFF-PLATFORM — no checkout, no money through Tribe.
  // This mirrors the session detail page (ActionButtons -> PaidSessionRequest ->
  // sessionActions.handleJoin -> joinSession): joinSession creates a pending
  // "awaiting payment" request; the athlete pays the instructor directly and the
  // instructor confirms receipt. The previous Wompi checkout has been removed.
  async function handlePaidRequest(): Promise<void> {
    if (!currentUserId) {
      showError(t.loginRequired);
      return;
    }
    if (requesting) return;
    setRequesting(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const userName = user?.user_metadata?.name || user?.email || 'Someone';

      const result = await joinSession({ supabase, sessionId: session.id, userId: currentUserId, userName });
      if (!result.success) {
        const messages = getJoinErrorMessages(language);
        showError(
          messages[result.error ?? ''] ||
            (language === 'es' ? 'No se pudo enviar la solicitud' : 'Could not send request')
        );
        return;
      }
      onJoined(session.id);
      showSuccess(
        result.status === 'pending'
          ? language === 'es'
            ? '¡Solicitud enviada! Paga al instructor directamente y confirmará tu lugar.'
            : 'Request sent! Pay the instructor directly and they will confirm your spot.'
          : language === 'es'
            ? '¡Estás dentro!'
            : "You're in!"
      );
    } catch {
      showError(language === 'es' ? 'Error al enviar la solicitud' : 'Failed to send request');
    } finally {
      setRequesting(false);
    }
  }

  // Whether the viewer can act on a paid session (the off-platform request flow).
  // Every other paid state (joined / own / full / logged-out) falls through to
  // renderCTA below, so this is the ONLY paid entry point and it is off-platform.
  const canRequestPaid = isPaid && !!currentUserId && !isOwn && !isFull && !hasJoined;

  function renderCTA(): React.JSX.Element {
    if (hasJoined) {
      return (
        <div className="flex items-center gap-1.5 text-tribe-green font-semibold text-sm">
          <CheckCircle className="w-4 h-4" />
          {t.joined}
        </div>
      );
    }

    if (isOwn) {
      return <span className="text-xs text-theme-secondary font-medium">{t.ownSession}</span>;
    }

    if (isFull) {
      return <span className="text-xs text-red-500 font-semibold">{t.full}</span>;
    }

    // Not logged in — prompt to log in. No checkout wording on paid sessions.
    if (!currentUserId) {
      return (
        <button
          onClick={() => showError(t.loginRequired)}
          className="bg-stone-200 dark:bg-tribe-mid text-theme-secondary px-3 py-1.5 rounded-xl font-semibold text-xs cursor-not-allowed"
        >
          {isFree ? t.joinFree : t.requestToJoin}
        </button>
      );
    }

    // Logged in and actionable: paid is handled by canRequestPaid above, so the
    // only case that reaches here is a free session.
    return (
      <button
        onClick={handleJoinFree}
        disabled={joiningFree}
        className="bg-green-600 text-white px-3 py-1.5 rounded-xl font-semibold hover:bg-green-700 transition-all text-xs flex items-center gap-1.5"
      >
        {joiningFree ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
        {t.joinFree}
      </button>
    );
  }

  return (
    <div className="bg-white dark:bg-tribe-surface rounded-xl border border-stone-200 dark:border-tribe-mid p-4 overflow-hidden hover:border-tribe-green/50 transition-all">
      {/* Boosted Badge */}
      {session.is_boosted && (
        <div className="flex items-center gap-1 mb-3 w-fit">
          <Zap className="w-3 h-3 text-tribe-green" />
          <span className="text-xs font-bold text-tribe-green bg-tribe-green/20 px-2 py-0.5 rounded-full">
            {t.boosted}
          </span>
        </div>
      )}

      {/* Sport and Title */}
      <h3 className="text-base font-bold text-theme-primary mb-1">{session.sport}</h3>
      <p className="text-sm text-theme-secondary mb-3">{session.title}</p>

      {/* Details */}
      <div className="space-y-2 mb-4 text-xs">
        <div className="flex items-center gap-2 text-theme-secondary">
          <Clock className="w-4 h-4 text-tribe-green flex-shrink-0" />
          <span>
            {formatSessionDay(session.date, language)} &middot; {session.start_time.slice(0, 5)}
          </span>
        </div>
        {cadenceLabel && (
          <div className="flex items-center gap-2 text-theme-secondary">
            <Repeat className="w-4 h-4 text-tribe-green flex-shrink-0" />
            <span>{cadenceLabel}</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Users className={`w-4 h-4 flex-shrink-0 ${spotsUrgent ? 'text-red-500' : 'text-tribe-green'}`} />
          <span className={`${spotsUrgent ? 'text-red-500 font-semibold' : 'text-theme-secondary'}`}>
            {isFull ? t.full : t.spotsLeft}
          </span>
        </div>
      </div>

      {/* Price and CTA */}
      {canRequestPaid ? (
        <div className="pt-3 border-t border-stone-200 dark:border-gray-700">
          <PaidSessionRequest
            priceCents={session.price_cents ?? 0}
            currency={currency}
            paymentInstructions={null}
            canViewPaymentInstructions={false}
            onRequest={handlePaidRequest}
            requesting={requesting}
            language={language}
          />
        </div>
      ) : (
        <div className="flex items-center justify-between pt-3 border-t border-stone-200 dark:border-gray-700">
          <span className={`text-lg font-bold ${isFree ? 'text-green-600' : 'text-tribe-green'}`}>{priceDisplay}</span>
          {renderCTA()}
        </div>
      )}
    </div>
  );
}
