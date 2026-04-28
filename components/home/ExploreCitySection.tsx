'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { ACTIVE_CITY, getPopularNeighborhoods } from '@/lib/city-config';
import { createClient } from '@/lib/supabase/client';
import { fetchNeighborhoodStats, type NeighborhoodStats } from '@/lib/dal/neighborhoods';

export default function ExploreCitySection() {
  const { language } = useLanguage();
  const [stats, setStats] = useState<Record<string, NeighborhoodStats>>({});

  useEffect(() => {
    const supabase = createClient();
    const hoods = getPopularNeighborhoods();
    let cancelled = false;
    fetchNeighborhoodStats(supabase, hoods).then((res) => {
      if (cancelled) return;
      if (res.success && res.data) setStats(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const hoods = getPopularNeighborhoods();

  return (
    <div className="px-4 py-3">
      <h2 className="text-base font-bold text-stone-900 dark:text-white mb-0.5">
        {language === 'es' ? `Explora ${ACTIVE_CITY.name}` : `Explore ${ACTIVE_CITY.name}`}
      </h2>
      <p className="text-[11px] text-stone-500 dark:text-gray-500 mb-3">
        {language === 'es' ? 'Toca un barrio para ver qué está pasando' : "Tap a neighborhood to see what's happening"}
      </p>

      <div className="space-y-2.5">
        {hoods.map((hood) => {
          const s = stats[hood.id] || { sessionCount: 0, instructorCount: 0 };
          const desc = language === 'es' ? hood.description.es : hood.description.en;
          const isEmpty = s.sessionCount === 0 && s.instructorCount === 0;
          // Pre-fill /create with the neighborhood name + center coords so the
          // CTA actually saves the host a step. /create already reads these.
          const createHref = `/create?location=${encodeURIComponent(hood.name)}&lat=${hood.center.lat}&lng=${hood.center.lng}`;

          return (
            <div
              key={hood.id}
              className="w-full text-left p-3.5 rounded-2xl border border-blue-500/15 bg-gradient-to-br from-blue-500/[0.06] to-tribe-green/[0.03]"
            >
              <div className="font-bold text-sm text-stone-900 dark:text-white mb-1">
                {hood.emoji} {hood.name}
              </div>
              <p className="text-[11px] text-stone-500 dark:text-gray-400 leading-relaxed mb-2">{desc}</p>

              {isEmpty ? (
                <Link
                  href={createHref}
                  className="inline-flex items-center gap-1 text-[12px] font-semibold text-tribe-green hover:underline"
                >
                  {language === 'es'
                    ? `Sé el primero en organizar en ${hood.name}`
                    : `Be the first to host in ${hood.name}`}
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              ) : (
                <div className="flex gap-4">
                  <div className="text-center">
                    <div className="text-base font-extrabold text-blue-400">{s.sessionCount}</div>
                    <div className="text-[9px] text-stone-500 dark:text-gray-500">
                      {language === 'es' ? 'Sesiones' : 'Sessions'}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-base font-extrabold text-blue-400">{s.instructorCount}</div>
                    <div className="text-[9px] text-stone-500 dark:text-gray-500">
                      {language === 'es' ? 'Instructores' : 'Instructors'}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
