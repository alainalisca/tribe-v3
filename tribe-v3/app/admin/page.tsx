'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Users, Calendar, MessageSquare, TrendingUp, Search, Ban, Trash2, UserCheck } from 'lucide-react';

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

    try {
      const { error } = await supabase
        .from('users')
        .update({ banned: true })
        .eq('id', userId);

      if (error) throw error;
      alert('User banned successfully');
      await loadUsers();
      await loadStats();
    } catch (error: any) {
      alert('Error: ' + error.message);
    }
  }

  async function unbanUser(userId: string) {
    try {
      const { error } = await supabase
        .from('users')
        .update({ banned: false })
        .eq('id', userId);

      if (error) throw error;
      alert('User unbanned successfully');
      await loadUsers();
    } catch (error: any) {
      alert('Error: ' + error.message);
    }
  }

  async function deleteUser(userId: string) {
    if (!confirm('⚠️ WARNING: This will permanently delete the user and ALL their data. Are you sure?')) return;

    try {
      await supabase.from('chat_messages').delete().eq('user_id', userId);
      await supabase.from('session_participants').delete().eq('user_id', userId);
      await supabase.from('sessions').delete().eq('creator_id', userId);
      
      const { error } = await supabase.from('users').delete().eq('id', userId);

      if (error) throw error;
      alert('User deleted successfully');
      await loadUsers();
      await loadStats();
    } catch (error: any) {
      alert('Error: ' + error.message);
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
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-6">
          <Link
            href="/settings"
            className="inline-flex items-center gap-2 text-stone-600 hover:text-[#272D34] mb-4"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Settings
          </Link>
          <h1 className="text-2xl font-bold text-[#272D34] mb-1">
            Tribe Admin Panel
          </h1>
          <p className="text-sm text-stone-600">
            Logged in as {user?.email}
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-4 mb-6 border-b border-stone-300">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`px-4 py-2 font-medium transition ${
              activeTab === 'dashboard'
                ? 'border-b-2 border-[#C0E863] text-[#272D34]'
                : 'text-stone-600'
            }`}
          >
            Dashboard
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`px-4 py-2 font-medium transition ${
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
          <div className="grid grid-cols-2 gap-4">
            <StatCard
              title="Total Users"
              value={stats.totalUsers}
              icon={<Users className="w-5 h-5" />}
              color="bg-blue-500"
            />
            <StatCard
              title="Active Sessions"
              value={stats.activeSessions}
              icon={<Calendar className="w-5 h-5" />}
              color="bg-green-500"
            />
            <StatCard
              title="Total Messages"
              value={stats.totalMessages}
              icon={<MessageSquare className="w-5 h-5" />}
              color="bg-purple-500"
            />
            <StatCard
              title="New Users Today"
              value={stats.newUsersToday}
              icon={<TrendingUp className="w-5 h-5" />}
              color="bg-orange-500"
            />
          </div>
        )}

        {/* Users Tab */}
        {activeTab === 'users' && (
          <div className="bg-white rounded-lg shadow">
            {/* Search Bar */}
            <div className="p-4 border-b border-stone-200">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Search by name or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C0E863]"
                />
              </div>
            </div>

            {/* Users List */}
            <div className="divide-y divide-stone-200">
              {loadingUsers ? (
                <p className="text-center text-gray-500 py-8">Loading users...</p>
              ) : filteredUsers.length === 0 ? (
                <p className="text-center text-gray-500 py-8">No users found</p>
              ) : (
                filteredUsers.map((u) => (
                  <div key={u.id} className="p-4">
                    {/* User Info */}
                    <div className="flex items-start gap-3 mb-3">
                      {u.avatar_url ? (
                        <img
                          src={u.avatar_url}
                          alt={u.name}
                          className="w-12 h-12 rounded-full flex-shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-[#C0E863] flex items-center justify-center text-[#272D34] font-bold flex-shrink-0">
                          {u.name?.[0]?.toUpperCase() || 'U'}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-[#272D34] truncate">
                          {u.name || 'No name'}
                          {u.banned && (
                            <span className="ml-2 px-2 py-0.5 bg-red-500 text-white text-xs rounded">
                              BANNED
                            </span>
                          )}
                        </h3>
                        <p className="text-sm text-stone-600 truncate">{u.email}</p>
                        <p className="text-xs text-stone-500">
                          Joined: {new Date(u.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-2">
                      {u.banned ? (
                        <button
                          onClick={() => unbanUser(u.id)}
                          className="flex-1 px-3 py-2 bg-green-500 text-white text-sm rounded-lg hover:bg-green-600 transition flex items-center justify-center gap-2"
                        >
                          <UserCheck className="w-4 h-4" />
                          Unban
                        </button>
                      ) : (
                        <button
                          onClick={() => banUser(u.id)}
                          className="flex-1 px-3 py-2 bg-orange-500 text-white text-sm rounded-lg hover:bg-orange-600 transition flex items-center justify-center gap-2"
                        >
                          <Ban className="w-4 h-4" />
                          Ban
                        </button>
                      )}
                      <button
                        onClick={() => deleteUser(u.id)}
                        className="flex-1 px-3 py-2 bg-red-500 text-white text-sm rounded-lg hover:bg-red-600 transition flex items-center justify-center gap-2"
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete
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
    <div className="bg-white rounded-lg p-4 shadow">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-medium text-stone-600">
          {title}
        </h3>
        <div className={`${color} p-2 rounded-lg text-white`}>
          {icon}
        </div>
      </div>
      <p className="text-2xl font-bold text-[#272D34]">
        {value}
      </p>
    </div>
  );
}
