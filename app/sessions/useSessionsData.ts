'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { logError } from '@/lib/logger';
import type { User } from '@supabase/supabase-js';
import type { Session } from '@/lib/database.types';

/** Session with optional participant list (from hosting query) */
export interface HostingSession extends Session {
  participants: { user_id: string | null; status: string | null }[];
}

/** Session with optional creator info (from joined query) */
export interface JoinedSession extends Session {
  creator: { name: string; avatar_url: string | null } | null;
}

/** Past session may come from either hosting or joined queries */
export interface PastSession extends Session {
  wasParticipant?: boolean;
  creator?: { name: string; avatar_url: string | null } | null;
}

function isSessionPast(session: { date: string; start_time?: string; duration?: number }): boolean {
  const sessionDate = new Date(session.date + 'T00:00:00');
  if (session.start_time) {
    const [hours, minutes] = session.start_time.split(':').map(Number);
    sessionDate.setHours(hours, minutes, 0, 0);
    sessionDate.setMinutes(sessionDate.getMinutes() + (session.duration || 60));
  } else {
    sessionDate.setHours(23, 59, 59, 999);
  }
  return sessionDate < new Date();
}

export function useSessionsData() {
  const [, setUser] = useState<User | null>(null);
  const [hostingSessions, setHostingSessions] = useState<HostingSession[]>([]);
  const [joinedSessions, setJoinedSessions] = useState<JoinedSession[]>([]);
  const [pastSessions, setPastSessions] = useState<PastSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past'>('upcoming');
  const router = useRouter();
  const supabase = createClient();
  const fixedAreaRef = useRef<HTMLDivElement>(null);
  const [fixedHeight, setFixedHeight] = useState(0);

  const measureFixed = useCallback(() => {
    if (fixedAreaRef.current) {
      setFixedHeight(fixedAreaRef.current.offsetHeight);
    }
  }, []);

  useEffect(() => {
    measureFixed();
    window.addEventListener('resize', measureFixed);
    return () => window.removeEventListener('resize', measureFixed);
  }, [measureFixed]);

  useEffect(() => {
    measureFixed();
    requestAnimationFrame(() => measureFixed());
  }, [activeTab, loading, hostingSessions.length, joinedSessions.length, pastSessions.length, measureFixed]);

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
    await loadSessions(user.id);
  }

  async function loadSessions(userId: string) {
    try {
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      // Load sessions I'm hosting (upcoming) - include today's sessions
      const { data: hosting } = await supabase
        .from('sessions')
        .select(
          `
          *,
          participants:session_participants(user_id, status)
        `
        )
        .eq('creator_id', userId)
        .gte('date', today)
        .eq('status', 'active')
        .order('date', { ascending: true });

      // Filter out hosting sessions that have actually ended (today's sessions past their end time)
      const upcomingHosting = (hosting || []).filter((s) => !isSessionPast(s));

      // Load sessions I've joined (upcoming)
      const { data: joined } = await supabase
        .from('session_participants')
        .select(
          `
          session:sessions(
            *,
            creator:users!sessions_creator_id_fkey(name, avatar_url)
          )
        `
        )
        .eq('user_id', userId)
        .eq('status', 'confirmed');

      // Filter joined sessions to only upcoming ones (not past their end time)
      const upcomingJoined =
        joined
          ?.filter((j) => {
            const session = j.session as unknown as JoinedSession | null;
            if (!session) return false;
            return !isSessionPast(session) && session.creator_id !== userId;
          })
          .map((j) => j.session as unknown as JoinedSession) || [];

      // Load past sessions (both hosted and joined)
      const { data: pastHosted } = await supabase
        .from('sessions')
        .select('*')
        .eq('creator_id', userId)
        .lte('date', today)
        .order('date', { ascending: false })
        .limit(20);

      // Filter to only actually past sessions
      const pastHostedFiltered = (pastHosted || []).filter((s) => isSessionPast(s));

      const pastJoinedData =
        joined
          ?.filter((j) => {
            const session = j.session as unknown as JoinedSession | null;
            if (!session) return false;
            return isSessionPast(session);
          })
          .map((j) => ({ ...(j.session as unknown as JoinedSession), wasParticipant: true })) || [];

      // Combine and dedupe past sessions
      const allPast = [...pastHostedFiltered, ...pastJoinedData];
      const uniquePast = allPast.reduce((acc: PastSession[], curr) => {
        if (!acc.find((s) => s.id === curr.id)) {
          acc.push(curr);
        }
        return acc;
      }, []);
      uniquePast.sort((a, b) => new Date(b.date + 'T00:00:00').getTime() - new Date(a.date + 'T00:00:00').getTime());

      setHostingSessions(upcomingHosting);
      setJoinedSessions(upcomingJoined);
      setPastSessions(uniquePast.slice(0, 20));
    } catch (error) {
      logError(error, { action: 'loadSessions' });
    } finally {
      setLoading(false);
    }
  }

  return {
    hostingSessions,
    joinedSessions,
    pastSessions,
    loading,
    activeTab,
    setActiveTab,
    fixedAreaRef,
    fixedHeight,
  };
}
