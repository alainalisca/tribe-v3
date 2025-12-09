'use client';

import { showSuccess, showError, showInfo } from "@/lib/toast";
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Users, Calendar, MessageSquare, TrendingUp, Search, Ban, Trash2, UserCheck, Shield, Flag, AlertTriangle, Bug } from 'lucide-react';

export default function AdminPage() {
  const router = useRouter();
  const supabase = createClient();
  const [user, setUser] = useState<any>(null);
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

  const ADMIN_EMAIL = 'alainalisca@aplusfitnessllc.com';

  useEffect(() => {
    checkAdmin();
  }, []);

  useEffect(() => {
    if (activeTab === 'users') {
      loadUsers();
    } else if (activeTab === 'reports') {
      loadReports();
    } else if (activeTab === 'feedback') {
      loadFeedback();
    } else if (activeTab === 'bugs') {
      loadBugs();
    } else if (activeTab === 'messages') {
      loadMessages();
    } else if (activeTab === 'sessions') {
      loadSessions();
    }
  }, [activeTab]);

  async function checkAdmin() {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      router.push('/auth');
      return;
    }

    if (user.email !== ADMIN_EMAIL) {
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
      const { count: userCount } = await supabase
        .from('users')
        .select('id', { count: 'exact', head: true });

      const today = new Date().toISOString().split('T')[0];
      const { count: sessionCount } = await supabase
        .from('sessions')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active')
        .gte('date', today);

      const { count: messageCount } = await supabase
        .from('chat_messages')
        .select('id', { count: 'exact', head: true });

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const { count: newUsers } = await supabase
        .from('users')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', todayStart.toISOString());


      // Session analytics
      const { data: allSessions } = await supabase
        .from("sessions")
        .select("id, status, date, participants_count");

      const pastSessions = allSessions?.filter(s => new Date(s.date) < new Date()) || [];
      const completedCount = pastSessions.filter(s => s.status === "completed").length;
      const cancelledCount = pastSessions.filter(s => s.status === "cancelled").length;
      
      const avgParticipants = allSessions && allSessions.length > 0
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
        .select(`
          *,
          reporter:users!reported_users_reporter_id_fkey(id, name, email),
          reported:users!reported_users_reported_user_id_fkey(id, name, email)
        `)
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
        .select(`
          *,
          user:users(id, name, email)
        `)
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
        .select(`
          *,
          user:users(id, name, email)
        `)
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
        .select(`
          *,
          user:users(id, name, email),
          session:sessions(id, sport, location)
        `)
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

  async function deleteMessage(messageId: string) {
    if (!confirm('Delete this message?')) return;
    
    setActionLoading(messageId);
    try {
      const { error } = await supabase
        .from('chat_messages')
        .delete()
        .eq('id', messageId);

      if (error) throw error;
      
      setMessages(messages.filter(m => m.id !== messageId));
      showSuccess('Message deleted');
    } catch (error: any) {
      console.error('Error deleting message:', error);
      showError('Error: ' + error.message);
    } finally {
      setActionLoading(null);
    }
  }

  async function loadSessions() {
    setLoadingSessions(true);
    try {
      const { data, error } = await supabase
        .from('sessions')
        .select(`
          *,
          creator:users!sessions_creator_id_fkey(id, name, email)
        `)
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

  async function verifySessionPhotos(sessionId: string) {
    if (!confirm('Verify these location photos as authentic?')) return;

    try {
      const { error } = await supabase
        .from('sessions')
        .update({
          photo_verified: true,
          verified_by: user?.id,
          verified_at: new Date().toISOString(),
        })
        .eq('id', sessionId);

      if (error) throw error;

      setSessions(sessions.map(s => 
        s.id === sessionId ? { ...s, photo_verified: true } : s
      ));

      alert('✅ Photos verified');
    } catch (error: any) {
      showError('Error: ' + error.message);
    }
  }

  async function unverifySessionPhotos(sessionId: string) {
    if (!confirm('Remove verification?')) return;

    try {
      const { error } = await supabase
        .from('sessions')
        .update({
          photo_verified: false,
          verified_by: null,
          verified_at: null,
        })
        .eq('id', sessionId);

      if (error) throw error;

      setSessions(sessions.map(s => 
        s.id === sessionId ? { ...s, photo_verified: false } : s
      ));

      alert('Verification removed');
    } catch (error: any) {
      showError('Error: ' + error.message);
    }
  }

  async function banUser(userId: string) {
    if (!confirm('Ban this user?')) return;

    setActionLoading(userId);
    try {
      const { error } = await supabase
        .from('users')
        .update({ banned: true })
        .eq('id', userId);

      if (error) throw error;
      
      setUsers(prev => prev.map(u => 
        u.id === userId ? { ...u, banned: true } : u
      ));
      
      showSuccess('User banned');
      await loadUsers();
    } catch (error: any) {
      showError('Error: ' + error.message);
    } finally {
      setActionLoading(null);
    }
  }

  async function unbanUser(userId: string) {
    if (!confirm('Unban this user?')) return;

    setActionLoading(userId);
    try {
      const { error } = await supabase
        .from('users')
        .update({ banned: false })
        .eq('id', userId);

      if (error) throw error;
      
      setUsers(prev => prev.map(u => 
        u.id === userId ? { ...u, banned: false } : u
      ));
      
      showSuccess('User unbanned');
      await loadUsers();
    } catch (error: any) {
      showError('Error: ' + error.message);
    } finally {
      setActionLoading(null);
    }
  }

  async function deleteUser(userId: string) {
    if (!confirm('⚠️ DELETE user and ALL data?')) return;

    setActionLoading(userId);
    try {
      await supabase.from('chat_messages').delete().eq('user_id', userId);
      await supabase.from('session_participants').delete().eq('user_id', userId);
      await supabase.from('sessions').delete().eq('creator_id', userId);
      const { error } = await supabase.from('users').delete().eq('id', userId);

      if (error) throw error;
      
      setUsers(prev => prev.filter(u => u.id !== userId));
      
      showSuccess('User deleted');
      await loadUsers();
    } catch (error: any) {
      showError('Error: ' + error.message);
    } finally {
      setActionLoading(null);
    }
  }

  async function updateReportStatus(reportId: string, status: string) {
    try {
      const { error } = await supabase
        .from('reported_users')
        .update({ status })
        .eq('id', reportId);

      if (error) throw error;
      
      setReports(prev => prev.map(r => 
        r.id === reportId ? { ...r, status } : r
      ));
      
      alert(`✅ Report marked as ${status}`);
    } catch (error: any) {
      showError('Error: ' + error.message);
    }
  }

  async function updateFeedbackStatus(feedbackId: string, status: string) {
    try {
      const { error } = await supabase
        .from('user_feedback')
        .update({ status })
        .eq('id', feedbackId);

      if (error) throw error;
      
      setFeedback(prev => prev.map(f => 
        f.id === feedbackId ? { ...f, status } : f
      ));
      
      alert(`✅ Feedback marked as ${status}`);
    } catch (error: any) {
      showError('Error: ' + error.message);
    }
  }

  async function updateBugStatus(bugId: string, status: string) {
    try {
      const { error } = await supabase
        .from('bug_reports')
        .update({ status })
        .eq('id', bugId);

      if (error) throw error;
      
      setBugs(prev => prev.map(b => 
        b.id === bugId ? { ...b, status } : b
      ));
      
      alert(`✅ Bug marked as ${status}`);
    } catch (error: any) {
      showError('Error: ' + error.message);
    }
  }

  const filteredUsers = users.filter(u => 
    u.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const pendingReports = reports.filter(r => r.status === 'pending');
  const pendingFeedback = feedback.filter(f => f.status === 'pending');
  const pendingBugs = bugs.filter(b => b.status === 'pending');

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-stone-50">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (!authorized) return null;

  return (
    <div className="min-h-screen bg-stone-50 pb-32">
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
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`px-3 py-1.5 text-sm font-medium whitespace-nowrap ${
              activeTab === 'dashboard'
                ? 'border-b-2 border-[#C0E863] text-[#272D34]'
                : 'text-stone-600'
            }`}
          >
            Dashboard
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`px-3 py-1.5 text-sm font-medium whitespace-nowrap ${
              activeTab === 'users'
                ? 'border-b-2 border-[#C0E863] text-[#272D34]'
                : 'text-stone-600'
            }`}
          >
            Users
          </button>
          <button
            onClick={() => setActiveTab('reports')}
            className={`px-3 py-1.5 text-sm font-medium whitespace-nowrap relative ${
              activeTab === 'reports'
                ? 'border-b-2 border-[#C0E863] text-[#272D34]'
                : 'text-stone-600'
            }`}
          >
            Reports
            {pendingReports.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {pendingReports.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('feedback')}
            className={`px-3 py-1.5 text-sm font-medium whitespace-nowrap relative ${
              activeTab === 'feedback'
                ? 'border-b-2 border-[#C0E863] text-[#272D34]'
                : 'text-stone-600'
            }`}
          >
            Feedback
            {pendingFeedback.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {pendingFeedback.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('bugs')}
            className={`px-3 py-1.5 text-sm font-medium whitespace-nowrap relative ${
              activeTab === 'bugs'
                ? 'border-b-2 border-[#C0E863] text-[#272D34]'
                : 'text-stone-600'
            }`}
          >
            Bugs
            {pendingBugs.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {pendingBugs.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("messages")}
            className={`px-3 py-1.5 text-sm font-medium whitespace-nowrap ${
              activeTab === "messages"
                ? "border-b-2 border-[#C0E863] text-[#272D34]"
                : "text-stone-600"
            }`}
          >
            Messages
          </button>
          <button
            onClick={() => setActiveTab("sessions")}
            className={`px-3 py-1.5 text-sm font-medium whitespace-nowrap ${
              activeTab === "sessions"
                ? "border-b-2 border-[#C0E863] text-[#272D34]"
                : "text-stone-600"
            }`}
          >
            Sessions
          </button>
        </div>

        {activeTab === 'dashboard' && (
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white rounded p-3 shadow">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-stone-600">Users</p>
                <Users className="w-4 h-4 text-blue-500" />
              </div>
              <p className="text-lg font-bold">{stats.totalUsers}</p>
            </div>
            <div className="bg-white rounded p-3 shadow">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-stone-600">Sessions</p>
                <Calendar className="w-4 h-4 text-green-500" />
              </div>
              <p className="text-lg font-bold">{stats.activeSessions}</p>
            </div>
            <div className="bg-white rounded p-3 shadow">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-stone-600">Messages</p>
                <MessageSquare className="w-4 h-4 text-purple-500" />
              </div>
              <p className="text-lg font-bold">{stats.totalMessages}</p>
            </div>
            <div className="bg-white rounded p-3 shadow">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-stone-600">New Today</p>
                <TrendingUp className="w-4 h-4 text-orange-500" />
              </div>
              <p className="text-lg font-bold">{stats.newUsersToday}</p>
            </div>

          {/* Session Analytics */}
          <div className="mt-4">
            <h3 className="text-xs font-bold text-stone-700 mb-2 uppercase">Session Analytics</h3>
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-white rounded p-3 shadow">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-stone-600">Completed</p>
                  <span className="text-green-500">✓</span>
                </div>
                <p className="text-lg font-bold">{stats.completedSessions}</p>
              </div>
              <div className="bg-white rounded p-3 shadow">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-stone-600">Cancelled</p>
                  <span className="text-red-500">✗</span>
                </div>
                <p className="text-lg font-bold">{stats.cancelledSessions}</p>
              </div>
              <div className="bg-white rounded p-3 shadow">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-stone-600">Avg Participants</p>
                  <Users className="w-4 h-4 text-blue-500" />
                </div>
                <p className="text-lg font-bold">{stats.averageParticipants}</p>
              </div>
            </div>
          </div>
          </div>
        )}

        {activeTab === 'users' && (
          <div className="bg-white rounded shadow">
            <div className="p-3 border-b">
              <div className="relative">
                <Search className="absolute left-2 top-2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-2 py-1.5 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-[#C0E863]"
                />
              </div>
            </div>

            <div className="divide-y max-h-96 overflow-y-auto">
              {loadingUsers ? (
                <p className="text-center py-6 text-sm text-gray-500">Loading...</p>
              ) : filteredUsers.length === 0 ? (
                <p className="text-center py-6 text-sm text-gray-500">No users found</p>
              ) : (
                filteredUsers.map((u) => (
                  <div key={u.id} className={`p-3 ${u.banned ? 'bg-red-50' : ''}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-9 h-9 rounded-full bg-[#C0E863] flex items-center justify-center text-sm font-bold flex-shrink-0">
                        {u.name?.[0]?.toUpperCase() || 'U'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 mb-0.5">
                          <p className="text-sm font-medium truncate">{u.name || 'No name'}</p>
                          {u.banned && (
                            <span className="px-1.5 py-0.5 bg-red-500 text-white text-xs rounded flex-shrink-0">
                              BANNED
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-stone-600 truncate">{u.email}</p>
                      </div>
                    </div>
                    
                    <div className="flex gap-2">
                      {u.banned ? (
                        <button
                          onClick={() => unbanUser(u.id)}
                          disabled={actionLoading === u.id}
                          className="flex-1 py-1.5 bg-green-500 text-white text-xs rounded hover:bg-green-600 disabled:opacity-50"
                        >
                          {actionLoading === u.id ? 'Wait...' : 'Unban'}
                        </button>
                      ) : (
                        <button
                          onClick={() => banUser(u.id)}
                          disabled={actionLoading === u.id}
                          className="flex-1 py-1.5 bg-orange-500 text-white text-xs rounded hover:bg-orange-600 disabled:opacity-50"
                        >
                          {actionLoading === u.id ? 'Wait...' : 'Ban'}
                        </button>
                      )}
                      <button
                        onClick={() => deleteUser(u.id)}
                        disabled={actionLoading === u.id}
                        className="flex-1 py-1.5 bg-red-500 text-white text-xs rounded hover:bg-red-600 disabled:opacity-50"
                      >
                        {actionLoading === u.id ? 'Wait...' : 'Delete'}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'reports' && (
          <div className="space-y-3">
            {loadingReports ? (
              <p className="text-center py-6 text-sm text-gray-500">Loading reports...</p>
            ) : reports.length === 0 ? (
              <div className="bg-white rounded p-6 text-center shadow">
                <Flag className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No reports yet</p>
              </div>
            ) : (
              <>
                {pendingReports.length > 0 && (
                  <>
                    <h3 className="text-sm font-bold text-[#272D34] flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-orange-500" />
                      Pending ({pendingReports.length})
                    </h3>
                    {pendingReports.map((report) => (
                      <div key={report.id} className="bg-white rounded shadow p-3">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <p className="text-sm font-bold text-[#272D34]">{report.reported?.name}</p>
                            <p className="text-xs text-stone-600">{report.reported?.email}</p>
                          </div>
                          <span className="px-2 py-1 bg-orange-100 text-orange-800 text-xs rounded">
                            {report.reason}
                          </span>
                        </div>
                        
                        {report.description && (
                          <p className="text-xs text-stone-700 mb-2 p-2 bg-stone-50 rounded">
                            {report.description}
                          </p>
                        )}
                        
                        <div className="flex items-center justify-between text-xs text-stone-500 mb-3">
                          <span>By: {report.reporter?.name}</span>
                          <span>{new Date(report.created_at).toLocaleDateString()}</span>
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={() => router.push(`/profile/${report.reported_user_id}`)}
                            className="flex-1 py-1.5 border border-stone-300 text-stone-700 text-xs rounded hover:bg-stone-50"
                          >
                            View Profile
                          </button>
                          <button
                            onClick={() => banUser(report.reported_user_id)}
                            className="flex-1 py-1.5 bg-red-500 text-white text-xs rounded hover:bg-red-600"
                          >
                            Ban User
                          </button>
                          <button
                            onClick={() => updateReportStatus(report.id, 'resolved')}
                            className="flex-1 py-1.5 bg-green-500 text-white text-xs rounded hover:bg-green-600"
                          >
                            Resolve
                          </button>
                        </div>
                      </div>
                    ))}
                  </>
                )}

                {reports.filter(r => r.status !== 'pending').length > 0 && (
                  <>
                    <h3 className="text-sm font-bold text-[#272D34] mt-4">
                      Resolved ({reports.filter(r => r.status !== 'pending').length})
                    </h3>
                    {reports.filter(r => r.status !== 'pending').slice(0, 5).map((report) => (
                      <div key={report.id} className="bg-stone-50 rounded p-3 opacity-60">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium">{report.reported?.name}</p>
                            <p className="text-xs text-stone-600">{report.reason}</p>
                          </div>
                          <span className="text-xs text-green-600">✓ Resolved</span>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === 'feedback' && (
          <div className="space-y-3">
            {loadingFeedback ? (
              <p className="text-center py-6 text-sm text-gray-500">Loading feedback...</p>
            ) : feedback.length === 0 ? (
              <div className="bg-white rounded p-6 text-center shadow">
                <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No feedback yet</p>
              </div>
            ) : (
              <>
                {pendingFeedback.length > 0 && (
                  <>
                    <h3 className="text-sm font-bold text-[#272D34] flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-blue-500" />
                      New Feedback ({pendingFeedback.length})
                    </h3>
                    {pendingFeedback.map((item) => (
                      <div key={item.id} className="bg-white rounded shadow p-3">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <p className="text-sm font-bold text-[#272D34]">{item.title}</p>
                            <p className="text-xs text-stone-600">{item.user?.email}</p>
                          </div>
                          <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">
                            {item.type === 'feature_request' ? 'Feature' : 'General'}
                          </span>
                        </div>
                        
                        <p className="text-xs text-stone-700 mb-2 p-2 bg-stone-50 rounded">
                          {item.description}
                        </p>
                        
                        <div className="text-xs text-stone-500 mb-3">
                          {new Date(item.created_at).toLocaleDateString()}
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={() => updateFeedbackStatus(item.id, 'reviewed')}
                            className="flex-1 py-1.5 bg-green-500 text-white text-xs rounded hover:bg-green-600"
                          >
                            Mark Reviewed
                          </button>
                          <button
                            onClick={() => updateFeedbackStatus(item.id, 'implemented')}
                            className="flex-1 py-1.5 bg-tribe-green text-slate-900 text-xs rounded hover:bg-lime-500"
                          >
                            Implemented
                          </button>
                        </div>
                      </div>
                    ))}
                  </>
                )}

                {feedback.filter(f => f.status !== 'pending').slice(0, 5).map((item) => (
                  <div key={item.id} className="bg-stone-50 rounded p-3 opacity-60">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{item.title}</p>
                        <p className="text-xs text-stone-600">{item.user?.name}</p>
                      </div>
                      <span className="text-xs text-green-600">
                        {item.status === 'implemented' ? '✓ Done' : '✓ Reviewed'}
                      </span>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {activeTab === 'bugs' && (
          <div className="space-y-3">
            {loadingBugs ? (
              <p className="text-center py-6 text-sm text-gray-500">Loading bugs...</p>
            ) : bugs.length === 0 ? (
              <div className="bg-white rounded p-6 text-center shadow">
                <Bug className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No bug reports yet</p>
              </div>
            ) : (
              <>
                {pendingBugs.length > 0 && (
                  <>
                    <h3 className="text-sm font-bold text-[#272D34] flex items-center gap-2">
                      <Bug className="w-4 h-4 text-orange-500" />
                      Open Bugs ({pendingBugs.length})
                    </h3>
                    {pendingBugs.map((bug) => (
                      <div key={bug.id} className="bg-white rounded shadow p-3">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <p className="text-sm font-bold text-[#272D34]">{bug.title}</p>
                            <p className="text-xs text-stone-600">{bug.user?.email}</p>
                          </div>
                          <span className={`px-2 py-1 text-xs rounded ${
                            bug.severity === 'critical' ? 'bg-red-100 text-red-800' :
                            bug.severity === 'high' ? 'bg-orange-100 text-orange-800' :
                            bug.severity === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {bug.severity}
                          </span>
                        </div>
                        
                        <p className="text-xs text-stone-700 mb-1 p-2 bg-stone-50 rounded">
                          {bug.description}
                        </p>
                        
                        {bug.steps_to_reproduce && (
                          <p className="text-xs text-stone-600 mb-2 p-2 bg-blue-50 rounded whitespace-pre-wrap">
                            <strong>Steps:</strong> {bug.steps_to_reproduce}
                          </p>
                        )}
                        
                        <div className="text-xs text-stone-500 mb-3">
                          {new Date(bug.created_at).toLocaleDateString()}
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={() => updateBugStatus(bug.id, 'investigating')}
                            className="flex-1 py-1.5 bg-yellow-500 text-white text-xs rounded hover:bg-yellow-600"
                          >
                            Investigating
                          </button>
                          <button
                            onClick={() => updateBugStatus(bug.id, 'fixed')}
                            className="flex-1 py-1.5 bg-green-500 text-white text-xs rounded hover:bg-green-600"
                          >
                            Fixed
                          </button>
                        </div>
                      </div>
                    ))}
                  </>
                )}

                {bugs.filter(b => b.status !== 'pending').slice(0, 5).map((bug) => (
                  <div key={bug.id} className="bg-stone-50 rounded p-3 opacity-60">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{bug.title}</p>
                        <p className="text-xs text-stone-600">{bug.user?.name}</p>
                      </div>
                      <span className="text-xs text-green-600">
                        {bug.status === 'fixed' ? '✓ Fixed' : '🔍 Investigating'}
                      </span>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>

        {activeTab === 'messages' && (
          <div className="bg-white rounded shadow">
            <div className="p-3 border-b">
              <h3 className="text-sm font-bold text-[#272D34] flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-purple-500" />
                Recent Messages ({messages.length})
              </h3>
              <p className="text-xs text-stone-600 mt-1">Last 100 messages across all sessions</p>
            </div>
            
            {loadingMessages ? (
              <p className="text-center py-6 text-sm text-gray-500">Loading messages...</p>
            ) : messages.length === 0 ? (
              <div className="p-6 text-center">
                <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No messages yet</p>
              </div>
            ) : (
              <div className="divide-y max-h-[600px] overflow-y-auto">
                {messages.map((msg) => (
                  <div key={msg.id} className="p-3 hover:bg-stone-50">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-xs font-medium text-[#272D34]">
                            {msg.user?.name || 'Unknown User'}
                          </p>
                          <span className="text-xs text-stone-500">
                            {msg.user?.email}
                          </span>
                        </div>
                        
                        <p className="text-sm text-stone-700 mb-2 break-words">
                          {msg.message}
                        </p>
                        
                        <div className="flex items-center gap-3 text-xs text-stone-500">
                          <span>
                            Session: {msg.session?.sport} @ {msg.session?.location}
                          </span>
                          <span>•</span>
                          <span>
                            {new Date(msg.created_at).toLocaleString()}
                          </span>
                        </div>
                      </div>
                      
                      <button
                        onClick={() => deleteMessage(msg.id)}
                        disabled={actionLoading === msg.id}
                        className="p-1.5 text-red-500 hover:bg-red-50 rounded disabled:opacity-50"
                        title="Delete message"
                      >
                        {actionLoading === msg.id ? (
                          <div className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'sessions' && (
          <div className="bg-white rounded shadow">
            <div className="p-3 border-b">
              <h3 className="text-sm font-bold text-[#272D34]">
                Sessions Management ({sessions.length})
              </h3>
              <p className="text-xs text-stone-600 mt-1">Verify location photos to reduce fake sessions</p>
            </div>
            
            {loadingSessions ? (
              <p className="text-center py-6 text-sm text-gray-500">Loading sessions...</p>
            ) : sessions.length === 0 ? (
              <div className="p-6 text-center">
                <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No sessions yet</p>
              </div>
            ) : (
              <div className="divide-y max-h-[600px] overflow-y-auto">
                {sessions.filter(s => s.photos && s.photos.length > 0).map((session) => (
                  <div key={session.id} className="p-3 hover:bg-stone-50">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-medium text-[#272D34]">
                            {session.sport} @ {session.location}
                          </p>
                          {session.photo_verified && (
                            <span className="px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded flex items-center gap-1">
                              ✓ Verified
                            </span>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-3 text-xs text-stone-500 mb-2">
                          <span>{session.creator?.name || 'Unknown Host'}</span>
                          <span>•</span>
                          <span>{new Date(session.date).toLocaleDateString()}</span>
                          <span>•</span>
                          <span>{session.photos?.length || 0} photos</span>
                        </div>

                        {session.photos && session.photos.length > 0 && (
                          <div className="flex gap-2 overflow-x-auto">
                            {session.photos.slice(0, 3).map((photo: string, idx: number) => (
                              <img
                                key={idx}
                                src={photo}
                                alt={`Photo ${idx + 1}`}
                                className="w-16 h-16 object-cover rounded border border-stone-200"
                              />
                            ))}
                          </div>
                        )}
                      </div>
                      
                      <div className="flex flex-col gap-2">
                        {!session.photo_verified ? (
                          <button
                            onClick={() => verifySessionPhotos(session.id)}
                            className="px-3 py-1.5 bg-green-500 text-white text-xs rounded hover:bg-green-600"
                          >
                            ✓ Verify
                          </button>
                        ) : (
                          <button
                            onClick={() => unverifySessionPhotos(session.id)}
                            className="px-3 py-1.5 bg-orange-500 text-white text-xs rounded hover:bg-orange-600"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
    </div>

  );
}
