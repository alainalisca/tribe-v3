/** Page: /matches — Browse and manage training partner matches */
'use client';
import { formatTime12Hour } from '@/lib/utils';

import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import BottomNav from '@/components/BottomNav';
import { Calendar, MapPin, Clock, Users } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import Link from 'next/link';
import { sportTranslations } from '@/lib/translations';
import { formatSessionLocation } from '@/lib/sessionLocation';
import { useMatches } from './useMatches';

export default function MatchesPage() {
  const { t, language, activeTab, setActiveTab, joinRequests, tribeSessions, loading, error, user, retry } =
    useMatches();

  if (!user) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-tribe-mid flex items-center justify-center">
        <p className="text-stone-900 dark:text-gray-100"></p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-tribe-mid flex flex-col items-center justify-center p-4">
        <p className="text-stone-900 dark:text-white text-lg mb-4">
          {language === 'es' ? 'Algo salió mal' : 'Something went wrong'}
        </p>
        <Button onClick={retry} className="font-bold">
          {language === 'es' ? 'Intentar de nuevo' : 'Try Again'}
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-32 bg-stone-50 dark:bg-tribe-mid">
      <div className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-stone-200 dark:bg-tribe-dark border-b border-stone-300 dark:border-black">
        <div className="max-w-2xl md:max-w-4xl mx-auto h-14 flex items-center px-4">
          <h1 className="text-2xl font-bold text-tribe-dark dark:text-white">{t('matches')}</h1>
        </div>
      </div>

      <div className="pt-header">
        <div className="max-w-2xl md:max-w-4xl mx-auto px-4 pt-4">
          <div className="flex gap-3 mb-4">
            <button
              onClick={() => setActiveTab('requests')}
              className={`flex-1 py-3 px-4 rounded-lg font-semibold transition ${
                activeTab === 'requests'
                  ? 'bg-stone-300 dark:bg-tribe-surface text-tribe-dark dark:text-white'
                  : 'bg-white dark:bg-tribe-card text-stone-600 dark:text-gray-300'
              }`}
            >
              {t('joinRequests')} {joinRequests.length > 0 && `(${joinRequests.length})`}
            </button>
            <button
              onClick={() => setActiveTab('tribe')}
              className={`flex-1 py-3 px-4 rounded-lg font-semibold transition ${
                activeTab === 'tribe'
                  ? 'bg-tribe-green text-slate-900'
                  : 'bg-white dark:bg-tribe-card text-stone-600 dark:text-gray-300'
              }`}
            >
              {t('myTribe')}
            </button>
          </div>
        </div>

        <div className="max-w-2xl md:max-w-4xl mx-auto p-4 md:p-6">
          {loading ? (
            <p className="text-center text-stone-600 dark:text-gray-300"></p>
          ) : activeTab === 'requests' ? (
            joinRequests.length === 0 ? (
              <p className="text-center text-stone-600 dark:text-gray-300 mt-8">{t('noJoinRequests')}</p>
            ) : (
              <div className="space-y-3">
                {joinRequests.map((request) => (
                  <Link key={request.id} href={`/session/${request.session_id}`}>
                    <Card className="dark:bg-tribe-card border-stone-200 dark:border-tribe-mid hover:bg-stone-50 dark:hover:bg-tribe-mid transition cursor-pointer">
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3 mb-3">
                          <Avatar className="w-10 h-10">
                            <AvatarImage
                              loading="lazy"
                              src={request.user?.avatar_url || undefined}
                              alt={request.user?.name ?? ''}
                            />
                            <AvatarFallback className="bg-tribe-green text-sm font-bold text-slate-900">
                              {request.user?.name?.charAt(0).toUpperCase() || '?'}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-tribe-dark dark:text-white font-semibold">
                              {request.user?.name || t('newJoinRequest')}
                            </p>
                            <p className="text-sm text-stone-600 dark:text-gray-300">{t('userWantsToJoin')}</p>
                          </div>
                        </div>
                        {request.session && (
                          <div className="mt-2 pt-2 border-t border-stone-200 dark:border-tribe-mid text-sm text-stone-600 dark:text-gray-300">
                            <span className="font-medium">
                              {language === 'es'
                                ? sportTranslations[request.session.sport]?.es || request.session.sport
                                : request.session.sport}
                            </span>{' '}
                            •{' '}
                            {formatSessionLocation(
                              request.session.location,
                              null,
                              null,
                              language === 'es' ? 'es' : 'en'
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            )
          ) : tribeSessions.length === 0 ? (
            <p className="text-center text-stone-600 dark:text-gray-300 mt-8">{t('noSessions')}</p>
          ) : (
            <div className="space-y-3">
              {tribeSessions.map((session) => (
                <Link key={session.id} href={`/session/${session.id}`}>
                  <Card className="dark:bg-tribe-card border-stone-200 dark:border-tribe-mid hover:bg-stone-50 dark:hover:bg-tribe-mid transition cursor-pointer">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <Badge className="px-3 py-1 bg-tribe-green text-slate-900 rounded-full border-transparent">
                          {language === 'es' ? sportTranslations[session.sport]?.es || session.sport : session.sport}
                        </Badge>
                        <div className="flex items-center gap-1 text-stone-600 dark:text-gray-300 text-sm">
                          <Users className="w-4 h-4" />
                          <span>
                            {session.current_participants}/{session.max_participants}
                          </span>
                        </div>
                      </div>
                      <div className="space-y-2 text-sm text-stone-600 dark:text-gray-300">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4" />
                          <span>
                            {format(parseISO(session.date + 'T00:00:00'), 'EEE, MMM d', {
                              locale: language === 'es' ? es : undefined,
                            })}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4" />
                          <span>{formatTime12Hour(session.start_time)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4" />
                          <span>
                            {formatSessionLocation(session.location, null, null, language === 'es' ? 'es' : 'en')}
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
