'use client';

import { useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import {
  fetchAdminStatsRaw,
  fetchAdminUsersWithCounts,
  fetchAdminReports,
  fetchAdminFeedback,
  fetchAdminBugs,
  fetchAdminMessages,
  fetchAdminSessions,
} from '@/lib/dal';
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
  const [error, setError] = useState<string | null>(null);

  async function loadStats() {
    try {
      setError(null);
      const result = await fetchAdminStatsRaw(supabase);
      if (!result.success || !result.data) return;

      const {
        userCount,
        activeSessionCount,
        messageCount,
        newUsersToday,
        allSessions,
        allSessionCreators,
        allParticipants,
      } = result.data;

      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const weekStr = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, '0')}-${String(weekStart.getDate()).padStart(2, '0')}`;
      const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

      const totalSessions = allSessions.length;
      const pastSessions = allSessions.filter((s) => new Date(s.date + 'T00:00:00') < new Date());
      const avgParticipants =
        totalSessions > 0
          ? Math.round(allSessions.reduce((sum, s) => sum + (s.current_participants || 0), 0) / totalSessions)
          : 0;
      const sessionsThisWeek = allSessions.filter((s) => s.date >= weekStr).length;
      const sessionsThisMonth = allSessions.filter((s) => s.date >= monthStr).length;

      const sportCounts: Record<string, number> = {};
      allSessions.forEach((s) => {
        sportCounts[s.sport] = (sportCounts[s.sport] || 0) + 1;
      });
      const topSportEntry = Object.entries(sportCounts).sort((a, b) => b[1] - a[1])[0];

      const activeCreatorIds = new Set<string>();
      allSessions.forEach((s) => {
        if (new Date(s.date + 'T00:00:00') >= new Date(thirtyDaysAgo)) activeCreatorIds.add(s.creator_id);
      });
      const activeParticipantIds = new Set<string>();
      allParticipants.forEach((p) => activeParticipantIds.add(p.user_id));
      const activeUsers = new Set([...activeCreatorIds, ...activeParticipantIds]).size;

      const creatorCounts = new Map<string, number>();
      allSessionCreators.forEach((s) => {
        creatorCounts.set(s.creator_id, (creatorCounts.get(s.creator_id) || 0) + 1);
      });
      const creatorsWithMultiple = [...creatorCounts.values()].filter((c) => c > 1).length;
      const retentionPercent =
        creatorCounts.size > 0 ? Math.round((creatorsWithMultiple / creatorCounts.size) * 100) : 0;

      setStats({
        totalUsers: userCount,
        activeUsers,
        activeSessions: activeSessionCount,
        totalSessions,
        sessionsThisWeek,
        sessionsThisMonth,
        totalMessages: messageCount,
        newUsersToday,
        // QA-13: sessions rarely get explicitly marked `completed` — they
        // just run and pass. Count any past session whose status isn't
        // 'cancelled' as completed so the dashboard reflects reality.
        completedSessions: pastSessions.filter((s) => s.status !== 'cancelled').length,
        cancelledSessions: allSessions.filter((s) => s.status === 'cancelled').length,
        averageParticipants: avgParticipants,
        topSport: topSportEntry?.[0] || '-',
        topSportCount: topSportEntry?.[1] || 0,
        avgSessionsPerUser: userCount > 0 ? Math.round((totalSessions / userCount) * 10) / 10 : 0,
        retentionPercent,
        totalCreated: allSessionCreators.length,
        totalJoined: allParticipants.length,
      });
    } catch (err) {
      logError(err, { action: 'loadStats' });
      setError('load_failed');
    }
  }

  async function loadUsers() {
    setLoadingUsers(true);
    try {
      const result = await fetchAdminUsersWithCounts(supabase);
      if (!result.success || !result.data) throw new Error(result.error);

      const { users: data, sessionCounts, participantCounts } = result.data;
      const createdMap = new Map<string, number>();
      sessionCounts.forEach((s) => {
        createdMap.set(s.creator_id, (createdMap.get(s.creator_id) || 0) + 1);
      });
      const joinedMap = new Map<string, number>();
      participantCounts.forEach((p) => {
        if (p.user_id) joinedMap.set(p.user_id, (joinedMap.get(p.user_id) || 0) + 1);
      });
      setUsers(
        (data as Array<{ id: string } & Record<string, unknown>>).map((u) => ({
          ...u,
          sessions_created: createdMap.get(u.id) || 0,
          sessions_joined: joinedMap.get(u.id) || 0,
        })) as AdminUser[]
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
      const result = await fetchAdminReports(supabase);
      if (!result.success) throw new Error(result.error);
      setReports(result.data || []);
    } catch (error) {
      logError(error, { action: 'loadReports' });
    } finally {
      setLoadingReports(false);
    }
  }

  async function loadFeedback() {
    setLoadingFeedback(true);
    try {
      const result = await fetchAdminFeedback(supabase);
      if (!result.success) throw new Error(result.error);
      setFeedback(result.data || []);
    } catch (error) {
      logError(error, { action: 'loadFeedback' });
    } finally {
      setLoadingFeedback(false);
    }
  }

  async function loadBugs() {
    setLoadingBugs(true);
    try {
      const result = await fetchAdminBugs(supabase);
      if (!result.success) throw new Error(result.error);
      setBugs(result.data || []);
    } catch (error) {
      logError(error, { action: 'loadBugs' });
    } finally {
      setLoadingBugs(false);
    }
  }

  async function loadMessages() {
    setLoadingMessages(true);
    try {
      const result = await fetchAdminMessages(supabase);
      if (!result.success) throw new Error(result.error);
      setMessages(result.data || []);
    } catch (error) {
      logError(error, { action: 'loadMessages' });
    } finally {
      setLoadingMessages(false);
    }
  }

  async function loadSessions() {
    setLoadingSessions(true);
    try {
      const result = await fetchAdminSessions(supabase);
      if (!result.success) throw new Error(result.error);
      setSessions(result.data || []);
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
    error,
    loadStats,
    loadUsers,
    loadReports,
    loadFeedback,
    loadBugs,
    loadMessages,
    loadSessions,
  };
}
