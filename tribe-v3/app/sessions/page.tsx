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
    <div className="min-h-screen pb-20 bg-theme-page">
      <div className="bg-theme-card p-4 sticky top-0 z-10 border-b border-theme">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-2xl font-bold text-theme-primary mb-4">{t('mySessions')}</h1>
          
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('Hosting')}
              className={`flex-1 py-2 px-4 rounded-lg font-medium transition ${
                activeTab === 'Hosting'
                  ? 'bg-tribe-green text-slate-900'
                  : 'bg-theme-page text-theme-secondary hover:text-theme-primary'
              }`}
            >
              {t('Hosting')}
            </button>
            <button
              onClick={() => setActiveTab('joined')}
              className={`flex-1 py-2 px-4 rounded-lg font-medium transition ${
                activeTab === 'joined'
                  ? 'bg-tribe-green text-slate-900'
                  : 'bg-theme-page text-theme-secondary hover:text-theme-primary'
              }`}
            >
              {t('Joined')}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4">
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-48 bg-theme-card rounded-xl animate-pulse" />
            ))}
          </div>
        ) : activeTab === 'Hosting' ? (
          HostingSessions.length === 0 ? (
            <div className="bg-theme-card rounded-lg p-8 text-center border border-theme">
              <Calendar className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-theme-secondary mb-2">{t('No sessions')}</p>
              <p className="text-sm text-gray-500 mb-4">{t('startHosting')}</p>
              <Link href="/create">
                <button className="px-6 py-2 bg-tribe-green text-slate-900 font-semibold rounded-lg hover:bg-lime-500 transition">
                  {t('Create Session')}
                </button>
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {HostingSessions.map((session) => (
                <SessionCard 
                  key={session.id} 
                  session={session}
                  currentUserId={user.id}
                />
              ))}
            </div>
          )
        ) : (
          joinedSessions.length === 0 ? (
            <div className="bg-theme-card rounded-lg p-8 text-center border border-theme">
              <Calendar className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-theme-secondary mb-2">{t('noJoinedSessions')}</p>
              <p className="text-sm text-gray-500 mb-4">{t('startJoining')}</p>
              <Link href="/">
                <button className="px-6 py-2 bg-tribe-green text-slate-900 font-semibold rounded-lg hover:bg-lime-500 transition">
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
                  currentUserId={user.id}
                />
              ))}
            </div>
          )
        )}
      </div>

      <BottomNav activeTab="sessions" />
    </div>
  );
}
