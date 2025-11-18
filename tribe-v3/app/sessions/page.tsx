'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import BottomNav from '@/components/BottomNav';
import SessionCard from '@/components/SessionCard';
import { Calendar } from 'lucide-react';
import Link from 'next/link';
import { useLanguage } from '@/lib/LanguageContext';

export default function SessionsPage() {
  const router = useRouter();
  const supabase = createClient();
  const { t } = useLanguage();
  const [user, setUser] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'Hosting' | 'joined'>('Hosting');
  const [HostingSessions, setHostingSessions] = useState<any[]>([]);
  const [joinedSessions, setJoinedSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkUser();
  }, []);

  useEffect(() => {
    if (user) {
      loadSessions();
    }
  }, [user]);

  async function checkUser() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/auth');
    } else {
      setUser(user);
    }
  }

  async function loadSessions() {
    try {
      setLoading(true);
      const today = new Date().toISOString().split('T')[0];

      const { data: Hosting, error: HostingError } = await supabase
        .from('sessions')
        .select(`
          *,
          participants:session_participants(
            user_id, 
            status,
            user:users(id, name, avatar_url)
          ),
          creator:users!sessions_creator_id_fkey(id, name, avatar_url)
        `)
        .eq('creator_id', user.id)
        .eq('status', 'active')
        .gte('date', today)
        .order('date', { ascending: true });

      if (HostingError) throw HostingError;

      const { data: participations, error: partError } = await supabase
        .from('session_participants')
        .select('session_id')
        .eq('user_id', user.id)
        .eq('status', 'confirmed');

      if (partError) throw partError;

      if (participations && participations.length > 0) {
        const sessionIds = participations.map(p => p.session_id);
        
        const { data: joined, error: joinedError } = await supabase
          .from('sessions')
          .select(`
            *,
            participants:session_participants(
              user_id, 
              status,
              user:users(id, name, avatar_url)
            ),
            creator:users!sessions_creator_id_fkey(id, name, avatar_url)
          `)
          .in('id', sessionIds)
          .eq('status', 'active')
          .gte('date', today)
          .order('date', { ascending: true });

        if (joinedError) throw joinedError;
        setJoinedSessions(joined || []);
      }

      setHostingSessions(Hosting || []);
    } catch (error) {
      console.error('Error loading sessions:', error);
    } finally {
      setLoading(false);
    }
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-theme-page flex items-center justify-center">
        <p className="text-theme-primary">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-theme-page pb-20">
      <div className="bg-theme-card p-4 border-b border-theme">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-xl font-bold text-theme-primary">{t('mySessions')}</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4">
        <div className="flex gap-4 mb-6 border-b border-theme">
          <button
            onClick={() => setActiveTab('Hosting')}
            className={`pb-2 px-1 font-medium transition ${
              activeTab === 'Hosting'
                ? 'border-b-2 border-tribe-green text-theme-primary'
                : 'text-theme-secondary'
            }`}
          >
            {t('Hosting')}
          </button>
          <button
            onClick={() => setActiveTab('joined')}
            className={`pb-2 px-1 font-medium transition ${
              activeTab === 'joined'
                ? 'border-b-2 border-tribe-green text-theme-primary'
                : 'text-theme-secondary'
            }`}
          >
            {t('joined')}
          </button>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-48 bg-theme-card rounded-xl animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            {activeTab === 'Hosting' && (
              <>
                {HostingSessions.length === 0 ? (
                  <div className="bg-theme-card rounded-xl p-8 text-center border border-theme">
                    <Calendar className="w-12 h-12 text-theme-secondary mx-auto mb-3" />
                    <p className="text-theme-secondary mb-2">{t('noHostingSessions')}</p>
                    <p className="text-sm text-theme-secondary mb-4">{t('createFirstSession')}</p>
                    <Link href="/create">
                      <button className="px-6 py-2 bg-tribe-green text-slate-900 rounded-lg font-semibold hover:bg-lime-500 transition">
                        {t('createSession')}
                      </button>
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {HostingSessions.map((session) => (
                      <SessionCard
                        key={session.id}
                        session={session}
                        currentUserId={user?.id}
                      />
                    ))}
                  </div>
                )}
              </>
            )}

            {activeTab === 'joined' && (
              <>
                {joinedSessions.length === 0 ? (
                  <div className="bg-theme-card rounded-xl p-8 text-center border border-theme">
                    <Calendar className="w-12 h-12 text-theme-secondary mx-auto mb-3" />
                    <p className="text-theme-secondary mb-2">{t('noJoinedSessions')}</p>
                    <p className="text-sm text-theme-secondary mb-4">{t('browseHomePage')}</p>
                    <Link href="/">
                      <button className="px-6 py-2 bg-tribe-green text-slate-900 rounded-lg font-semibold hover:bg-lime-500 transition">
                        {t('findSessions')}
                      </button>
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {joinedSessions.map((session) => (
                      <SessionCard
                        key={session.id}
                        session={session}
                        currentUserId={user?.id}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
