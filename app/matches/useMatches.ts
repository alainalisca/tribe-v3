'use client';

import { logError } from '@/lib/logger';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/lib/LanguageContext';
import {
  fetchSessionsByCreator,
  fetchSessionsByIds,
  fetchParticipantsForSessions,
  fetchConfirmedParticipations,
} from '@/lib/dal';
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
  const [error, setError] = useState<string | null>(null);
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
      setError(null);
      if (activeTab === 'requests') {
        await loadJoinRequests();
      } else {
        await loadTribeSessions();
      }
    } catch (err) {
      logError(err, { action: 'loadData' });
      setError('load_failed');
    } finally {
      setLoading(false);
    }
  }

  async function loadJoinRequests() {
    try {
      const sessionsResult = await fetchSessionsByCreator(supabase, user!.id, {
        fields: 'id, sport, date, start_time, location, status',
      });
      if (!sessionsResult.success) throw new Error(sessionsResult.error);

      // REASON: DAL returns unknown[] — cast for field access on session rows
      const mySessions = (sessionsResult.data || []) as Array<{
        id: string;
        sport: string;
        date: string;
        start_time: string;
        location: string;
        status?: string;
      }>;
      const activeSessions = mySessions.filter((s) => s.status === 'active');

      if (activeSessions.length === 0) {
        setJoinRequests([]);
        return;
      }

      const sessionIds = activeSessions.map((s) => s.id);

      const participantsResult = await fetchParticipantsForSessions(supabase, sessionIds, 'confirmed');
      // REASON: DAL returns unknown[] — cast for field access on participant rows
      const participants = (participantsResult.success ? participantsResult.data : []) as Array<{
        id: string;
        user_id: string | null;
        session_id: string;
        joined_at: string | null;
        status: string | null;
        user: JoinRequestItem['user'] | JoinRequestItem['user'][];
      }>;

      const requestsWithSession = participants.map((p) => ({
        ...p,
        user: (Array.isArray(p.user) ? p.user[0] : p.user) as JoinRequestItem['user'],
        session: activeSessions.find((s) => s.id === p.session_id),
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

      const participationsResult = await fetchConfirmedParticipations(supabase, user!.id);
      if (!participationsResult.success) throw new Error(participationsResult.error);

      const participations = participationsResult.data || [];
      if (participations.length === 0) {
        setTribeSessions([]);
        return;
      }

      const sessionIds = participations.map((p) => p.session_id);

      const sessionsResult = await fetchSessionsByIds(
        supabase,
        sessionIds,
        'id, sport, date, start_time, location, creator_id, current_participants, max_participants, status'
      );
      // REASON: DAL returns unknown[] — cast for field access, then filter/sort client-side
      const allSessions = (sessionsResult.success ? sessionsResult.data : []) as unknown as Array<
        TribeSession & { status?: string }
      >;
      const sessions = allSessions
        .filter((s) => s.status === 'active' && s.date >= today)
        .sort((a, b) => a.date.localeCompare(b.date));

      setTribeSessions(sessions);
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
    error,
    user,
    retry: loadData,
  };
}
