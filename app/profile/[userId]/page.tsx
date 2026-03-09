/** Page: /profile/[userId] — Public profile view for other users */
'use client';
import { logError } from '@/lib/logger';
import { showSuccess, showError, showInfo } from '@/lib/toast';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, MapPin, Shield, Flag } from 'lucide-react';
import BottomNav from '@/components/BottomNav';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useLanguage } from '@/lib/LanguageContext';
import { getErrorMessage } from '@/lib/errorMessages';
import { sportTranslations } from '@/lib/translations';
import {
  fetchUserProfile,
  blockUser,
  unblockUser,
  reportUser,
  fetchBlockedStatus,
  fetchSessionsByCreatorCount,
  fetchParticipantCountForUser,
} from '@/lib/dal';
import type { User } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

import { getProfileTranslations } from './translations';
import ProfileLightbox from './ProfileLightbox';
import ReportUserModal from './ReportUserModal';

type UserProfile = Database['public']['Tables']['users']['Row'];

export default function PublicProfilePage() {
  const router = useRouter();
  const params = useParams();
  const userId = params.userId as string;
  const supabase = createClient();
  const { language, t: globalT } = useLanguage();
  const t = getProfileTranslations(language);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [stats, setStats] = useState({
    sessionsCreated: 0,
    sessionsJoined: 0,
    totalSessions: 0,
    attendanceRate: 0,
    totalAttendance: 0,
  });
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isBlocked, setIsBlocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportDescription, setReportDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    message: string;
    confirmLabel?: string;
    variant?: 'danger' | 'default';
    onConfirm: () => void;
  } | null>(null);

  useEffect(() => {
    loadProfile();
    checkCurrentUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, [userId]);

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

  async function loadProfile() {
    try {
      const profileResult = await fetchUserProfile(supabase, userId);
      setProfile(profileResult.data ?? null);
      const createdResult = await fetchSessionsByCreatorCount(supabase, userId);
      const created = createdResult.success ? (createdResult.data ?? 0) : 0;
      const joinedResult = await fetchParticipantCountForUser(supabase, userId);
      const joined = joinedResult.success ? (joinedResult.data ?? 0) : 0;
      const { data: attendanceData } = await supabase.rpc('get_user_attendance_stats', { user_uuid: userId });
      const attendance = attendanceData?.[0] || { total_sessions: 0, attended_sessions: 0, attendance_rate: 0 };
      setStats({
        sessionsCreated: created || 0,
        sessionsJoined: joined || 0,
        totalSessions: (created || 0) + (joined || 0),
        attendanceRate: Number(attendance.attendance_rate) || 0,
        totalAttendance: Number(attendance.total_sessions) || 0,
      });
    } catch (error) {
      logError(error, { action: 'loadProfile' });
    } finally {
      setLoading(false);
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

  if (loading)
    return (
      <div className="min-h-screen bg-theme-page flex items-center justify-center">
        <p className="text-theme-primary">{t.loading}</p>
      </div>
    );
  if (!profile)
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-[#52575D] pb-32">
        <div className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-white dark:bg-[#2C3137] border-b border-gray-200 dark:border-gray-700">
          <div className="max-w-2xl mx-auto h-14 flex items-center gap-3 px-4">
            <button
              onClick={() => router.back()}
              className="p-2 -ml-2 min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              <ArrowLeft className="w-6 h-6 text-stone-900 dark:text-white hover:opacity-70" />
            </button>
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
            <button
              onClick={() => router.back()}
              className="inline-block px-6 py-3 bg-tribe-green text-slate-900 font-bold rounded-lg hover:bg-lime-500 transition"
            >
              {t.goBack}
            </button>
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
        <div className="max-w-2xl mx-auto h-14 flex items-center justify-between px-4">
          <div className="flex items-center">
            <button onClick={() => router.back()} className="p-2 hover:bg-stone-200 rounded-lg transition mr-3">
              <ArrowLeft className="w-6 h-6 text-theme-primary" />
            </button>
            <h1 className="text-xl font-bold text-theme-primary">{profile.name}</h1>
          </div>
          {currentUser && !isOwnProfile && (
            <div className="flex gap-2">
              <button
                onClick={handleBlock}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${isBlocked ? 'bg-stone-200 text-stone-700 hover:bg-stone-300' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}`}
              >
                <Shield className="w-4 h-4 inline mr-1" />
                {isBlocked ? t.unblock : t.block}
              </button>
              <button
                onClick={() => setShowReportModal(true)}
                className="px-3 py-1.5 bg-red-100 text-red-600 rounded-lg text-sm font-medium hover:bg-red-200 transition"
              >
                <Flag className="w-4 h-4 inline mr-1" />
                {t.report}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="pt-header max-w-2xl mx-auto p-4">
        <div className="bg-theme-card rounded-2xl p-6 border border-theme">
          {profile.avatar_url && (
            <div className="flex justify-center mb-4">
              <img
                loading="lazy"
                src={profile.avatar_url}
                alt={profile.name ?? undefined}
                onClick={() => {
                  setLightboxPhoto(profile.avatar_url);
                  history.pushState({ lightbox: true }, '');
                }}
                className="w-24 h-24 rounded-full object-cover border-4 border-tribe-green cursor-pointer hover:opacity-90 transition"
              />
            </div>
          )}

          {hasLowAttendance && !isOwnProfile && (
            <div className="mt-4 bg-orange-100 border border-orange-300 rounded-lg p-3">
              <p className="text-sm text-orange-700">
                ⚠️ {t.lowAttendance} {stats.attendanceRate.toFixed(0)}%
              </p>
            </div>
          )}

          <div className="mt-4">
            <h2 className="text-2xl font-bold text-theme-primary">{profile?.name}</h2>
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
                className="bg-white dark:bg-[#3D4349] rounded-2xl p-4 text-center border border-stone-200 dark:border-[#52575D]"
              >
                <p className="text-4xl font-bold text-theme-primary">{stat.value}</p>
                <p className="text-sm text-theme-secondary mt-1">{stat.label}</p>
              </div>
            ))}
            <div
              className={`bg-white rounded-2xl p-4 text-center border ${hasLowAttendance ? 'border-orange-300 bg-orange-50' : 'border-stone-200'}`}
            >
              <p className={`text-4xl font-bold ${hasLowAttendance ? 'text-orange-600' : 'text-theme-primary'}`}>
                {stats.totalAttendance > 0 ? `${stats.attendanceRate.toFixed(0)}%` : '—'}
              </p>
              <p className="text-sm text-theme-secondary mt-1">{t.attendanceRate}</p>
            </div>
          </div>

          {profile?.bio && (
            <div className="mt-6 bg-white rounded-2xl p-5 border border-stone-200">
              <p className="text-theme-primary whitespace-pre-wrap leading-relaxed">{profile.bio}</p>
            </div>
          )}

          {(profile?.instagram_username || profile?.facebook_url) && (
            <div className="mt-6 bg-white rounded-2xl p-5 border border-stone-200">
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
              <div className="grid grid-cols-3 gap-2">
                {profile.photos.map((photo: string, index: number) => (
                  <div
                    key={index}
                    className="aspect-square rounded-lg overflow-hidden bg-stone-200 cursor-pointer hover:opacity-90 transition"
                    onClick={() => {
                      setLightboxPhoto(photo);
                      setLightboxIndex(index);
                      history.pushState({ lightbox: true }, '');
                    }}
                  >
                    <img loading="lazy" src={photo} alt={`Photo ${index + 1}`} className="w-full h-full object-cover" />
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
