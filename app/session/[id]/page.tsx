'use client';
import { logError } from '@/lib/logger';
import { showSuccess, showError } from '@/lib/toast';
import { getErrorMessage } from '@/lib/errorMessages';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { LogOut, Trash2, X, MessageCircle } from 'lucide-react';
import Link from 'next/link';
import { useLanguage } from '@/lib/LanguageContext';
import AttendanceTracker from '@/components/AttendanceTracker';
import StoryUpload from '@/components/StoryUpload';
import StoryViewer from '@/components/StoryViewer';
import { markStoriesSeen } from '@/components/StoriesRow';

import SessionHeader from '@/components/session/SessionHeader';
import SessionDetails from '@/components/session/SessionDetails';
import ParticipantList from '@/components/session/ParticipantList';
import ReviewSection from '@/components/session/ReviewSection';
import RecapPhotos from '@/components/session/RecapPhotos';
import LiveStatusSection from '@/components/session/LiveStatusSection';
import { fetchSessionWithDetails } from '@/lib/dal';
import { useLiveStatus } from '@/hooks/useLiveStatus';
import { useSessionActions } from '@/hooks/useSessionActions';
import { downloadICS } from '@/lib/calendar';
import type { User as AuthUser } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

type RecapPhotoRow = Database['public']['Tables']['session_recap_photos']['Row'];
type RecapPhotoWithUser = RecapPhotoRow & {
  user: { id: string; name: string | null; avatar_url: string | null } | undefined;
};

type SessionStoryJoined = {
  id: string;
  session_id: string;
  user_id: string;
  media_url: string;
  media_type: string;
  thumbnail_url: string | null;
  caption: string | null;
  created_at: string | null;
  user: { name: string | null; avatar_url: string | null } | null;
};

export default function SessionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClient();
  const { language } = useLanguage();
  // REASON: Session/creator/participants are complex DB shapes — full typing deferred
  const [session, setSession] = useState<any>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const [creator, setCreator] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [userIsAdmin, setUserIsAdmin] = useState(false);
  const [hasJoined, setHasJoined] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [photoType, setPhotoType] = useState<'location' | 'recap'>('location');
  const [touchStart, setTouchStart] = useState(0);
  const [touchEnd, setTouchEnd] = useState(0);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteLink, setInviteLink] = useState('');
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [wasMarkedAttended, setWasMarkedAttended] = useState(false);
  const [recapPhotos, setRecapPhotos] = useState<RecapPhotoWithUser[]>([]);
  const [userPhotoCount, setUserPhotoCount] = useState(0);
  const [hasReviewed, setHasReviewed] = useState(false);
  const [showStoryUpload, setShowStoryUpload] = useState(false);
  const [sessionStories, setSessionStories] = useState<SessionStoryJoined[]>([]);
  const [showStoryViewer, setShowStoryViewer] = useState(false);

  // --- Hooks ---
  const liveStatus = useLiveStatus({
    supabase,
    sessionId: params.id as string,
    sessionDate: session?.date || null,
    user,
    language,
  });

  const sessionActions = useSessionActions({
    supabase,
    sessionId: params.id as string,
    session,
    user,
    language,
    onSessionUpdated: loadSession,
    onNavigate: (path) => router.push(path),
    setParticipants,
    setSession,
  });

  // --- Effects ---
  useEffect(() => {
    checkUser();
    loadSession();
    sessionActions.checkGuestParticipation(params.id as string);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, [params.id]);

  useEffect(() => {
    if (user && session) checkUserReview();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once when session loaded
  }, [user, session]);

  useEffect(() => {
    if (session && !loading) liveStatus.loadLiveStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once when session loaded
  }, [session, user, loading]);

  // Lock body scroll for modals
  useEffect(() => {
    if (lightboxOpen || sessionActions.showGuestModal || showStoryUpload || showStoryViewer) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [lightboxOpen, sessionActions.showGuestModal, showStoryUpload, showStoryViewer]);

  // Lightbox back button handling
  useEffect(() => {
    function handlePopState() {
      if (lightboxOpen) setLightboxOpen(false);
    }
    if (lightboxOpen) {
      const scrollY = window.scrollY;
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
      document.body.style.top = `-${scrollY}px`;
      window.addEventListener('popstate', handlePopState);
    }
    return () => {
      window.removeEventListener('popstate', handlePopState);
      if (lightboxOpen) {
        const scrollY = document.body.style.top;
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.width = '';
        document.body.style.top = '';
        window.scrollTo(0, parseInt(scrollY || '0') * -1);
      }
    };
  }, [lightboxOpen]);

  // --- Data fetching ---
  async function checkUser() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    setUser(user);
    if (user) {
      const { data: profile } = await supabase.from('users').select('is_admin').eq('id', user.id).single();
      setUserIsAdmin(!!profile?.is_admin);
    }
  }

  async function loadSession() {
    try {
      setLoading(true);
      const result = await fetchSessionWithDetails(supabase, params.id as string);
      if (!result.success || !result.data) throw new Error(result.error);

      setSession(result.data.session);
      setCreator(result.data.creator);
      setParticipants(result.data.participants);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) setHasJoined(!!result.data.participants.some((p) => p.user_id === user.id));

      await checkAttendance();
      await loadRecapPhotos();
      await loadSessionStories();
    } catch (error) {
      logError(error, { action: 'loadSession', sessionId: params.id as string });
    } finally {
      setLoading(false);
    }
  }

  async function checkAttendance() {
    if (!user) return;
    const { data } = await supabase
      .from('session_attendance')
      .select('attended')
      .eq('session_id', params.id)
      .eq('user_id', user.id)
      .single();
    setWasMarkedAttended(data?.attended === true);
  }

  async function loadRecapPhotos() {
    try {
      const { data: photosData, error } = await supabase
        .from('session_recap_photos')
        .select('*')
        .eq('session_id', params.id)
        .order('uploaded_at', { ascending: true });
      if (error) throw error;
      if (photosData && photosData.length > 0) {
        const userIds = [...new Set(photosData.map((p) => p.user_id))];
        const { data: usersData } = await supabase.from('users').select('id, name, avatar_url').in('id', userIds);
        setRecapPhotos(photosData.map((photo) => ({ ...photo, user: usersData?.find((u) => u.id === photo.user_id) })));
      } else {
        setRecapPhotos([]);
      }
      if (user) setUserPhotoCount(photosData?.filter((p) => p.user_id === user.id).length || 0);
    } catch (error) {
      logError(error, { action: 'loadRecapPhotos', sessionId: params.id as string });
    }
  }

  async function loadSessionStories() {
    try {
      const { data, error } = await supabase
        .from('session_stories')
        .select(
          'id, session_id, user_id, media_url, media_type, thumbnail_url, caption, created_at, user:users!session_stories_user_id_fkey(name, avatar_url)'
        )
        .eq('session_id', params.id)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: true });
      if (error) throw error;
      setSessionStories((data as unknown as SessionStoryJoined[]) || []);
    } catch (error) {
      logError(error, { action: 'loadSessionStories', sessionId: params.id as string });
    }
  }

  async function checkUserReview() {
    if (!user || !session) return;
    try {
      const { data } = await supabase
        .from('reviews')
        .select('id')
        .eq('session_id', session.id)
        .eq('reviewer_id', user.id)
        .single();
      if (data) setHasReviewed(true);
    } catch {
      // Review check is best-effort; defaults to not reviewed
    }
  }

  async function generateInviteLink() {
    if (!user || !session) return;
    try {
      setCreatingInvite(true);
      const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      const { error } = await supabase
        .from('invite_tokens')
        .insert({ session_id: session.id, token, created_by: user.id });
      if (error) throw error;
      setInviteLink(`${window.location.origin}/invite/${token}`);
      setShowInviteModal(true);
    } catch (error) {
      showError(getErrorMessage(error, 'create_session', language));
    } finally {
      setCreatingInvite(false);
    }
  }

  function copyInviteLink() {
    navigator.clipboard.writeText(inviteLink);
    showSuccess(language === 'es' ? '¡Enlace copiado!' : 'Link copied!');
  }

  function shareInviteLink() {
    if (navigator.share) {
      navigator
        .share({
          title: language === 'es' ? `Únete a mi sesión de ${session.sport}` : `Join me for ${session.sport}`,
          text:
            language === 'es'
              ? `Voy a entrenar ${session.sport} en ${session.location}. ¡Únete!`
              : `I'm training ${session.sport} at ${session.location}. Join me!`,
          url: inviteLink,
        })
        .catch(() => {});
    } else copyInviteLink();
  }

  function openLightbox(index: number, type: 'location' | 'recap') {
    setCurrentPhotoIndex(index);
    setPhotoType(type);
    setLightboxOpen(true);
    history.pushState({ lightbox: true }, '');
  }

  function handleTouchStart(e: React.TouchEvent) {
    setTouchStart(e.targetTouches[0].clientX);
  }
  function handleTouchMove(e: React.TouchEvent) {
    setTouchEnd(e.targetTouches[0].clientX);
  }
  function handleTouchEnd() {
    const photos = photoType === 'location' ? session.photos : recapPhotos.map((p: RecapPhotoWithUser) => p.photo_url);
    if (!photos) return;
    const minSwipeDistance = 50;
    const distance = touchStart - touchEnd;
    if (distance > minSwipeDistance && currentPhotoIndex < photos.length - 1) setCurrentPhotoIndex((prev) => prev + 1);
    if (distance < -minSwipeDistance && currentPhotoIndex > 0) setCurrentPhotoIndex((prev) => prev - 1);
  }

  // --- Computed values ---
  if (loading)
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-[#52575D] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-tribe-green"></div>
      </div>
    );
  if (!session)
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-[#52575D] flex items-center justify-center">
        <p className="text-stone-900 dark:text-white">
          {language === 'es' ? 'Sesión no encontrada' : 'Session not found'}
        </p>
      </div>
    );

  const isPast = (() => {
    const sessionDate = new Date(session.date + 'T00:00:00');
    if (session.start_time) {
      const [hours, minutes] = session.start_time.split(':').map(Number);
      sessionDate.setHours(hours, minutes, 0, 0);
      sessionDate.setMinutes(sessionDate.getMinutes() + (session.duration || 60));
    } else sessionDate.setHours(23, 59, 59, 999);
    return sessionDate < new Date();
  })();
  const isFull = session.current_participants >= session.max_participants;
  const isCreator = session.creator_id === user?.id;
  const canKick = isCreator || userIsAdmin;
  const canUploadRecap = !!user && (isCreator || wasMarkedAttended) && isPast && userPhotoCount < 3;
  const canModerate = isCreator || userIsAdmin;
  const shouldPromptUpload = !!user && isPast && wasMarkedAttended && userPhotoCount === 0;
  const isToday = (() => {
    const now = new Date();
    return (
      session.date ===
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    );
  })();
  const canGoLive = !!user && (hasJoined || isCreator) && isToday && !isPast;
  const currentPhotos =
    photoType === 'location' ? session.photos : recapPhotos.map((p: RecapPhotoWithUser) => p.photo_url);

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-[#52575D] pb-32">
      {/* Lightbox */}
      {lightboxOpen && currentPhotos && (
        <div className="fixed inset-0 bg-black z-[60] flex items-center justify-center overflow-hidden">
          <button
            onClick={() => history.back()}
            className="absolute right-4 min-w-[44px] min-h-[44px] flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-full transition z-10"
            style={{ top: 'max(1rem, env(safe-area-inset-top, 1rem))' }}
          >
            <X className="w-6 h-6 text-white" />
          </button>
          <div
            className="w-full h-full flex items-center justify-center touch-none"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <img
              loading="lazy"
              src={currentPhotos[currentPhotoIndex]}
              alt={`Photo ${currentPhotoIndex + 1}`}
              className="max-w-[90%] max-h-[90%] object-contain transition-opacity duration-300 select-none"
              draggable={false}
            />
          </div>
          <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 flex gap-2">
            {currentPhotos.map((_: string, idx: number) => (
              <button
                key={idx}
                onClick={() => setCurrentPhotoIndex(idx)}
                className={`w-2 h-2 rounded-full transition-all ${idx === currentPhotoIndex ? 'bg-white w-6' : 'bg-white/40'}`}
              />
            ))}
          </div>
          <div className="absolute bottom-4 text-white text-sm">
            {currentPhotoIndex + 1} / {currentPhotos.length}
          </div>
        </div>
      )}

      <SessionHeader
        language={language}
        isCreator={isCreator}
        hasJoined={hasJoined}
        user={user}
        sessionStories={sessionStories}
        onAddStory={() => setShowStoryUpload(true)}
      />

      <div className="pt-header max-w-2xl mx-auto p-4 space-y-4">
        <SessionDetails
          session={session}
          creator={creator}
          participants={participants}
          isFull={isFull}
          language={language}
          onOpenLightbox={openLightbox}
        />

        {/* Live Status */}
        <LiveStatusSection
          canGoLive={canGoLive}
          isLive={liveStatus.isLive}
          liveCountdown={liveStatus.liveCountdown}
          liveUsers={liveStatus.liveUsers}
          goingLive={liveStatus.goingLive}
          language={language}
          onGoLive={liveStatus.handleGoLive}
          onEndLive={liveStatus.handleEndLive}
          onRenewLive={liveStatus.handleRenewLive}
          onShareMoment={() => setShowStoryUpload(true)}
        />

        {/* Action Buttons */}
        <div className="space-y-2">
          {!user ? (
            sessionActions.guestHasJoined ? (
              <button
                onClick={sessionActions.handleGuestLeave}
                className="w-full py-3 bg-orange-500 text-white font-bold rounded-lg hover:bg-orange-600 transition flex items-center justify-center gap-2"
              >
                <LogOut className="w-5 h-5" />
                {language === 'es' ? 'Salir de Sesión' : 'Leave Session'}
              </button>
            ) : isPast ? (
              <button
                disabled
                className="w-full py-3 bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-400 font-bold rounded-lg cursor-not-allowed"
              >
                {language === 'es' ? 'Sesión Terminada' : 'Session Ended'}
              </button>
            ) : isFull ? (
              <button
                disabled
                className="w-full py-3 bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-400 font-bold rounded-lg cursor-not-allowed"
              >
                {language === 'es' ? 'Sesión Llena' : 'Session Full'}
              </button>
            ) : (
              <button
                onClick={() => sessionActions.setShowGuestModal(true)}
                className="w-full py-3 bg-tribe-green text-slate-900 font-bold rounded-lg hover:bg-lime-500 transition"
              >
                {language === 'es' ? 'Unirse como Invitado' : 'Join as Guest'}
              </button>
            )
          ) : isCreator ? (
            <>
              <div className="w-full py-3 bg-blue-100 text-blue-800 font-bold rounded-lg text-center">
                {language === 'es' ? 'Tú organizas esta sesión' : "You're hosting this session"}
              </div>
              {!isPast && (
                <>
                  <button
                    onClick={() => router.push(`/session/${params.id}/edit`)}
                    className="w-full py-3 bg-tribe-green text-slate-900 font-bold rounded-lg hover:bg-lime-500 transition flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                      />
                    </svg>
                    {language === 'es' ? 'Editar Sesión' : 'Edit Session'}
                  </button>
                  <button
                    onClick={sessionActions.handleCancel}
                    className="w-full py-3 bg-red-500 text-white font-bold rounded-lg hover:bg-red-600 transition flex items-center justify-center gap-2"
                  >
                    <Trash2 className="w-5 h-5" />
                    {language === 'es' ? 'Cancelar Sesión' : 'Cancel Session'}
                  </button>
                </>
              )}
            </>
          ) : hasJoined ? (
            <button
              onClick={sessionActions.handleLeave}
              className="w-full py-3 bg-orange-500 text-white font-bold rounded-lg hover:bg-orange-600 transition flex items-center justify-center gap-2"
            >
              <LogOut className="w-5 h-5" />
              {language === 'es' ? 'Salir de Sesión' : 'Leave Session'}
            </button>
          ) : isPast ? (
            <button
              disabled
              className="w-full py-3 bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-400 font-bold rounded-lg cursor-not-allowed"
            >
              {language === 'es' ? 'Sesión Terminada' : 'Session Ended'}
            </button>
          ) : isFull ? (
            <button
              disabled
              className="w-full py-3 bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-400 font-bold rounded-lg cursor-not-allowed"
            >
              {language === 'es' ? 'Sesión Llena' : 'Session Full'}
            </button>
          ) : (
            <button
              onClick={sessionActions.handleJoin}
              disabled={sessionActions.joining}
              className="w-full py-3 bg-tribe-green text-slate-900 font-bold rounded-lg hover:bg-lime-500 disabled:opacity-50 transition"
            >
              {sessionActions.joining
                ? language === 'es'
                  ? 'Uniéndose...'
                  : 'Joining...'
                : language === 'es'
                  ? 'Unirse a la Sesión'
                  : 'Join Session'}
            </button>
          )}

          {hasJoined && !isPast && (
            <Link
              href={`/session/${params.id}/chat`}
              className="w-full py-3 bg-stone-700 text-white font-bold rounded-lg hover:bg-stone-600 transition flex items-center justify-center gap-2"
            >
              <MessageCircle className="w-5 h-5" />
              {language === 'es' ? 'Chat de Grupo' : 'Group Chat'}
            </Link>
          )}
          {hasJoined && !isPast && (
            <button
              onClick={generateInviteLink}
              disabled={creatingInvite}
              className="w-full py-3 bg-blue-500 text-white font-bold rounded-lg hover:bg-blue-600 transition disabled:opacity-50"
            >
              {creatingInvite
                ? language === 'es'
                  ? 'Generando...'
                  : 'Generating...'
                : language === 'es'
                  ? 'Invitar Amigo'
                  : 'Invite Friend'}
            </button>
          )}
          {hasJoined && (
            <button
              onClick={() =>
                downloadICS({
                  sport: session.sport,
                  date: session.date,
                  start_time: session.start_time,
                  duration: session.duration,
                  location: session.location,
                  description: session.description,
                  creatorName: session.creator?.name,
                  sessionId: session.id,
                })
              }
              className="w-full py-3 border-2 border-tribe-green text-tribe-green dark:text-tribe-green font-bold rounded-lg hover:bg-tribe-green hover:text-slate-900 transition flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              {language === 'es' ? 'Añadir al Calendario' : 'Add to Calendar'}
            </button>
          )}
        </div>

        {/* Recap Photos */}
        <RecapPhotos
          session={session}
          recapPhotos={recapPhotos}
          user={user}
          isPast={isPast}
          canUploadRecap={canUploadRecap}
          canModerate={canModerate}
          shouldPromptUpload={shouldPromptUpload}
          userPhotoCount={userPhotoCount}
          language={language}
          onOpenLightbox={openLightbox}
          onPhotosChanged={loadRecapPhotos}
        />

        {/* Review Section */}
        <ReviewSection
          session={session}
          user={user}
          isCreator={isCreator}
          hasJoined={hasJoined}
          isPast={isPast}
          hasReviewed={hasReviewed}
          language={language}
          onReviewSubmitted={() => {
            setHasReviewed(true);
            loadSession();
          }}
        />

        {/* Session Stories Thumbnails */}
        {sessionStories.length > 0 && (
          <div className="bg-white dark:bg-[#6B7178] rounded-xl p-4 shadow-lg">
            <h2 className="text-sm font-bold text-stone-900 dark:text-white mb-3">
              {language === 'es' ? 'Historias' : 'Stories'} ({sessionStories.length})
            </h2>
            <div
              className="flex gap-2 overflow-x-auto pb-1"
              style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              {sessionStories.map((story: SessionStoryJoined) => (
                <button
                  key={story.id}
                  onClick={() => setShowStoryViewer(true)}
                  className="flex-shrink-0 w-20 h-20 rounded-xl overflow-hidden border-2 border-stone-200 dark:border-gray-600 hover:border-tribe-green transition active:scale-95 relative"
                >
                  {story.media_type === 'video' && story.thumbnail_url ? (
                    <img loading="lazy" src={story.thumbnail_url} alt="" className="w-full h-full object-cover" />
                  ) : story.media_type === 'video' ? (
                    <div className="w-full h-full bg-stone-800 flex items-center justify-center">
                      <span className="text-white text-xl">▶</span>
                    </div>
                  ) : (
                    <img loading="lazy" src={story.media_url} alt="" className="w-full h-full object-cover" />
                  )}
                  <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5">
                    <span className="text-white text-[9px] truncate block">{story.user?.name}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Participants */}
        <ParticipantList
          creator={creator}
          participants={participants}
          canKick={canKick}
          language={language}
          onKickUser={sessionActions.handleKickUser}
        />

        {/* Attendance Tracker */}
        {user && (
          <AttendanceTracker
            sessionId={params.id as string}
            isHost={isCreator}
            isAdmin={userIsAdmin}
            sessionDate={session.date}
          />
        )}
      </div>

      {/* Guest Join Modal */}
      {sessionActions.showGuestModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#6B7178] rounded-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-theme-primary">
                {language === 'es' ? 'Unirse como Invitado' : 'Join as Guest'}
              </h3>
              <button
                onClick={() => sessionActions.setShowGuestModal(false)}
                className="p-2 hover:bg-stone-100 dark:hover:bg-[#52575D] rounded"
              >
                <X className="w-5 h-5 text-theme-primary" />
              </button>
            </div>
            <p className="text-sm text-stone-600 dark:text-gray-300 mb-4">
              {language === 'es'
                ? 'Ingresa tus datos para confirmar tu asistencia'
                : 'Enter your details to confirm attendance'}
            </p>
            <div className="space-y-3">
              <input
                type="text"
                placeholder={language === 'es' ? 'Nombre completo *' : 'Full name *'}
                value={sessionActions.guestData.name}
                onChange={(e) => sessionActions.setGuestData({ ...sessionActions.guestData, name: e.target.value })}
                className="w-full px-4 py-3 border border-stone-300 dark:border-[#52575D] rounded-lg bg-white dark:bg-[#52575D] text-theme-primary"
              />
              <input
                type="tel"
                placeholder={language === 'es' ? 'Teléfono *' : 'Phone *'}
                value={sessionActions.guestData.phone}
                onChange={(e) => sessionActions.setGuestData({ ...sessionActions.guestData, phone: e.target.value })}
                className="w-full px-4 py-3 border border-stone-300 dark:border-[#52575D] rounded-lg bg-white dark:bg-[#52575D] text-theme-primary"
              />
              <input
                type="email"
                placeholder={language === 'es' ? 'Email (opcional)' : 'Email (optional)'}
                value={sessionActions.guestData.email}
                onChange={(e) => sessionActions.setGuestData({ ...sessionActions.guestData, email: e.target.value })}
                className="w-full px-4 py-3 border border-stone-300 dark:border-[#52575D] rounded-lg bg-white dark:bg-[#52575D] text-theme-primary"
              />
            </div>
            <button
              onClick={sessionActions.handleGuestJoin}
              disabled={sessionActions.joiningAsGuest}
              className="w-full mt-4 py-3 bg-tribe-green text-slate-900 font-bold rounded-lg hover:bg-lime-500 disabled:opacity-50"
            >
              {sessionActions.joiningAsGuest
                ? language === 'es'
                  ? 'Confirmando...'
                  : 'Confirming...'
                : language === 'es'
                  ? 'Confirmar Asistencia'
                  : 'Confirm Attendance'}
            </button>
            <p className="text-xs text-center text-stone-500 dark:text-gray-400 mt-3">
              {language === 'es' ? '¿Ya tienes cuenta?' : 'Already have an account?'}{' '}
              <a href="/auth" className="text-tribe-green hover:underline">
                {language === 'es' ? 'Inicia sesión' : 'Sign in'}
              </a>
            </p>
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#6B7178] rounded-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-theme-primary">
                {language === 'es' ? 'Invitar Amigo' : 'Invite Friend'}
              </h3>
              <button
                onClick={() => setShowInviteModal(false)}
                className="p-2 hover:bg-stone-100 dark:hover:bg-[#52575D] rounded"
              >
                <X className="w-5 h-5 text-theme-primary" />
              </button>
            </div>
            <p className="text-sm text-stone-600 dark:text-gray-300 mb-4">
              {language === 'es'
                ? 'Comparte este enlace con amigos para que se unan sin necesidad de crear cuenta'
                : 'Share this link with friends so they can join without creating an account'}
            </p>
            <div className="bg-stone-50 dark:bg-[#52575D] p-3 rounded-lg mb-4 break-all text-sm">{inviteLink}</div>
            <div className="flex gap-3">
              <button
                onClick={copyInviteLink}
                className="flex-1 py-3 bg-stone-200 dark:bg-[#52575D] text-theme-primary font-medium rounded-lg hover:bg-stone-300 dark:hover:bg-[#6B7178]"
              >
                {language === 'es' ? 'Copiar' : 'Copy'}
              </button>
              <button
                onClick={shareInviteLink}
                className="flex-1 py-3 bg-tribe-green text-slate-900 font-medium rounded-lg hover:bg-lime-500"
              >
                {language === 'es' ? 'Compartir' : 'Share'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Story Upload Modal */}
      {showStoryUpload && user && (
        <StoryUpload
          sessionId={session.id}
          userId={user.id}
          onClose={() => setShowStoryUpload(false)}
          onUploaded={() => loadSessionStories()}
        />
      )}

      {/* Story Viewer */}
      {showStoryViewer && sessionStories.length > 0 && session && (
        <StoryViewer
          groups={[
            {
              sessionId: session.id,
              sport: session.sport,
              stories: sessionStories.map((s: SessionStoryJoined) => ({
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
          currentUserId={user?.id}
          onClose={() => setShowStoryViewer(false)}
          onStorySeen={(ids: string[]) => markStoriesSeen(ids)}
          onStoryDeleted={() => loadSessionStories()}
        />
      )}
    </div>
  );
}
