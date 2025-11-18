'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Users, Calendar, MessageSquare, TrendingUp, Search, Ban, Trash2, UserCheck, Shield } from 'lucide-react';

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
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const ADMIN_EMAIL = 'alainalisca@aplusfitnessllc.com';

  useEffect(() => {
    checkAdmin();
  }, []);

  useEffect(() => {
    if (activeTab === 'users') {
      loadUsers();
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

  async function banUser(userId: string) {
    if (!confirm('Are you sure you want to ban this user?')) return;

    setActionLoading(userId);
    try {
      const { data, error } = await supabase
        .from('users')
        .update({ banned: true })
        .eq('id', userId)
        .select();

      if (error) throw error;
      
      setUsers(prev => prev.map(u => 
        u.id === userId ? { ...u, banned: true } : u
      ));
      
      alert('✅ User banned successfully');
      await loadStats();
    } catch (error: any) {
      alert('❌ Error: ' + error.message);
    } finally {
      setActionLoading(null);
    }
  }

  async function unbanUser(userId: string) {
    if (!confirm('Are you sure you want to unban this user?')) return;

    setActionLoading(userId);
    try {
      const { data, error } = await supabase
        .from('users')
        .update({ banned: false })
        .eq('id', userId)
        .select();

      if (error) throw error;
      
      setUsers(prev => prev.map(u => 
        u.id === userId ? { ...u, banned: false } : u
      ));
      
      alert('✅ User unbanned successfully');
      await loadStats();
    } catch (error: any) {
      alert('❌ Error: ' + error.message);
    } finally {
      setActionLoading(null);
    }
  }

  async function deleteUser(userId: string) {
    if (!confirm('⚠️ WARNING: This will permanently delete the user and ALL their data. Are you sure?')) return;
    if (!confirm('⚠️ FINAL WARNING: This action CANNOT be undone. Delete user?')) return;

    setActionLoading(userId);
    try {
      await supabase.from('chat_messages').delete().eq('user_id', userId);
      await supabase.from('session_participants').delete().eq('user_id', userId);
      await supabase.from('sessions').delete().eq('creator_id', userId);
      
      const { error } = await supabase.from('users').delete().eq('id', userId);

      if (error) throw error;
      
      setUsers(prev => prev.filter(u => u.id !== userId));
      
      alert('✅ User deleted successfully');
      await loadStats();
    } catch (error: any) {
      alert('❌ Error: ' + error.message);
    } finally {
      setActionLoading(null);
    }
  }

  const filteredUsers = users.filter(u => 
    u.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-stone-50">
        <div className="text-lg">Loading admin panel...</div>
      </div>
    );
  }

  if (!authorized) return null;

  return (
    <div className="min-h-screen bg-stone-50 pb-20">
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-6">
          <Link
            href="/settings"
            className="inline-flex items-center gap-2 text-stone-600 hover:text-[#272D34] mb-4 text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Settings
          </Link>
          <h1 className="text-xl font-bold text-[#272D34] mb-1">
            Tribe Admin Panel
          </h1>
          <p className="text-xs text-stone-600 break-all">
            {user?.email}
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-4 mb-6 border-b border-stone-300">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`px-3 py-2 text-sm font-medium transition ${
              activeTab === 'dashboard'
                ? 'border-b-2 border-[#C0E863] text-[#272D34]'
                : 'text-stone-600'
            }`}
          >
            Dashboard
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`px-3 py-2 text-sm font-medium transition ${
              activeTab === 'users'
                ? 'border-b-2 border-[#C0E863] text-[#272D34]'
                : 'text-stone-600'
            }`}
          >
            User Management
          </button>
        </div>

        {/* Dashboard Tab */}
        {activeTab === 'dashboard' && (
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              title="Total Users"
              value={stats.totalUsers}
              icon={<Users className="w-4 h-4" />}
              color="bg-blue-500"
            />
            <StatCard
              title="Active Sessions"
              value={stats.activeSessions}
              icon={<Calendar className="w-4 h-4" />}
              color="bg-green-500"
            />
            <StatCard
              title="Total Messages"
              value={stats.totalMessages}
              icon={<MessageSquare className="w-4 h-4" />}
              color="bg-purple-500"
            />
            <StatCard
              title="New Users Today"
              value={stats.newUsersToday}
              icon={<TrendingUp className="w-4 h-4" />}
              color="bg-orange-500"
            />
          </div>
        )}

        {/* Users Tab */}
        {activeTab === 'users' && (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            {/* Search Bar */}
            <div className="p-3 border-b border-stone-200">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search by name or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C0E863]"
                />
              </div>
            </div>

            {/* Users List */}
            <div>
              {loadingUsers ? (
                <p className="text-center text-gray-500 py-8 text-sm">Loading users...</p>
              ) : filteredUsers.length === 0 ? (
                <p className="text-center text-gray-500 py-8 text-sm">No users found</p>
              ) : (
                filteredUsers.map((u) => (
                  <div 
                    key={u.id} 
                    className={`p-3 border-b border-stone-200 last:border-b-0 ${
                      u.banned ? 'bg-red-50' : 'bg-white'
                    }`}
                  >
                    {/* User Info */}
                    <div className="flex items-center gap-2 mb-2">
                      {u.avatar_url ? (
                        <img
                          src={u.avatar_url}
                          alt={u.name}
                          className="w-10 h-10 rounded-full flex-shrink-0 object-cover"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-[#C0E863] flex items-center justify-center text-[#272D34] font-bold flex-shrink-0 text-sm">
                          {u.name?.[0]?.toUpperCase() || 'U'}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <h3 className="font-medium text-[#272D34] text-sm truncate">
                            {u.name || 'No name'}
                          </h3>
                          {u.banned && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-red-500 text-white text-xs rounded flex-shrink-0">
                              <Shield className="w-2.5 h-2.5" />
                              BANNED
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-stone-600 truncate">{u.email}</p>
                        <p className="text-xs text-stone-500">
                          Joined: {new Date(u.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="grid grid-cols-2 gap-2">
                      {u.banned ? (
                        <button
                          onClick={() => unbanUser(u.id)}
                          disabled={actionLoading === u.id}
                          className="w-full px-2 py-1.5 bg-green-500 text-white text-xs font-medium rounded hover:bg-green-600 transition flex items-center justify-center gap-1 disabled:opacity-50"
                        >
                          <UserCheck className="w-3 h-3" />
                          {actionLoading === u.id ? 'Unbanning...' : 'Unban'}
                        </button>
                      ) : (
                        <button
                          onClick={() => banUser(u.id)}
                          disabled={actionLoading === u.id}
                          className="w-full px-2 py-1.5 bg-orange-500 text-white text-xs font-medium rounded hover:bg-orange-600 transition flex items-center justify-center gap-1 disabled:opacity-50"
                        >
                          <Ban className="w-3 h-3" />
                          {actionLoading === u.id ? 'Banning...' : 'Ban'}
                        </button>
                      )}
                      <button
                        onClick={() => deleteUser(u.id)}
                        disabled={actionLoading === u.id}
                        className="w-full px-2 py-1.5 bg-red-500 text-white text-xs font-medium rounded hover:bg-red-600 transition flex items-center justify-center gap-1 disabled:opacity-50"
                      >
                        <Trash2 className="w-3 h-3" />
                        {actionLoading === u.id ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ title, value, icon, color }: any) {
  return (
    <div className="bg-white rounded-lg p-3 shadow">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-xs font-medium text-stone-600">
          {title}
        </h3>
        <div className={`${color} p-1.5 rounded text-white`}>
          {icon}
        </div>
      </div>
      <p className="text-xl font-bold text-[#272D34]">
        {value}
      </p>
    </div>
  );
}
