'use client';

import { logError } from '@/lib/logger';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/lib/LanguageContext';
import type { User } from '@supabase/supabase-js';

export interface JoinRequestItem {
  id: string;
  user_id: string | null;
  session_id: string;
  joined_at: string | null;
  status: string | null;
  // REASON: Supabase join via !session_participants_user_id_fkey returns a single object at runtime,
  // but generated types may infer an array. We type as single object to match actual usage.
  user: { id: string; name: string | null; avatar_url: string | null } | null;
  session: { id: string; sport: string; date: string; start_time: string; location: string } | undefined;
}

export interface TribeSession {
  id: string;
  sport: string;
  date: string;
  start_time: string;
  location: string;
  creator_id: string;
  current_participants: number | null;
  max_participants: number;
}

export function useMatches() {
  const { t, language } = useLanguage();
  const [activeTab, setActiveTab] = useState<'requests' | 'tribe'>('tribe');
  const [joinRequests, setJoinRequests] = useState<JoinRequestItem[]>([]);
  const [tribeSessions, setTribeSessions] = useState<TribeSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    checkUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  useEffect(() => {
    if (user) {
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, [user, activeTab]);

  async function checkUser() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push('/auth');
    } else {
      setUser(user);
    }
  }

  async function loadData() {
    setLoading(true);
    try {
      if (activeTab === 'requests') {
        await loadJoinRequests();
      } else {
        await loadTribeSessions();
      }
    } catch (error) {
      logError(error, { action: 'loadData' });
    } finally {
      setLoading(false);
    }
  }

  async function loadJoinRequests() {
    try {
      const { data: mySessions, error: sessError } = await supabase
        .from('sessions')
        .select('id, sport, date, start_time, location')
        .eq('creator_id', user!.id)
        .eq('status', 'active');

      if (sessError) throw sessError;

      if (!mySessions || mySessions.length === 0) {
        setJoinRequests([]);
        return;
      }

      const sessionIds = mySessions.map((s) => s.id);

      const { data: participants } = await supabase
        .from('session_participants')
        .select(
          `
          id,
          user_id,
          session_id,
          joined_at,
          status,
          user:users!session_participants_user_id_fkey(id, name, avatar_url)
        `
        )
        .in('session_id', sessionIds)
        .eq('status', 'confirmed')
        .order('joined_at', { ascending: false });

      const requestsWithSession = (participants || []).map((p) => ({
        ...p,
        user: (Array.isArray(p.user) ? p.user[0] : p.user) as JoinRequestItem['user'],
        session: mySessions.find((s) => s.id === p.session_id),
      }));

      setJoinRequests(requestsWithSession);
    } catch (error) {
      logError(error, { action: 'loadJoinRequests' });
      setJoinRequests([]);
    }
  }

  async function loadTribeSessions() {
    try {
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      const { data: participations } = await supabase
        .from('session_participants')
        .select('session_id, joined_at')
        .eq('user_id', user!.id)
        .eq('status', 'confirmed');

      if (!participations || participations.length === 0) {
        setTribeSessions([]);
        return;
      }

      const sessionIds = participations.map((p) => p.session_id);

      const { data: sessions } = await supabase
        .from('sessions')
        .select('id, sport, date, start_time, location, creator_id, current_participants, max_participants')
        .in('id', sessionIds)
        .eq('status', 'active')
        .gte('date', today)
        .order('date', { ascending: true });

      setTribeSessions(sessions || []);
    } catch (error) {
      logError(error, { action: 'loadTribeSessions' });
      setTribeSessions([]);
    }
  }

  return {
    t,
    language,
    activeTab,
    setActiveTab,
    joinRequests,
    tribeSessions,
    loading,
    user,
  };
}
