'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Calendar, Clock, MapPin, Star, Award } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { createClient } from '@/lib/supabase/client';
import { trackEvent } from '@/lib/analytics';

interface InstructorProfile {
  id: string;
  name: string | null;
  avatar_url: string | null;
  bio: string | null;
  sports: string[] | null;
  average_rating: number | null;
  city: string | null;
}

interface UpcomingSession {
  id: string;
  title: string;
  sport: string;
  date: string;
  start_time: string | null;
  time: string | null;
  location_name: string | null;
}

export default function InstructorShareClient() {
  const params = useParams();
  const instructorId = params.id as string;
  const { language } = useLanguage();
  const supabase = createClient();

  const [profile, setProfile] = useState<InstructorProfile | null>(null);
  const [sessions, setSessions] = useState<UpcomingSession[]>([]);
  const [sessionCount, setSessionCount] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instructorId]);

  async function loadData() {
    try {
      const today = new Date().toISOString().split('T')[0];

      const [profileRes, sessionsRes, countRes, userRes] = await Promise.all([
        supabase
          .from('users')
          .select('id, name, avatar_url, bio, sports, average_rating, city')
          .eq('id', instructorId)
          .single(),
        supabase
          .from('sessions')
          .select('id, title, sport, date, start_time, time, location_name')
          .eq('creator_id', instructorId)
          .gte('date', today)
          .order('date', { ascending: true })
          .limit(5),
        supabase.from('sessions').select('*', { count: 'exact', head: true }).eq('creator_id', instructorId),
        supabase.auth.getUser(),
      ]);

      if (profileRes.data) setProfile(profileRes.data);
      if (sessionsRes.data) setSessions(sessionsRes.data);
      setSessionCount(countRes.count ?? 0);
      if (userRes.data?.user) setUserId(userRes.data.user.id);

      trackEvent('instructor_profile_viewed', { instructor_id: instructorId, source: 'public_share' });
    } catch {
      // Profile not found handled by null check
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

  if (!profile) {
    return (
      <div className="min-h-screen bg-tribe-dark flex items-center justify-center p-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-2">
            Tribe<span className="text-tribe-green">.</span>
          </h1>
          <p className="text-gray-400 mt-4">
            {language === 'es' ? 'Instructor no encontrado' : 'Instructor not found'}
          </p>
          <Link href="/" className="mt-6 inline-block px-6 py-3 bg-tribe-green text-slate-900 font-bold rounded-lg">
            {language === 'es' ? 'Ir a Tribe' : 'Go to Tribe'}
          </Link>
        </div>
      </div>
    );
  }

  const rating = profile.average_rating;
  const sports = profile.sports ?? [];
  const ctaHref = userId ? `/profile/${profile.id}` : `/auth`;
  const ctaLabel = language === 'es' ? 'Reserva una Sesion' : 'Book a Session';

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

      {/* Instructor Card */}
      <div className="max-w-lg mx-auto px-4 pb-10 space-y-4">
        <div className="bg-tribe-surface rounded-2xl p-6 border border-tribe-mid">
          {/* Avatar + name */}
          <div className="flex flex-col items-center text-center">
            <div className="w-24 h-24 rounded-full bg-tribe-green flex items-center justify-center overflow-hidden mb-4 border-4 border-tribe-green">
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt={profile.name ?? ''} className="w-full h-full object-cover" />
              ) : (
                <span className="text-slate-900 text-3xl font-bold">{profile.name?.[0]?.toUpperCase() || '?'}</span>
              )}
            </div>
            <h2 className="text-2xl font-bold text-white">{profile.name}</h2>
            {profile.city && (
              <div className="flex items-center gap-1 mt-1 text-sm text-gray-400">
                <MapPin className="w-3.5 h-3.5" />
                {profile.city}
              </div>
            )}
          </div>

          {/* Rating + sessions */}
          <div className="flex justify-center gap-6 mt-5">
            {rating != null && rating > 0 && (
              <div className="flex items-center gap-1.5 text-sm text-gray-300">
                <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                <span className="font-semibold text-white">{rating.toFixed(1)}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 text-sm text-gray-300">
              <Award className="w-4 h-4 text-tribe-green" />
              <span>
                {sessionCount} {language === 'es' ? 'sesiones' : 'sessions'}
              </span>
            </div>
          </div>

          {/* Bio */}
          {profile.bio && <p className="mt-5 text-sm text-gray-300 leading-relaxed text-center">{profile.bio}</p>}

          {/* Sports tags */}
          {sports.length > 0 && (
            <div className="flex flex-wrap justify-center gap-2 mt-5">
              {sports.map((sport) => (
                <span
                  key={sport}
                  className="px-3 py-1 bg-tribe-green/20 text-tribe-green text-xs font-bold rounded-full uppercase tracking-wide"
                >
                  {sport}
                </span>
              ))}
            </div>
          )}

          {/* CTA */}
          <Link
            href={ctaHref}
            className="block w-full text-center mt-6 py-4 bg-tribe-green text-slate-900 font-bold text-lg rounded-xl hover:brightness-110 transition"
          >
            {ctaLabel}
          </Link>
        </div>

        {/* Upcoming Sessions */}
        {sessions.length > 0 && (
          <div className="bg-tribe-surface rounded-2xl p-6 border border-tribe-mid">
            <h3 className="text-lg font-bold text-white mb-4">
              {language === 'es' ? 'Proximas Sesiones' : 'Upcoming Sessions'}
            </h3>
            <div className="space-y-3">
              {sessions.map((s) => {
                const d = new Date(s.date + 'T12:00:00').toLocaleDateString(language === 'es' ? 'es-CO' : 'en-US', {
                  month: 'short',
                  day: 'numeric',
                });
                const t = s.start_time || s.time;
                const tf = t
                  ? new Date(`2000-01-01T${t}`).toLocaleTimeString(language === 'es' ? 'es-CO' : 'en-US', {
                      hour: 'numeric',
                      minute: '2-digit',
                    })
                  : null;

                return (
                  <Link
                    key={s.id}
                    href={userId ? `/session/${s.id}` : `/s/${s.id}`}
                    className="block p-3 rounded-xl bg-tribe-dark/50 hover:bg-tribe-mid/50 transition border border-tribe-mid"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-white font-semibold text-sm">{s.title}</p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" /> {d}
                          </span>
                          {tf && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" /> {tf}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="text-xs text-tribe-green font-bold uppercase">{s.sport}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
