'use client';

import Link from 'next/link';
import { calculateDistance, formatDistance } from '@/lib/distance';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/lib/LanguageContext';
import type { SessionWithRelations } from '@/lib/dal';

interface LiveNowSectionProps {
  liveNowSessions: SessionWithRelations[];
  userLocation: { latitude: number; longitude: number } | null;
  language: 'en' | 'es';
}

export default function LiveNowSection({ liveNowSessions, userLocation, language }: LiveNowSectionProps) {
  const { t } = useLanguage();
  if (liveNowSessions.length === 0) return null;

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <div className="relative">
          <div className="w-3 h-3 bg-green-500 rounded-full"></div>
          <div className="absolute inset-0 w-3 h-3 bg-green-500 rounded-full animate-ping"></div>
        </div>
        <h2 className="text-lg font-bold text-theme-primary">
          {t('liveNow')} ({liveNowSessions.length})
        </h2>
      </div>
      <div className="space-y-3">
        {liveNowSessions.map((session) => {
          const sessionStart = new Date(`${session.date}T${session.start_time}`);
          const now = new Date();
          const diffMs = sessionStart.getTime() - now.getTime();
          const diffMins = Math.round(diffMs / 60000);
          const sessionEnd = new Date(sessionStart.getTime() + (session.duration || 60) * 60000);
          const minsLeft = Math.round((sessionEnd.getTime() - now.getTime()) / 60000);

          let statusText = '';
          if (diffMins > 0) {
            statusText = `${language === 'es' ? 'Empieza en' : 'Starting in'} ${diffMins} ${t('min')}`;
          } else {
            statusText = `${minsLeft} ${t('minLeft')}`;
          }

          let liveDistanceText = '';
          if (userLocation && session.latitude && session.longitude) {
            const distanceKm = calculateDistance(
              userLocation.latitude,
              userLocation.longitude,
              session.latitude,
              session.longitude
            );
            liveDistanceText = formatDistance(distanceKm, language);
          }

          const sportEmoji =
            session.sport === 'Running'
              ? '🏃'
              : session.sport === 'CrossFit'
                ? '🏋️'
                : session.sport === 'Swimming'
                  ? '🏊'
                  : session.sport === 'Cycling'
                    ? '🚴'
                    : session.sport === 'Boxing'
                      ? '🥊'
                      : session.sport === 'Jiu-Jitsu'
                        ? '🥋'
                        : '💪';

          return (
            <Link key={session.id} href={`/session/${session.id}`}>
              <div className="bg-gradient-to-r from-green-50 to-lime-50 dark:from-green-900/20 dark:to-lime-900/20 border-2 border-green-400 dark:border-green-600 rounded-xl p-4 hover:shadow-lg transition cursor-pointer">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-tribe-green rounded-full flex items-center justify-center text-lg">
                      {sportEmoji}
                    </div>
                    <div>
                      <div className="font-bold text-theme-primary">
                        {session.creator?.name || 'Someone'} - {session.sport}
                      </div>
                      <div className="text-sm text-theme-secondary truncate max-w-[200px]">
                        {session.location}
                        {liveDistanceText && (
                          <span className="ml-2 text-xs text-green-600 dark:text-green-400 font-medium">
                            ({liveDistanceText})
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-medium text-green-600 dark:text-green-400">{statusText}</div>
                    <Button className="mt-1 px-4 py-1.5 text-sm font-bold rounded-full">{t('join')}</Button>
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
