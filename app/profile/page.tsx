/** Page: /profile — Current user's profile with stats, reviews, and settings */
'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Camera, MapPin, X, Settings, Store, HeartHandshake, BarChart3 } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import BottomNav from '@/components/BottomNav';
import LoadingSpinner from '@/components/LoadingSpinner';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/lib/LanguageContext';
import { sportTranslations } from '@/lib/translations';
import { useProfile } from './useProfile';
import AchievementBadges from '@/components/AchievementBadges';
import TribeOSEntryCard from '@/components/tribe-os/TribeOSEntryCard';
import MyCoachEntryCard from '@/components/tribe-os/MyCoachEntryCard';

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
    debugInfo,
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
      {/* TEMPORARY: profile-blank diagnostic — surfaces what fetchUserProfile
          returned on the client. Remove once root-caused. */}
      {debugInfo && (
        <div className="fixed top-16 left-0 right-0 z-50 mx-2 mt-2 p-2 bg-red-50 dark:bg-red-900/40 border border-red-300 dark:border-red-700 rounded text-[10px] text-red-800 dark:text-red-200 break-words">
          DEBUG: {debugInfo}
        </div>
      )}
      {/* Header */}
      <div className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-theme-card border-b border-theme">
        <div className="max-w-2xl md:max-w-4xl mx-auto h-14 flex items-center justify-between px-4">
          <Link href="/">
            <h1 className="text-xl font-bold text-theme-primary cursor-pointer">
              Tribe
              <span
                aria-hidden="true"
                className="inline-block w-[0.35em] h-[0.35em] rounded-full bg-tribe-green ml-[0.1em] align-middle"
              />
            </h1>
          </Link>
          <Link href="/settings">
            <button className="p-2 hover:bg-stone-200 rounded-lg transition">
              <Settings className="w-6 h-6 text-theme-primary" />
            </button>
          </Link>
        </div>
      </div>

      <div className="pt-header max-w-2xl md:max-w-4xl mx-auto">
        {/* Banner. Onboarding writes to storefront_banner_url, the profile
            page historically read banner_url — falling back so the
            uploaded banner shows up regardless of which column wrote it
            (BUG-007). */}
        <div className="relative h-48 overflow-hidden">
          <div className="relative w-full h-full bg-gradient-to-br from-tribe-green to-lime-500">
            {(profile?.banner_url || profile?.storefront_banner_url) && (
              <Image
                src={(profile?.banner_url || profile?.storefront_banner_url)!}
                alt="Profile banner"
                fill
                className="object-cover"
                unoptimized
              />
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
          {/* Avatar. BUG-034: tapping the avatar opens the same lightbox the
              gallery photos use, so users can see their picture full size. */}
          <div className="relative inline-block">
            <button
              type="button"
              onClick={() => profile?.avatar_url && openPhoto(profile.avatar_url)}
              disabled={!profile?.avatar_url}
              aria-label={language === 'es' ? 'Ver foto de perfil' : 'View profile photo'}
              className="block rounded-full focus:outline-none focus:ring-2 focus:ring-tribe-green disabled:cursor-default"
            >
              <Avatar className="w-32 h-32 border-4 border-white dark:border-tribe-surface shadow-lg">
                <AvatarImage loading="lazy" src={profile?.avatar_url || undefined} alt={profile?.name ?? ''} />
                <AvatarFallback className="bg-tribe-green text-5xl font-bold text-slate-900">
                  {getInitials(profile?.name || 'User')}
                </AvatarFallback>
              </Avatar>
            </button>
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
            <div className="mt-6 bg-white dark:bg-tribe-surface rounded-2xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-theme-primary">{txt.profileComplete(pct)}</span>
              </div>
              <div className="w-full h-1.5 bg-stone-200 dark:bg-tribe-mid rounded-full overflow-hidden">
                <div
                  className="h-full bg-tribe-green rounded-full transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mt-6">
            <div className="bg-white dark:bg-tribe-surface rounded-2xl p-4 text-center border border-stone-200 dark:border-tribe-mid">
              <p className="text-3xl font-bold text-theme-primary">{stats.sessionsCreated}</p>
              <p className="text-xs text-muted-foreground mt-1">{txt.created}</p>
            </div>
            <div className="bg-white dark:bg-tribe-surface rounded-2xl p-4 text-center border border-stone-200 dark:border-tribe-mid">
              <p className="text-3xl font-bold text-theme-primary">{stats.sessionsJoined}</p>
              <p className="text-xs text-muted-foreground mt-1">{txt.joined}</p>
            </div>
            <div className="bg-white dark:bg-tribe-surface rounded-2xl p-4 text-center border border-stone-200 dark:border-tribe-mid">
              <p className="text-3xl font-bold text-theme-primary">{stats.totalSessions}</p>
              <p className="text-xs text-muted-foreground mt-1">{txt.total}</p>
            </div>
          </div>

          {/* Achievement Badges */}
          {profile?.id && (
            <div className="mt-6">
              <AchievementBadges userId={profile.id} isOwnProfile={true} />
            </div>
          )}

          {/* Tribe.OS entry point — surfaces for everyone. Premium
              users see "Open dashboard"; non-premium see "Try
              Tribe.OS". Both go to /os/dashboard which branches
              between the dashboard surface and the upgrade card.
              Placed above other CTAs because for a premium user it's
              the most-frequented landing target. */}
          {profile?.id && (
            <div className="mt-6">
              <TribeOSEntryCard />
            </div>
          )}

          {/* My Training — personal dashboard for every athlete */}
          {profile?.id && (
            <Link
              href="/my-training"
              className="mt-3 flex items-center justify-center gap-3 w-full px-5 py-5 bg-white dark:bg-tribe-surface rounded-2xl border border-tribe-mid text-tribe-gray-60 hover:border-tribe-green hover:text-tribe-green transition text-center"
            >
              <BarChart3 className="w-6 h-6 flex-shrink-0" />
              <span className="font-bold text-base text-center">
                {language === 'es' ? 'Mi Entrenamiento' : 'My Training'}
              </span>
            </Link>
          )}

          {/* My Coach — gym-side view of the user's training as
              their coach records it. Auto-hides when the user isn't
              a client of any gym, so non-gym users never see it. */}
          {profile?.id && <MyCoachEntryCard />}

          {/* Instructor Dashboard (instructors only) */}
          {profile?.is_instructor && profile?.id && (
            <Link
              href="/dashboard/instructor"
              className="mt-6 flex items-center justify-center gap-3 w-full px-5 py-5 bg-tribe-green-light rounded-2xl shadow-md hover:bg-tribe-green-hover transition"
            >
              <Store className="w-6 h-6 text-slate-900 flex-shrink-0" />
              <span className="font-bold text-base text-slate-900 text-center">
                {language === 'es' ? 'Panel del Instructor' : 'Instructor Dashboard'}
              </span>
            </Link>
          )}

          {/* Become a Featured Affiliate (instructors who are NOT already affiliates) */}
          {profile?.is_instructor && profile?.id && (
            <Link
              href="/partners"
              className="mt-3 flex items-center justify-center gap-3 w-full px-5 py-5 bg-white dark:bg-tribe-surface rounded-2xl border border-tribe-mid text-tribe-gray-60 hover:border-tribe-green hover:text-tribe-green transition text-center"
            >
              <HeartHandshake className="w-6 h-6 flex-shrink-0" />
              <span className="font-bold text-base text-center">
                {language === 'es' ? 'Ser Afiliado Destacado' : 'Become a Featured Affiliate'}
              </span>
            </Link>
          )}

          {/* Bio */}
          <div className="mt-6">
            {profile?.bio ? (
              <div className="bg-white dark:bg-tribe-surface rounded-2xl p-5">
                <p className="text-theme-primary whitespace-pre-wrap leading-relaxed">{profile.bio}</p>
              </div>
            ) : (
              <div className="bg-white dark:bg-tribe-surface rounded-2xl p-5 text-center">
                <p className="text-theme-secondary text-sm italic">{txt.noBio}</p>
              </div>
            )}
          </div>

          {/* Social Media Links */}
          {(profile?.instagram_username || profile?.facebook_url) && (
            <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
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
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">{txt.photos}</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {photos.map((photo: string, index: number) => (
                  <div
                    key={index}
                    onClick={() => openPhoto(photo)}
                    className="relative aspect-square rounded-lg overflow-hidden cursor-pointer hover:opacity-90 transition"
                  >
                    <Image src={photo} alt={`Profile photo ${index + 1}`} fill className="object-cover" unoptimized />
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
            className="w-full mt-6 py-4 font-bold rounded-2xl text-lg"
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
          <Image
            src={selectedPhoto}
            alt="Full size profile photo"
            width={800}
            height={800}
            className="max-w-[90vw] max-h-[90vh] object-contain"
            onClick={(e) => e.stopPropagation()}
            unoptimized
          />
        </div>
      )}

      <BottomNav />
    </div>
  );
}
