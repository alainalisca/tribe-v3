'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, MapPin } from 'lucide-react';
import Link from 'next/link';
import BottomNav from '@/components/BottomNav';

export default function PublicProfilePage() {
  const router = useRouter();
  const params = useParams();
  const userId = params.userId as string;
  const supabase = createClient();
  
  const [profile, setProfile] = useState<any>(null);
  const [stats, setStats] = useState({
    sessionsCreated: 0,
    sessionsJoined: 0,
    totalSessions: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProfile();
  }, [userId]);

  async function loadProfile() {
    try {
      const { data: profileData } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      setProfile(profileData);

      const { count: created } = await supabase
        .from('sessions')
        .select('*', { count: 'exact', head: true })
        .eq('creator_id', userId)
        .eq('status', 'active');

      const { count: joined } = await supabase
        .from('session_participants')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

      setStats({
        sessionsCreated: created || 0,
        sessionsJoined: joined || 0,
        totalSessions: (created || 0) + (joined || 0),
      });
    } catch (error) {
      console.error('Error loading profile:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-theme-page flex items-center justify-center">
        <p className="text-theme-primary">Loading...</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-theme-page flex items-center justify-center">
        <p className="text-theme-primary">User not found</p>
      </div>
    );
  }

  const getInitials = (name: string) => {
    return name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U';
  };

  const sports = profile?.sports || [];

  return (
    <div className="min-h-screen bg-theme-page pb-20">
      {/* Header */}
      <div className="bg-theme-card p-4 border-b border-theme">
        <div className="max-w-2xl mx-auto flex items-center">
          <button onClick={() => router.back()} className="p-2 hover:bg-stone-200 rounded-lg transition mr-3">
            <ArrowLeft className="w-6 h-6 text-theme-primary" />
          </button>
          <h1 className="text-xl font-bold text-theme-primary">{profile.name}'s Profile</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto">
        {/* Banner */}
        <div className="relative h-48 bg-gradient-to-br from-tribe-green to-lime-500">
          {profile?.banner_url && (
            <img 
              src={profile.banner_url} 
              alt="Banner" 
              className="w-full h-full object-cover"
            />
          )}
        </div>

        {/* Profile Section */}
        <div className="px-4 -mt-16 relative z-10">
          {/* Avatar */}
          <div className="w-32 h-32 rounded-full border-4 border-white bg-tribe-green flex items-center justify-center overflow-hidden shadow-lg">
            {profile?.avatar_url ? (
              <img 
                src={profile.avatar_url} 
                alt={profile.name} 
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-5xl font-bold text-slate-900">
                {getInitials(profile?.name || 'User')}
              </span>
            )}
          </div>

          {/* Name & Info */}
          <div className="mt-4">
            <h2 className="text-2xl font-bold text-theme-primary">{profile?.name}</h2>
            <div className="flex items-center gap-3 mt-2">
              {profile?.username && (
                <span className="text-sm text-theme-secondary">@{profile.username}</span>
              )}
              {profile?.location && (
                <div className="flex items-center gap-1">
                  <MapPin className="w-4 h-4 text-tribe-green" />
                  <span className="text-sm text-theme-secondary">{profile.location}</span>
                </div>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mt-6">
            <div className="bg-white rounded-2xl p-4 text-center border border-stone-200">
              <p className="text-4xl font-bold text-theme-primary">{stats.sessionsCreated}</p>
              <p className="text-sm text-theme-secondary mt-1">Created</p>
            </div>
            <div className="bg-white rounded-2xl p-4 text-center border border-stone-200">
              <p className="text-4xl font-bold text-theme-primary">{stats.sessionsJoined}</p>
              <p className="text-sm text-theme-secondary mt-1">Joined</p>
            </div>
            <div className="bg-white rounded-2xl p-4 text-center border border-stone-200">
              <p className="text-4xl font-bold text-theme-primary">{stats.totalSessions}</p>
              <p className="text-sm text-theme-secondary mt-1">Total</p>
            </div>
          </div>

          {/* Bio */}
          {profile?.bio && (
            <div className="mt-6 bg-white rounded-2xl p-5 border border-stone-200">
              <p className="text-theme-primary whitespace-pre-wrap leading-relaxed">{profile.bio}</p>
            </div>
          )}

          {/* Photo Gallery */}
          {profile?.photos && profile.photos.length > 0 && (
            <div className="mt-6">
              <h3 className="text-lg font-semibold text-theme-primary mb-3">Photos</h3>
              <div className="grid grid-cols-3 gap-2">
                {profile.photos.map((photo: string, index: number) => (
                  <div key={index} className="aspect-square rounded-lg overflow-hidden bg-stone-200">
                    <img 
                      src={photo} 
                      alt={`Photo ${index + 1}`} 
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sports */}
          {sports.length > 0 && (
            <div className="mt-6">
              <div className="flex flex-wrap gap-2">
                {sports.map((sport: string, index: number) => (
                  <span 
                    key={index}
                    className="px-5 py-2.5 bg-tribe-green text-slate-900 rounded-full text-sm font-medium"
                  >
                    {sport}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
