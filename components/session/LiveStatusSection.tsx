'use client';

import { Camera } from 'lucide-react';
import Link from 'next/link';
import { useLanguage } from '@/lib/LanguageContext';

interface LiveUser {
  user_id: string;
  name: string;
  avatar_url: string | null;
  started_at: string;
}

interface LiveStatusSectionProps {
  canGoLive: boolean;
  isLive: boolean;
  liveCountdown: string;
  liveUsers: LiveUser[];
  goingLive: boolean;
  language: 'en' | 'es';
  onGoLive: () => void;
  onEndLive: () => void;
  onRenewLive: () => void;
  onShareMoment: () => void;
}

export default function LiveStatusSection({
  canGoLive,
  isLive,
  liveCountdown,
  liveUsers,
  goingLive,
  language,
  onGoLive,
  onEndLive,
  onRenewLive,
  onShareMoment,
}: LiveStatusSectionProps) {
  const { t } = useLanguage();
  return (
    <>
      {/* Go Live / Live Controls */}
      {canGoLive && (
        <div className="mb-4">
          {isLive ? (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 border-2 border-red-400 dark:border-red-600 rounded-xl">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                    <div className="absolute inset-0 w-3 h-3 bg-red-500 rounded-full animate-ping"></div>
                  </div>
                  <span className="font-bold text-red-700 dark:text-red-300">{t('liveLabel')}</span>
                </div>
                <span className="text-sm font-mono text-red-600 dark:text-red-400">
                  {liveCountdown} {t('remaining')}
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={onRenewLive}
                  className="flex-1 py-2 bg-red-500 text-white font-bold rounded-lg hover:bg-red-600 transition text-sm"
                >
                  {t('renewFifteenMin')}
                </button>
                <button
                  onClick={onEndLive}
                  className="flex-1 py-2 bg-stone-200 dark:bg-stone-600 text-stone-700 dark:text-white font-bold rounded-lg hover:bg-stone-300 transition text-sm"
                >
                  {t('endLive')}
                </button>
              </div>
              <button
                onClick={onShareMoment}
                className="w-full mt-2 py-2 border-2 border-red-400 text-red-600 dark:text-red-300 font-semibold rounded-lg flex items-center justify-center gap-2 text-sm"
              >
                <Camera className="w-4 h-4" />
                {t('shareMoment')}
              </button>
            </div>
          ) : (
            <button
              onClick={onGoLive}
              disabled={goingLive}
              className="w-full py-3 bg-red-500 text-white font-bold rounded-lg hover:bg-red-600 transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <div className="relative mr-1">
                <div className="w-3 h-3 bg-white rounded-full"></div>
                <div className="absolute inset-0 w-3 h-3 bg-white rounded-full animate-ping"></div>
              </div>
              {goingLive ? t('starting') : t('goLive')}
            </button>
          )}
        </div>
      )}

      {/* Live Participants */}
      {liveUsers.length > 0 && (
        <div className="bg-red-50 dark:bg-red-900/10 border-2 border-red-400 dark:border-red-600 rounded-xl p-6 shadow-lg">
          <div className="flex items-center gap-2 mb-4">
            <div className="relative">
              <div className="w-3 h-3 bg-red-500 rounded-full"></div>
              <div className="absolute inset-0 w-3 h-3 bg-red-500 rounded-full animate-ping"></div>
            </div>
            <h2 className="text-lg font-bold text-red-700 dark:text-red-300">
              {t('trainingNow')} ({liveUsers.length})
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-3">
            {liveUsers.map((liveUser) => {
              const startedAt = new Date(liveUser.started_at);
              const minsLive = Math.max(1, Math.round((Date.now() - startedAt.getTime()) / 60000));
              return (
                <Link key={liveUser.user_id} href={`/profile/${liveUser.user_id}`}>
                  <div className="flex items-center gap-3 p-3 bg-white dark:bg-[#52575D] rounded-lg">
                    <div className="w-12 h-12 rounded-full p-[2px] bg-gradient-to-br from-red-500 to-red-400 animate-pulse">
                      <div className="w-full h-full rounded-full overflow-hidden bg-white dark:bg-[#3D4349] flex items-center justify-center">
                        {liveUser.avatar_url ? (
                          <img
                            loading="lazy"
                            src={liveUser.avatar_url}
                            alt={liveUser.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-lg font-bold text-stone-500">{liveUser.name[0]?.toUpperCase()}</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="font-medium text-stone-900 dark:text-white">{liveUser.name}</p>
                      <p className="text-xs text-red-600 dark:text-red-400 font-semibold">
                        {language === 'es' ? `En vivo hace ${minsLive} min` : `Live for ${minsLive} min`}
                      </p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
