/** Page: /messages — Chat conversations list with tabs for Sessions and Direct Messages */
'use client';

import Link from 'next/link';
import Image from 'next/image';
import { MessageCircle, ChevronRight, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import BottomNav from '@/components/BottomNav';
import { useMessages } from './useMessages';
import { useState } from 'react';

type Tab = 'sessions' | 'direct';

export default function MessagesPage() {
  const [activeTab, setActiveTab] = useState<Tab>('sessions');
  const { t, language, conversations, directConversations, loading, error, formatTime, getTranslatedSport, retry } =
    useMessages();

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-tribe-mid pb-32">
        <div className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-stone-200 dark:bg-tribe-dark border-b border-stone-300 dark:border-black">
          <div className="max-w-2xl mx-auto h-14 flex items-center px-4">
            <h1 className="text-xl font-bold text-stone-900 dark:text-white">{t('messages')}</h1>
          </div>
        </div>
        <div className="pt-header max-w-2xl mx-auto p-4">
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="dark:bg-tribe-card shadow-none animate-pulse">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-stone-200 dark:bg-tribe-mid rounded-full" />
                    <div className="flex-1">
                      <div className="h-4 bg-stone-200 dark:bg-tribe-mid rounded w-1/3 mb-2" />
                      <div className="h-3 bg-stone-200 dark:bg-tribe-mid rounded w-2/3" />
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
      <div className="min-h-screen bg-stone-50 dark:bg-tribe-mid flex flex-col items-center justify-center p-4">
        <p className="text-stone-900 dark:text-white text-lg mb-4">{t('somethingWentWrong')}</p>
        <Button onClick={retry} className="font-bold">
          {t('tryAgain')}
        </Button>
      </div>
    );
  }

  const hasSessionConversations = conversations.length > 0;
  const hasDirectConversations = directConversations.length > 0;
  const isEmpty = !hasSessionConversations && !hasDirectConversations;

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-tribe-mid pb-32">
      <div className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-stone-200 dark:bg-tribe-dark border-b border-stone-300 dark:border-black">
        <div className="max-w-2xl mx-auto h-14 flex items-center px-4">
          <h1 className="text-xl font-bold text-stone-900 dark:text-white">{t('messages')}</h1>
        </div>
      </div>

      <div className="pt-header max-w-2xl mx-auto">
        {/* Tabs */}
        <div className="flex border-b border-stone-300 dark:border-tribe-mid px-4 gap-0">
          <button
            onClick={() => setActiveTab('sessions')}
            className={`flex-1 py-3 px-4 text-center font-medium border-b-2 transition flex items-center justify-center gap-2 ${
              activeTab === 'sessions'
                ? 'border-tribe-green text-stone-900 dark:text-white'
                : 'border-transparent text-stone-600 dark:text-gray-400'
            }`}
          >
            {language === 'es' ? 'Sesiones' : 'Sessions'}
            {hasSessionConversations && (
              <span className="inline-flex items-center justify-center text-[10px] font-bold min-w-[20px] h-5 px-1.5 rounded-full bg-tribe-green-light text-slate-900">
                {conversations.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('direct')}
            className={`flex-1 py-3 px-4 text-center font-medium border-b-2 transition flex items-center justify-center gap-2 ${
              activeTab === 'direct'
                ? 'border-tribe-green text-stone-900 dark:text-white'
                : 'border-transparent text-stone-600 dark:text-gray-400'
            }`}
          >
            {language === 'es' ? 'Directo' : 'Direct'}
            {hasDirectConversations && (
              <span className="inline-flex items-center justify-center text-[10px] font-bold min-w-[20px] h-5 px-1.5 rounded-full bg-tribe-green-light text-slate-900">
                {directConversations.length}
              </span>
            )}
          </button>
        </div>

        <div className="p-4">
          {isEmpty ? (
            <Card className="dark:bg-tribe-card border-stone-200 dark:border-tribe-mid shadow-none">
              <CardContent className="p-8 text-center">
                <div className="w-16 h-16 bg-stone-100 dark:bg-tribe-mid rounded-full flex items-center justify-center mx-auto mb-4">
                  <MessageCircle className="w-8 h-8 text-stone-400" />
                </div>
                <h3 className="text-lg font-semibold text-stone-900 dark:text-white mb-2">{t('noConversations')}</h3>
                <p className="text-stone-500 dark:text-gray-400 mb-4">
                  {activeTab === 'sessions' ? t('joinSessionToChat') : 'Start a direct message with someone'}
                </p>
                <Link href="/">
                  <Button className="font-bold">{t('findSessions')}</Button>
                </Link>
              </CardContent>
            </Card>
          ) : activeTab === 'sessions' ? (
            // Sessions Tab
            <div className="space-y-2">
              {conversations.length === 0 ? (
                <Card className="dark:bg-tribe-card border-stone-200 dark:border-tribe-mid shadow-none">
                  <CardContent className="p-8 text-center">
                    <div className="w-16 h-16 bg-stone-100 dark:bg-tribe-mid rounded-full flex items-center justify-center mx-auto mb-4">
                      <MessageCircle className="w-8 h-8 text-stone-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-stone-900 dark:text-white mb-2">
                      {t('noConversations')}
                    </h3>
                    <p className="text-stone-500 dark:text-gray-400 mb-4">{t('joinSessionToChat')}</p>
                    <Link href="/">
                      <Button className="font-bold">{t('findSessions')}</Button>
                    </Link>
                  </CardContent>
                </Card>
              ) : (
                conversations.map((conv) => (
                  <Link key={conv.session_id} href={`/session/${conv.session_id}/chat`}>
                    <Card className="dark:bg-tribe-card border-stone-200 dark:border-tribe-mid hover:border-tribe-green transition cursor-pointer shadow-none">
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 bg-tribe-green-light rounded-full flex items-center justify-center text-lg flex-shrink-0">
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
                ))
              )}
            </div>
          ) : (
            // Direct Messages Tab
            <div className="space-y-2">
              {directConversations.length === 0 ? (
                <Card className="dark:bg-tribe-card border-stone-200 dark:border-tribe-mid shadow-none">
                  <CardContent className="p-8 text-center">
                    <div className="w-16 h-16 bg-stone-100 dark:bg-tribe-mid rounded-full flex items-center justify-center mx-auto mb-4">
                      <MessageSquare className="w-8 h-8 text-stone-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-stone-900 dark:text-white mb-2">No direct messages</h3>
                    <p className="text-stone-500 dark:text-gray-400 mb-4">
                      Start a conversation by visiting someone&apos;s profile
                    </p>
                  </CardContent>
                </Card>
              ) : (
                directConversations.map((conv) => (
                  <Link key={conv.id} href={`/messages/${conv.id}`}>
                    <Card className="dark:bg-tribe-card border-stone-200 dark:border-tribe-mid hover:border-tribe-green transition cursor-pointer shadow-none">
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3 relative">
                          <div className="relative flex-shrink-0">
                            <div className="w-12 h-12 bg-stone-300 dark:bg-tribe-mid rounded-full flex items-center justify-center text-sm font-semibold overflow-hidden">
                              {conv.other_user.avatar_url ? (
                                <Image
                                  src={conv.other_user.avatar_url}
                                  alt={conv.other_user.name}
                                  width={48}
                                  height={48}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <span className="text-stone-700 dark:text-gray-300">
                                  {conv.other_user.name
                                    .split(' ')
                                    .map((n) => n[0])
                                    .join('')
                                    .toUpperCase()
                                    .slice(0, 2)}
                                </span>
                              )}
                            </div>
                            {conv.unread_count > 0 && (
                              <div className="absolute top-0 right-0 w-3 h-3 bg-blue-500 rounded-full" />
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <h3 className="font-semibold text-stone-900 dark:text-white truncate">
                                {conv.other_user.name}
                              </h3>
                              {conv.last_message && (
                                <span className="text-xs text-stone-500 dark:text-gray-400 flex-shrink-0 ml-2">
                                  {formatTime(conv.last_message.created_at)}
                                </span>
                              )}
                            </div>
                            {conv.last_message && (
                              <p className="text-sm text-stone-600 dark:text-gray-300 truncate">
                                {conv.last_message.message}
                              </p>
                            )}
                          </div>

                          <ChevronRight className="w-5 h-5 text-stone-400 flex-shrink-0" />
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
