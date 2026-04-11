'use client';

import { useState } from 'react';
import { Clock, Users, Zap, Loader2, CreditCard, CheckCircle } from 'lucide-react';
import { formatPrice } from '@/lib/formatCurrency';
import { getPaymentGateway } from '@/lib/payments/config';
import type { Currency } from '@/lib/payments/config';
import { createClient } from '@/lib/supabase/client';
import { insertParticipant } from '@/lib/dal/participants';
import { showSuccess, showError } from '@/lib/toast';
import { celebrateJoin } from '@/lib/confetti';
import BookingConfirmModal from '@/components/BookingConfirmModal';

interface StorefrontSession {
  id: string;
  title: string;
  sport: string;
  date: string;
  time: string;
  price: number;
  spots_available: number;
  spots_total: number;
  creator_id: string;
  is_boosted?: boolean;
  currency?: string;
  is_paid?: boolean;
  price_cents?: number;
  location?: string;
  join_policy?: string;
}

interface StorefrontSessionCardProps {
  session: StorefrontSession;
  language: 'en' | 'es';
  currentUserId: string | null;
  joinedSessionIds: Set<string>;
  onJoined: (sessionId: string) => void;
}

export default function StorefrontSessionCard({
  session,
  language,
  currentUserId,
  joinedSessionIds,
  onJoined,
}: StorefrontSessionCardProps): React.JSX.Element {
  const [joiningFree, setJoiningFree] = useState(false);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [showBookingModal, setShowBookingModal] = useState(false);

  const currency = (session.currency || 'COP') as Currency;
  const isPaid = session.is_paid && (session.price_cents ?? session.price) > 0;
  const isFree = !isPaid || session.price === 0;
  const isFull = session.spots_available <= 0;
  const isOwn = currentUserId === session.creator_id;
  const hasJoined = joinedSessionIds.has(session.id);
  const gateway = isPaid ? getPaymentGateway(currency) : null;

  // Format the price display
  const priceDisplay = isPaid
    ? session.price_cents
      ? `${formatPrice(session.price_cents, currency)} ${currency}`
      : `$${session.price.toLocaleString(currency === 'COP' ? 'es-CO' : 'en-US', { maximumFractionDigits: currency === 'COP' ? 0 : 2 })} ${currency}`
    : language === 'es'
      ? 'Gratis'
      : 'Free';

  // Spots urgency
  const spotsUrgent = session.spots_available > 0 && session.spots_available <= 3;

  // Translations
  const t = {
    boosted: language === 'es' ? 'IMPULSADO' : 'BOOSTED',
    spotsLeft:
      language === 'es' ? `${session.spots_available} cupos disponibles` : `${session.spots_available} spots left`,
    full: language === 'es' ? 'Lleno' : 'Full',
    joinFree: language === 'es' ? 'Unirse Gratis' : 'Join Free',
    bookPay: language === 'es' ? 'Reservar y Pagar' : 'Book & Pay',
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

      const result = await insertParticipant(supabase, {
        session_id: session.id,
        user_id: currentUserId,
        status: session.join_policy === 'curated' ? 'pending' : 'confirmed',
      });

      if (!result.success) {
        showError(result.error || (language === 'es' ? 'No se pudo unir' : 'Could not join'));
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

  async function handlePaidBooking(): Promise<void> {
    if (!currentUserId) {
      showError(t.loginRequired);
      return;
    }
    setShowBookingModal(true);
  }

  async function handleConfirmPayment(): Promise<void> {
    setProcessingPayment(true);
    try {
      const res = await fetch('/api/payment/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: session.id }),
      });
      const data = await res.json();
      if (data.success && data.data?.redirect_url) {
        window.location.href = data.data.redirect_url;
      } else {
        showError(data.error || (language === 'es' ? 'Error al procesar pago' : 'Payment processing failed'));
        setProcessingPayment(false);
      }
    } catch {
      showError(language === 'es' ? 'Error de conexion' : 'Connection error');
      setProcessingPayment(false);
    }
  }

  function renderCTA(): React.JSX.Element {
    // Already joined
    if (hasJoined) {
      return (
        <div className="flex items-center gap-1.5 text-tribe-green font-semibold text-sm">
          <CheckCircle className="w-4 h-4" />
          {t.joined}
        </div>
      );
    }

    // Own session
    if (isOwn) {
      return <span className="text-xs text-theme-secondary font-medium">{t.ownSession}</span>;
    }

    // Session full
    if (isFull) {
      return <span className="text-xs text-red-500 font-semibold">{t.full}</span>;
    }

    // Not logged in
    if (!currentUserId) {
      return (
        <button
          onClick={() => showError(t.loginRequired)}
          className="bg-stone-200 dark:bg-[#52575D] text-theme-secondary px-3 py-1.5 rounded-xl font-semibold text-xs cursor-not-allowed"
        >
          {isFree ? t.joinFree : `${t.bookPay} · ${priceDisplay}`}
        </button>
      );
    }

    // Free session
    if (isFree) {
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

    // Paid session
    return (
      <button
        onClick={handlePaidBooking}
        className="bg-tribe-green text-slate-900 px-3 py-1.5 rounded-xl font-semibold hover:bg-[#8FD642] transition-all text-xs flex items-center gap-1.5"
      >
        <CreditCard className="w-3.5 h-3.5" />
        {t.bookPay} &middot; {priceDisplay}
        {gateway && <span className="opacity-60 text-[10px] ml-0.5">{gateway === 'wompi' ? 'Wompi' : 'Stripe'}</span>}
      </button>
    );
  }

  return (
    <>
      <div className="bg-white dark:bg-[#404549] rounded-xl border border-stone-200 dark:border-[#52575D] p-4 overflow-hidden hover:border-tribe-green/50 transition-all">
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
              {new Date(session.date).toLocaleDateString(language === 'es' ? 'es-CO' : 'en-US')} &middot; {session.time}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Users className={`w-4 h-4 flex-shrink-0 ${spotsUrgent ? 'text-red-500' : 'text-tribe-green'}`} />
            <span className={`${spotsUrgent ? 'text-red-500 font-semibold' : 'text-theme-secondary'}`}>
              {isFull ? t.full : t.spotsLeft}
            </span>
          </div>
        </div>

        {/* Price and CTA */}
        <div className="flex items-center justify-between pt-3 border-t border-stone-200 dark:border-gray-700">
          <span className={`text-lg font-bold ${isFree ? 'text-green-600' : 'text-tribe-green'}`}>{priceDisplay}</span>
          {renderCTA()}
        </div>
      </div>

      {/* Booking confirmation modal for paid sessions */}
      {showBookingModal && (
        <BookingConfirmModal
          open={showBookingModal}
          onClose={() => {
            setShowBookingModal(false);
            setProcessingPayment(false);
          }}
          onConfirm={handleConfirmPayment}
          session={session}
          language={language}
          processing={processingPayment}
        />
      )}
    </>
  );
}
