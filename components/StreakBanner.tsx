'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/LanguageContext';
import { logError } from '@/lib/logger';

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

      // Calculate current weekly streak
      const now = new Date();
      const currentWeekStart = new Date(now);
      currentWeekStart.setDate(now.getDate() - now.getDay());
      currentWeekStart.setHours(0, 0, 0, 0);

      // Get all weeks with at least one attendance
      const weeksWithAttendance = new Set<number>();
      records.forEach((record) => {
        const sessionDate = new Date(record.sessions.date);
        const weekStart = new Date(sessionDate);
        weekStart.setDate(sessionDate.getDate() - sessionDate.getDay());
        weekStart.setHours(0, 0, 0, 0);
        const weekNumber = Math.floor((sessionDate.getTime() - weekStart.getTime()) / (1000 * 60 * 60 * 24 * 7));
        weeksWithAttendance.add(weekNumber);
      });

      // Count consecutive weeks backwards from current week
      let currentWeekStreak = 0;
      const currentWeekNumber = Math.floor((now.getTime() - currentWeekStart.getTime()) / (1000 * 60 * 60 * 24 * 7));

      for (let i = currentWeekNumber; weeksWithAttendance.has(i); i--) {
        currentWeekStreak++;
      }

      setStreak(currentWeekStreak);

      // Calculate days in current week with attendance
      const daysInWeek: boolean[] = [false, false, false, false, false, false, false];
      records.forEach((record) => {
        const sessionDate = new Date(record.sessions.date);
        const weekStart = new Date(currentWeekStart);
        const dayDiff = Math.floor((sessionDate.getTime() - weekStart.getTime()) / (1000 * 60 * 60 * 24));

        if (dayDiff >= 0 && dayDiff < 7) {
          daysInWeek[dayDiff] = true;
        }
      });

      setWeekDays(daysInWeek);
      setLoading(false);
    } catch (error) {
      logError(error, { action: 'fetchStreakData', userId });
      setLoading(false);
    }
  }

  // Don't show if no streak
  if (loading || streak === 0) {
    return null;
  }

  const streakLabel = language === 'es' ? 'Racha de' : 'Streak';
  const weeksLabel = streak === 1 ? (language === 'es' ? 'semana' : 'week') : language === 'es' ? 'semanas' : 'weeks';
  const showSparkle = streak >= 4;

  return (
    <div className="bg-white dark:bg-[#52575D] rounded-lg p-4 mb-4 shadow-sm border border-gray-200 dark:border-[#6B7178]">
      {/* Streak header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🔥</span>
          <div className="flex items-baseline gap-1">
            <span className="text-gray-600 dark:text-gray-300 text-sm">{streakLabel}</span>
            <span className="text-tribe-green font-bold text-lg">{streak}</span>
            <span className="text-gray-600 dark:text-gray-300 text-sm">{weeksLabel}</span>
          </div>
          {showSparkle && <span className="text-lg">✨</span>}
        </div>
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
                    : 'bg-gray-300 dark:bg-[#6B7178] text-gray-500 dark:text-gray-400'
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
