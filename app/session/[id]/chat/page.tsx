'use client';

import { useParams } from 'next/navigation';
import SessionChat from '@/components/SessionChat';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { sportTranslations } from '@/lib/translations';

export default function ChatPage() {
  const params = useParams();
  const sessionId = params.id as string;
  const supabase = createClient();
  const { language } = useLanguage();
  const [user, setUser] = useState<any>(null);
  const [session, setSession] = useState<any>(null);
  const [userIsAdmin, setUserIsAdmin] = useState(false);

  const t = language === 'es' ? {
    loading: 'Cargando...',
    chat: 'Chat',
    admin: 'Admin',
    host: 'Anfitrión',
  } : {
    loading: 'Loading...',
    chat: 'Chat',
    admin: 'Admin',
    host: 'Host',
  };

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser();
    setUser(user);

    if (user) {
      const { data: profile } = await supabase
        .from('users')
        .select('is_admin')
        .eq('id', user.id)
        .single();
      setUserIsAdmin(!!profile?.is_admin);
    }

    const { data: sessionData } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    setSession(sessionData);
  }

  if (!user || !session) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-theme-page">
        <p className="text-theme-primary">{t.loading}</p>
      </div>
    );
  }

  const isHost = session.creator_id === user.id;
  const isAdmin = userIsAdmin;
  const sportName = language === 'es' && sportTranslations[session.sport] 
    ? sportTranslations[session.sport].es 
    : session.sport;

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-[#3D4349] pb-32 safe-area-top">
      <div className="max-w-2xl mx-auto">
        <div className="sticky top-0 bg-white dark:bg-[#2C3137] border-b border-gray-200 dark:border-gray-700 p-4 z-10">
          <div className="flex items-center gap-3">
            <Link href={`/session/${sessionId}`}>
              <ArrowLeft className="w-6 h-6 cursor-pointer hover:opacity-70" />
            </Link>
            <div>
              <h1 className="text-xl font-bold text-theme-primary">{sportName} {t.chat}</h1>
              <p className="text-sm text-gray-500">
                {session.location}
                {isAdmin && <span className="ml-2 text-red-500">• {t.admin}</span>}
                {isHost && !isAdmin && <span className="ml-2 text-tribe-green">• {t.host}</span>}
              </p>
            </div>
          </div>
        </div>

        <div className="p-4">
          <SessionChat 
            sessionId={sessionId} 
            currentUserId={user.id}
            isHost={isHost}
            isAdmin={isAdmin}
          />
        </div>
      </div>
    </div>
  );
}
