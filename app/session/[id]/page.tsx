/** Page: /session/[id] — Session detail with athletes, chat, live status, and actions */
'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Share2 } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import BottomNav from '@/components/BottomNav';
import LoadingSpinner from '@/components/LoadingSpinner';
import AttendanceTracker from '@/components/AttendanceTracker';
import StoryUpload from '@/components/StoryUpload';
import StoryViewer from '@/components/StoryViewer';
import { markStoriesSeen } from '@/components/StoriesRow';

import SessionHeader from '@/components/session/SessionHeader';
import SessionDetails from '@/components/session/SessionDetails';
import ParticipantList from '@/components/session/ParticipantList';
import ReviewSection from '@/components/session/ReviewSection';
import RecapPhotos from '@/components/session/RecapPhotos';
import ReviewsList from '@/components/instructor/ReviewsList';
import LiveStatusSection from '@/components/session/LiveStatusSection';
import ConfirmDialog from '@/components/ConfirmDialog';

import type { RecapPhotoWithUser, SessionStoryJoined } from './types';
import PhotoLightbox from './PhotoLightbox';
import ActionButtons from './ActionButtons';
import GuestJoinModal from './GuestJoinModal';
import InviteModal from './InviteModal';
import SessionStories from './SessionStories';
import { useSessionDetail } from './useSessionDetail';
import { confirmParticipantPayment } from '@/lib/dal';
import { createClient } from '@/lib/supabase/client';
import { showSuccess, showError } from '@/lib/toast';
import PostSessionConnect from '@/components/PostSessionConnect';
import PostSessionFlow from '@/components/PostSessionFlow';
import SessionQA from '@/components/session/SessionQA';
import { trackEvent } from '@/lib/analytics';
import { downloadCalendarEvent, getGoogleCalendarUrl } from '@/lib/calendar';
import { Calendar as CalendarIcon } from 'lucide-react';

export default function SessionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { t, language } = useLanguage();
  const supabase = createClient();
  const d = useSessionDetail(params.id as string, language, (path) => router.push(path));
  const [showPostSessionFlow, setShowPostSessionFlow] = useState(false);

  async function shareSession() {
    if (!d.session) return;
    const shareUrl = `${window.location.origin}/s/${d.session.id}`;
    const shareText = language === 'es' ? `${d.session.title} — Únete en Tribe` : `${d.session.title} — Join on Tribe`;
    if (navigator.share) {
      await navigator.share({ title: shareText, url: shareUrl });
      trackEvent('session_shared', { session_id: d.session.id, method: 'native' });
    } else {
      await navigator.clipboard.writeText(shareUrl);
      trackEvent('session_shared', { session_id: d.session.id, method: 'clipboard' });
      showSuccess(language === 'es' ? '¡Enlace copiado!' : 'Link copied!');
    }
  }

  // Track session view once on mount
  useEffect(() => {
    if (!d.session) return;
    trackEvent('session_viewed', {
      session_id: d.session.id,
      session_type: d.session.is_paid ? 'paid' : 'free',
      sport: d.session.sport,
      price_cents: d.session.price_cents,
      currency: d.session.currency,
      instructor_id: d.session.creator_id,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- track once when session loads
  }, [d.session?.id]);

  // Auto-show post-session flow for past sessions the user attended
  useEffect(() => {
    if (!d.session || !d.user) return;
    const sessionDate = new Date(d.session.date + 'T00:00:00');
    if (d.session.start_time) {
      const [hours, minutes] = d.session.start_time.split(':').map(Number);
      sessionDate.setHours(hours, minutes, 0, 0);
      sessionDate.setMinutes(sessionDate.getMinutes() + (d.session.duration || 60));
    } else sessionDate.setHours(23, 59, 59, 999);
    const sessionIsPast = sessionDate < new Date();
    if (sessionIsPast && d.hasJoined && d.creator && !d.hasReviewed) {
      setShowPostSessionFlow(true);
    }
  }, [d.session, d.user, d.hasJoined, d.creator, d.hasReviewed]);

  async function handleConfirmPayment(participantUserId: string) {
    if (!d.user || !d.session) return;
    const result = await confirmParticipantPayment(supabase, d.session.id, participantUserId, d.user.id);
    if (result.success) {
      showSuccess(language === 'es' ? 'Pago confirmado' : 'Payment confirmed');
      d.loadSession();
    } else {
      showError(result.error || (language === 'es' ? 'Error al confirmar pago' : 'Failed to confirm payment'));
    }
  }

  if (d.loading)
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-tribe-mid">
        <LoadingSpinner className="flex items-center justify-center min-h-screen" />
      </div>
    );
  if (!d.session)
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-tribe-mid pb-32">
        <div className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-white dark:bg-tribe-card border-b border-gray-200 dark:border-gray-700">
          <div className="max-w-2xl md:max-w-4xl mx-auto h-14 flex items-center gap-3 px-4">
            <Link href="/" className="p-2 -ml-2 min-w-[44px] min-h-[44px] flex items-center justify-center">
              <ArrowLeft className="w-6 h-6 text-stone-900 dark:text-white hover:opacity-70" />
            </Link>
            <h1 className="text-lg font-bold text-theme-primary leading-tight">
              Tribe<span className="text-tribe-green">.</span>
            </h1>
          </div>
        </div>
        <div className="pt-header flex items-center justify-center min-h-[60vh]">
          <div className="text-center p-6">
            <div className="text-4xl mb-4">🔍</div>
            <p className="text-lg font-semibold text-stone-900 dark:text-white mb-2">{t('sessionNotFound')}</p>
            <p className="text-sm text-stone-500 dark:text-gray-400 mb-6">{t('checkConnectionRetry')}</p>
            <Link
              href="/"
              className="inline-block px-6 py-3 bg-tribe-green text-slate-900 font-bold rounded-lg hover:bg-lime-500 transition"
            >
              {t('goHome')}
            </Link>
          </div>
        </div>
        <BottomNav />
      </div>
    );

  const isPast = (() => {
    const sessionDate = new Date(d.session.date + 'T00:00:00');
    if (d.session.start_time) {
      const [hours, minutes] = d.session.start_time.split(':').map(Number);
      sessionDate.setHours(hours, minutes, 0, 0);
      sessionDate.setMinutes(sessionDate.getMinutes() + (d.session.duration || 60));
    } else sessionDate.setHours(23, 59, 59, 999);
    return sessionDate < new Date();
  })();
  const isFull = d.session.current_participants >= d.session.max_participants;
  const isCreator = d.session.creator_id === d.user?.id;
  const canKick = isCreator || d.userIsAdmin;
  const canUploadRecap = !!d.user && (isCreator || d.wasMarkedAttended) && isPast && d.userPhotoCount < 3;
  const canModerate = isCreator || d.userIsAdmin;
  const shouldPromptUpload = !!d.user && isPast && d.wasMarkedAttended && d.userPhotoCount === 0;
  const isToday = (() => {
    const now = new Date();
    return (
      d.session.date ===
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    );
  })();
  const canGoLive = !!d.user && (d.hasJoined || isCreator) && isToday && !isPast;
  const currentPhotos =
    d.photoType === 'location' ? d.session.photos : d.recapPhotos.map((p: RecapPhotoWithUser) => p.photo_url);

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-tribe-mid pb-32">
      {d.lightboxOpen && currentPhotos && (
        <PhotoLightbox photos={currentPhotos} initialIndex={d.currentPhotoIndex} onClose={() => history.back()} />
      )}

      <SessionHeader
        language={language}
        isCreator={isCreator}
        hasJoined={d.hasJoined}
        user={d.user}
        sessionStories={d.sessionStories}
        onAddStory={() => d.setShowStoryUpload(true)}
      />

      <div className="pt-header max-w-2xl md:max-w-4xl mx-auto p-4 md:p-6 space-y-4">
        <SessionDetails
          session={d.session}
          creator={d.creator}
          participants={d.participants}
          isFull={isFull}
          language={language}
          isCreator={isCreator}
          onOpenLightbox={d.openLightbox}
        />

        {/* Share button */}
        <div className="flex justify-end">
          <button
            onClick={shareSession}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-tribe-surface dark:bg-tribe-surface border border-stone-200 dark:border-tribe-mid text-theme-primary hover:bg-stone-100 dark:hover:bg-tribe-mid transition text-sm font-medium"
          >
            <Share2 className="w-4 h-4" />
            {language === 'es' ? 'Compartir' : 'Share'}
          </button>
        </div>

        <LiveStatusSection
          canGoLive={canGoLive}
          isLive={d.liveStatus.isLive}
          liveCountdown={d.liveStatus.liveCountdown}
          liveUsers={d.liveStatus.liveUsers}
          goingLive={d.liveStatus.goingLive}
          language={language}
          onGoLive={d.liveStatus.handleGoLive}
          onEndLive={d.liveStatus.handleEndLive}
          onRenewLive={d.liveStatus.handleRenewLive}
          onShareMoment={() => d.setShowStoryUpload(true)}
        />

        <SessionQA
          sessionId={d.session.id}
          currentUserId={d.user?.id || null}
          isCreator={isCreator}
          creatorId={d.session.creator_id}
          language={language}
        />

        <ActionButtons
          language={language}
          user={d.user}
          session={d.session}
          isCreator={isCreator}
          hasJoined={d.hasJoined}
          isPending={d.isPending}
          isPast={isPast}
          isFull={isFull}
          sessionActions={d.sessionActions}
          onEdit={() => router.push(`/session/${params.id}/edit`)}
          onInvite={d.generateInviteLink}
          creatingInvite={d.creatingInvite}
        />

        {/* Calendar Integration — shown when user has joined and session is upcoming */}
        {d.hasJoined && !isPast && d.session && (
          <div className="mt-4 p-4 bg-tribe-green/10 border border-tribe-green/30 rounded-xl space-y-2">
            <p className="text-sm font-semibold text-stone-900 dark:text-white">
              {language === 'es' ? '¡Estás inscrito!' : "You're in!"}
            </p>
            <p className="text-xs text-stone-500 dark:text-gray-400">
              {language === 'es'
                ? 'Agrega a tu calendario para no olvidar'
                : "Add to your calendar so you don't forget"}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const sessionDate = new Date(`${d.session!.date}T${d.session!.start_time || '00:00'}`);
                  downloadCalendarEvent({
                    title: `${d.session!.sport} — ${d.session!.title || 'Tribe Session'}`,
                    description: `Session with ${d.session!.creator?.name || 'Instructor'} on Tribe.\n${window.location.origin}/session/${d.session!.id}`,
                    startDate: sessionDate,
                    durationMinutes: d.session!.duration || 60,
                    location: d.session!.location || undefined,
                    url: `${window.location.origin}/session/${d.session!.id}`,
                  });
                  trackEvent('session_calendar_added', { session_id: d.session!.id, method: 'ics' });
                }}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 bg-white dark:bg-tribe-surface text-stone-900 dark:text-white text-sm font-semibold rounded-lg border border-stone-200 dark:border-gray-600 hover:bg-stone-50 dark:hover:bg-tribe-mid transition"
              >
                <CalendarIcon className="w-4 h-4" />
                Apple Calendar
              </button>
              <a
                href={getGoogleCalendarUrl({
                  title: `${d.session!.sport} — ${d.session!.title || 'Tribe Session'}`,
                  description: `Session with ${d.session!.creator?.name || 'Instructor'} on Tribe.`,
                  startDate: new Date(`${d.session!.date}T${d.session!.start_time || '00:00'}`),
                  durationMinutes: d.session!.duration || 60,
                  location: d.session!.location || undefined,
                })}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackEvent('session_calendar_added', { session_id: d.session!.id, method: 'google' })}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 bg-white dark:bg-tribe-surface text-stone-900 dark:text-white text-sm font-semibold rounded-lg border border-stone-200 dark:border-gray-600 hover:bg-stone-50 dark:hover:bg-tribe-mid transition"
              >
                <CalendarIcon className="w-4 h-4" />
                Google
              </a>
            </div>
          </div>
        )}

        <RecapPhotos
          session={d.session}
          recapPhotos={d.recapPhotos}
          user={d.user}
          isPast={isPast}
          canUploadRecap={canUploadRecap}
          canModerate={canModerate}
          shouldPromptUpload={shouldPromptUpload}
          userPhotoCount={d.userPhotoCount}
          language={language}
          onOpenLightbox={d.openLightbox}
          onPhotosChanged={d.loadRecapPhotos}
        />

        {/* Instructor reviews preview — builds trust before booking another session */}
        {!isCreator && d.creator?.id && (
          <div className="mt-4">
            <h3 className="text-sm font-semibold text-theme-primary mb-2">
              {language === 'es'
                ? `Lo que dicen los atletas sobre ${d.creator.name || ''}`
                : `What athletes say about ${d.creator.name || ''}`}
            </h3>
            <ReviewsList
              hostId={d.creator.id}
              limit={3}
              showAll={false}
              language={language}
              seeAllHref={`/storefront/${d.creator.id}`}
            />
          </div>
        )}

        <ReviewSection
          session={d.session}
          user={d.user}
          isCreator={isCreator}
          hasJoined={d.hasJoined}
          isPast={isPast}
          hasReviewed={d.hasReviewed}
          language={language}
          onReviewSubmitted={() => {
            d.setHasReviewed(true);
            d.loadSession();
          }}
        />

        {/* Post-Session Connect — standalone fallback below session details */}
        {isPast && d.user && d.participants.length > 0 && (
          <PostSessionConnect
            sessionId={d.session.id}
            currentUserId={d.user.id}
            participants={d.participants
              .filter((p: any) => p.user_id !== d.user!.id && !p.is_guest)
              .map((p: any) => ({
                id: p.user_id,
                name: p.user?.name || p.guest_name || 'Unknown',
                avatar_url: p.user?.avatar_url || null,
                sports: p.user?.sports || [],
              }))}
            language={language}
          />
        )}

        <SessionStories
          stories={d.sessionStories}
          language={language}
          onViewStories={() => d.setShowStoryViewer(true)}
        />

        <ParticipantList
          creator={d.creator}
          participants={d.participants}
          canKick={canKick}
          isCreator={isCreator}
          isPaidSession={!!d.session.is_paid}
          language={language}
          onKickUser={d.sessionActions.handleKickUser}
          onConfirmPayment={handleConfirmPayment}
        />

        {d.user && (
          <AttendanceTracker
            sessionId={params.id as string}
            isHost={isCreator}
            isAdmin={d.userIsAdmin}
            sessionDate={d.session.date}
          />
        )}
      </div>

      {d.sessionActions.showGuestModal && (
        <GuestJoinModal
          language={language}
          guestData={d.sessionActions.guestData}
          joiningAsGuest={d.sessionActions.joiningAsGuest}
          onClose={() => d.sessionActions.setShowGuestModal(false)}
          onGuestDataChange={d.sessionActions.setGuestData}
          onSubmit={d.sessionActions.handleGuestJoin}
        />
      )}

      {d.showInviteModal && (
        <InviteModal
          language={language}
          inviteLink={d.inviteLink}
          session={d.session}
          onClose={() => d.setShowInviteModal(false)}
        />
      )}

      {d.showStoryUpload && d.user && (
        <StoryUpload
          sessionId={d.session.id}
          userId={d.user.id}
          onClose={() => d.setShowStoryUpload(false)}
          onUploaded={() => d.loadSessionStories()}
        />
      )}

      {/* Post-Session Flow Modal */}
      {d.user && d.creator && (
        <PostSessionFlow
          open={showPostSessionFlow}
          onClose={() => setShowPostSessionFlow(false)}
          sessionId={d.session.id}
          userId={d.user.id}
          creatorId={d.creator.id}
          creatorName={d.creator.name || ''}
          creatorAvatar={d.creator.avatar_url}
          sport={d.session.sport || ''}
          participants={d.participants
            .filter((p: any) => p.user_id !== d.user!.id && !p.is_guest)
            .map((p: any) => ({
              user_id: p.user_id,
              name: p.user?.name || p.guest_name || 'Unknown',
              avatar_url: p.user?.avatar_url || null,
              primary_sport: p.user?.sports?.[0] || undefined,
            }))}
          language={language}
          hasReviewed={d.hasReviewed}
          sessionTitle={d.session.title || d.session.sport}
          sessionDate={d.session.date}
          sessionTime={d.session.start_time}
          locationName={d.session.location}
          price={d.session.price_cents ? String(d.session.price_cents / 100) : undefined}
        />
      )}

      <ConfirmDialog
        open={!!d.sessionActions.confirmAction}
        title={d.sessionActions.confirmAction?.title || ''}
        message={d.sessionActions.confirmAction?.message || ''}
        confirmLabel={t('confirm')}
        cancelLabel={t('cancel')}
        variant="danger"
        onConfirm={() => {
          d.sessionActions.confirmAction?.onConfirm();
          d.sessionActions.setConfirmAction(null);
        }}
        onCancel={() => d.sessionActions.setConfirmAction(null)}
      />

      {d.showStoryViewer && d.sessionStories.length > 0 && d.session && (
        <StoryViewer
          groups={[
            {
              sessionId: d.session.id,
              sport: d.session.sport,
              stories: d.sessionStories.map((s: SessionStoryJoined) => ({
                id: s.id,
                media_url: s.media_url,
                media_type: s.media_type as 'image' | 'video',
                thumbnail_url: s.thumbnail_url,
                caption: s.caption,
                created_at: s.created_at || '',
                user_id: s.user_id,
                user_name: s.user?.name || '?',
                user_avatar: s.user?.avatar_url || null,
              })),
            },
          ]}
          startGroupIndex={0}
          currentUserId={d.user?.id}
          onClose={() => d.setShowStoryViewer(false)}
          onStorySeen={(ids: string[]) => markStoriesSeen(ids)}
          onStoryDeleted={() => d.loadSessionStories()}
        />
      )}
    </div>
  );
}
