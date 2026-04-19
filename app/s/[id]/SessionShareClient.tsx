'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Calendar, Clock, MapPin, Users, Star, DollarSign } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { createClient } from '@/lib/supabase/client';
import { trackEvent } from '@/lib/analytics';
import { detectNeighborhood, getNearestNeighborhood } from '@/lib/city-config';

interface SessionData {
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

export default function SessionShareClient() {
  const params = useParams();
  const sessionId = params.id as string;
  const { language } = useLanguage();
  const supabase = createClient();

  const [session, setSession] = useState<SessionData | null>(null);
  const [confirmedCount, setConfirmedCount] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  async function loadData() {
    try {
      const [sessionRes, userRes] = await Promise.all([
        supabase
          .from('sessions')
          .select(
            'id, title, sport, date, time, start_time, location_name, location_lat, location_lng, price, price_cents, currency, max_participants, creator_id, creator:users!sessions_creator_id_fkey(id, name, avatar_url, average_rating)'
          )
          .eq('id', sessionId)
          .single(),
        supabase.auth.getUser(),
      ]);

      if (sessionRes.data) {
        const raw = sessionRes.data as any;
        setSession({
          ...raw,
          creator: Array.isArray(raw.creator) ? raw.creator[0] : raw.creator,
        });
      }

      if (userRes.data?.user) setUserId(userRes.data.user.id);

      const { count } = await supabase
        .from('session_participants')
        .select('*', { count: 'exact', head: true })
        .eq('session_id', sessionId)
        .eq('status', 'confirmed');
      setConfirmedCount(count ?? 0);

      trackEvent('session_viewed', { session_id: sessionId, source: 'public_share' });
    } catch {
      // Session not found handled by null check
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-tribe-dark flex items-center justify-center">
        <div className="animate-pulse text-white text-lg">Loading...</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-tribe-dark flex items-center justify-center p-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-2">
            Tribe<span className="text-tribe-green">.</span>
          </h1>
          <p className="text-gray-400 mt-4">{language === 'es' ? 'Sesion no encontrada' : 'Session not found'}</p>
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
      ? 'Unete a Esta Sesion en Tribe'
      : 'Join This Session on Tribe';

  return (
    <div className="min-h-screen bg-tribe-dark">
      {/* Header */}
      <div className="px-6 pt-10 pb-4 text-center">
        <h1 className="text-2xl font-bold text-white">
          Tribe<span className="text-tribe-green">.</span>
        </h1>
        <p className="text-sm text-gray-400 mt-1">
          {language === 'es' ? 'Entrena con tu tribu' : 'Train with your tribe'}
        </p>
      </div>

      {/* Session Card */}
      <div className="max-w-lg mx-auto px-4 pb-10">
        <div className="bg-tribe-surface rounded-2xl p-6 border border-tribe-mid space-y-5">
          {/* Sport tag + title */}
          <div>
            <span className="inline-block px-3 py-1 bg-tribe-green/20 text-tribe-green text-xs font-bold rounded-full uppercase tracking-wide mb-3">
              {session.sport}
            </span>
            <h2 className="text-2xl font-bold text-white leading-tight">{session.title}</h2>
          </div>

          {/* Date & time */}
          <div className="flex flex-wrap gap-4 text-sm text-gray-300">
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
            <div className="flex items-start gap-2 text-sm text-gray-300">
              <MapPin className="w-4 h-4 text-tribe-green mt-0.5 flex-shrink-0" />
              <span>
                {session.location_name}
                {neighborhood && <span className="text-gray-400"> — {neighborhood.name}</span>}
              </span>
            </div>
          )}

          {/* Price + spots */}
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2 text-white font-semibold">
              <DollarSign className="w-4 h-4 text-tribe-green" />
              {priceDisplay}
            </div>
            <div className="flex items-center gap-2 text-gray-300">
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
            <div className="flex items-center gap-3 pt-2 border-t border-tribe-mid">
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
                <p className="text-white font-semibold text-sm">{session.creator.name}</p>
                {rating != null && rating > 0 && (
                  <div className="flex items-center gap-1 text-xs text-gray-400">
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
