/** Page: /messages — Chat conversations list for joined sessions */
'use client';

import Link from 'next/link';
import { MessageCircle, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import BottomNav from '@/components/BottomNav';
import { useMessages } from './useMessages';

export default function MessagesPage() {
  const { t, conversations, loading, error, formatTime, getTranslatedSport, retry } = useMessages();

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-[#52575D] pb-32">
        <div className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-stone-200 dark:bg-[#272D34] border-b border-stone-300 dark:border-black">
          <div className="max-w-2xl mx-auto h-14 flex items-center px-4">
            <h1 className="text-xl font-bold text-stone-900 dark:text-white">{t('messages')}</h1>
          </div>
        </div>
        <div className="pt-header max-w-2xl mx-auto p-4">
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="dark:bg-[#6B7178] shadow-none animate-pulse">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-stone-200 dark:bg-[#52575D] rounded-full" />
                    <div className="flex-1">
                      <div className="h-4 bg-stone-200 dark:bg-[#52575D] rounded w-1/3 mb-2" />
                      <div className="h-3 bg-stone-200 dark:bg-[#52575D] rounded w-2/3" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
        <BottomNav />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-[#52575D] flex flex-col items-center justify-center p-4">
        <p className="text-stone-900 dark:text-white text-lg mb-4">{t('somethingWentWrong')}</p>
        <Button onClick={retry} className="font-bold">
          {t('tryAgain')}
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-[#52575D] pb-32">
      <div className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-stone-200 dark:bg-[#272D34] border-b border-stone-300 dark:border-black">
        <div className="max-w-2xl mx-auto h-14 flex items-center px-4">
          <h1 className="text-xl font-bold text-stone-900 dark:text-white">{t('messages')}</h1>
        </div>
      </div>

      <div className="pt-header max-w-2xl mx-auto p-4">
        {conversations.length === 0 ? (
          <Card className="dark:bg-[#6B7178] border-stone-200 dark:border-[#52575D] shadow-none">
            <CardContent className="p-8 text-center">
              <div className="w-16 h-16 bg-stone-100 dark:bg-[#52575D] rounded-full flex items-center justify-center mx-auto mb-4">
                <MessageCircle className="w-8 h-8 text-stone-400" />
              </div>
              <h3 className="text-lg font-semibold text-stone-900 dark:text-white mb-2">{t('noConversations')}</h3>
              <p className="text-stone-500 dark:text-gray-400 mb-4">{t('joinSessionToChat')}</p>
              <Link href="/">
                <Button className="font-bold">{t('findSessions')}</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {conversations.map((conv) => (
              <Link key={conv.session_id} href={`/session/${conv.session_id}/chat`}>
                <Card className="dark:bg-[#6B7178] border-stone-200 dark:border-[#52575D] hover:border-tribe-green transition cursor-pointer shadow-none">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-tribe-green rounded-full flex items-center justify-center text-lg flex-shrink-0">
                        {conv.session.sport === 'Running'
                          ? '🏃'
                          : conv.session.sport === 'Cycling'
                            ? '🚴'
                            : conv.session.sport === 'Swimming'
                              ? '🏊'
                              : conv.session.sport === 'CrossFit'
                                ? '🏋️'
                                : conv.session.sport === 'Boxing'
                                  ? '🥊'
                                  : conv.session.sport === 'Yoga'
                                    ? '🧘'
                                    : conv.session.sport === 'Hiking'
                                      ? '🥾'
                                      : conv.session.sport === 'Basketball'
                                        ? '🏀'
                                        : conv.session.sport === 'Soccer'
                                          ? '⚽'
                                          : conv.session.sport === 'Tennis'
                                            ? '🎾'
                                            : '💪'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <h3 className="font-semibold text-stone-900 dark:text-white truncate">
                            {getTranslatedSport(conv.session.sport)}
                          </h3>
                          {conv.last_message && (
                            <span className="text-xs text-stone-500 dark:text-gray-400 flex-shrink-0 ml-2">
                              {formatTime(conv.last_message.created_at)}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-stone-500 dark:text-gray-400 truncate mb-1">
                          {conv.session.location}
                        </p>
                        {conv.last_message && (
                          <p className="text-sm text-stone-600 dark:text-gray-300 truncate">
                            <span className="font-medium">{conv.last_message.user.name}:</span>{' '}
                            {conv.last_message.message}
                          </p>
                        )}
                      </div>
                      <ChevronRight className="w-5 h-5 text-stone-400 flex-shrink-0" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
