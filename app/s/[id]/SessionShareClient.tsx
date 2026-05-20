'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Calendar, Clock, MapPin, Users, Star, DollarSign } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { createClient } from '@/lib/supabase/client';
import { trackEvent } from '@/lib/analytics';
import { detectNeighborhood, getNearestNeighborhood } from '@/lib/city-config';

import TribeWordmark from '@/components/TribeWordmark';

export interface InitialSession {
  id: string;
  title: string;
  sport: string;
  date: string;
  time: string | null;
  start_time: string | null;
  location_name: string | null;
  location_lat: number | null;
  location_lng: number | null;
  price: number | null;
  price_cents: number | null;
  currency: string | null;
  max_participants: number;
  creator_id: string;
  creator: {
    id: string;
    name: string | null;
    avatar_url: string | null;
    average_rating: number | null;
  } | null;
}

interface Props {
  initialSession: InitialSession | null;
  sessionId: string;
}

export default function SessionShareClient({ initialSession, sessionId }: Props) {
  const { language } = useLanguage();
  const supabase = createClient();

  // session is server-fetched — no client refetch on mount, no Loading flash.
  // Only the auth user and live participant count are client-side.
  const session = initialSession;
  const [confirmedCount, setConfirmedCount] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    (async () => {
      const [{ count }, userRes] = await Promise.all([
        supabase
          .from('session_participants')
          .select('*', { count: 'exact', head: true })
          .eq('session_id', sessionId)
          .eq('status', 'confirmed'),
        supabase.auth.getUser(),
      ]);
      setConfirmedCount(count ?? 0);
      if (userRes.data?.user) setUserId(userRes.data.user.id);
      trackEvent('session_viewed', { session_id: sessionId, source: 'public_share' });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  if (!session) {
    return (
      <div className="min-h-screen bg-theme-page flex items-center justify-center p-6">
        <div className="text-center">
          <TribeWordmark className="h-6 w-auto" />
          <p className="text-theme-tertiary mt-4">{language === 'es' ? 'Sesión no encontrada' : 'Session not found'}</p>
          <Link href="/" className="mt-6 inline-block px-6 py-3 bg-tribe-green text-slate-900 font-bold rounded-lg">
            {language === 'es' ? 'Ir a Tribe' : 'Go to Tribe'}
          </Link>
        </div>
      </div>
    );
  }

  const spotsLeft = session.max_participants - confirmedCount;
  const isFree = !session.price && !session.price_cents;
  const priceDisplay = isFree
    ? language === 'es'
      ? 'Gratis'
      : 'Free'
    : session.price_cents
      ? `$${(session.price_cents / 100).toLocaleString()} ${session.currency || 'COP'}`
      : `$${session.price?.toLocaleString()} ${session.currency || 'COP'}`;

  const neighborhood =
    session.location_lat && session.location_lng
      ? detectNeighborhood(session.location_lat, session.location_lng) ||
        getNearestNeighborhood(session.location_lat, session.location_lng)
      : null;

  const dateFormatted = new Date(session.date + 'T12:00:00').toLocaleDateString(language === 'es' ? 'es-CO' : 'en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const timeDisplay = session.start_time || session.time || null;
  const timeFormatted = timeDisplay
    ? new Date(`2000-01-01T${timeDisplay}`).toLocaleTimeString(language === 'es' ? 'es-CO' : 'en-US', {
        hour: 'numeric',
        minute: '2-digit',
      })
    : null;

  const rating = session.creator?.average_rating;
  const ctaHref = userId ? `/session/${session.id}` : `/auth?session=${session.id}`;
  const ctaLabel = userId
    ? language === 'es'
      ? 'Reservar Ahora'
      : 'Book Now'
    : language === 'es'
      ? 'Únete a esta sesión en Tribe'
      : 'Join This Session on Tribe';

  return (
    <div className="min-h-screen bg-theme-page">
      {/* Header */}
      <div className="px-6 pt-10 pb-4 text-center">
        <TribeWordmark className="h-6 w-auto" />
        <p className="text-sm text-theme-tertiary mt-1">
          {language === 'es' ? 'Entrena con tu tribu' : 'Train with your tribe'}
        </p>
      </div>

      {/* Session Card */}
      <div className="max-w-lg mx-auto px-4 pb-10">
        <div className="bg-theme-card rounded-2xl p-6 border border-theme space-y-5">
          {/* Sport tag + title */}
          <div>
            <span className="inline-block px-3 py-1 bg-tribe-green/20 text-tribe-green text-xs font-bold rounded-full uppercase tracking-wide mb-3">
              {session.sport}
            </span>
            <h2 className="text-2xl font-bold text-theme-primary leading-tight">{session.title}</h2>
          </div>

          {/* Date & time */}
          <div className="flex flex-wrap gap-4 text-sm text-theme-secondary">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-tribe-green" />
              <span className="capitalize">{dateFormatted}</span>
            </div>
            {timeFormatted && (
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-tribe-green" />
                <span>{timeFormatted}</span>
              </div>
            )}
          </div>

          {/* Location */}
          {(session.location_name || neighborhood) && (
            <div className="flex items-start gap-2 text-sm text-theme-secondary">
              <MapPin className="w-4 h-4 text-tribe-green mt-0.5 flex-shrink-0" />
              <span>
                {session.location_name}
                {neighborhood && <span className="text-theme-tertiary"> — {neighborhood.name}</span>}
              </span>
            </div>
          )}

          {/* Price + spots */}
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2 text-theme-primary font-semibold">
              <DollarSign className="w-4 h-4 text-tribe-green" />
              {priceDisplay}
            </div>
            <div className="flex items-center gap-2 text-theme-secondary">
              <Users className="w-4 h-4 text-tribe-green" />
              {spotsLeft > 0
                ? language === 'es'
                  ? `${spotsLeft} cupos disponibles`
                  : `${spotsLeft} spots left`
                : language === 'es'
                  ? 'Lleno'
                  : 'Full'}
            </div>
          </div>

          {/* Instructor */}
          {session.creator && (
            <div className="flex items-center gap-3 pt-2 border-t border-theme">
              <div className="w-10 h-10 rounded-full bg-tribe-green flex items-center justify-center overflow-hidden flex-shrink-0">
                {session.creator.avatar_url ? (
                  <img
                    src={session.creator.avatar_url}
                    alt={session.creator.name ?? ''}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-slate-900 font-bold">{session.creator.name?.[0]?.toUpperCase() || '?'}</span>
                )}
              </div>
              <div>
                <p className="text-theme-primary font-semibold text-sm">{session.creator.name}</p>
                {rating != null && rating > 0 && (
                  <div className="flex items-center gap-1 text-xs text-theme-tertiary">
                    <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                    {rating.toFixed(1)}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* CTA */}
          <Link
            href={ctaHref}
            className="block w-full text-center py-4 bg-tribe-green text-slate-900 font-bold text-lg rounded-xl hover:brightness-110 transition"
          >
            {ctaLabel}
          </Link>
        </div>
      </div>
    </div>
  );
}
