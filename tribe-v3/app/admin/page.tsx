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
      await loadUsers();
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
    await await loadStats();
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
        .from('messages')
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
      console.log('Banning user:', userId);
      const { data, error } = await supabase
        .from('users')
        .update({ banned: true })
        .eq('id', userId)
        .select();

      console.log('Ban result:', { data, error });

      if (error) throw error;
      alert('User banned successfully');
      await loadUsers();
      await loadStats();
    } catch (error: any) {
      console.error('Ban error:', error);
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
      console.log('Deleting user:', userId);
      
      const { error: msgError } = await supabase.from('messages').delete().eq('user_id', userId);
      console.log('Messages deleted:', msgError);
      
      const { error: partError } = await supabase.from('session_participants').delete().eq('user_id', userId);
      console.log('Participants deleted:', partError);
      
      const { error: sessError } = await supabase.from('sessions').delete().eq('creator_id', userId);
      console.log('Sessions deleted:', sessError);
      
      const { error } = await supabase.from('users').delete().eq('id', userId);
      console.log('User deleted:', error);

      if (error) throw error;
      alert('User deleted successfully');
      await loadUsers();
      await loadStats();
    } catch (error: any) {
      console.error('Delete error:', error);
      alert('Error: ' + error.message);
    }
  }

  const filteredUsers = users.filter(u => 
    u.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-stone-50 dark:bg-[#3D4349]">
        <div className="text-lg">Loading admin panel...</div>
      </div>
    );
  }

  if (!authorized) return null;

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-[#3D4349] p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
        <Link
          href="/settings"
          className="inline-flex items-center gap-2 text-stone-600 dark:text-gray-400 hover:text-[#272D34] dark:hover:text-white mb-4"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Settings
        </Link>
          <h1 className="text-3xl font-bold text-[#272D34] dark:text-white mb-2">
            Tribe Admin Panel
          </h1>
          <p className="text-stone-600 dark:text-gray-400">
            Logged in as {user?.email}
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-4 mb-8 border-b border-stone-300 dark:border-gray-700">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`px-4 py-2 font-medium transition ${
              activeTab === 'dashboard'
                ? 'border-b-2 border-[#C0E863] text-[#272D34] dark:text-white'
                : 'text-stone-600 dark:text-gray-400'
            }`}
          >
            Dashboard
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`px-4 py-2 font-medium transition ${
              activeTab === 'users'
                ? 'border-b-2 border-[#C0E863] text-[#272D34] dark:text-white'
                : 'text-stone-600 dark:text-gray-400'
            }`}
          >
            User Management
          </button>
        </div>

        {/* Dashboard Tab */}
        {activeTab === 'dashboard' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard
              title="Total Users"
              value={stats.totalUsers}
              icon={<Users className="w-6 h-6" />}
              color="bg-blue-500"
            />
            <StatCard
              title="Active Sessions"
              value={stats.activeSessions}
              icon={<Calendar className="w-6 h-6" />}
              color="bg-green-500"
            />
            <StatCard
              title="Total Messages"
              value={stats.totalMessages}
              icon={<MessageSquare className="w-6 h-6" />}
              color="bg-purple-500"
            />
            <StatCard
              title="New Users Today"
              value={stats.newUsersToday}
              icon={<TrendingUp className="w-6 h-6" />}
              color="bg-orange-500"
            />
          </div>
        )}

        {/* Users Tab */}
        {activeTab === 'users' && (
          <div className="bg-white dark:bg-[#2C3137] rounded-lg shadow-lg">
            {/* Search Bar */}
            <div className="p-6 border-b border-stone-300 dark:border-gray-700">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Search by name or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-stone-300 dark:border-gray-600 rounded-lg bg-white dark:bg-[#404549] text-[#272D34] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#C0E863]"
                />
              </div>
            </div>

            {/* Users List */}
            <div className="p-6">
              {loadingUsers ? (
                <p className="text-center text-gray-500">Loading users...</p>
              ) : filteredUsers.length === 0 ? (
                <p className="text-center text-gray-500">No users found</p>
              ) : (
                <div className="space-y-4">
                  {filteredUsers.map((u) => (
                    <div
                      key={u.id}
                      className="flex items-center justify-between p-4 border border-stone-300 dark:border-gray-700 rounded-lg hover:bg-stone-50 dark:hover:bg-[#404549] transition"
                    >
                      <div className="flex items-center gap-4">
                        {u.avatar_url ? (
                          <img
                            src={u.avatar_url}
                            alt={u.name}
                            className="w-12 h-12 rounded-full"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-[#C0E863] flex items-center justify-center text-[#272D34] font-bold">
                            {u.name?.[0]?.toUpperCase() || 'U'}
                          </div>
                        )}
                        <div>
                          <h3 className="font-medium text-[#272D34] dark:text-white">
                            {u.name || 'No name'}
                            {u.banned && (
                              <span className="ml-2 px-2 py-1 bg-red-500 text-white text-xs rounded">
                                BANNED
                              </span>
                            )}
                          </h3>
                          <p className="text-sm text-stone-600 dark:text-gray-400">{u.email}</p>
                          <p className="text-xs text-stone-500 dark:text-gray-500">
                            Joined: {new Date(u.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {u.banned ? (
                          <button
                            onClick={() => unbanUser(u.id)}
                            className="px-3 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition flex items-center gap-2"
                          >
                            <UserCheck className="w-4 h-4" />
                            Unban
                          </button>
                        ) : (
                          <button
                            onClick={() => banUser(u.id)}
                            className="px-3 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition flex items-center gap-2"
                          >
                            <Ban className="w-4 h-4" />
                            Ban
                          </button>
                        )}
                        <button
                          onClick={() => deleteUser(u.id)}
                          className="px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition flex items-center gap-2"
                        >
                          <Trash2 className="w-4 h-4" />
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
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
    <div className="bg-white dark:bg-[#2C3137] rounded-lg p-6 shadow-lg">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-stone-600 dark:text-gray-400">
          {title}
        </h3>
        <div className={`${color} p-3 rounded-lg text-white`}>
          {icon}
        </div>
      </div>
      <p className="text-3xl font-bold text-[#272D34] dark:text-white">
        {value}
      </p>
    </div>
  );
}
