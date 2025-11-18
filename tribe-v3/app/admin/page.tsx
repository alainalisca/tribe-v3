'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Users, Calendar, MessageSquare, TrendingUp, Search, Ban, Trash2, UserCheck, Shield, Flag, AlertTriangle } from 'lucide-react';

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
  });
  const [users, setUsers] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingReports, setLoadingReports] = useState(false);
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

      setStats({
        totalUsers: userCount || 0,
        activeSessions: sessionCount || 0,
        totalMessages: messageCount || 0,
        newUsersToday: newUsers || 0,
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
      
      alert('✅ User banned');
    } catch (error: any) {
      alert('❌ Error: ' + error.message);
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
      
      alert('✅ User unbanned');
    } catch (error: any) {
      alert('❌ Error: ' + error.message);
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
      
      alert('✅ User deleted');
    } catch (error: any) {
      alert('❌ Error: ' + error.message);
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
      alert('❌ Error: ' + error.message);
    }
  }

  const filteredUsers = users.filter(u => 
    u.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const pendingReports = reports.filter(r => r.status === 'pending');
  const resolvedReports = reports.filter(r => r.status !== 'pending');

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-stone-50">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (!authorized) return null;

  return (
    <div className="min-h-screen bg-stone-50 pb-20">
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

                {resolvedReports.length > 0 && (
                  <>
                    <h3 className="text-sm font-bold text-[#272D34] mt-4">
                      Resolved ({resolvedReports.length})
                    </h3>
                    {resolvedReports.slice(0, 5).map((report) => (
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
      </div>
    </div>
  );
}
