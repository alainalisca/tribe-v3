/** Page: /profile — Current user's profile with stats, reviews, and settings */
'use client';

import Link from 'next/link';
import { Camera, MapPin, X, Settings } from 'lucide-react';
import BottomNav from '@/components/BottomNav';
import LoadingSpinner from '@/components/LoadingSpinner';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/lib/LanguageContext';
import { sportTranslations } from '@/lib/translations';
import { useProfile } from './useProfile';

export default function ProfilePage() {
  const { language, t } = useLanguage();
  const {
    txt,
    profile,
    stats,
    loading,
    showAllSports,
    setShowAllSports,
    selectedPhoto,
    handleAvatarUpload,
    handleBannerUpload,
    openPhoto,
    getInitials,
    sports,
    photos,
    displayedSports,
    getProfileCompleteness,
    router,
  } = useProfile(language);

  if (loading) {
    return (
      <div className="min-h-screen bg-theme-page">
        <LoadingSpinner className="flex items-center justify-center min-h-screen" />
      </div>
    );
  }

  const pct = getProfileCompleteness();

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
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={handleBannerUpload}
              />
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
                  alt={profile.name ?? undefined}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-5xl font-bold text-slate-900">{getInitials(profile?.name || 'User')}</span>
              )}
            </div>
            <label className="absolute bottom-0 right-0 bg-slate-900 p-2.5 rounded-full cursor-pointer hover:bg-slate-800 transition shadow-lg">
              <Camera className="w-5 h-5 text-white" />
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={handleAvatarUpload}
              />
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
          {pct !== null && (
            <div className="mt-6 bg-white dark:bg-[#3D4349] rounded-2xl p-4 border border-stone-200 dark:border-[#52575D]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-theme-primary">{txt.profileComplete(pct)}</span>
              </div>
              <div className="w-full h-1.5 bg-stone-200 dark:bg-[#52575D] rounded-full overflow-hidden">
                <div
                  className="h-full bg-tribe-green rounded-full transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mt-6">
            <div className="bg-white dark:bg-[#3D4349] rounded-2xl p-4 text-center border border-stone-200 dark:border-[#52575D]">
              <p className="text-4xl font-bold text-theme-primary">{stats.sessionsCreated}</p>
              <p className="text-sm text-theme-secondary mt-1">{txt.created}</p>
            </div>
            <div className="bg-white dark:bg-[#3D4349] rounded-2xl p-4 text-center border border-stone-200 dark:border-[#52575D]">
              <p className="text-4xl font-bold text-theme-primary">{stats.sessionsJoined}</p>
              <p className="text-sm text-theme-secondary mt-1">{txt.joined}</p>
            </div>
            <div className="bg-white dark:bg-[#3D4349] rounded-2xl p-4 text-center border border-stone-200 dark:border-[#52575D]">
              <p className="text-4xl font-bold text-theme-primary">{stats.totalSessions}</p>
              <p className="text-sm text-theme-secondary mt-1">{txt.total}</p>
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
                <p className="text-theme-secondary text-sm italic">{txt.noBio}</p>
              </div>
            )}
          </div>

          {/* Social Media Links */}
          {(profile?.instagram_username || profile?.facebook_url) && (
            <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
              <h3 className="text-sm font-bold text-theme-primary mb-3 flex items-center gap-2">
                🔗 {txt.verifiedSocial}
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
                    📘 {t('facebookProfile')}
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Photo Gallery */}
          {photos.length > 0 && (
            <div className="mt-6">
              <h3 className="text-lg font-bold text-theme-primary mb-3">{txt.photos}</h3>
              <div className="grid grid-cols-3 gap-2">
                {photos.map((photo: string, index: number) => (
                  <div
                    key={index}
                    onClick={() => openPhoto(photo)}
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
                  {showAllSports ? txt.showLess : txt.showMore(sports.length - 6)}
                </button>
              )}
            </div>
          )}

          {/* Edit Profile Button */}
          <Button
            onClick={() => router.push('/profile/edit')}
            className="w-full mt-8 py-4 font-bold rounded-2xl text-lg"
          >
            {txt.editProfile}
          </Button>
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
