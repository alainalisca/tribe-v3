/** Page: /session/[id]/chat — Real-time chat for session athletes */
'use client';

import { useParams } from 'next/navigation';
import SessionChat from '@/components/SessionChat';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { sportTranslations } from '@/lib/translations';
import { Button } from '@/components/ui/button';
import { fetchUserIsAdmin, fetchSession } from '@/lib/dal';
import { logError } from '@/lib/logger';
import BottomNav from '@/components/BottomNav';
import LoadingSpinner from '@/components/LoadingSpinner';
import type { User } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

type SessionRow = Database['public']['Tables']['sessions']['Row'];

export default function ChatPage() {
  const params = useParams();
  const sessionId = params.id as string;
  const supabase = createClient();
  const { t, language } = useLanguage();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<SessionRow | null>(null);
  const [userIsAdmin, setUserIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      setError(false);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUser(user);

      if (user) {
        const result = await fetchUserIsAdmin(supabase, user.id);
        setUserIsAdmin(result.success ? !!result.data : false);
      }

      const sessionResult = await fetchSession(supabase, sessionId);
      if (!sessionResult.success || !sessionResult.data) {
        setError(true);
        return;
      }
      setSession(sessionResult.data ?? null);
    } catch (err) {
      logError(err, { action: 'loadChatData', sessionId });
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  const isHost = session ? session.creator_id === user?.id : false;
  const isAdmin = userIsAdmin;
  const sportName =
    session && language === 'es' && sportTranslations[session.sport]
      ? sportTranslations[session.sport].es
      : (session?.sport ?? '');

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-tribe-surface pb-32">
      {/* Header always renders so user can navigate back */}
      <div className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-white dark:bg-tribe-dark border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-2xl mx-auto h-14 flex items-center gap-3 px-4">
          <Link
            href={`/session/${sessionId}`}
            className="p-2 -ml-2 min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            <ArrowLeft className="w-6 h-6 text-stone-900 dark:text-white hover:opacity-70" />
          </Link>
          {session ? (
            <div>
              <h1 className="text-lg font-bold text-theme-primary leading-tight">
                {sportName} {t('chat')}
              </h1>
              <p className="text-xs text-gray-500 leading-tight truncate max-w-[250px]">
                {session.location}
                {isAdmin && <span className="ml-2 text-red-500">• Admin</span>}
                {isHost && !isAdmin && <span className="ml-2 text-tribe-green">• {t('host')}</span>}
              </p>
            </div>
          ) : (
            <h1 className="text-lg font-bold text-theme-primary leading-tight">{t('chat')}</h1>
          )}
        </div>
      </div>

      <div className="max-w-2xl mx-auto">
        <div className="pt-header p-4">
          {loading ? (
            <LoadingSpinner className="flex items-center justify-center py-20" />
          ) : error || !user || !session ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="text-4xl mb-4">💬</div>
              <p className="text-lg font-semibold text-stone-900 dark:text-white mb-2">{t('couldNotLoadChat')}</p>
              <p className="text-sm text-stone-500 dark:text-gray-400 mb-4">{t('checkConnectionRetry')}</p>
              <Button onClick={loadData} className="px-6 py-3 font-bold">
                {t('tryAgain')}
              </Button>
            </div>
          ) : (
            <SessionChat sessionId={sessionId} currentUserId={user.id} isHost={isHost} isAdmin={isAdmin} />
          )}
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
