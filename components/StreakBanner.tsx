'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/LanguageContext';
import { useTranslations } from '@/lib/i18n/useTranslations';
import { logError } from '@/lib/logger';
import { X } from 'lucide-react';
import ShareButton from '@/components/ShareButton';
import { useBannerDismissal, BANNER_IDS } from '@/hooks/useBannerDismissal';
import { shareAchievement } from '@/lib/share';
import { getSessionWeekIndex, getSessionWeekday, computeWeeklyStreak } from '@/lib/utils';
import { bogotaToday } from '@/lib/time/bogotaDate';

interface StreakBannerProps {
  userId: string;
}

interface AttendanceRecord {
  session_id: string;
  attended: boolean;
  sessions: {
    date: string;
  };
}

export default function StreakBanner({ userId }: StreakBannerProps) {
  const supabase = createClient();
  // T-ONB1: this banner had no dismiss control at all — the only one of the
  // five without a way to make it stop.
  const { dismissed, loading: dismissalLoading, dismiss } = useBannerDismissal(BANNER_IDS.streak);
  const tCommon = useTranslations('common');
  const { language } = useLanguage();
  const [streak, setStreak] = useState<number>(0);
  const [weekDays, setWeekDays] = useState<boolean[]>([false, false, false, false, false, false, false]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStreakData();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- userId is the dependency
  }, [userId]);

  async function fetchStreakData() {
    try {
      const { data, error } = await supabase
        .from('session_attendance')
        .select('session_id, attended, sessions!inner(date)')
        .eq('user_id', userId)
        .eq('attended', true)
        .order('created_at', { ascending: false });

      if (error) {
        logError(error, { action: 'fetchStreakData', userId });
        setLoading(false);
        return;
      }

      if (!data || data.length === 0) {
        setLoading(false);
        return;
      }

      const records = data as unknown as AttendanceRecord[];

      // Bucket attended sessions by week and compute the streak. All week math
      // lives in getSessionWeekIndex / computeWeeklyStreak so this component and
      // AchievementBadges share one tested implementation instead of duplicating
      // it (the old copy always bucketed to 0, pinning the streak at 0 or 1).
      // currentWeekIndex is today's week in Medellin, the in-progress week that
      // counts toward the streak but never breaks it (see computeWeeklyStreak).
      const currentWeekIndex = getSessionWeekIndex(bogotaToday());
      const weeksWithAttendance = new Set<number>(records.map((r) => getSessionWeekIndex(r.sessions.date)));
      setStreak(computeWeeklyStreak(weeksWithAttendance, currentWeekIndex));

      // Days of the CURRENT week (Sunday=0 .. Saturday=6) that have an attended
      // session. Week membership and weekday are both read in the same UTC frame
      // as getSessionWeekIndex, so the previous UTC-date vs local-midnight
      // mismatch (which dropped a same-day session) is gone.
      const daysInWeek: boolean[] = [false, false, false, false, false, false, false];
      records.forEach((record) => {
        if (getSessionWeekIndex(record.sessions.date) === currentWeekIndex) {
          daysInWeek[getSessionWeekday(record.sessions.date)] = true;
        }
      });
      setWeekDays(daysInWeek);
      setLoading(false);
    } catch (error) {
      logError(error, { action: 'fetchStreakData', userId });
      setLoading(false);
    }
  }

  // No streak, dismissed, or the answer is not known yet.
  if (loading || dismissalLoading || dismissed || streak === 0) {
    return null;
  }

  const streakLabel = language === 'es' ? 'Racha de' : 'Streak';
  const weeksLabel = streak === 1 ? (language === 'es' ? 'semana' : 'week') : language === 'es' ? 'semanas' : 'weeks';
  const showSparkle = streak >= 4;

  return (
    <div className="relative bg-white dark:bg-tribe-mid rounded-lg p-4 mb-4 shadow-sm border border-gray-200 dark:border-tribe-card">
      <button
        onClick={dismiss}
        aria-label={tCommon('dismiss')}
        className="absolute top-1 right-1 min-w-[40px] min-h-[40px] flex items-center justify-center text-stone-500 hover:text-stone-700 dark:text-gray-400 dark:hover:text-gray-200 rounded"
      >
        <X className="w-4 h-4" />
      </button>

      {/* Streak header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🔥</span>
          <div className="flex items-baseline gap-1">
            <span className="text-gray-600 dark:text-gray-300 text-sm">{streakLabel}</span>
            <span className="text-tribe-amber font-bold text-lg">{streak}</span>
            <span className="text-gray-600 dark:text-gray-300 text-sm">{weeksLabel}</span>
          </div>
          {showSparkle && <span className="text-lg">✨</span>}
        </div>
        <ShareButton
          size="sm"
          variant="icon"
          onShare={async () => {
            await shareAchievement({ type: 'streak', title: 'Training Streak', count: streak }, language);
            return null;
          }}
        />
      </div>

      {/* Week days indicator */}
      <div className="flex justify-center gap-1.5">
        {weekDays.map((hasAttendance, index) => {
          const days = language === 'es' ? ['L', 'M', 'X', 'J', 'V', 'S', 'D'] : ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
          return (
            <div key={index} className="flex flex-col items-center flex-1 max-w-[40px]">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center transition ${
                  hasAttendance
                    ? 'bg-tribe-green text-slate-900'
                    : 'bg-stone-300 dark:bg-tribe-card text-gray-500 dark:text-gray-400'
                }`}
              >
                <span className={`font-bold ${hasAttendance ? 'text-sm' : 'text-xs'}`}>
                  {hasAttendance ? '✓' : days[index]}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
