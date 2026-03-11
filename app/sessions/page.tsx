/** Page: /sessions — My sessions: hosting, joined, and past sessions */
'use client';

import { Calendar, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import BottomNav from '@/components/BottomNav';
import LoadingSpinner from '@/components/LoadingSpinner';
import { useLanguage } from '@/lib/LanguageContext';
import { sportTranslations } from '@/lib/translations';
import { getSessionsTranslations } from './translations';
import { useSessionsData } from './useSessionsData';
import SessionCard from './SessionCard';

export default function SessionsPage() {
  const { language } = useLanguage();
  const txt = getSessionsTranslations(language);
  const {
    hostingSessions,
    joinedSessions,
    pastSessions,
    loading,
    error,
    activeTab,
    setActiveTab,
    fixedAreaRef,
    fixedHeight,
    retry,
  } = useSessionsData();

  const getSportName = (sport: string) => {
    return language === 'es' ? sportTranslations[sport]?.es || sport : sport;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-[#52575D]">
        <LoadingSpinner className="flex items-center justify-center min-h-screen" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-[#52575D] flex flex-col items-center justify-center p-4">
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
    <div className="min-h-screen bg-stone-50 dark:bg-[#52575D] pb-32">
      <div
        ref={fixedAreaRef}
        className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-stone-200 dark:bg-[#272D34] border-b border-stone-300 dark:border-black"
      >
        <div className="max-w-2xl mx-auto h-14 flex items-center px-4">
          <h1 className="text-2xl font-bold text-stone-900 dark:text-white">{txt.mySessions}</h1>
        </div>

        {/* Tabs */}
        <div className="border-t border-stone-300 dark:border-black">
          <div className="max-w-2xl mx-auto flex">
            <button
              onClick={() => setActiveTab('upcoming')}
              className={`flex-1 py-3 text-sm font-semibold transition ${
                activeTab === 'upcoming'
                  ? 'text-tribe-green border-b-2 border-tribe-green'
                  : 'text-stone-600 dark:text-gray-400'
              }`}
            >
              {txt.upcoming} ({hostingSessions.length + joinedSessions.length})
            </button>
            <button
              onClick={() => setActiveTab('past')}
              className={`flex-1 py-3 text-sm font-semibold transition ${
                activeTab === 'past'
                  ? 'text-tribe-green border-b-2 border-tribe-green'
                  : 'text-stone-600 dark:text-gray-400'
              }`}
            >
              {txt.past} ({pastSessions.length})
            </button>
          </div>
        </div>
      </div>

      <div style={{ paddingTop: fixedHeight || undefined }} className={fixedHeight ? '' : 'pt-[200px]'}>
        <div className="max-w-2xl mx-auto p-4">
          {activeTab === 'upcoming' ? (
            <>
              {hostingSessions.length === 0 && joinedSessions.length === 0 ? (
                <div className="bg-white dark:bg-[#6B7178] rounded-xl p-8 text-center border border-stone-200 dark:border-[#52575D]">
                  <Calendar className="w-16 h-16 text-stone-300 dark:text-gray-600 mx-auto mb-4" />
                  <h2 className="text-xl font-bold text-stone-900 dark:text-white mb-2">{txt.noUpcoming}</h2>
                  <p className="text-stone-600 dark:text-gray-300 mb-6">{txt.browseHome}</p>
                  <div className="flex gap-3 justify-center">
                    <Link href="/create">
                      <Button className="font-bold">{txt.createSession}</Button>
                    </Link>
                    <Link href="/">
                      <Button variant="outline" className="font-semibold">
                        {txt.browseSessions}
                      </Button>
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Hosting Section */}
                  {hostingSessions.length > 0 && (
                    <div>
                      <h2 className="text-sm font-bold text-stone-600 dark:text-gray-400 uppercase tracking-wide mb-3">
                        {txt.hosting} ({hostingSessions.length})
                      </h2>
                      <div className="space-y-3">
                        {hostingSessions.map((session) => (
                          <SessionCard
                            key={session.id}
                            session={session}
                            getSportName={getSportName}
                            txt={txt}
                            language={language}
                            isHost
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Joined Section */}
                  {joinedSessions.length > 0 && (
                    <div>
                      <h2 className="text-sm font-bold text-stone-600 dark:text-gray-400 uppercase tracking-wide mb-3">
                        {txt.joined} ({joinedSessions.length})
                      </h2>
                      <div className="space-y-3">
                        {joinedSessions.map((session) => (
                          <SessionCard
                            key={session.id}
                            session={session}
                            getSportName={getSportName}
                            txt={txt}
                            language={language}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              {pastSessions.length === 0 ? (
                <div className="bg-white dark:bg-[#6B7178] rounded-xl p-8 text-center border border-stone-200 dark:border-[#52575D]">
                  <Clock className="w-16 h-16 text-stone-300 dark:text-gray-600 mx-auto mb-4" />
                  <h2 className="text-xl font-bold text-stone-900 dark:text-white mb-2">{txt.noPast}</h2>
                </div>
              ) : (
                <div className="space-y-3">
                  {pastSessions.map((session) => (
                    <SessionCard
                      key={session.id}
                      session={session}
                      getSportName={getSportName}
                      txt={txt}
                      language={language}
                      isPast
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
