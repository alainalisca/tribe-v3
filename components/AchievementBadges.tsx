'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/LanguageContext';
import { logError } from '@/lib/logger';
import ShareButton from '@/components/ShareButton';
import { shareAchievement } from '@/lib/share';

interface AchievementBadgesProps {
  userId: string;
  isOwnProfile: boolean;
}

interface Badge {
  id: string;
  name: string;
  nameEs: string;
  emoji: string;
  lockEmoji: string;
  threshold: number;
  type: 'attended' | 'created' | 'streak';
}

const BADGES: Badge[] = [
  {
    id: 'first-session',
    name: 'First Session',
    nameEs: 'Primera Sesión',
    emoji: '🏆',
    lockEmoji: '🔒',
    threshold: 1,
    type: 'attended',
  },
  {
    id: 'regular',
    name: 'Regular',
    nameEs: 'Habitual',
    emoji: '🥇',
    lockEmoji: '🔒',
    threshold: 10,
    type: 'attended',
  },
  {
    id: 'dedicated',
    name: 'Dedicated',
    nameEs: 'Dedicado',
    emoji: '🔥',
    lockEmoji: '🔒',
    threshold: 25,
    type: 'attended',
  },
  {
    id: 'legend',
    name: 'Legend',
    nameEs: 'Leyenda',
    emoji: '👑',
    lockEmoji: '🔒',
    threshold: 50,
    type: 'attended',
  },
  {
    id: 'streak-master',
    name: 'Streak Master',
    nameEs: 'Maestro de Racha',
    emoji: '⚡',
    lockEmoji: '🔒',
    threshold: 8,
    type: 'streak',
  },
  {
    id: 'session-creator',
    name: 'Session Creator',
    nameEs: 'Creador de Sesiones',
    emoji: '⭐',
    lockEmoji: '🔒',
    threshold: 5,
    type: 'created',
  },
  {
    id: 'community-builder',
    name: 'Community Builder',
    nameEs: 'Constructor Comunitario',
    emoji: '❤️',
    lockEmoji: '🔒',
    threshold: 20,
    type: 'created',
  },
];

export default function AchievementBadges({ userId, isOwnProfile }: AchievementBadgesProps) {
  const supabase = createClient();
  const { language } = useLanguage();
  const [sessionsAttended, setSessionsAttended] = useState(0);
  const [sessionsCreated, setSessionsCreated] = useState(0);
  const [streak, setStreak] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAchievementData();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- userId is the dependency
  }, [userId]);

  async function fetchAchievementData() {
    try {
      // Fetch sessions attended
      const { count: attendedCount, error: attendedError } = await supabase
        .from('session_attendance')
        .select('id', { count: 'exact' })
        .eq('user_id', userId)
        .eq('attended', true);

      if (attendedError) {
        logError(attendedError, { action: 'fetchAttendedSessions', userId });
      }

      // Fetch sessions created
      const { count: createdCount, error: createdError } = await supabase
        .from('sessions')
        .select('id', { count: 'exact' })
        .eq('creator_id', userId);

      if (createdError) {
        logError(createdError, { action: 'fetchCreatedSessions', userId });
      }

      // Fetch streak
      const { data: attendanceData, error: streakError } = await supabase
        .from('session_attendance')
        .select('session_id, attended, sessions!inner(date)')
        .eq('user_id', userId)
        .eq('attended', true)
        .order('created_at', { ascending: false });

      if (streakError) {
        logError(streakError, { action: 'fetchStreakData', userId });
      }

      setSessionsAttended(attendedCount || 0);
      setSessionsCreated(createdCount || 0);

      // Calculate streak
      if (attendanceData && attendanceData.length > 0) {
        const records = attendanceData as unknown as Array<{
          session_id: string;
          attended: boolean;
          sessions: { date: string };
        }>;

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
      }

      setLoading(false);
    } catch (error) {
      logError(error, { action: 'fetchAchievementData', userId });
      setLoading(false);
    }
  }

  // Determine which badges are earned
  const earnedBadges = BADGES.filter((badge) => {
    switch (badge.type) {
      case 'attended':
        return sessionsAttended >= badge.threshold;
      case 'created':
        return sessionsCreated >= badge.threshold;
      case 'streak':
        return streak >= badge.threshold;
      default:
        return false;
    }
  });

  const earnedCount = earnedBadges.length;
  const totalCount = BADGES.length;

  if (loading) {
    return null;
  }

  // Only show if user has earned at least one badge or it's their own profile
  if (earnedCount === 0 && !isOwnProfile) {
    return null;
  }

  return (
    <div className="bg-white dark:bg-tribe-mid rounded-lg p-4 shadow-sm border border-gray-200 dark:border-tribe-card">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-stone-900 dark:text-white">
          {language === 'es' ? 'Logros' : 'Achievements'}
        </h3>
        <span className="text-sm font-medium text-tribe-green">
          {earnedCount}/{totalCount}
        </span>
      </div>

      {/* Badges scroll container */}
      <div className="overflow-x-auto pb-2 -mx-4 px-4">
        <div className="flex gap-4 min-w-min justify-center">
          {BADGES.map((badge) => {
            const isEarned = earnedBadges.some((b) => b.id === badge.id);
            const badgeName = language === 'es' ? badge.nameEs : badge.name;

            return (
              <div key={badge.id} className="flex flex-col items-center gap-2 w-16 relative">
                {/* Badge circle */}
                <button
                  className={`w-16 h-16 rounded-full flex items-center justify-center transition relative mx-auto ${
                    isEarned
                      ? 'bg-tribe-green text-slate-900 shadow-md hover:shadow-lg'
                      : 'bg-stone-300 dark:bg-tribe-card text-gray-500 dark:text-gray-400'
                  }`}
                  title={badgeName}
                  disabled
                >
                  <span className="text-2xl leading-none flex items-center justify-center">
                    {isEarned ? badge.emoji : badge.lockEmoji}
                  </span>
                </button>

                {/* Badge label */}
                <span
                  className={`text-xs font-medium text-center w-full leading-tight ${
                    isEarned ? 'text-stone-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  {badgeName}
                </span>

                {/* Share button for earned badges */}
                {isEarned && (
                  <ShareButton
                    size="sm"
                    variant="icon"
                    onShare={async () => {
                      await shareAchievement({ type: 'badge', title: badgeName }, language);
                      return null;
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Stats footer */}
      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-tribe-card text-sm text-stone-600 dark:text-gray-400 space-y-1">
        <div>
          <span className="font-medium">{sessionsAttended}</span>{' '}
          {language === 'es' ? 'sesiones asistidas' : 'sessions attended'}
        </div>
        <div>
          <span className="font-medium">{sessionsCreated}</span>{' '}
          {language === 'es' ? 'sesiones creadas' : 'sessions created'}
        </div>
        {streak > 0 && (
          <div>
            <span className="font-medium">{streak}</span> {language === 'es' ? 'semanas de racha' : 'week streak'}
          </div>
        )}
      </div>
    </div>
  );
}
