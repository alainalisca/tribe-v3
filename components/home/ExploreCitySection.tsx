'use client';

import { useLanguage } from '@/lib/LanguageContext';
import { ACTIVE_CITY, getPopularNeighborhoods } from '@/lib/city-config';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface NeighborhoodStats {
  sessionCount: number;
  instructorCount: number;
}

export default function ExploreCitySection() {
  const { language } = useLanguage();
  const [stats, setStats] = useState<Record<string, NeighborhoodStats>>({});
  const supabase = createClient();

  useEffect(() => {
    loadStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  async function loadStats() {
    const hoods = getPopularNeighborhoods();
    const result: Record<string, NeighborhoodStats> = {};

    // TODO: Replace per-neighborhood queries with a single RPC that returns all stats at once
    // This will be needed when we expand beyond 8 neighborhoods
    for (const hood of hoods) {
      const { count: sessionCount } = await supabase
        .from('sessions')
        .select('id', { count: 'exact', head: true })
        .in('status', ['active', 'upcoming'])
        .gte('location_lat', hood.bounds.sw.lat)
        .lte('location_lat', hood.bounds.ne.lat)
        .gte('location_lng', hood.bounds.sw.lng)
        .lte('location_lng', hood.bounds.ne.lng);

      const { data: instructorData } = await supabase
        .from('sessions')
        .select('creator_id')
        .gte('location_lat', hood.bounds.sw.lat)
        .lte('location_lat', hood.bounds.ne.lat)
        .gte('location_lng', hood.bounds.sw.lng)
        .lte('location_lng', hood.bounds.ne.lng);

      const uniqueInstructors = new Set(instructorData?.map((s) => s.creator_id) || []);

      result[hood.id] = {
        sessionCount: sessionCount || 0,
        instructorCount: uniqueInstructors.size,
      };
    }

    setStats(result);
  }

  const hoods = getPopularNeighborhoods();

  return (
    <div className="px-4 py-3">
      <h2 className="text-base font-bold text-stone-900 dark:text-white mb-0.5">
        {language === 'es' ? `Explora ${ACTIVE_CITY.name}` : `Explore ${ACTIVE_CITY.name}`}
      </h2>
      <p className="text-[11px] text-stone-500 dark:text-gray-500 mb-3">
        {language === 'es'
          ? 'Toca un barrio para ver qu\u00e9 est\u00e1 pasando'
          : "Tap a neighborhood to see what's happening"}
      </p>

      <div className="space-y-2.5">
        {hoods.map((hood) => {
          const s = stats[hood.id] || { sessionCount: 0, instructorCount: 0 };
          const desc = language === 'es' ? hood.description.es : hood.description.en;

          return (
            <div
              key={hood.id}
              className="w-full text-left p-3.5 rounded-2xl border border-blue-500/15 bg-gradient-to-br from-blue-500/[0.06] to-tribe-green/[0.03]"
            >
              <div className="font-bold text-sm text-stone-900 dark:text-white mb-1">
                {hood.emoji} {hood.name}
              </div>
              <p className="text-[11px] text-stone-500 dark:text-gray-400 leading-relaxed mb-2">{desc}</p>
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
            </div>
          );
        })}
      </div>
    </div>
  );
}
