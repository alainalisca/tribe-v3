'use client';

import { MessageCircle } from 'lucide-react';
import { trackEvent } from '@/lib/analytics';
import { sportTranslations } from '@/lib/translations';
import { formatTime12Hour } from '@/lib/utils';
import { formatSessionLocation } from '@/lib/sessionLocation';
import { formatPrice } from '@/lib/formatCurrency';
import type { Currency } from '@/lib/payments/config';

interface WhatsAppShareButtonProps {
  session: {
    id: string;
    sport: string;
    date: string;
    start_time: string;
    location: string | null;
    latitude?: number | null;
    longitude?: number | null;
    location_lat?: number | null;
    location_lng?: number | null;
    is_paid?: boolean | null;
    price_cents?: number | null;
    currency?: string | null;
  };
  language: 'en' | 'es';
  /** Whether the viewer is the session creator. Used for the prominent
   *  variant — instructors get a brighter, edge-to-edge button because
   *  this is the highest-leverage fill-rate tool we ship. */
  isCreator?: boolean;
}

function formatSessionDate(dateIso: string, language: 'en' | 'es'): string {
  return new Date(dateIso + 'T00:00:00').toLocaleDateString(language === 'es' ? 'es-CO' : 'en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function formatPriceLine(
  isPaid: boolean,
  priceCents: number | null | undefined,
  currency: string | null | undefined,
  language: 'en' | 'es'
): string {
  if (!isPaid || !priceCents || priceCents <= 0) {
    return language === 'es' ? 'Gratis' : 'Free';
  }
  const c = (currency || 'COP') as Currency;
  return `${formatPrice(priceCents, c)} ${c}`;
}

export default function WhatsAppShareButton({ session, language, isCreator = false }: WhatsAppShareButtonProps) {
  const handleClick = () => {
    const sportName =
      language === 'es' && sportTranslations[session.sport] ? sportTranslations[session.sport].es : session.sport;

    const dateStr = formatSessionDate(session.date, language);
    const timeStr = formatTime12Hour(session.start_time);
    const locationStr = formatSessionLocation(
      session.location,
      session.latitude ?? session.location_lat ?? null,
      session.longitude ?? session.location_lng ?? null,
      language
    );
    const priceStr = formatPriceLine(!!session.is_paid, session.price_cents, session.currency, language);

    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const sessionUrl = `${origin}/session/${session.id}`;

    const message =
      language === 'es'
        ? `¡Únete a mi sesión de ${sportName} en Tribe!\n📅 ${dateStr} a las ${timeStr}\n📍 ${locationStr}\n💪 ${priceStr}\nReserva aquí: ${sessionUrl}`
        : `Join my ${sportName} session on Tribe!\n📅 ${dateStr} at ${timeStr}\n📍 ${locationStr}\n💪 ${priceStr}\nBook here: ${sessionUrl}`;

    const waUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;

    trackEvent('session_shared', {
      session_id: session.id,
      sport: session.sport,
      channel: 'whatsapp',
      is_creator: isCreator,
      language,
    });

    // Open in a new tab/window so the user keeps their session-detail
    // page open in the background. WhatsApp's deep-link will open the
    // installed app on mobile and the web client on desktop.
    if (typeof window !== 'undefined') {
      window.open(waUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const label = language === 'es' ? 'Compartir en WhatsApp' : 'Share to WhatsApp';

  // Creator gets the bright primary variant (this is their fill-rate
  // tool); attendees get the muted secondary variant so it doesn't
  // compete with Pay & Join / Leave / Group Chat.
  const className = isCreator
    ? 'w-full py-3 font-bold rounded-lg flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#20bd5a] text-white shadow-sm'
    : 'w-full py-2.5 font-medium rounded-lg flex items-center justify-center gap-2 bg-white dark:bg-tribe-surface text-[#075E54] dark:text-[#25D366] border border-[#25D366]/40 hover:bg-[#25D366]/10';

  return (
    <button type="button" onClick={handleClick} className={className} aria-label={label}>
      <MessageCircle className="w-5 h-5" />
      {label}
    </button>
  );
}
