'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { sportTranslations } from '@/lib/translations';

interface AvailabilityPreviewProps {
  instructorId: string;
  language: 'en' | 'es';
  daysAhead?: number;
}

interface UpcomingSession {
  id: string;
  date: string;
  start_time: string;
  sport: string | null;
  title: string | null;
  max_participants: number | null;
  participant_count: number;
}

function formatDayLabel(iso: string, language: 'en' | 'es'): string {
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString(language === 'es' ? 'es-CO' : 'en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export default function AvailabilityPreview({ instructorId, language, daysAhead = 14 }: AvailabilityPreviewProps) {
  const [sessions, setSessions] = useState<UpcomingSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function load() {
      setLoading(true);
      const today = new Date().toISOString().slice(0, 10);
      const end = new Date(Date.now() + daysAhead * 86400000).toISOString().slice(0, 10);

      const { data, error } = await supabase
        .from('sessions')
        .select('id, date, start_time, sport, title, max_participants, session_participants(count)')
        .eq('creator_id', instructorId)
        .eq('status', 'active')
        .gte('date', today)
        .lte('date', end)
        .order('date', { ascending: true })
        .order('start_time', { ascending: true })
        .limit(20);

      if (cancelled) return;
      if (!error && data) {
        const mapped: UpcomingSession[] = (data as Array<Record<string, unknown>>).map((row) => {
          const countArr = row.session_participants as unknown as { count: number }[] | null;
          return {
            id: row.id as string,
            date: row.date as string,
            start_time: (row.start_time as string) || '',
            sport: (row.sport as string | null) ?? null,
            title: (row.title as string | null) ?? null,
            max_participants: (row.max_participants as number | null) ?? null,
            participant_count: countArr?.[0]?.count ?? 0,
          };
        });
        setSessions(mapped);
      }
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [instructorId, daysAhead]);

  const t = {
    heading: language === 'es' ? `Próximos ${daysAhead} Días` : `Next ${daysAhead} Days`,
    noSessions: language === 'es' ? 'Aún no hay sesiones programadas' : 'No sessions scheduled yet',
    seeAll: language === 'es' ? 'Ver todas las sesiones' : 'See all sessions',
    loading: language === 'es' ? 'Cargando…' : 'Loading…',
    full: language === 'es' ? 'Lleno' : 'Full',
  };

  if (loading) {
    return (
      <div className="bg-[#3D4349] rounded-xl p-4">
        <p className="text-xs text-gray-400">{t.loading}</p>
      </div>
    );
  }

  return (
    <div className="bg-[#3D4349] rounded-xl p-4">
      <h3 className="text-sm font-semibold text-white mb-3">{t.heading}</h3>
      {sessions.length === 0 ? (
        <p className="text-xs text-gray-400">{t.noSessions}</p>
      ) : (
        <ul className="space-y-2">
          {sessions.map((s) => {
            const full = s.max_participants != null && s.participant_count >= s.max_participants;
            const sportLabel = s.sport
              ? language === 'es'
                ? sportTranslations[s.sport]?.es || s.sport
                : sportTranslations[s.sport]?.en || s.sport
              : '';
            return (
              <li key={s.id}>
                <Link
                  href={`/session/${s.id}`}
                  className="flex items-center gap-2 py-1.5 text-sm text-gray-200 hover:text-[#A3E635]"
                >
                  <span
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${full ? 'bg-red-500' : 'bg-[#84cc16]'}`}
                    aria-hidden="true"
                  />
                  <span className="text-xs text-gray-400 w-20 flex-shrink-0">{formatDayLabel(s.date, language)}</span>
                  <span className="text-xs text-gray-400 w-16 flex-shrink-0">{s.start_time.slice(0, 5)}</span>
                  <span className="flex-1 truncate">{s.title || sportLabel}</span>
                  {full && <span className="text-[10px] uppercase text-red-400 font-semibold">{t.full}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
