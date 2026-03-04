/** Hook: useSessionDetail — all state, effects, and data-fetching for session detail page */
'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { logError } from '@/lib/logger';
import { showError } from '@/lib/toast';
import { getErrorMessage } from '@/lib/errorMessages';
import { fetchSessionWithDetails } from '@/lib/dal';
import { useLiveStatus } from '@/hooks/useLiveStatus';
import { useSessionActions } from '@/hooks/useSessionActions';
import type { User as AuthUser } from '@supabase/supabase-js';
import type { RecapPhotoWithUser, SessionStoryJoined } from './types';

export function useSessionDetail(sessionId: string, language: 'en' | 'es', onNavigate: (path: string) => void) {
  const supabase = createClient();

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

  const liveStatus = useLiveStatus({
    supabase,
    sessionId,
    sessionDate: session?.date || null,
    user,
    language,
  });

  const sessionActions = useSessionActions({
    supabase,
    sessionId,
    session,
    user,
    language,
    onSessionUpdated: loadSession,
    onNavigate,
    setParticipants,
    setSession,
  });

  // --- Effects ---
  useEffect(() => {
    checkUser();
    loadSession();
    sessionActions.checkGuestParticipation(sessionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, [sessionId]);

  useEffect(() => {
    if (user && session) checkUserReview();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once when session loaded
  }, [user, session]);

  useEffect(() => {
    if (session && !loading) liveStatus.loadLiveStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once when session loaded
  }, [session, user, loading]);

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
      const result = await fetchSessionWithDetails(supabase, sessionId);
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
      logError(error, { action: 'loadSession', sessionId });
    } finally {
      setLoading(false);
    }
  }

  async function checkAttendance() {
    if (!user) return;
    const { data } = await supabase
      .from('session_attendance')
      .select('attended')
      .eq('session_id', sessionId)
      .eq('user_id', user.id)
      .single();
    setWasMarkedAttended(data?.attended === true);
  }

  async function loadRecapPhotos() {
    try {
      const { data: photosData, error } = await supabase
        .from('session_recap_photos')
        .select('*')
        .eq('session_id', sessionId)
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
      logError(error, { action: 'loadRecapPhotos', sessionId });
    }
  }

  async function loadSessionStories() {
    try {
      const { data, error } = await supabase
        .from('session_stories')
        .select(
          'id, session_id, user_id, media_url, media_type, thumbnail_url, caption, created_at, user:users!session_stories_user_id_fkey(name, avatar_url)'
        )
        .eq('session_id', sessionId)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: true });
      if (error) throw error;
      setSessionStories((data as unknown as SessionStoryJoined[]) || []);
    } catch (error) {
      logError(error, { action: 'loadSessionStories', sessionId });
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

  function openLightbox(index: number, type: 'location' | 'recap') {
    setCurrentPhotoIndex(index);
    setPhotoType(type);
    setLightboxOpen(true);
    history.pushState({ lightbox: true }, '');
  }

  return {
    session,
    creator,
    participants,
    loading,
    user,
    userIsAdmin,
    hasJoined,
    lightboxOpen,
    currentPhotoIndex,
    photoType,
    showInviteModal,
    inviteLink,
    creatingInvite,
    recapPhotos,
    userPhotoCount,
    hasReviewed,
    wasMarkedAttended,
    showStoryUpload,
    sessionStories,
    showStoryViewer,
    liveStatus,
    sessionActions,
    loadSession,
    loadRecapPhotos,
    loadSessionStories,
    generateInviteLink,
    openLightbox,
    setShowStoryUpload,
    setShowStoryViewer,
    setShowInviteModal,
    setHasReviewed,
  };
}
