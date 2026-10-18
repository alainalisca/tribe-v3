'use client';

import { PosterHeader } from '@/components/bridge';
import { useTranslations } from '@/lib/i18n/useTranslations';
import { publicSessionPlace, publicSessionTitle } from '@/lib/share/sessionPublic';
import { formatPrice } from '@/lib/site/weekFormat';
import { translateSport } from '@/lib/sportTranslationData';

/** What the poster reads off a session; both the signed-in and the signed-out row have it. */
export type PosterSession = {
  title: string | null;
  sport: string | null;
  photos: string[] | null;
  is_paid: boolean | null;
  price_cents: number | null;
  currency: string | null;
  location: string | null;
  location_lat: number | null;
  location_lng: number | null;
  partner_status: string | null;
};

/** The session price as the poster tag and the Cuánto line show it ("40.000 COP"), or null when free. */
export function sessionPriceLabel(session: PosterSession, language: 'es' | 'en'): string | null {
  if (!session.is_paid || (session.price_cents ?? 0) <= 0) return null;
  const currency = session.currency ?? 'COP';
  return `${formatPrice({ cents: session.price_cents ?? 0, currency }, language)} ${currency.toUpperCase()}`;
}

/**
 * T-JOIN1 Part B: a session's PosterHeader. The title (or "<Deporte> con
 * <Nombre>"), the first photo or the ink grid, the place (partner gym or
 * barrio, never the street address) and the price or "Gratis". The signed-out
 * page always opens with it; the signed-in page only when the session has no
 * photo.
 */
export default function SessionPoster({
  session,
  creatorName,
  gymName,
  language,
  place: placeOverride,
}: {
  session: PosterSession;
  creatorName: string | null;
  /** The partner gym's name when the session is at an approved, active partner. */
  gymName: string | null;
  language: 'es' | 'en';
  /** T-SSR1: the place worked out on the server (never the street address). */
  place?: string | null;
}) {
  const t = useTranslations('sessionPublic');
  const { place } =
    placeOverride !== undefined
      ? { place: placeOverride }
      : publicSessionPlace({
          partnerName: gymName,
          partnerApproved: session.partner_status === 'approved' && !!gymName,
          lat: session.location_lat,
          lng: session.location_lng,
          location: session.location,
        });
  return (
    <PosterHeader
      title={publicSessionTitle({ title: session.title, sport: session.sport, creatorName }, language)}
      sport={session.sport && session.sport !== 'Other' ? translateSport(session.sport, language) : null}
      photoUrl={(session.photos ?? []).find(Boolean) ?? null}
      caption={place}
      tag={sessionPriceLabel(session, language) ?? t('free')}
    />
  );
}
