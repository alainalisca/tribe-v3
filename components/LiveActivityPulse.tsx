'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/LanguageContext';
import { fetchActivityStats } from '@/lib/dal/sessions';

export default function LiveActivityPulse() {
  const { language } = useLanguage();
  const lang = language === 'es' ? 'es' : 'en';

  const [stats, setStats] = useState<{
    activeAthletes: number;
    sessionsThisWeek: number;
    totalSessions: number;
  } | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const supabase = createClient();
        const result = await fetchActivityStats(supabase);
        if (cancelled) return;
        if (result.success && result.data) {
          setStats(result.data);
        } else {
          setError(true);
        }
      } catch {
        if (!cancelled) setError(true);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Gracefully hide on error
  if (error) return null;

  // Loading skeleton
  if (!stats) {
    return (
      <div className="mb-4 rounded-xl px-4 py-3 bg-stone-100 dark:bg-[#3D4349]">
        <div className="h-5 w-3/4 mx-auto rounded bg-stone-200 dark:bg-[#52575D] animate-pulse" />
      </div>
    );
  }

  return (
    <div className="mb-4 rounded-xl px-4 py-3 bg-stone-100 dark:bg-[#3D4349] flex items-center justify-center gap-2 text-sm text-stone-600 dark:text-gray-300">
      <span className="relative flex h-2.5 w-2.5">
        <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
      </span>

      <span>
        <strong>{stats.activeAthletes}</strong> {lang === 'es' ? 'atletas activos' : 'athletes active'}
      </span>
      <span className="text-stone-400 dark:text-gray-500">&middot;</span>
      <span>
        <strong>{stats.sessionsThisWeek}</strong> {lang === 'es' ? 'sesiones esta semana' : 'sessions this week'}
      </span>
      <span className="text-stone-400 dark:text-gray-500">&middot;</span>
      <span>
        <strong>{stats.totalSessions}</strong> {lang === 'es' ? 'sesiones creadas' : 'sessions created'}
      </span>
    </div>
  );
}
