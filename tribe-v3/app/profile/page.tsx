'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import BottomNav from '@/components/BottomNav';
import { User, Calendar, Users, LogOut, Globe } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';

export default function ProfilePage() {
  const router = useRouter();
  const supabase = createClient();
  const { language, setLanguage, t } = useLanguage();
  const [user, setUser] = useState<any>(null);
  const [stats, setStats] = useState({ hosted: 0, joined: 0, total: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkUser();
  }, []);

  useEffect(() => {
    if (user) {
      loadStats();
    }
  }, [user]);

  async function checkUser() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/auth');
    } else {
      const { data: userData } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();
      
      setUser(userData || { id: user.id, email: user.email });
    }
  }

  async function loadStats() {
    try {
      const { data: hostedSessions } = await supabase
        .from('sessions')
        .select('id')
        .eq('creator_id', user.id)
        .eq('status', 'active');

      const { data: joinedSessions } = await supabase
        .from('session_participants')
        .select('id')
        .eq('user_id', user.id)
        .eq('status', 'confirmed');

      const hosted = hostedSessions?.length || 0;
      const joined = joinedSessions?.length || 0;

      setStats({
        hosted,
        joined,
        total: hosted + joined,
      });
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/auth');
  }

  const getColorFromName = (name: string) => {
    const colors = ['bg-red-500', 'bg-blue-500', 'bg-green-500', 'bg-yellow-500', 'bg-purple-500', 'bg-pink-500'];
    const index = name?.charCodeAt(0) % colors.length || 0;
    return colors[index];
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-tribe-darker flex items-center justify-center">
        <p className="text-white">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20 bg-tribe-darker">
      <div className="bg-tribe-dark p-4 border-b border-slate-700">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-2xl font-bold text-white">{t('profile')}</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-4">
        {/* Profile Card */}
        <div className="bg-tribe-dark rounded-xl p-6 border border-slate-700">
          <div className="flex items-center mb-4">
            <div className={`w-16 h-16 rounded-full ${getColorFromName(user.name || user.email)} flex items-center justify-center`}>
              {user.avatar_url ? (
                <img src={user.avatar_url} alt="Profile" className="w-full h-full rounded-full object-cover" />
              ) : (
                <User className="w-8 h-8 text-white" />
              )}
            </div>
            <div className="ml-4">
              <h2 className="text-xl font-bold text-white">{user.name || 'User'}</h2>
              <p className="text-gray-400 text-sm">{user.email}</p>
              {user.location && (
                <p className="text-gray-500 text-sm">{user.location}</p>
              )}
            </div>
          </div>
          {user.bio && (
            <p className="text-gray-300 text-sm">{user.bio}</p>
          )}
        </div>

        {/* Stats Card */}
        <div className="bg-tribe-dark rounded-xl p-6 border border-slate-700">
          <h3 className="text-white font-semibold mb-4">{t('stats')}</h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="flex items-center justify-center mb-2">
                <Calendar className="w-5 h-5 text-tribe-green" />
              </div>
              <p className="text-2xl font-bold text-white">{stats.hosted}</p>
              <p className="text-sm text-gray-400">{t('hosted')}</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center mb-2">
                <Users className="w-5 h-5 text-tribe-green" />
              </div>
              <p className="text-2xl font-bold text-white">{stats.joined}</p>
              <p className="text-sm text-gray-400">{t('joinedTab')}</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center mb-2">
                <Calendar className="w-5 h-5 text-tribe-green" />
              </div>
              <p className="text-2xl font-bold text-white">{stats.total}</p>
              <p className="text-sm text-gray-400">{t('totalSessions')}</p>
            </div>
          </div>
        </div>

        {/* Settings Card */}
        <div className="bg-tribe-dark rounded-xl border border-slate-700">
          <div className="p-4 border-b border-slate-700">
            <h3 className="text-white font-semibold">{t('settings')}</h3>
          </div>
          
          {/* Language Toggle */}
          <div className="p-4 border-b border-slate-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <Globe className="w-5 h-5 text-tribe-green mr-3" />
                <span className="text-white">{t('language')}</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setLanguage('en')}
                  className={`px-4 py-2 rounded-lg font-medium transition ${
                    language === 'en'
                      ? 'bg-tribe-green text-slate-900'
                      : 'bg-tribe-darker text-gray-400 hover:text-white'
                  }`}
                >
                  {t('english')}
                </button>
                <button
                  onClick={() => setLanguage('es')}
                  className={`px-4 py-2 rounded-lg font-medium transition ${
                    language === 'es'
                      ? 'bg-tribe-green text-slate-900'
                      : 'bg-tribe-darker text-gray-400 hover:text-white'
                  }`}
                >
                  {t('spanish')}
                </button>
              </div>
            </div>
          </div>

          {/* Logout */}
          <button
            onClick={handleLogout}
            className="w-full p-4 flex items-center text-red-400 hover:bg-slate-700 transition rounded-b-xl"
          >
            <LogOut className="w-5 h-5 mr-3" />
            <span>{t('logout')}</span>
          </button>
        </div>
      </div>

      <BottomNav activeTab="profile" />
    </div>
  );
}
