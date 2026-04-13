/** Page: /requests — Manage incoming join requests for curated sessions */
'use client';
import { logError } from '@/lib/logger';
import { formatTime12Hour } from '@/lib/utils';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ArrowLeft, Check, X, User } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import Link from 'next/link';
import { useLanguage } from '@/lib/LanguageContext';
import { getErrorMessage } from '@/lib/errorMessages';
import BottomNav from '@/components/BottomNav';
import { showSuccess, showError } from '@/lib/toast';
import {
  updateParticipantStatus,
  deleteParticipant,
  fetchSessionsByCreator,
  fetchPendingParticipantsForSessions,
} from '@/lib/dal';
import type { User as AuthUser } from '@supabase/supabase-js';

interface JoinRequest {
  id: string;
  session_id: string;
  user_id: string | null;
  status: string | null;
  users: {
    name: string | null;
    avatar_url: string | null;
    sports: string[] | null;
  } | null;
  session:
    | {
        id: string;
        sport: string;
        date: string;
        start_time: string;
        location: string;
      }
    | undefined;
}

export default function RequestsPage() {
  const router = useRouter();
  const supabase = createClient();
  const { language, t } = useLanguage();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  async function checkUser() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push('/auth');
      return;
    }
    setUser(user);
    loadRequests(user.id);
  }

  async function loadRequests(userId: string) {
    try {
      const sessionsResult = await fetchSessionsByCreator(supabase, userId, {
        fields: 'id, sport, date, start_time, location',
      });

      const mySessions = (sessionsResult.data || []) as {
        id: string;
        sport: string;
        date: string;
        start_time: string;
        location: string;
      }[];
      if (mySessions.length === 0) {
        setLoading(false);
        return;
      }

      const sessionIds = mySessions.map((s) => s.id);

      const pendingResult = await fetchPendingParticipantsForSessions(supabase, sessionIds);
      const pendingRequests = pendingResult.data || [];

      const requestsWithSessions =
        pendingRequests?.map((req) => ({
          ...req,
          users: req.user ? { name: req.user.name, avatar_url: req.user.avatar_url, sports: null } : null,
          session: mySessions.find((s) => s.id === req.session_id),
        })) || [];

      setRequests(requestsWithSessions as unknown as JoinRequest[]);
    } catch (error) {
      logError(error, { action: 'loadRequests' });
    } finally {
      setLoading(false);
    }
  }

  async function handleAccept(requestId: string) {
    try {
      const result = await updateParticipantStatus(supabase, requestId, 'confirmed');

      if (!result.success) throw new Error(result.error);

      showSuccess(t('requestAccepted'));
      loadRequests(user!.id);
    } catch (error: unknown) {
      showError(getErrorMessage(error, 'handle_request', language));
    }
  }

  async function handleDecline(requestId: string) {
    try {
      const result = await deleteParticipant(supabase, requestId);

      if (!result.success) throw new Error(result.error);

      showSuccess(t('requestDeclined'));
      loadRequests(user!.id);
    } catch (error: unknown) {
      showError(getErrorMessage(error, 'handle_request', language));
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-tribe-mid flex items-center justify-center">
        <p className="text-stone-900 dark:text-white"></p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-tribe-mid pb-32">
      <div className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-stone-200 dark:bg-tribe-dark border-b border-stone-300 dark:border-black">
        <div className="max-w-2xl mx-auto h-14 flex items-center gap-4 px-4">
          <Link href="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-6 h-6 text-stone-900 dark:text-white" />
            </Button>
          </Link>
          <h1 className="text-xl font-bold text-stone-900 dark:text-white">{t('joinRequests')}</h1>
        </div>
      </div>

      <div className="pt-header max-w-2xl mx-auto p-4">
        {requests.length === 0 ? (
          <Card className="dark:bg-tribe-card border-stone-200 dark:border-tribe-mid">
            <CardContent className="p-8 text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-stone-200 dark:bg-tribe-mid rounded-full flex items-center justify-center">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-8 h-8 text-stone-500 dark:text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-stone-900 dark:text-white mb-2">{t('noPendingRequests')}</h2>
              <p className="text-stone-600 dark:text-gray-300 mb-4">{t('requestsDescription')}</p>
              <Link href="/create">
                <Button className="font-bold">{t('createASession')}</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {requests.map((request) => (
              <Card key={request.id} className="dark:bg-tribe-card shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-bold text-stone-900 dark:text-white">
                        {request.session?.sport} - {request.session?.location}
                      </h3>
                      <p className="text-sm text-stone-600 dark:text-gray-400">
                        {request.session &&
                          new Date(request.session.date + 'T00:00:00').toLocaleDateString(
                            language === 'es' ? 'es-ES' : 'en-US'
                          )}{' '}
                        {request.session && (
                          <>
                            {t('at')} {formatTime12Hour(request.session.start_time)}
                          </>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 mb-4 p-3 bg-stone-50 dark:bg-tribe-mid rounded-lg">
                    <Avatar className="w-12 h-12">
                      <AvatarImage
                        loading="lazy"
                        src={request.users?.avatar_url || undefined}
                        alt={request.users?.name ?? ''}
                      />
                      <AvatarFallback className="bg-stone-300 dark:bg-tribe-surface">
                        <User className="w-6 h-6 text-stone-600 dark:text-gray-400" />
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <p className="font-semibold text-stone-900 dark:text-white">{request.users?.name}</p>
                    </div>
                    <Link href={`/profile/${request.user_id}`}>
                      <button className="text-xs text-tribe-green hover:underline">{t('viewProfile')}</button>
                    </Link>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleAccept(request.id)}
                      className="flex-1 flex items-center justify-center gap-2 font-semibold"
                    >
                      <Check className="w-4 h-4" />
                      {t('accept')}
                    </Button>
                    <button
                      onClick={() => handleDecline(request.id)}
                      className="flex-1 py-2 bg-red-500 text-white font-semibold rounded-lg hover:bg-red-600 transition flex items-center justify-center gap-2"
                    >
                      <X className="w-4 h-4" />
                      {t('decline')}
                    </button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
