/**
 * Client-side surface for /profile/[userId].
 *
 * The parent Server Component (./page.tsx) fetches the profile + stats
 * server-side and hands them off via props. This component skips the
 * on-mount load round-trip. What it still does client-side:
 *   - Identify the current viewer via supabase.auth.getUser() (session
 *     cookie, fast)
 *   - Check viewer ↔ target blocked status (viewer-scoped, not cacheable
 *     in the server payload)
 *   - All interactivity: block/unblock, report, invite, share, lightbox,
 *     photo carousel
 */
'use client';
import { showSuccess, showError, showInfo } from '@/lib/toast';
import { trackEvent } from '@/lib/analytics';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { ArrowLeft, MapPin, Shield, Flag, UserPlus, Share2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import BottomNav from '@/components/BottomNav';
import ConfirmDialog from '@/components/ConfirmDialog';
import ReviewsList from '@/components/instructor/ReviewsList';
import TribePlusBadge from '@/components/TribePlusBadge';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/lib/LanguageContext';
import { getErrorMessage } from '@/lib/errorMessages';
import { sportTranslations } from '@/lib/translations';
import { blockUser, unblockUser, reportUser, fetchBlockedStatus } from '@/lib/dal';
import type { User } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

import ConnectionButton from '@/components/ConnectionButton';
import TrailblazerBadge from '@/components/TrailblazerBadge';
import InviteToSessionSheet from '@/components/InviteToSessionSheet';
import { getProfileTranslations } from './translations';
import ProfileLightbox from './ProfileLightbox';
import ReportUserModal from './ReportUserModal';

type UserProfile = Database['public']['Tables']['users']['Row'];

export interface ProfileStats {
  sessionsCreated: number;
  sessionsJoined: number;
  totalSessions: number;
  attendanceRate: number;
  totalAttendance: number;
}

interface ProfilePageClientProps {
  userId: string;
  initialProfile: UserProfile | null;
  initialStats: ProfileStats;
}

export default function ProfilePageClient({ userId, initialProfile, initialStats }: ProfilePageClientProps) {
  const router = useRouter();
  const supabase = createClient();
  const { language, t: globalT } = useLanguage();
  const t = getProfileTranslations(language);

  // Profile + stats are authoritative from the server fetch. They're stored
  // in state (not just used directly from props) because a future
  // router.refresh() after block/unblock could re-seed them, and the state
  // setter pattern leaves that door open without another refactor.
  const [profile] = useState<UserProfile | null>(initialProfile);
  const [stats] = useState<ProfileStats>(initialStats);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isBlocked, setIsBlocked] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportDescription, setReportDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  // QA-06: inline avatar carousel — index into [avatar_url, ...photos]
  const [avatarIndex, setAvatarIndex] = useState(0);
  const [showInviteSheet, setShowInviteSheet] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    message: string;
    confirmLabel?: string;
    variant?: 'danger' | 'default';
    onConfirm: () => void;
  } | null>(null);

  useEffect(() => {
    checkCurrentUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, [userId]);

  // Track instructor profile views (only when viewing someone else's profile)
  useEffect(() => {
    if (currentUser && profile && currentUser.id !== userId) {
      trackEvent('instructor_profile_viewed', {
        instructor_id: userId,
        source: 'direct',
      });
    }
  }, [currentUser, profile, userId]);

  useEffect(() => {
    function handlePopState() {
      if (lightboxPhoto) setLightboxPhoto(null);
    }
    if (lightboxPhoto) {
      const scrollY = window.scrollY;
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
      document.body.style.top = `-${scrollY}px`;
      window.addEventListener('popstate', handlePopState);
    }
    return () => {
      window.removeEventListener('popstate', handlePopState);
      if (lightboxPhoto) {
        const scrollY = document.body.style.top;
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.width = '';
        document.body.style.top = '';
        window.scrollTo(0, parseInt(scrollY || '0') * -1);
      }
    };
  }, [lightboxPhoto]);

  async function checkCurrentUser() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    setCurrentUser(user);
    if (user) {
      const blockedResult = await fetchBlockedStatus(supabase, user.id, userId);
      setIsBlocked(blockedResult.success ? !!blockedResult.data : false);
    }
  }

  async function handleBlock() {
    if (!currentUser) return;
    try {
      if (isBlocked) {
        const result = await unblockUser(supabase, currentUser.id, userId);
        if (!result.success) throw new Error(result.error);
        setIsBlocked(false);
        showSuccess(t.userUnblocked);
      } else {
        setConfirmAction({
          title: t.block,
          message: t.blockConfirm,
          confirmLabel: t.block,
          variant: 'danger',
          onConfirm: async () => {
            setConfirmAction(null);
            try {
              const result = await blockUser(supabase, { user_id: currentUser.id, blocked_user_id: userId });
              if (!result.success) throw new Error(result.error);
              setIsBlocked(true);
              showSuccess(t.userBlocked);
            } catch (error: unknown) {
              showError(getErrorMessage(error, 'admin_action', language));
            }
          },
        });
      }
    } catch (error: unknown) {
      showError(getErrorMessage(error, 'admin_action', language));
    }
  }

  async function handleReport() {
    if (!reportReason.trim()) {
      showInfo(t.selectReasonError);
      return;
    }
    setSubmitting(true);
    try {
      const reportResult = await reportUser(supabase, {
        reporter_id: currentUser!.id,
        reported_user_id: userId,
        reason: reportReason,
        description: reportDescription,
      });
      if (!reportResult.success) throw new Error(reportResult.error);
      showSuccess(t.reportSuccess);
      setShowReportModal(false);
      setReportReason('');
      setReportDescription('');
    } catch (error: unknown) {
      showError(getErrorMessage(error, 'submit_feedback', language));
    } finally {
      setSubmitting(false);
    }
  }

  async function shareInstructor() {
    const shareUrl = `${window.location.origin}/i/${userId}`;
    const shareText =
      language === 'es' ? `${profile?.name} — Instructor en Tribe` : `${profile?.name} — Instructor on Tribe`;
    if (navigator.share) {
      await navigator.share({ title: shareText, url: shareUrl });
      trackEvent('share_link_created', { type: 'instructor', instructor_id: userId });
    } else {
      await navigator.clipboard.writeText(shareUrl);
      trackEvent('share_link_created', { type: 'instructor', instructor_id: userId });
      showSuccess(language === 'es' ? '¡Enlace copiado!' : 'Link copied!');
    }
  }

  // No more client-side loading gate — the server page fetches profile
  // before this component mounts, so `profile` is either a real row or
  // null (not-found case, which falls through to the next branch).
  if (!profile)
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-tribe-mid pb-32">
        <div className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-white dark:bg-tribe-card border-b border-gray-200 dark:border-gray-700">
          <div className="max-w-2xl md:max-w-4xl mx-auto h-14 flex items-center gap-3 px-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.back()}
              className="-ml-2 min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              <ArrowLeft className="w-6 h-6 text-stone-900 dark:text-white hover:opacity-70" />
            </Button>
            <h1 className="text-lg font-bold text-theme-primary leading-tight">
              Tribe<span className="text-tribe-green">.</span>
            </h1>
          </div>
        </div>
        <div className="pt-header flex items-center justify-center min-h-[60vh]">
          <div className="text-center p-6">
            <div className="text-4xl mb-4">🔍</div>
            <p className="text-lg font-semibold text-stone-900 dark:text-white mb-2">{t.userNotFound}</p>
            <p className="text-sm text-stone-500 dark:text-gray-400 mb-6">{globalT('checkConnectionRetry')}</p>
            <Button onClick={() => router.back()} className="px-6 py-3 font-bold">
              {t.goBack}
            </Button>
          </div>
        </div>
        <BottomNav />
      </div>
    );

  const isOwnProfile = currentUser?.id === userId;
  const sports = profile.sports || [];
  const hasLowAttendance = stats.totalAttendance >= 3 && stats.attendanceRate < 50;

  return (
    <div className="min-h-screen bg-theme-page pb-32">
      <div className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-theme-card border-b border-theme">
        <div className="max-w-2xl md:max-w-4xl mx-auto h-14 flex items-center justify-between px-4">
          <div className="flex items-center">
            <Button variant="ghost" size="icon" onClick={() => router.back()} className="mr-3">
              <ArrowLeft className="w-6 h-6 text-theme-primary" />
            </Button>
            <h1 className="text-xl font-bold text-theme-primary">{profile.name}</h1>
          </div>
          {currentUser && !isOwnProfile && (
            <div className="flex gap-2">
              <button
                onClick={handleBlock}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${isBlocked ? 'bg-stone-200 text-stone-700 hover:bg-stone-300' : 'bg-stone-100 dark:bg-tribe-mid text-stone-600 dark:text-gray-300 hover:bg-stone-200 dark:hover:bg-tribe-mid'}`}
              >
                <Shield className="w-4 h-4 inline mr-1" />
                {isBlocked ? t.unblock : t.block}
              </button>
              <button
                onClick={() => setShowReportModal(true)}
                className="px-3 py-1.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg text-sm font-medium hover:bg-red-200 dark:hover:bg-red-900/50 transition"
              >
                <Flag className="w-4 h-4 inline mr-1" />
                {t.report}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="pt-header max-w-2xl md:max-w-4xl mx-auto p-4 md:p-6">
        <div className="bg-theme-card rounded-2xl p-6 border border-theme">
          {/* QA-06: avatar + inline photo carousel. Builds a combined list of
              [avatar_url, ...profile.photos] so arrows let you flip through
              every picture without opening the lightbox. */}
          {(() => {
            const allPhotos: string[] = [
              ...(profile.avatar_url ? [profile.avatar_url] : []),
              ...((profile as any)?.photos ?? []),
            ];
            const currentPhoto = allPhotos[avatarIndex] ?? profile.avatar_url ?? null;
            const canNavigate = allPhotos.length > 1;

            const goPrev = (e: React.MouseEvent) => {
              e.stopPropagation();
              setAvatarIndex((i) => (i - 1 + allPhotos.length) % allPhotos.length);
            };
            const goNext = (e: React.MouseEvent) => {
              e.stopPropagation();
              setAvatarIndex((i) => (i + 1) % allPhotos.length);
            };
            const openLightbox = () => {
              if (!currentPhoto) return;
              setLightboxPhoto(currentPhoto);
              // If viewing one of the gallery photos (index >= 1 since avatar is 0),
              // align lightboxIndex so the lightbox opens on the same picture.
              setLightboxIndex(Math.max(0, avatarIndex - (profile.avatar_url ? 1 : 0)));
              history.pushState({ lightbox: true }, '');
            };

            return (
              <div className="flex justify-center mb-4">
                <div className="relative">
                  <Avatar
                    className="w-24 h-24 border-4 border-tribe-green cursor-pointer hover:opacity-90 transition"
                    onClick={openLightbox}
                  >
                    <AvatarImage loading="lazy" src={currentPhoto || undefined} alt={profile.name ?? ''} />
                    <AvatarFallback className="bg-tribe-green text-3xl font-bold text-slate-900">
                      {profile.name?.[0]?.toUpperCase() || '?'}
                    </AvatarFallback>
                  </Avatar>
                  {canNavigate && (
                    <>
                      <button
                        type="button"
                        onClick={goPrev}
                        aria-label="Previous photo"
                        className="absolute left-[-36px] top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center transition-colors"
                      >
                        <ChevronLeft className="w-5 h-5" />
                      </button>
                      <button
                        type="button"
                        onClick={goNext}
                        aria-label="Next photo"
                        className="absolute right-[-36px] top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center transition-colors"
                      >
                        <ChevronRight className="w-5 h-5" />
                      </button>
                      <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                        {allPhotos.map((_, i) => (
                          <span
                            key={i}
                            className={`w-1.5 h-1.5 rounded-full ${
                              i === avatarIndex ? 'bg-tribe-green' : 'bg-white/40'
                            }`}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })()}

          {hasLowAttendance && !isOwnProfile && (
            <div className="mt-4 bg-orange-100 border border-orange-300 rounded-lg p-3">
              <p className="text-sm text-orange-700">
                ⚠️ {t.lowAttendance} {stats.attendanceRate.toFixed(0)}%
              </p>
            </div>
          )}

          <div className="mt-4">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-3xl font-extrabold tracking-tight text-theme-primary">{profile?.name}</h2>
              {(profile as any)?.is_trailblazer && <TrailblazerBadge language={language} />}
              <TribePlusBadge user={profile as any} />
            </div>
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

          <div className="grid grid-cols-2 gap-3 mt-6">
            {[
              { value: stats.sessionsCreated, label: t.sessionsCreated },
              { value: stats.sessionsJoined, label: t.sessionsJoined },
              { value: stats.totalSessions, label: t.totalSessions },
            ].map((stat) => (
              <div
                key={stat.label}
                className="bg-white dark:bg-tribe-surface rounded-2xl p-4 text-center border border-stone-200 dark:border-tribe-mid"
              >
                <p className="text-4xl font-bold text-theme-primary">{stat.value}</p>
                <p className="text-sm text-theme-secondary mt-1">{stat.label}</p>
              </div>
            ))}
            <div
              className={`bg-white dark:bg-tribe-surface rounded-2xl p-4 text-center border ${hasLowAttendance ? 'border-orange-300 bg-orange-50 dark:bg-orange-900/20' : 'border-stone-200 dark:border-tribe-mid'}`}
            >
              <p className={`text-4xl font-bold ${hasLowAttendance ? 'text-orange-600' : 'text-theme-primary'}`}>
                {stats.totalAttendance > 0 ? `${stats.attendanceRate.toFixed(0)}%` : '—'}
              </p>
              <p className="text-sm text-theme-secondary mt-1">{t.attendanceRate}</p>
            </div>
          </div>

          {/* Reviews preview — instructors only */}
          {profile?.is_instructor && (
            <div className="mt-6 bg-white dark:bg-tribe-surface rounded-2xl p-5 border border-stone-200 dark:border-tribe-mid">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-theme-primary">{language === 'es' ? 'Reseñas' : 'Reviews'}</h3>
                <a href={`/storefront/${userId}`} className="text-xs font-medium text-tribe-green hover:underline">
                  {language === 'es' ? 'Ver en la tienda →' : 'See all on storefront →'}
                </a>
              </div>
              <ReviewsList
                hostId={userId}
                limit={3}
                showAll={false}
                language={language}
                seeAllHref={`/storefront/${userId}`}
              />
            </div>
          )}

          {/* Invite to Session — always visible */}
          {currentUser && !isOwnProfile && (
            <div className="mt-6">
              <Button
                variant="outline"
                onClick={() => setShowInviteSheet(true)}
                className="w-full py-3 border-2 border-tribe-green text-tribe-green font-semibold hover:bg-tribe-green hover:text-slate-900 transition"
              >
                <UserPlus className="w-5 h-5 mr-2" />
                {language === 'es' ? 'Invitar a Sesion' : 'Invite to Session'}
              </Button>
            </div>
          )}

          {/* Share Instructor Profile */}
          {profile?.is_instructor && (
            <div className="mt-4">
              <button
                onClick={shareInstructor}
                className="w-full flex items-center justify-center gap-2 py-3 border-2 border-stone-300 dark:border-tribe-mid text-theme-primary rounded-lg font-semibold hover:bg-stone-100 dark:hover:bg-tribe-mid transition"
              >
                <Share2 className="w-5 h-5" />
                {language === 'es' ? 'Compartir Perfil' : 'Share Profile'}
              </button>
            </div>
          )}

          {/* Connection Button — session-gated: Connect / Message */}
          {currentUser && !isOwnProfile && (
            <div className="mt-6">
              <ConnectionButton
                currentUserId={currentUser.id}
                profileUserId={userId}
                language={language}
                profileUserName={profile?.name ?? undefined}
              />
            </div>
          )}

          {profile?.bio && (
            <div className="mt-6 bg-white dark:bg-tribe-surface rounded-2xl p-5 border border-stone-200 dark:border-tribe-mid">
              <p className="text-theme-primary whitespace-pre-wrap leading-relaxed">{profile.bio}</p>
            </div>
          )}

          {profile?.is_instructor && (
            <div className="mt-6 bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl p-5 border border-emerald-200 dark:border-emerald-800">
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-sm font-bold text-emerald-800 dark:text-emerald-300">
                  {language === 'es' ? '🏋️ Instructor' : '🏋️ Instructor'}
                </h3>
                {profile.is_verified_instructor && (
                  <span className="px-2 py-0.5 bg-emerald-200 dark:bg-emerald-700 text-emerald-800 dark:text-emerald-200 rounded-full text-xs font-bold">
                    {language === 'es' ? 'Verificado' : 'Verified'}
                  </span>
                )}
              </div>
              {profile.instructor_bio && (
                <p className="text-sm text-theme-primary whitespace-pre-wrap leading-relaxed mb-3">
                  {profile.instructor_bio}
                </p>
              )}
              <div className="flex flex-wrap gap-2 mb-3">
                {profile.specialties &&
                  (profile.specialties as string[]).map((s: string, i: number) => (
                    <span
                      key={i}
                      className="px-3 py-1 bg-emerald-200 dark:bg-emerald-800 text-emerald-900 dark:text-emerald-100 rounded-full text-xs font-medium"
                    >
                      {s}
                    </span>
                  ))}
              </div>
              {profile.certifications && (profile.certifications as string[]).length > 0 && (
                <div className="mb-2">
                  <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 mb-1">
                    {language === 'es' ? 'Certificaciones' : 'Certifications'}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {(profile.certifications as string[]).map((c: string, i: number) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 bg-white dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200 rounded text-xs border border-emerald-300 dark:border-emerald-700"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex gap-4 text-xs text-emerald-700 dark:text-emerald-400">
                {profile.years_experience != null && (
                  <span>
                    {profile.years_experience} {language === 'es' ? 'años exp.' : 'yrs exp.'}
                  </span>
                )}
                {profile.total_sessions_hosted != null && profile.total_sessions_hosted > 0 && (
                  <span>
                    {profile.total_sessions_hosted} {language === 'es' ? 'sesiones' : 'sessions hosted'}
                  </span>
                )}
              </div>
              {profile.website_url && (
                <a
                  href={profile.website_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-2 text-xs text-blue-600 hover:underline"
                >
                  {profile.website_url}
                </a>
              )}
            </div>
          )}

          {(profile?.instagram_username || profile?.facebook_url) && (
            <div className="mt-6 bg-white dark:bg-tribe-surface rounded-2xl p-5 border border-stone-200 dark:border-tribe-mid">
              <h3 className="text-sm font-bold text-theme-primary mb-3 flex items-center gap-2">🔗 {t.socialMedia}</h3>
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
                    📘 {globalT('facebookProfile')}
                  </a>
                )}
              </div>
            </div>
          )}

          {profile?.photos && profile.photos.length > 0 && (
            <div className="mt-6">
              <h3 className="text-lg font-semibold text-theme-primary mb-3">{t.photos}</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {profile.photos.map((photo: string, index: number) => (
                  <div
                    key={index}
                    className="relative aspect-square rounded-lg overflow-hidden bg-stone-200 cursor-pointer hover:opacity-90 transition"
                    onClick={() => {
                      setLightboxPhoto(photo);
                      setLightboxIndex(index);
                      history.pushState({ lightbox: true }, '');
                    }}
                  >
                    <Image src={photo} alt={`User photo ${index + 1}`} fill className="object-cover" unoptimized />
                  </div>
                ))}
              </div>
            </div>
          )}

          {sports.length > 0 && (
            <div className="mt-6">
              <div className="flex flex-wrap gap-2">
                {sports.map((sport: string, index: number) => (
                  <span
                    key={index}
                    className="px-5 py-2.5 bg-tribe-green text-slate-900 rounded-full text-sm font-medium"
                  >
                    {language === 'es' && sportTranslations[sport] ? sportTranslations[sport].es : sport}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {currentUser && !isOwnProfile && profile && (
        <InviteToSessionSheet
          open={showInviteSheet}
          onClose={() => setShowInviteSheet(false)}
          athlete={{
            id: userId,
            name: profile.name ?? '',
            avatar_url: profile.avatar_url ?? null,
            primary_sport: sports[0] ?? '',
            distance_km: 0,
            shared_sport_count: 0,
            sports: sports,
          }}
          language={language}
        />
      )}

      {lightboxPhoto && (
        <ProfileLightbox
          photo={lightboxPhoto}
          photos={profile?.photos ?? null}
          lightboxIndex={lightboxIndex}
          onClose={() => history.back()}
          onNavigate={(index, photo) => {
            setLightboxIndex(index);
            setLightboxPhoto(photo);
          }}
        />
      )}

      {showReportModal && (
        <ReportUserModal
          t={t}
          reportReason={reportReason}
          reportDescription={reportDescription}
          submitting={submitting}
          onReasonChange={setReportReason}
          onDescriptionChange={setReportDescription}
          onClose={() => setShowReportModal(false)}
          onSubmit={handleReport}
        />
      )}

      <ConfirmDialog
        open={!!confirmAction}
        title={confirmAction?.title ?? ''}
        message={confirmAction?.message ?? ''}
        confirmLabel={confirmAction?.confirmLabel ?? t.submit}
        cancelLabel={t.cancel}
        variant={confirmAction?.variant ?? 'default'}
        onConfirm={() => confirmAction?.onConfirm()}
        onCancel={() => setConfirmAction(null)}
      />

      <BottomNav />
    </div>
  );
}
