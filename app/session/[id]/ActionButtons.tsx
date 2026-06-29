'use client';

import { useState } from 'react';
import Link from 'next/link';
import { LogOut, Trash2, MessageCircle, Lock, CreditCard, Loader2 } from 'lucide-react';
import { downloadCalendarEvent, getGoogleCalendarUrl } from '@/lib/calendar';
import { Calendar as CalendarIcon } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { Button } from '@/components/ui/button';
import { showError, showInfo } from '@/lib/toast';
import { logError } from '@/lib/logger';
import { trackEvent } from '@/lib/analytics';
import { formatPrice as formatPriceUtil } from '@/lib/formatCurrency';
import type { Currency } from '@/lib/payments/config';
import WhatsAppShareButton from '@/components/session/WhatsAppShareButton';

interface ActionButtonsProps {
  language: 'en' | 'es';
  user: { id: string } | null;
  // REASON: session shape comes from DB with many nullable fields — loosely typed here
  session: any;
  isCreator: boolean;
  hasJoined: boolean;
  isPending: boolean;
  isPast: boolean;
  isFull: boolean;
  sessionActions: {
    guestHasJoined: boolean;
    joining: boolean;
    handleJoin: () => void;
    handleLeave: () => void;
    handleCancel: () => void;
    handleGuestLeave: () => void;
    setShowGuestModal: (v: boolean) => void;
  };
  onEdit: () => void;
  onInvite: () => void;
  creatingInvite: boolean;
}

export default function ActionButtons({
  language: _language,
  user,
  session,
  isCreator,
  hasJoined,
  isPending,
  isPast,
  isFull,
  sessionActions,
  onEdit,
  onInvite,
  creatingInvite,
}: ActionButtonsProps) {
  const { t } = useLanguage();
  const [processingPayment, setProcessingPayment] = useState(false);

  const isPaidSession = !!session.is_paid && session.price_cents > 0;
  const calendarData = {
    title: `${session.sport} — ${session.title || 'Tribe Session'}`,
    description: `Session with ${session.creator?.name || 'Instructor'} on Tribe.`,
    startDate: new Date(`${session.date}T${session.start_time || '00:00'}`),
    durationMinutes: session.duration || 60,
    location: session.location || undefined,
  };

  // formatPrice imported from @/lib/formatCurrency

  // Handle paid session checkout — calls /api/payment/create and redirects to gateway
  async function handlePaidJoin() {
    if (!user || !session) return;
    setProcessingPayment(true);
    trackEvent('payment_initiated', {
      session_id: session.id,
      amount_cents: session.price_cents,
      currency: session.currency,
      gateway: session.currency === 'COP' ? 'wompi' : 'stripe',
    });
    try {
      const res = await fetch('/api/payment/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: session.id }),
      });
      // Parse defensively: a 5xx that returned HTML (e.g. an outage page)
      // would throw on res.json() and the user used to see nothing — the
      // catch had an empty `{}` that swallowed the error. Now we capture
      // the body text on parse failure for the toast + log.
      const raw = await res.text();
      let data: { success?: boolean; data?: { redirect_url?: string }; error?: string } = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        // non-JSON response; surface the status and a snippet in logs
      }
      if (res.ok && data.success && data.data?.redirect_url) {
        window.location.href = data.data.redirect_url;
        return;
      }
      const fallback = _language === 'es' ? 'Error al procesar pago' : 'Payment processing failed';
      showError(data.error || fallback);
      logError(new Error(`payment_create_failed_${res.status}: ${data.error || raw.slice(0, 200)}`), {
        action: 'handlePaidJoin',
        sessionId: session.id,
        status: res.status,
      });
      setProcessingPayment(false);
    } catch (err) {
      showError(_language === 'es' ? 'Error de conexión' : 'Connection error');
      logError(err, { action: 'handlePaidJoin.network', sessionId: session.id });
      setProcessingPayment(false);
    }
  }

  return (
    <div className="space-y-2">
      {!user ? (
        sessionActions.guestHasJoined ? (
          <Button
            onClick={sessionActions.handleGuestLeave}
            variant="destructive"
            className="w-full py-2 text-sm bg-orange-500 hover:bg-orange-600 font-bold flex items-center justify-center gap-2"
          >
            <LogOut className="w-5 h-5" />
            {t('leaveSession')}
          </Button>
        ) : isPast ? (
          <Button disabled className="w-full py-3 font-bold">
            {t('sessionEnded')}
          </Button>
        ) : isFull ? (
          <Button disabled className="w-full py-3 font-bold">
            {t('sessionFull')}
          </Button>
        ) : (
          <Button onClick={() => sessionActions.setShowGuestModal(true)} className="w-full py-3 font-bold">
            {t('joinAsGuest')}
          </Button>
        )
      ) : isCreator ? (
        <>
          <div className="w-full py-3 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 font-medium text-sm rounded-lg text-center">
            {t('hostingThisSession')}
          </div>
          {!isPast && (
            <>
              {/* Highest-leverage fill-rate tool: WhatsApp share lands above
                  Edit/Cancel for the host so it's the first thing they
                  see after acknowledging they're hosting. */}
              <WhatsAppShareButton session={session} language={_language} isCreator />
              {/* BUG-024: pair Edit + Cancel side-by-side so the host action
                  stack doesn't sprawl down the page on mobile. */}
              <div className="grid grid-cols-2 gap-2">
                <Button
                  onClick={onEdit}
                  variant="outline"
                  className="w-full py-3 font-medium flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </svg>
                  {t('editSessionBtn')}
                </Button>
                <Button
                  onClick={sessionActions.handleCancel}
                  variant="destructive"
                  className="w-full py-3 text-sm font-bold flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-5 h-5" />
                  {t('cancelSession')}
                </Button>
              </div>
            </>
          )}
        </>
      ) : isPending ? (
        <>
          <div className="w-full py-3 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 font-bold rounded-lg text-center">
            ⏳ {t('pendingApproval')}
          </div>
          <Button
            onClick={sessionActions.handleLeave}
            variant="destructive"
            className="w-full py-2 text-sm bg-orange-500 hover:bg-orange-600 font-bold flex items-center justify-center gap-2"
          >
            <LogOut className="w-5 h-5" />
            {t('withdrawRequest')}
          </Button>
        </>
      ) : hasJoined ? (
        isPast ? (
          <Button disabled className="w-full py-3 font-bold">
            {t('sessionEnded')}
          </Button>
        ) : (
          <Button
            onClick={sessionActions.handleLeave}
            variant="destructive"
            className="w-full py-2 text-sm bg-orange-500 hover:bg-orange-600 font-bold flex items-center justify-center gap-2"
          >
            <LogOut className="w-5 h-5" />
            {t('leaveSession')}
          </Button>
        )
      ) : isPast ? (
        <Button disabled className="w-full py-3 font-bold">
          {t('sessionEnded')}
        </Button>
      ) : isFull ? (
        <Button disabled className="w-full py-3 font-bold">
          {t('sessionFull')}
        </Button>
      ) : session.join_policy === 'invite_only' ? (
        <div className="w-full py-3 bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 font-bold rounded-lg text-center flex items-center justify-center gap-2">
          <Lock className="w-5 h-5" />
          {t('inviteOnlyLabel')}
        </div>
      ) : isPaidSession ? (
        /* ── Paid session: show price + Pay button ── */
        <div className="space-y-2">
          <div className="w-full p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-green-700 dark:text-green-300 font-medium">
                  {_language === 'es' ? 'Sesión de pago' : 'Paid Session'}
                </p>
                <p className="text-lg font-bold text-green-800 dark:text-green-200">
                  {session.currency || 'COP'}{' '}
                  {formatPriceUtil(session.price_cents, (session.currency || 'COP') as Currency)}
                </p>
              </div>
              <div className="text-xs text-green-800 dark:text-green-200 text-right font-medium">
                {session.currency === 'USD' ? '💳 Stripe' : '🇨🇴 Wompi'}
                <br />
                <span className="text-green-700 dark:text-green-300 font-normal">
                  {session.currency === 'USD'
                    ? _language === 'es'
                      ? 'Tarjeta de crédito/débito'
                      : 'Credit/debit card'
                    : _language === 'es'
                      ? 'Nequi, PSE, tarjeta'
                      : 'Nequi, PSE, card'}
                </span>
              </div>
            </div>
          </div>
          <Button
            onClick={handlePaidJoin}
            disabled={processingPayment || sessionActions.joining}
            className="w-full py-3 font-bold bg-green-600 hover:bg-green-700 text-white flex items-center justify-center gap-2"
          >
            {processingPayment ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                {_language === 'es' ? 'Procesando...' : 'Processing...'}
              </>
            ) : (
              <>
                <CreditCard className="w-5 h-5" />
                {_language === 'es' ? 'Pagar y unirse' : 'Pay & Join'}
              </>
            )}
          </Button>
        </div>
      ) : (
        <Button onClick={sessionActions.handleJoin} disabled={sessionActions.joining} className="w-full py-3 font-bold">
          {sessionActions.joining ? t('joining') : t('joinSession')}
        </Button>
      )}

      {/* BUG-024: pair Group Chat + Invite Friend so attendees/hosts get
          two equally-weighted actions on one row instead of two stacked
          full-width buttons. */}
      {(hasJoined || isCreator) && !isPast && (
        <div className="grid grid-cols-2 gap-2">
          <Link
            href={`/session/${session.id}/chat`}
            className="w-full py-3 bg-stone-100 dark:bg-tribe-mid text-stone-700 dark:text-white text-sm font-medium rounded-lg hover:bg-stone-200 dark:hover:bg-tribe-mid transition flex items-center justify-center gap-2"
          >
            <MessageCircle className="w-5 h-5" />
            {t('groupChat')}
          </Link>
          <Button
            onClick={onInvite}
            disabled={creatingInvite}
            variant="outline"
            className="w-full py-3 text-sm font-medium"
          >
            {creatingInvite ? t('generating') : t('inviteFriend')}
          </Button>
        </div>
      )}
      {/* Non-creator, future session → muted WhatsApp share. Creators see the
          prominent variant higher up; this is for attendees and prospects
          who'd want to invite a friend to come along. */}
      {!isCreator && !isPast && <WhatsAppShareButton session={session} language={_language} />}

      {/* BUG-224: Add to Calendar — shown to ALL users on future sessions.
          Primary: Google Calendar URL (opens in new tab, works on all browsers
          including mobile). Secondary: Apple Calendar via .ics download.
          Removed legacy creator-only ICS-only button. */}
      {!isPast && (
        <div className="mt-2 p-4 bg-tribe-green/10 border border-tribe-green/30 rounded-xl space-y-2">
          {hasJoined && (
            <p className="text-sm font-semibold text-stone-900 dark:text-white">
              {_language === 'es' ? '¡Estás inscrito!' : "You're in!"}
            </p>
          )}
          <p className="text-xs text-stone-500 dark:text-gray-400">
            {_language === 'es' ? 'Agrega esta sesion a tu calendario' : 'Add this session to your calendar'}
          </p>
          <div className="flex gap-2">
            {/* Primary: Google Calendar — reliable on desktop and mobile web */}
            <a
              href={getGoogleCalendarUrl({
                ...calendarData,
                url: `${typeof window !== 'undefined' ? window.location.origin : ''}/session/${session.id}`,
              })}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                showInfo(t('addToCalendarOpened'));
                trackEvent('session_calendar_added', {
                  session_id: session.id,
                  provider: 'google',
                  user_state: hasJoined ? 'joined' : isCreator ? 'creator' : 'viewer',
                });
              }}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 bg-white dark:bg-tribe-surface text-stone-900 dark:text-white text-sm font-semibold rounded-lg border border-stone-200 dark:border-gray-600 hover:bg-stone-50 dark:hover:bg-tribe-mid transition"
            >
              <CalendarIcon className="w-4 h-4" />
              {t('addToCalendarGoogle')}
            </a>
            {/* Secondary: Apple Calendar via .ics — desktop Safari / macOS */}
            <button
              onClick={() => {
                downloadCalendarEvent({ ...calendarData, url: `${window.location.origin}/session/${session.id}` });
                showInfo(t('addToCalendarIcsDownloaded'));
                trackEvent('session_calendar_added', {
                  session_id: session.id,
                  provider: 'apple',
                  user_state: hasJoined ? 'joined' : isCreator ? 'creator' : 'viewer',
                });
              }}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 bg-white dark:bg-tribe-surface text-stone-900 dark:text-white text-sm font-semibold rounded-lg border border-stone-200 dark:border-gray-600 hover:bg-stone-50 dark:hover:bg-tribe-mid transition"
            >
              <CalendarIcon className="w-4 h-4" />
              {t('addToCalendarApple')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
