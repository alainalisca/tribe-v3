'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { sportTranslations } from '@/lib/translations';
import { trackEvent } from '@/lib/analytics';

interface RebookingStepProps {
  instructorId: string;
  instructorName: string;
  sport: string;
  language: 'en' | 'es';
  city?: string | null;
  onBookNow?: (sessionId: string) => void;
}

interface UpcomingSessionCard {
  id: string;
  title: string | null;
  sport: string | null;
  date: string;
  start_time: string | null;
  location: string | null;
  neighborhood: string | null;
  is_paid: boolean | null;
  price_cents: number | null;
  currency: string | null;
  max_participants: number | null;
  participant_count: number;
  creator_id: string;
  creator_name: string | null;
}

function formatDay(iso: string, language: 'en' | 'es'): string {
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString(language === 'es' ? 'es-CO' : 'en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function formatPrice(
  isPaid: boolean | null,
  cents: number | null,
  currency: string | null,
  language: 'en' | 'es'
): string {
  if (!isPaid || !cents) return language === 'es' ? 'Gratis' : 'Free';
  if (currency === 'USD') return `$${(cents / 100).toFixed(2)} USD`;
  return `$${Math.round(cents).toLocaleString(language === 'es' ? 'es-CO' : 'en-US')} COP`;
}

function SessionCard({
  s,
  language,
  variant,
}: {
  s: UpcomingSessionCard;
  language: 'en' | 'es';
  variant: 'primary' | 'similar';
}) {
  const spotsLeft = s.max_participants != null ? Math.max(0, s.max_participants - s.participant_count) : null;
  const sportLabel = s.sport
    ? language === 'es'
      ? sportTranslations[s.sport]?.es || s.sport
      : sportTranslations[s.sport]?.en || s.sport
    : '';
  const spotsLabel = (() => {
    if (spotsLeft == null) return '';
    if (spotsLeft === 0) return language === 'es' ? 'Lleno' : 'Full';
    return language === 'es' ? `${spotsLeft} lugares` : `${spotsLeft} spots left`;
  })();

  return (
    <div
      className={`rounded-xl p-3 border ${
        variant === 'primary' ? 'bg-[#3D4349] border-[#84cc16]/30' : 'bg-[#272D34] border-[#3D4349]'
      }`}
    >
      <p className="text-xs text-gray-400">
        {formatDay(s.date, language)}
        {s.start_time ? ` · ${s.start_time.slice(0, 5)}` : ''}
      </p>
      <p className="text-sm font-semibold text-white mt-0.5">{s.title || sportLabel}</p>
      {variant === 'similar' && s.creator_name && <p className="text-xs text-gray-400 mt-0.5">{s.creator_name}</p>}
      <p className="text-xs text-gray-400">
        {s.neighborhood || s.location || ''}
        {spotsLabel ? ` · ${spotsLabel}` : ''}
        {' · '}
        {formatPrice(s.is_paid, s.price_cents, s.currency, language)}
      </p>
      <Link
        href={`/session/${s.id}`}
        onClick={() =>
          trackEvent('post_session_rebook', {
            source: 'post_session_flow',
            session_id: s.id,
            instructor_id: s.creator_id,
            variant,
          })
        }
        className="mt-2 block w-full text-center py-2 rounded-lg bg-[#84cc16] hover:bg-[#A3E635] text-slate-900 text-xs font-bold"
      >
        {language === 'es' ? 'Reservar' : 'Book Now'}
      </Link>
    </div>
  );
}

export default function RebookingStep({ instructorId, instructorName, sport, language, city }: RebookingStepProps) {
  const supabase = createClient();
  const [byInstructor, setByInstructor] = useState<UpcomingSessionCard[]>([]);
  const [similar, setSimilar] = useState<UpcomingSessionCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const now = new Date().toISOString();
      const today = now.slice(0, 10);
      const next7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

      const selectFields = `
        id, title, sport, date, start_time, location, neighborhood,
        is_paid, price_cents, currency, max_participants, creator_id,
        session_participants(count),
        creator:creator_id(name)
      `;

      // Primary: next 3 sessions by this instructor
      const { data: primaryData } = await supabase
        .from('sessions')
        .select(selectFields)
        .eq('creator_id', instructorId)
        .eq('status', 'active')
        .gte('date', today)
        .order('date', { ascending: true })
        .order('start_time', { ascending: true })
        .limit(3);

      // Similar: same sport, same city, different instructor, next 7 days
      let similarQuery = supabase
        .from('sessions')
        .select(selectFields)
        .neq('creator_id', instructorId)
        .eq('status', 'active')
        .gte('date', today)
        .lte('date', next7);
      if (sport) similarQuery = similarQuery.eq('sport', sport);
      const { data: similarData } = await similarQuery.order('date', { ascending: true }).limit(2);

      if (cancelled) return;

      const mapRow = (row: Record<string, unknown>): UpcomingSessionCard => {
        const countArr = row.session_participants as unknown as { count: number }[] | null;
        const creatorRel = row.creator as { name: string | null } | null;
        return {
          id: row.id as string,
          title: (row.title as string | null) ?? null,
          sport: (row.sport as string | null) ?? null,
          date: row.date as string,
          start_time: (row.start_time as string | null) ?? null,
          location: (row.location as string | null) ?? null,
          neighborhood: (row.neighborhood as string | null) ?? null,
          is_paid: (row.is_paid as boolean | null) ?? null,
          price_cents: (row.price_cents as number | null) ?? null,
          currency: (row.currency as string | null) ?? null,
          max_participants: (row.max_participants as number | null) ?? null,
          participant_count: countArr?.[0]?.count ?? 0,
          creator_id: row.creator_id as string,
          creator_name: creatorRel?.name ?? null,
        };
      };

      setByInstructor((primaryData || []).map((r) => mapRow(r as Record<string, unknown>)));
      setSimilar((similarData || []).map((r) => mapRow(r as Record<string, unknown>)));
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [instructorId, sport, city, supabase]);

  const t = {
    heading: language === 'es' ? '¡Gran sesión!' : 'Great session!',
    nextFrom: language === 'es' ? `Próximas sesiones de ${instructorName}:` : `${instructorName}'s next sessions:`,
    seeAll:
      language === 'es' ? `Ver todas las sesiones de ${instructorName} →` : `See all sessions by ${instructorName} →`,
    noUpcoming:
      language === 'es'
        ? `${instructorName} aún no tiene próximas sesiones`
        : `${instructorName} has no upcoming sessions yet`,
    similar: language === 'es' ? 'Sesiones similares cerca de ti' : 'Similar sessions near you',
    loading: language === 'es' ? 'Cargando…' : 'Loading…',
  };

  if (loading) {
    return <div className="py-6 text-center text-sm text-gray-400">{t.loading}</div>;
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold text-theme-primary text-center">🎉 {t.heading}</h3>

      <div>
        <p className="text-sm font-semibold text-theme-primary mb-2">{t.nextFrom}</p>
        {byInstructor.length === 0 ? (
          <p className="text-xs text-theme-secondary">{t.noUpcoming}</p>
        ) : (
          <div className="space-y-2">
            {byInstructor.map((s) => (
              <SessionCard key={s.id} s={s} language={language} variant="primary" />
            ))}
          </div>
        )}
        <Link
          href={`/storefront/${instructorId}`}
          className="mt-2 block text-center text-xs font-semibold text-[#84cc16] hover:text-[#A3E635]"
        >
          {t.seeAll}
        </Link>
      </div>

      {similar.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-theme-primary mb-2">── {t.similar} ──</p>
          <div className="grid grid-cols-2 gap-2">
            {similar.map((s) => (
              <SessionCard key={s.id} s={s} language={language} variant="similar" />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
