'use client';

import { useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type {
  AdminStatsData,
  AdminUser,
  AdminReport,
  AdminFeedback,
  AdminBug,
  AdminSession,
  AdminMessage,
} from './types';

const defaultStats: AdminStatsData = {
  totalUsers: 0,
  activeUsers: 0,
  activeSessions: 0,
  totalSessions: 0,
  sessionsThisWeek: 0,
  sessionsThisMonth: 0,
  totalMessages: 0,
  newUsersToday: 0,
  completedSessions: 0,
  cancelledSessions: 0,
  averageParticipants: 0,
  topSport: '',
  topSportCount: 0,
  avgSessionsPerUser: 0,
  retentionPercent: 0,
  totalCreated: 0,
  totalJoined: 0,
};

export function useAdminData(supabase: SupabaseClient) {
  const [stats, setStats] = useState<AdminStatsData>(defaultStats);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [feedback, setFeedback] = useState<AdminFeedback[]>([]);
  const [bugs, setBugs] = useState<AdminBug[]>([]);
  const [sessions, setSessions] = useState<AdminSession[]>([]);
  const [messages, setMessages] = useState<AdminMessage[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingReports, setLoadingReports] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingFeedback, setLoadingFeedback] = useState(false);
  const [loadingBugs, setLoadingBugs] = useState(false);

  async function loadStats() {
    try {
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const weekStr = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, '0')}-${String(weekStart.getDate()).padStart(2, '0')}`;
      const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

      const [
        { count: userCount },
        { count: activeSessionCount },
        { count: messageCount },
        { count: newUsers },
        { data: allSessions },
        { data: allSessionCreators },
        { data: allParticipants },
      ] = await Promise.all([
        supabase.from('users').select('id', { count: 'exact', head: true }),
        supabase
          .from('sessions')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'active')
          .gte('date', today),
        supabase.from('chat_messages').select('id', { count: 'exact', head: true }),
        supabase.from('users').select('id', { count: 'exact', head: true }).gte('created_at', todayStart.toISOString()),
        supabase.from('sessions').select('id, status, date, participants_count, sport, creator_id'),
        supabase.from('sessions').select('creator_id'),
        supabase.from('session_participants').select('user_id'),
      ]);

      const totalSessions = allSessions?.length || 0;
      const pastSessions = allSessions?.filter((s) => new Date(s.date + 'T00:00:00') < new Date()) || [];
      const avgParticipants =
        totalSessions > 0
          ? Math.round((allSessions || []).reduce((sum, s) => sum + (s.participants_count || 0), 0) / totalSessions)
          : 0;
      const sessionsThisWeek = allSessions?.filter((s) => s.date >= weekStr).length || 0;
      const sessionsThisMonth = allSessions?.filter((s) => s.date >= monthStr).length || 0;

      const sportCounts: Record<string, number> = {};
      allSessions?.forEach((s) => {
        sportCounts[s.sport] = (sportCounts[s.sport] || 0) + 1;
      });
      const topSportEntry = Object.entries(sportCounts).sort((a, b) => b[1] - a[1])[0];

      const activeCreatorIds = new Set<string>();
      allSessions?.forEach((s) => {
        if (new Date(s.date + 'T00:00:00') >= new Date(thirtyDaysAgo)) activeCreatorIds.add(s.creator_id);
      });
      const activeParticipantIds = new Set<string>();
      allParticipants?.forEach((p) => activeParticipantIds.add(p.user_id));
      const activeUsers = new Set([...activeCreatorIds, ...activeParticipantIds]).size;

      const creatorCounts = new Map<string, number>();
      allSessionCreators?.forEach((s) => {
        creatorCounts.set(s.creator_id, (creatorCounts.get(s.creator_id) || 0) + 1);
      });
      const creatorsWithMultiple = [...creatorCounts.values()].filter((c) => c > 1).length;
      const retentionPercent =
        creatorCounts.size > 0 ? Math.round((creatorsWithMultiple / creatorCounts.size) * 100) : 0;

      setStats({
        totalUsers: userCount || 0,
        activeUsers,
        activeSessions: activeSessionCount || 0,
        totalSessions,
        sessionsThisWeek,
        sessionsThisMonth,
        totalMessages: messageCount || 0,
        newUsersToday: newUsers || 0,
        completedSessions: pastSessions.filter((s) => s.status === 'completed').length,
        cancelledSessions: pastSessions.filter((s) => s.status === 'cancelled').length,
        averageParticipants: avgParticipants,
        topSport: topSportEntry?.[0] || '-',
        topSportCount: topSportEntry?.[1] || 0,
        avgSessionsPerUser: (userCount || 0) > 0 ? Math.round((totalSessions / (userCount || 1)) * 10) / 10 : 0,
        retentionPercent,
        totalCreated: allSessionCreators?.length || 0,
        totalJoined: allParticipants?.length || 0,
      });
    } catch (error) {
      logError(error, { action: 'loadStats' });
    }
  }

  async function loadUsers() {
    setLoadingUsers(true);
    try {
      const [{ data, error }, { data: sessionCounts }, { data: participantCounts }] = await Promise.all([
        supabase.from('users').select('*').order('created_at', { ascending: false }).limit(100),
        supabase.from('sessions').select('creator_id'),
        supabase.from('session_participants').select('user_id'),
      ]);
      if (error) throw error;
      const createdMap = new Map<string, number>();
      sessionCounts?.forEach((s) => {
        createdMap.set(s.creator_id, (createdMap.get(s.creator_id) || 0) + 1);
      });
      const joinedMap = new Map<string, number>();
      participantCounts?.forEach((p) => {
        if (p.user_id) joinedMap.set(p.user_id, (joinedMap.get(p.user_id) || 0) + 1);
      });
      setUsers(
        (data || []).map((u) => ({
          ...u,
          sessions_created: createdMap.get(u.id) || 0,
          sessions_joined: joinedMap.get(u.id) || 0,
        }))
      );
    } catch (error) {
      logError(error, { action: 'loadUsers' });
    } finally {
      setLoadingUsers(false);
    }
  }

  async function loadReports() {
    setLoadingReports(true);
    try {
      const { data, error } = await supabase
        .from('reported_users')
        .select(
          `*, reporter:users!reported_users_reporter_id_fkey(id, name, email), reported:users!reported_users_reported_user_id_fkey(id, name, email)`
        )
        .order('created_at', { ascending: false });
      if (error) throw error;
      setReports(data || []);
    } catch (error) {
      logError(error, { action: 'loadReports' });
    } finally {
      setLoadingReports(false);
    }
  }

  async function loadFeedback() {
    setLoadingFeedback(true);
    try {
      const { data, error } = await supabase
        .from('user_feedback')
        .select(`*, user:users(id, name, email)`)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setFeedback(data || []);
    } catch (error) {
      logError(error, { action: 'loadFeedback' });
    } finally {
      setLoadingFeedback(false);
    }
  }

  async function loadBugs() {
    setLoadingBugs(true);
    try {
      const { data, error } = await supabase
        .from('bug_reports')
        .select(`*, user:users(id, name, email)`)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setBugs(data || []);
    } catch (error) {
      logError(error, { action: 'loadBugs' });
    } finally {
      setLoadingBugs(false);
    }
  }

  async function loadMessages() {
    setLoadingMessages(true);
    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .select(`*, user:users(id, name, email), session:sessions(id, sport, location)`)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      setMessages(data || []);
    } catch (error) {
      logError(error, { action: 'loadMessages' });
    } finally {
      setLoadingMessages(false);
    }
  }

  async function loadSessions() {
    setLoadingSessions(true);
    try {
      const { data, error } = await supabase
        .from('sessions')
        .select(`*, creator:users!sessions_creator_id_fkey(id, name, email)`)
        .order('date', { ascending: false })
        .limit(50);
      if (error) throw error;
      setSessions(data || []);
    } catch (error) {
      logError(error, { action: 'loadSessions' });
    } finally {
      setLoadingSessions(false);
    }
  }

  return {
    stats,
    users,
    reports,
    feedback,
    bugs,
    sessions,
    messages,
    setUsers,
    setReports,
    setFeedback,
    setBugs,
    setSessions,
    setMessages,
    loadingUsers,
    loadingReports,
    loadingSessions,
    loadingMessages,
    loadingFeedback,
    loadingBugs,
    loadStats,
    loadUsers,
    loadReports,
    loadFeedback,
    loadBugs,
    loadMessages,
    loadSessions,
  };
}
