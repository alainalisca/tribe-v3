/** Page: /session/[id] — Session detail with athletes, chat, live status, and actions */
'use client';

import { useState, useEffect } from 'react';
import { notFound, useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { copyToClipboard, getSessionShareUrl, nativeShare } from '@/lib/share';
import BottomNav from '@/components/BottomNav';
import LoadingSpinner from '@/components/LoadingSpinner';
import AttendanceTracker from '@/components/AttendanceTracker';
import SessionAttendanceSection from '@/components/tribe-os/SessionAttendanceSection';
import StoryUpload from '@/components/StoryUpload';
import StoryViewer from '@/components/StoryViewer';
import { markStoriesSeen } from '@/components/StoriesRow';

import SessionHeader from '@/components/session/SessionHeader';
import SessionDetails from '@/components/session/SessionDetails';
import ParticipantList from '@/components/session/ParticipantList';
import DoorCheckInCard from '@/components/session/DoorCheckInCard';
import ReviewSection from '@/components/session/ReviewSection';
import RecapPhotos from '@/components/session/RecapPhotos';
import ReviewsList from '@/components/instructor/ReviewsList';
import WaitlistPanel from '@/components/session/WaitlistPanel';
import PendingRequestsPanel from '@/components/session/PendingRequestsPanel';
import LiveStatusSection from '@/components/session/LiveStatusSection';
import ConfirmDialog from '@/components/ConfirmDialog';

import type { RecapPhotoWithUser, SessionStoryJoined } from './types';
import PhotoLightbox from '@/components/PhotoLightbox';
import SessionActionBar from './SessionActionBar';
import AthleteShareButton from './AthleteShareButton';
import ManageSessionSheet from './ManageSessionSheet';
import { ACTION_BAR_CLEARANCE, athleteBarState } from './sessionActionState';
import SignedOutSession, { type PublicSession } from './SignedOutSession';
import SessionPoster, { type PosterSession } from './SessionPoster';
import type { HeroPhoto } from '@/lib/site/coachPage';
import { publicSessionTitle } from '@/lib/share/sessionPublic';
import SessionStatusNotice from './SessionStatusNotice';
import InviteModal from './InviteModal';
import SubscribeButton from '@/components/SubscribeButton';
import SessionStories from './SessionStories';
import { useSessionDetail } from './useSessionDetail';
import BringAFriendCard from '@/components/referral/BringAFriendCard';
import { useMyReferralCode } from '@/hooks/useMyReferralCode';
import { confirmParticipantPayment } from '@/lib/dal';
import { createClient } from '@/lib/supabase/client';
import { showSuccess, showError } from '@/lib/toast';
import PostSessionConnect from '@/components/PostSessionConnect';
import PostSessionFlow from '@/components/PostSessionFlow';
import SessionQA from '@/components/session/SessionQA';
import { trackEvent } from '@/lib/analytics';
import { pathBefore, sessionViewSourceFrom } from '@/lib/navigationSource';
import AddToCalendarRow from '@/components/session/AddToCalendarRow';
import { useTranslations } from '@/lib/i18n/useTranslations';
import { firstName } from '@/lib/text/firstName';

import TribeWordmark from '@/components/TribeWordmark';
export default function SessionDetailPage({ hostHero = null }: { hostHero?: HeroPhoto | null } = {}) {
  const params = useParams();
  const router = useRouter();
  const { t, language } = useLanguage();
  const supabase = createClient();
  const d = useSessionDetail(params.id as string, language, (path) => router.push(path));
  // T-GROW2: called before any early return so the hook order never changes.
  const myRefCode = useMyReferralCode(d.user?.id);
  const [showPostSessionFlow, setShowPostSessionFlow] = useState(false);
  // T-UI-SD1: the host's "Gestionar" sheet.
  const [showManage, setShowManage] = useState(false);
  const sd = useTranslations('sessionDetail');

  async function shareSession() {
    if (!d.session) return;
    const shareUrl = getSessionShareUrl(d.session.id);
    const titleForShare = publicSessionTitle(
      { title: d.session.title, sport: d.session.sport, creatorName: d.creator?.name ?? null },
      language
    );
    const shareText = language === 'es' ? `${titleForShare} — Únete en Tribe` : `${titleForShare} — Join on Tribe`;
    // A cancelled share sheet is not an error and not a share: nativeShare
    // reports it and nothing happens. It used to be an unhandled rejection
    // that PostHog recorded as an exception on every cancel.
    const native = await nativeShare({ title: shareText, url: shareUrl });
    if (native === 'cancelled') return;
    if (native === 'shared') {
      trackEvent('session_shared', {
        session_id: d.session.id,
        content_type: 'session',
        channel: 'native',
        method: 'native',
      });
      return;
    }
    if (await copyToClipboard(shareUrl)) {
      trackEvent('session_shared', {
        session_id: d.session.id,
        content_type: 'session',
        channel: 'copy',
        method: 'clipboard',
      });
      showSuccess(language === 'es' ? '¡Enlace copiado!' : 'Link copied!');
    }
  }

  // Track session view once on mount
  useEffect(() => {
    if (!d.session) return;
    trackEvent('session_viewed', {
      session_id: d.session.id,
      // T-ANALYTICS1 part D: the in-app page this was opened from.
      source: sessionViewSourceFrom(pathBefore(window.location.pathname)),
      sport: d.session.sport ?? null,
      is_paid: !!d.session.is_paid,
      instructor_id: d.session.creator_id ?? null,
      session_type: d.session.is_paid ? 'paid' : 'free',
      price_cents: d.session.price_cents,
      currency: d.session.currency,
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

  if (d.loading || !d.userChecked)
    return (
      <div className="min-h-screen bg-theme-page">
        <LoadingSpinner className="flex items-center justify-center min-h-screen" />
      </div>
    );
  if (!d.session) {
    // BUG-001: only show "Session not found" when the row is truly absent.
    // Transient/RLS/network errors get a retryable error state, not the
    // confusing "not found" page on top of a session that exists.
    const isTrulyNotFound = d.loadError === 'session_not_found';
    return (
      <div className="min-h-screen bg-theme-page pb-nav">
        <div className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-theme-header border-b border-theme">
          <div className="max-w-2xl md:max-w-4xl mx-auto h-14 flex items-center gap-3 px-4">
            <Link href="/" className="p-2 -ml-2 min-w-[44px] min-h-[44px] flex items-center justify-center">
              <ArrowLeft className="w-6 h-6 text-theme-primary hover:opacity-70" />
            </Link>
            <TribeWordmark className="h-5 w-auto" />
          </div>
        </div>
        <div className="pt-header flex items-center justify-center min-h-[60vh]">
          <div className="text-center p-6">
            <div className="text-4xl mb-4">{isTrulyNotFound ? '🔍' : '⚠️'}</div>
            <p className="text-lg font-semibold text-theme-primary mb-2">
              {isTrulyNotFound
                ? t('sessionNotFound')
                : language === 'es'
                  ? 'No se pudo cargar la sesión'
                  : "Couldn't load the session"}
            </p>
            <p className="text-sm text-theme-tertiary mb-6">
              {isTrulyNotFound
                ? t('checkConnectionRetry')
                : language === 'es'
                  ? 'Revisa tu conexión y vuelve a intentar.'
                  : 'Check your connection and try again.'}
            </p>
            {isTrulyNotFound ? (
              <Link
                href="/"
                className="inline-block px-6 py-3 bg-tribe-green text-slate-900 font-bold rounded-lg hover:bg-lime-500 transition"
              >
                {t('goHome')}
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => d.reload()}
                className="inline-block px-6 py-3 bg-tribe-green text-slate-900 font-bold rounded-lg hover:bg-lime-500 transition"
              >
                {language === 'es' ? 'Reintentar' : 'Retry'}
              </button>
            )}
          </div>
        </div>
        <BottomNav />
      </div>
    );
  }

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
  // T-JOIN1b: a test session is for its host and the admins only (the server
  // layout already answered 404 to anyone else; this covers in-app navigation).
  const isTestSession = !!(d.session as { is_test?: boolean | null }).is_test;
  const isCancelled = d.session.status === 'cancelled';
  if (isTestSession && !isCreator) {
    if (!d.adminChecked)
      return (
        <div className="min-h-screen bg-theme-page">
          <LoadingSpinner className="flex items-center justify-center min-h-screen" />
        </div>
      );
    if (!d.userIsAdmin) notFound();
  }
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
  // payment_instructions is free-text where instructors put personal payment
  // rails (Nequi/Daviplata/account numbers). /session/[id] is a PUBLIC route,
  // so it must never render for a logged-out visitor. Host, or any viewer
  // holding a participant row — hasJoined is confirmed-only, so isPending is
  // included deliberately: with no enforced payment step there is no reason to
  // withhold it from someone who has already requested.
  const canViewPaymentInstructions = !!d.user && (isCreator || d.hasJoined || d.isPending);
  const currentPhotos =
    d.photoType === 'location' ? d.session.photos : d.recapPhotos.map((p: RecapPhotoWithUser) => p.photo_url);

  // T-JOIN1 Part B: someone not signed in (every share link lands here) gets
  // the Jornada-frame page with the guest request; the signed-in page below is
  // unchanged.
  // venue is set only for an approved, active partner (lib/sessionGym.ts).
  const gymName = d.gym?.venue?.business_name ?? null;
  // "<Deporte> con <Nombre>" for a session with no title (T-JOIN1 decision 5).
  const displayTitle = publicSessionTitle(
    { title: d.session.title, sport: d.session.sport, creatorName: d.creator?.name ?? null },
    language
  );
  // T-UI-SD1: one primary action per role in a bar pinned to the bottom; no
  // bar on a cancelled session (nothing to book or manage).
  const showActionBar = !isCancelled;
  const isPaidSession = !!d.session.is_paid && d.session.price_cents > 0;
  const isSeriesMember = !!d.session.is_recurring || d.session.recurring_parent_id != null;
  const isSeriesParent = !!d.session.is_recurring && d.session.recurring_parent_id == null;
  const hostFirstName = d.creator?.name ? firstName(d.creator.name) : '';

  if (!d.user) {
    return (
      <SignedOutSession
        session={d.session as unknown as PublicSession}
        creator={
          d.creator
            ? { id: d.creator.id, name: d.creator.name ?? null, avatar_url: d.creator.avatar_url ?? null }
            : null
        }
        gymName={gymName}
        language={language}
        isPast={isPast}
        isFull={isFull}
      />
    );
  }

  return (
    <div
      className="min-h-screen bg-theme-page pb-nav"
      style={showActionBar ? { paddingBottom: ACTION_BAR_CLEARANCE } : undefined}
    >
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
        {/* T-JOIN1b: a test session says so to the two people who can see it; a
            cancelled one says so to everyone and points at the host's page. */}
        {isTestSession && <SessionStatusNotice kind={isCreator ? 'testHost' : 'testAdmin'} />}
        {isCancelled && (
          <SessionStatusNotice kind="cancelled" hostId={d.session.creator_id} hostName={d.creator?.name ?? null} />
        )}
        {/* T-JOIN1 Part B poster; T-UI-SD1: every session opens with it, on
            the host's coach-card photo (never the session's own photos, which
            stay in "Fotos del Lugar"), or with no photo. */}
        <div className="mx-auto max-w-md overflow-hidden rounded-xl">
          <SessionPoster
            session={d.session as unknown as PosterSession}
            creatorName={d.creator?.name ?? null}
            gymName={gymName}
            language={language}
            priceTag={false}
            photo={hostHero}
          />
        </div>
        <SessionDetails
          gym={d.gym}
          coachCount={d.gymCoachCount}
          session={d.session}
          creator={d.creator}
          participants={d.participants}
          isFull={isFull}
          language={language}
          isCreator={isCreator}
          canViewPaymentInstructions={canViewPaymentInstructions}
          paymentInstructions={d.paymentInstructions}
          onOpenLightbox={d.openLightbox}
        />

        {/* Share button — BUG-022: previously bg-theme-surface blended into
            the page background. Tribe-green pill gives clear contrast in
            light AND dark mode. */}
        {/* T-UI-SD1: athletes share from here (the host shares from the bar). */}
        {!isCreator && <AthleteShareButton sessionId={d.session.id} title={displayTitle} />}

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

        {/* T-UI-SD1: the calendar as one row, for whoever is going. */}
        {(d.hasJoined || isCreator) && !isPast && !isCancelled && (
          <AddToCalendarRow
            sessionId={d.session.id}
            title={displayTitle}
            hostName={d.creator?.name ?? null}
            date={d.session.date}
            startTime={d.session.start_time}
            durationMinutes={d.session.duration}
            location={d.session.location}
            userState={isCreator ? 'creator' : 'joined'}
          />
        )}

        {/* T-GROW2 share moment 2: after joining. A confirmed participant of an
            upcoming session who is not the host, and only once their code has
            loaded, so the card never renders a link with no ref. */}
        {d.user && d.hasJoined && !isCreator && !isPast && myRefCode && (
          <BringAFriendCard
            context={{ kind: 'session', sessionId: d.session.id, title: displayTitle }}
            code={myRefCode}
            language={language}
          />
        )}

        {/* Subscribe to the recurring series — auto-enrolls the athlete in
            future occurrences via the recurring-sessions cron. Only on the
            recurring PARENT, for signed-in non-host, upcoming sessions. */}
        {d.user && !isCreator && !isPast && d.session.is_recurring && (
          <SubscribeButton
            sessionId={d.session.id}
            instructorId={d.session.creator_id}
            userId={d.user.id}
            isRecurring={!!d.session.is_recurring}
            recurrencePattern={d.session.recurrence_pattern || 'weekly'}
            price={d.session.price_cents ? d.session.price_cents / 100 : null}
            currency={d.session.currency || 'COP'}
          />
        )}

        {/* Host-only: pending requests for manual-approval sessions. Curated
            sessions and paid sessions (T-PAY1: off-platform, awaiting payment
            confirmation) both use this panel. */}
        {isCreator &&
          (d.session.join_policy === 'curated' || (!!d.session.is_paid && d.session.price_cents > 0)) &&
          d.user && (
            <PendingRequestsPanel
              sessionId={d.session.id}
              sessionTitle={displayTitle}
              hostId={d.user.id}
              language={language}
              t={t}
              onApproved={() => d.loadSession()}
              isPaid={!!d.session.is_paid && d.session.price_cents > 0}
            />
          )}

        {/* Waitlist — visible when session full or when the viewer has an active offer */}
        <WaitlistPanel
          sessionId={d.session.id}
          userId={d.user?.id ?? null}
          isFull={isFull}
          hasJoined={d.hasJoined}
          isPast={isPast}
          isCreator={isCreator}
          language={language}
          onAccepted={() => d.loadSession()}
        />

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
              {sd('reviewsAbout', { name: hostFirstName })}
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

        {isCreator && (
          <DoorCheckInCard
            sessionId={params.id as string}
            isCreator={isCreator}
            sessionDate={d.session.date}
            sessionStartTime={d.session.start_time}
            sessionStatus={d.session.status}
            language={language}
            onChange={d.reloadSilent}
          />
        )}

        <ParticipantList
          creator={d.creator}
          creatorId={d.session.creator_id}
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
            creatorId={d.session.creator_id}
            isHost={isCreator}
            isAdmin={d.userIsAdmin}
            sessionDate={d.session.date}
            sessionStartTime={d.session.start_time}
            sessionEndTime={d.session.end_time ?? null}
          />
        )}
      </div>

      {showActionBar &&
        (isCreator ? (
          <SessionActionBar role="host" isPast={isPast} onShare={shareSession} onManage={() => setShowManage(true)} />
        ) : (
          <SessionActionBar
            role="athlete"
            state={athleteBarState({
              hasJoined: d.hasJoined,
              isPending: d.isPending,
              isPast,
              isFull,
              isPaid: isPaidSession,
              joinPolicy: d.session.join_policy,
            })}
            isPaid={isPaidSession}
            joining={d.sessionActions.joining}
            onJoin={d.sessionActions.handleJoin}
            onLeave={d.sessionActions.handleLeave}
            paid={
              isPaidSession
                ? {
                    priceCents: d.session.price_cents,
                    currency: d.session.currency || 'COP',
                    paymentInstructions: d.paymentInstructions,
                    canViewPaymentInstructions,
                  }
                : null
            }
            language={language}
          />
        ))}

      {isCreator && (
        <ManageSessionSheet
          open={showManage}
          onClose={() => setShowManage(false)}
          sessionId={d.session.id}
          language={language}
          isTest={isTestSession}
          isPast={isPast}
          isSeriesMember={isSeriesMember}
          isSeriesParent={isSeriesParent}
          creatingInvite={d.creatingInvite}
          onEdit={() => router.push(`/session/${params.id}/edit`)}
          onInvite={d.generateInviteLink}
          onCancel={d.sessionActions.handleCancel}
          onCancelOccurrence={d.sessionActions.handleCancelOccurrence}
          onEndSeries={d.sessionActions.handleEndSeries}
        >
          {/* Tribe.OS premium-only: per-client attendance + payment tracking.
              Renders nothing for a host without Tribe.OS. */}
          <SessionAttendanceSection sessionId={params.id as string} isCreator={isCreator} />
        </ManageSessionSheet>
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

      {/* Post-Session Flow Modal.
          `!isCreator` matters: this flow asks the viewer to RATE THE HOST, and
          without it a host is asked to rate themselves. It is not hypothetical
          -- production holds one review row where reviewer_id = host_id, a
          5-star self-rating, on session 21a301f1-3c77-4551-a527-00d38943362e,
          which is one of the 23 sessions migration 169 cleaned up.

          That is also why the hole is currently unreachable rather than
          harmless: the flow opens on `hasJoined`, which is computed purely from
          session_participants rows, and 169 deleted every host's row. So the
          display was being held shut by a DATA migration. Anything that
          recreates a host participant row reopens it. The guard belongs here,
          next to the SubscribeButton three lines up that already has one. */}
      {d.user && d.creator && !isCreator && (
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
          sessionTitle={displayTitle}
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
