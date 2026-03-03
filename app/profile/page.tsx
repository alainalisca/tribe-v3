'use client';
import { logError } from '@/lib/logger';
import { showSuccess, showError } from '@/lib/toast';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Camera, MapPin, X, Settings } from 'lucide-react';
import BottomNav from '@/components/BottomNav';
import { useLanguage } from '@/lib/LanguageContext';
import { sportTranslations } from '@/lib/translations';

export default function ProfilePage() {
  const router = useRouter();
  const supabase = createClient();
  const { t, language } = useLanguage();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [stats, setStats] = useState({
    sessionsCreated: 0,
    sessionsJoined: 0,
    totalSessions: 0,
  });
  const [loading, setLoading] = useState(true);
  const [showAllSports, setShowAllSports] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  useEffect(() => {
    loadProfile();
  }, []);

  // Lock body scroll and handle back button when lightbox is open
  useEffect(() => {
    function handlePopState() {
      if (selectedPhoto) {
        setSelectedPhoto(null);
      }
    }

    if (selectedPhoto) {
      const scrollY = window.scrollY;
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
      document.body.style.top = `-${scrollY}px`;
      window.addEventListener('popstate', handlePopState);
    }

    return () => {
      window.removeEventListener('popstate', handlePopState);
      if (selectedPhoto) {
        const scrollY = document.body.style.top;
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.width = '';
        document.body.style.top = '';
        window.scrollTo(0, parseInt(scrollY || '0') * -1);
      }
    };
  }, [selectedPhoto]);

  async function loadProfile() {
    try {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (!authUser) {
        router.push('/auth');
        return;
      }
      setUser(authUser);

      const { data: profileData } = await supabase.from('users').select('*').eq('id', authUser.id).single();

      setProfile(profileData);

      const { count: created } = await supabase
        .from('sessions')
        .select('*', { count: 'exact', head: true })
        .eq('creator_id', authUser.id)
        .eq('status', 'active');

      const { count: joined } = await supabase
        .from('session_participants')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', authUser.id);

      setStats({
        sessionsCreated: created || 0,
        sessionsJoined: joined || 0,
        totalSessions: (created || 0) + (joined || 0),
      });
    } catch (error) {
      logError(error, { action: 'loadProfile' });
    } finally {
      setLoading(false);
    }
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}-${Date.now()}.${fileExt}`;
      const filePath = `avatars/${fileName}`;

      const { error: uploadError } = await supabase.storage.from('profile-images').upload(filePath, file);

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from('profile-images').getPublicUrl(filePath);

      const { error: updateError } = await supabase.from('users').update({ avatar_url: publicUrl }).eq('id', user.id);

      if (updateError) throw updateError;

      await loadProfile();
    } catch (error) {
      logError(error, { action: 'handleAvatarUpload' });
      showError('Failed to upload image');
    }
  }

  async function handleBannerUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `banner-${user.id}-${Date.now()}.${fileExt}`;
      const filePath = `banners/${fileName}`;

      const { error: uploadError } = await supabase.storage.from('profile-images').upload(filePath, file);

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from('profile-images').getPublicUrl(filePath);

      const { error: updateError } = await supabase.from('users').update({ banner_url: publicUrl }).eq('id', user.id);

      if (updateError) throw updateError;

      await loadProfile();
    } catch (error) {
      logError(error, { action: 'handleBannerUpload' });
      showError('Failed to upload banner');
    }
  }

  if (loading) {
    return <div className="min-h-screen bg-theme-page flex items-center justify-center"></div>;
  }

  const getInitials = (name: string) => {
    return (
      name
        ?.split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2) || 'U'
    );
  };

  const sports = profile?.sports || [];
  const photos = profile?.photos || [];
  const displayedSports = showAllSports ? sports : sports.slice(0, 6);

  return (
    <div className="min-h-screen bg-theme-page pb-32">
      {/* Header */}
      <div className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-theme-card border-b border-theme">
        <div className="max-w-2xl mx-auto h-14 flex items-center justify-between px-4">
          <Link href="/">
            <h1 className="text-xl font-bold text-theme-primary cursor-pointer">
              Tribe<span className="text-tribe-green">.</span>
            </h1>
          </Link>
          <Link href="/settings">
            <button className="p-2 hover:bg-stone-200 rounded-lg transition">
              <Settings className="w-6 h-6 text-theme-primary" />
            </button>
          </Link>
        </div>
      </div>

      <div className="pt-header max-w-2xl mx-auto">
        {/* Banner */}
        <div className="relative h-48 overflow-hidden">
          <div className="w-full h-full bg-gradient-to-br from-tribe-green to-lime-500">
            {profile?.banner_url && (
              <img loading="lazy" src={profile.banner_url} alt="Banner" className="w-full h-full object-cover" />
            )}
          </div>
          <div className="absolute bottom-4 right-4 z-30">
            <label className="block bg-white p-3 rounded-full cursor-pointer hover:bg-opacity-90 transition shadow-xl border-2 border-white">
              <Camera className="w-5 h-5 text-slate-900" />
              <input type="file" accept="image/*" className="hidden" onChange={handleBannerUpload} />
            </label>
          </div>
        </div>

        {/* Profile Section */}
        <div className="px-4 -mt-16 relative z-10">
          {/* Avatar */}
          <div className="relative inline-block">
            <div className="w-32 h-32 rounded-full border-4 border-white bg-tribe-green flex items-center justify-center overflow-hidden shadow-lg">
              {profile?.avatar_url ? (
                <img
                  loading="lazy"
                  src={profile.avatar_url}
                  alt={profile.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-5xl font-bold text-slate-900">{getInitials(profile?.name || 'User')}</span>
              )}
            </div>
            <label className="absolute bottom-0 right-0 bg-slate-900 p-2.5 rounded-full cursor-pointer hover:bg-slate-800 transition shadow-lg">
              <Camera className="w-5 h-5 text-white" />
              <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
            </label>
          </div>

          {/* Name & Info */}
          <div className="mt-4">
            <h2 className="text-2xl font-bold text-theme-primary">{profile?.name || 'User'}</h2>
            <div className="flex items-center gap-3 mt-2">
              {profile?.username && <span className="text-sm text-theme-secondary">@{profile.username}</span>}
              {profile?.location && (
                <div className="flex items-center gap-1">
                  <MapPin className="w-4 h-4 text-tribe-green" />
                  <span className="text-sm text-theme-secondary">{profile.location}</span>
                </div>
              )}
            </div>
          </div>

          {/* Profile Completeness */}
          {(() => {
            const fields = [
              !!profile?.name,
              !!profile?.avatar_url,
              !!profile?.bio,
              (profile?.sports?.length || 0) > 0,
              (profile?.photos?.length || 0) > 0,
              !!profile?.location,
            ];
            const filled = fields.filter(Boolean).length;
            const pct = Math.round((filled / fields.length) * 100);
            if (pct >= 100) return null;
            return (
              <div className="mt-6 bg-white dark:bg-[#3D4349] rounded-2xl p-4 border border-stone-200 dark:border-[#52575D]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-theme-primary">
                    {language === 'es' ? `Perfil: ${pct}% completo` : `Profile: ${pct}% complete`}
                  </span>
                </div>
                <div className="w-full h-1.5 bg-stone-200 dark:bg-[#52575D] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-tribe-green rounded-full transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })()}

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mt-6">
            <div className="bg-white dark:bg-[#3D4349] rounded-2xl p-4 text-center border border-stone-200 dark:border-[#52575D]">
              <p className="text-4xl font-bold text-theme-primary">{stats.sessionsCreated}</p>
              <p className="text-sm text-theme-secondary mt-1">{language === 'es' ? 'Creadas' : 'Created'}</p>
            </div>
            <div className="bg-white dark:bg-[#3D4349] rounded-2xl p-4 text-center border border-stone-200 dark:border-[#52575D]">
              <p className="text-4xl font-bold text-theme-primary">{stats.sessionsJoined}</p>
              <p className="text-sm text-theme-secondary mt-1">{language === 'es' ? 'Unidas' : 'Joined'}</p>
            </div>
            <div className="bg-white dark:bg-[#3D4349] rounded-2xl p-4 text-center border border-stone-200 dark:border-[#52575D]">
              <p className="text-4xl font-bold text-theme-primary">{stats.totalSessions}</p>
              <p className="text-sm text-theme-secondary mt-1">{language === 'es' ? 'Total' : 'Total'}</p>
            </div>
          </div>

          {/* Bio */}
          <div className="mt-6">
            {profile?.bio ? (
              <div className="bg-white rounded-2xl p-5 border border-stone-200">
                <p className="text-theme-primary whitespace-pre-wrap leading-relaxed">{profile.bio}</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl p-5 border border-stone-200 text-center">
                <p className="text-theme-secondary text-sm italic">
                  {language === 'es'
                    ? 'Sin bio aún. Haz clic en Editar Perfil para agregar una.'
                    : 'No bio yet. Click Edit Profile to add one.'}
                </p>
              </div>
            )}
          </div>

          {/* Social Media Links */}
          {(profile?.instagram_username || profile?.facebook_url) && (
            <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
              <h3 className="text-sm font-bold text-theme-primary mb-3 flex items-center gap-2">
                🔗 {language === 'es' ? 'Redes Sociales Verificadas' : 'Verified Social Media'}
              </h3>
              <div className="space-y-2">
                {profile?.instagram_username && (
                  <a
                    href={`https://instagram.com/${profile.instagram_username}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 hover:underline"
                  >
                    📷 @{profile.instagram_username}
                  </a>
                )}
                {profile?.facebook_url && (
                  <a
                    href={profile.facebook_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 hover:underline"
                  >
                    📘 Facebook Profile
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Photo Gallery */}
          {photos.length > 0 && (
            <div className="mt-6">
              <h3 className="text-lg font-bold text-theme-primary mb-3">{language === 'es' ? 'Fotos' : 'Photos'}</h3>
              <div className="grid grid-cols-3 gap-2">
                {photos.map((photo: string, index: number) => (
                  <div
                    key={index}
                    onClick={() => {
                      setSelectedPhoto(photo);
                      history.pushState({ lightbox: true }, '');
                    }}
                    className="aspect-square rounded-lg overflow-hidden cursor-pointer hover:opacity-90 transition"
                  >
                    <img src={photo} alt={`Photo ${index + 1}`} className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sports */}
          {sports.length > 0 && (
            <div className="mt-6">
              <div className="flex flex-wrap gap-2">
                {displayedSports.map((sport: string, index: number) => (
                  <span
                    key={index}
                    className="px-5 py-2.5 bg-tribe-green text-slate-900 rounded-full text-sm font-medium"
                  >
                    {language === 'es' ? sportTranslations[sport]?.es || sport : sport}
                  </span>
                ))}
              </div>
              {sports.length > 6 && (
                <button
                  onClick={() => setShowAllSports(!showAllSports)}
                  className="mt-3 text-sm text-tribe-green font-medium hover:underline"
                >
                  {showAllSports
                    ? language === 'es'
                      ? 'Mostrar Menos'
                      : 'Show Less'
                    : language === 'es'
                      ? `Mostrar ${sports.length - 6} Más`
                      : `Show ${sports.length - 6} More`}
                </button>
              )}
            </div>
          )}

          {/* Edit Profile Button */}
          <button
            onClick={() => router.push('/profile/edit')}
            className="w-full mt-8 py-4 bg-tribe-green text-slate-900 font-bold rounded-2xl hover:opacity-90 transition text-lg"
          >
            {language === 'es' ? 'Editar Perfil' : 'Edit Profile'}
          </button>
        </div>
      </div>

      {/* Full-Screen Photo Modal */}
      {selectedPhoto && (
        <div
          className="fixed inset-0 bg-black z-[60] flex items-center justify-center p-4 overflow-hidden"
          onClick={() => history.back()}
        >
          <button
            className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full transition z-10"
            onClick={() => history.back()}
          >
            <X className="w-6 h-6 text-white" />
          </button>
          <img
            src={selectedPhoto}
            alt="Full size"
            className="max-w-[90vw] max-h-[90vh] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      <BottomNav />
    </div>
  );
}
