'use client';
import { useLanguage } from '@/lib/LanguageContext';
import { getErrorMessage } from '@/lib/errorMessages';
import { showSuccess, showError } from '@/lib/toast';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import {
  AdminStats,
  UserManagement,
  ReportedMessages,
  FeedbackList,
  BugReports,
  MessageList,
  SessionManagement,
} from '@/components/admin';

export default function AdminPage() {
  const router = useRouter();
  const supabase = createClient();
  const [user, setUser] = useState<any>(null);
  const { language } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeSessions: 0,
    totalMessages: 0,
    newUsersToday: 0,
    completedSessions: 0,
    cancelledSessions: 0,
    averageParticipants: 0,
  });
  const [users, setUsers] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [feedback, setFeedback] = useState<any[]>([]);
  const [bugs, setBugs] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingReports, setLoadingReports] = useState(false);
  const [sessions, setSessions] = useState<any[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingFeedback, setLoadingFeedback] = useState(false);
  const [loadingBugs, setLoadingBugs] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    checkAdmin();
  }, []);

  useEffect(() => {
    if (activeTab === 'users') loadUsers();
    else if (activeTab === 'reports') loadReports();
    else if (activeTab === 'feedback') loadFeedback();
    else if (activeTab === 'bugs') loadBugs();
    else if (activeTab === 'messages') loadMessages();
    else if (activeTab === 'sessions') loadSessions();
  }, [activeTab]);

  async function checkAdmin() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push('/auth');
      return;
    }
    const { data: profile } = await supabase.from('users').select('is_admin').eq('id', user.id).single();
    if (!profile?.is_admin) {
      alert('Unauthorized access');
      router.push('/');
      return;
    }
    setUser(user);
    setAuthorized(true);
    await loadStats();
    setLoading(false);
  }

  async function loadStats() {
    try {
      const { count: userCount } = await supabase.from('users').select('id', { count: 'exact', head: true });
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const { count: sessionCount } = await supabase
        .from('sessions')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active')
        .gte('date', today);
      const { count: messageCount } = await supabase.from('chat_messages').select('id', { count: 'exact', head: true });
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const { count: newUsers } = await supabase
        .from('users')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', todayStart.toISOString());
      const { data: allSessions } = await supabase.from('sessions').select('id, status, date, participants_count');
      const pastSessions = allSessions?.filter((s) => new Date(s.date + 'T00:00:00') < new Date()) || [];
      const completedCount = pastSessions.filter((s) => s.status === 'completed').length;
      const cancelledCount = pastSessions.filter((s) => s.status === 'cancelled').length;
      const avgParticipants =
        allSessions && allSessions.length > 0
          ? Math.round(allSessions.reduce((sum, s) => sum + (s.participants_count || 0), 0) / allSessions.length)
          : 0;
      setStats({
        totalUsers: userCount || 0,
        activeSessions: sessionCount || 0,
        totalMessages: messageCount || 0,
        newUsersToday: newUsers || 0,
        completedSessions: completedCount,
        cancelledSessions: cancelledCount,
        averageParticipants: avgParticipants,
      });
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  }

  async function loadUsers() {
    setLoadingUsers(true);
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('Error loading users:', error);
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
          `*, reporter:users!reported_users_reporter_id_fkey(id, name, email),
          reported:users!reported_users_reported_user_id_fkey(id, name, email)`
        )
        .order('created_at', { ascending: false });
      if (error) throw error;
      setReports(data || []);
    } catch (error) {
      console.error('Error loading reports:', error);
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
      console.error('Error loading feedback:', error);
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
      console.error('Error loading bugs:', error);
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
      console.error('Error loading messages:', error);
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
      console.error('Error loading sessions:', error);
    } finally {
      setLoadingSessions(false);
    }
  }

  async function deleteMessage(messageId: string) {
    if (!confirm('Delete this message?')) return;
    setActionLoading(messageId);
    try {
      const { error } = await supabase.from('chat_messages').delete().eq('id', messageId);
      if (error) throw error;
      setMessages(messages.filter((m) => m.id !== messageId));
      showSuccess('Message deleted');
    } catch (error: any) {
      showError(getErrorMessage(error, 'admin_action', language));
    } finally {
      setActionLoading(null);
    }
  }

  async function verifySessionPhotos(sessionId: string) {
    if (!confirm('Verify these location photos as authentic?')) return;
    try {
      const { error } = await supabase
        .from('sessions')
        .update({ photo_verified: true, verified_by: user?.id, verified_at: new Date().toISOString() })
        .eq('id', sessionId);
      if (error) throw error;
      setSessions(sessions.map((s) => (s.id === sessionId ? { ...s, photo_verified: true } : s)));
      showSuccess('Photos verified');
    } catch (error: any) {
      showError(getErrorMessage(error, 'admin_action', language));
    }
  }

  async function unverifySessionPhotos(sessionId: string) {
    if (!confirm('Remove verification?')) return;
    try {
      const { error } = await supabase
        .from('sessions')
        .update({ photo_verified: false, verified_by: null, verified_at: null })
        .eq('id', sessionId);
      if (error) throw error;
      setSessions(sessions.map((s) => (s.id === sessionId ? { ...s, photo_verified: false } : s)));
      showSuccess('Verification removed');
    } catch (error: any) {
      showError(getErrorMessage(error, 'admin_action', language));
    }
  }

  async function banUser(userId: string) {
    if (!confirm('Ban this user?')) return;
    setActionLoading(userId);
    try {
      const { error } = await supabase.from('users').update({ banned: true }).eq('id', userId);
      if (error) throw error;
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, banned: true } : u)));
      showSuccess('User banned');
    } catch (error: any) {
      showError(getErrorMessage(error, 'admin_action', language));
    } finally {
      setActionLoading(null);
    }
  }

  async function unbanUser(userId: string) {
    if (!confirm('Unban this user?')) return;
    setActionLoading(userId);
    try {
      const { error } = await supabase.from('users').update({ banned: false }).eq('id', userId);
      if (error) throw error;
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, banned: false } : u)));
      showSuccess('User unbanned');
    } catch (error: any) {
      showError(getErrorMessage(error, 'admin_action', language));
    } finally {
      setActionLoading(null);
    }
  }

  async function deleteUser(userId: string) {
    if (!confirm('DELETE user and ALL data?')) return;
    setActionLoading(userId);
    try {
      await supabase.from('chat_messages').delete().eq('user_id', userId);
      await supabase.from('session_participants').delete().eq('user_id', userId);
      await supabase.from('sessions').delete().eq('creator_id', userId);
      const { error } = await supabase.from('users').delete().eq('id', userId);
      if (error) throw error;
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      showSuccess('User deleted');
    } catch (error: any) {
      showError(getErrorMessage(error, 'admin_action', language));
    } finally {
      setActionLoading(null);
    }
  }

  async function updateReportStatus(reportId: string, status: string) {
    try {
      const { error } = await supabase.from('reported_users').update({ status }).eq('id', reportId);
      if (error) throw error;
      setReports((prev) => prev.map((r) => (r.id === reportId ? { ...r, status } : r)));
      showSuccess(`Report marked as ${status}`);
    } catch (error: any) {
      showError(getErrorMessage(error, 'admin_action', language));
    }
  }

  async function updateFeedbackStatus(feedbackId: string, status: string) {
    try {
      const { error } = await supabase.from('user_feedback').update({ status }).eq('id', feedbackId);
      if (error) throw error;
      setFeedback((prev) => prev.map((f) => (f.id === feedbackId ? { ...f, status } : f)));
      showSuccess(`Feedback marked as ${status}`);
    } catch (error: any) {
      showError(getErrorMessage(error, 'admin_action', language));
    }
  }

  async function updateBugStatus(bugId: string, status: string) {
    try {
      const { error } = await supabase.from('bug_reports').update({ status }).eq('id', bugId);
      if (error) throw error;
      setBugs((prev) => prev.map((b) => (b.id === bugId ? { ...b, status } : b)));
      showSuccess(`Bug marked as ${status}`);
    } catch (error: any) {
      showError(getErrorMessage(error, 'admin_action', language));
    }
  }

  const pendingReports = reports.filter((r) => r.status === 'pending');
  const pendingFeedback = feedback.filter((f) => f.status === 'pending');
  const pendingBugs = bugs.filter((b) => b.status === 'pending');

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-stone-50">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (!authorized) return null;

  const tabs = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'users', label: 'Users' },
    { id: 'reports', label: 'Reports', badge: pendingReports.length, badgeColor: 'bg-red-500' },
    { id: 'feedback', label: 'Feedback', badge: pendingFeedback.length, badgeColor: 'bg-blue-500' },
    { id: 'bugs', label: 'Bugs', badge: pendingBugs.length, badgeColor: 'bg-orange-500' },
    { id: 'messages', label: 'Messages' },
    { id: 'sessions', label: 'Sessions' },
  ];

  return (
    <div className="min-h-screen bg-stone-50 pb-32 safe-area-top">
      <div className="w-full max-w-md mx-auto px-3 py-4">
        <Link href="/settings" className="inline-flex items-center gap-1 text-stone-600 mb-3 text-sm">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </Link>

        <h1 className="text-lg font-bold text-[#272D34] mb-1">Admin Panel</h1>
        <p className="text-xs text-stone-600 mb-4 truncate">{user?.email}</p>

        <div className="flex gap-2 mb-4 border-b border-stone-300 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 text-sm font-medium whitespace-nowrap relative ${
                activeTab === tab.id ? 'border-b-2 border-[#C0E863] text-[#272D34]' : 'text-stone-600'
              }`}
            >
              {tab.label}
              {tab.badge && tab.badge > 0 && (
                <span
                  className={`absolute -top-1 -right-1 ${tab.badgeColor} text-white text-xs rounded-full w-5 h-5 flex items-center justify-center`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {activeTab === 'dashboard' && <AdminStats stats={stats} />}
        {activeTab === 'users' && (
          <UserManagement
            users={users}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            loading={loadingUsers}
            actionLoading={actionLoading}
            onBan={banUser}
            onUnban={unbanUser}
            onDelete={deleteUser}
          />
        )}
        {activeTab === 'reports' && (
          <ReportedMessages
            reports={reports}
            loading={loadingReports}
            language={language}
            onBanUser={banUser}
            onUpdateStatus={updateReportStatus}
          />
        )}
        {activeTab === 'feedback' && (
          <FeedbackList
            feedback={feedback}
            loading={loadingFeedback}
            language={language}
            onUpdateStatus={updateFeedbackStatus}
          />
        )}
        {activeTab === 'bugs' && (
          <BugReports bugs={bugs} loading={loadingBugs} language={language} onUpdateStatus={updateBugStatus} />
        )}
        {activeTab === 'messages' && (
          <MessageList
            messages={messages}
            loading={loadingMessages}
            actionLoading={actionLoading}
            onDelete={deleteMessage}
          />
        )}
        {activeTab === 'sessions' && (
          <SessionManagement
            sessions={sessions}
            loading={loadingSessions}
            language={language}
            onVerify={verifySessionPhotos}
            onUnverify={unverifySessionPhotos}
          />
        )}
      </div>
    </div>
  );
}
