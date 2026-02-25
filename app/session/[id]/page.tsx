'use client';
import { formatTime12Hour } from "@/lib/utils";
import { showSuccess, showError, showInfo } from '@/lib/toast';
import { getErrorMessage } from "@/lib/errorMessages";
import { celebrateJoin } from "@/lib/confetti";

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
import { joinSession } from '@/lib/sessions';

import SessionHeader from '@/components/session/SessionHeader';
import SessionDetails from '@/components/session/SessionDetails';
import ParticipantList from '@/components/session/ParticipantList';
import ReviewSection from '@/components/session/ReviewSection';
import RecapPhotos from '@/components/session/RecapPhotos';
import LiveStatusSection from '@/components/session/LiveStatusSection';
import { fetchSessionWithDetails, cancelSession } from '@/lib/dal';

export default function SessionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClient();
  const { language } = useLanguage();
  const [session, setSession] = useState<any>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const [creator, setCreator] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [userIsAdmin, setUserIsAdmin] = useState(false);
  const [hasJoined, setHasJoined] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [photoType, setPhotoType] = useState<'location' | 'recap'>('location');
  const [touchStart, setTouchStart] = useState(0);
  const [touchEnd, setTouchEnd] = useState(0);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteLink, setInviteLink] = useState("");
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [wasMarkedAttended, setWasMarkedAttended] = useState(false);
  const [recapPhotos, setRecapPhotos] = useState<any[]>([]);
  const [showGuestModal, setShowGuestModal] = useState(false);
  const [guestData, setGuestData] = useState({ name: '', phone: '', email: '' });
  const [joiningAsGuest, setJoiningAsGuest] = useState(false);
  const [joining, setJoining] = useState(false);
  const [userPhotoCount, setUserPhotoCount] = useState(0);
  const [guestHasJoined, setGuestHasJoined] = useState(false);
  const [guestParticipantId, setGuestParticipantId] = useState<string | null>(null);
  const [hasReviewed, setHasReviewed] = useState(false);
  const [showStoryUpload, setShowStoryUpload] = useState(false);
  const [sessionStories, setSessionStories] = useState<any[]>([]);
  const [showStoryViewer, setShowStoryViewer] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [liveExpiresAt, setLiveExpiresAt] = useState<Date | null>(null);
  const [liveCountdown, setLiveCountdown] = useState('');
  const [liveUsers, setLiveUsers] = useState<Array<{
    user_id: string;
    name: string;
    avatar_url: string | null;
    started_at: string;
  }>>([]);
  const [goingLive, setGoingLive] = useState(false);

  // --- Effects ---
  useEffect(() => {
    checkUser();
    loadSession();
    checkGuestParticipation();
  }, [params.id]);

  useEffect(() => {
    if (user && session) checkUserReview();
  }, [user, session]);

  useEffect(() => {
    if (session && !loading) loadLiveStatus();
  }, [session, user, loading]);

  // Ping last_ping every 60s while live
  useEffect(() => {
    if (!isLive || !user) return;
    const interval = setInterval(async () => {
      try {
        await supabase
          .from('live_status')
          .update({ last_ping: new Date().toISOString() })
          .eq('user_id', user.id)
          .eq('session_id', params.id as string);
      } catch {}
    }, 60000);
    return () => clearInterval(interval);
  }, [isLive, user]);

  // Countdown timer every 1s while live
  useEffect(() => {
    if (!isLive || !liveExpiresAt) return;
    const interval = setInterval(() => {
      const remaining = liveExpiresAt.getTime() - Date.now();
      if (remaining <= 0) {
        setIsLive(false);
        setLiveExpiresAt(null);
        setLiveCountdown('');
        loadLiveStatus();
        return;
      }
      const mins = Math.floor(remaining / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);
      setLiveCountdown(`${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [isLive, liveExpiresAt]);

  // Poll live users every 30s for today's sessions
  useEffect(() => {
    if (!session) return;
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    if (session.date !== todayStr) return;
    const interval = setInterval(() => loadLiveStatus(), 30000);
    return () => clearInterval(interval);
  }, [session]);

  // Lock body scroll for modals
  useEffect(() => {
    if (lightboxOpen || showGuestModal || showStoryUpload || showStoryViewer) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [lightboxOpen, showGuestModal, showStoryUpload, showStoryViewer]);

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
    const { data: { user } } = await supabase.auth.getUser();
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

      const { data: { user } } = await supabase.auth.getUser();
      if (user) setHasJoined(!!result.data.participants.some(p => p.user_id === user.id));

      await checkAttendance();
      await loadRecapPhotos();
      await loadSessionStories();
    } catch (error) {
      console.error('Error loading session:', error);
    } finally {
      setLoading(false);
    }
  }

  async function checkAttendance() {
    if (!user) return;
    const { data } = await supabase.from("session_attendance").select("attended").eq("session_id", params.id).eq("user_id", user.id).single();
    setWasMarkedAttended(data?.attended === true);
  }

  async function loadRecapPhotos() {
    try {
      const { data: photosData, error } = await supabase.from('session_recap_photos').select('*').eq('session_id', params.id).order('uploaded_at', { ascending: true });
      if (error) throw error;
      if (photosData && photosData.length > 0) {
        const userIds = [...new Set(photosData.map(p => p.user_id))];
        const { data: usersData } = await supabase.from('users').select('id, name, avatar_url').in('id', userIds);
        setRecapPhotos(photosData.map(photo => ({ ...photo, user: usersData?.find(u => u.id === photo.user_id) })));
      } else {
        setRecapPhotos([]);
      }
      if (user) setUserPhotoCount(photosData?.filter(p => p.user_id === user.id).length || 0);
    } catch (error) {
      console.error('Error loading recap photos:', error);
    }
  }

  async function loadSessionStories() {
    try {
      const { data, error } = await supabase
        .from('session_stories')
        .select('id, session_id, user_id, media_url, media_type, thumbnail_url, caption, created_at, user:users!session_stories_user_id_fkey(name, avatar_url)')
        .eq('session_id', params.id)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: true });
      if (error) throw error;
      setSessionStories(data || []);
    } catch (error) {
      console.error('Error loading session stories:', error);
    }
  }

  async function loadLiveStatus() {
    try {
      if (user) {
        const { data: myLive } = await supabase.from('live_status').select('expires_at').eq('session_id', params.id).eq('user_id', user.id).gt('expires_at', new Date().toISOString()).maybeSingle();
        if (myLive) { setIsLive(true); setLiveExpiresAt(new Date(myLive.expires_at)); }
        else { setIsLive(false); setLiveExpiresAt(null); }
      }
      const { data: liveData } = await supabase.from('live_status').select('user_id, started_at, user:users(name, avatar_url)').eq('session_id', params.id).gt('expires_at', new Date().toISOString());
      if (liveData) {
        setLiveUsers(liveData.map((row: any) => ({ user_id: row.user_id, name: (row.user as any)?.name || 'Unknown', avatar_url: (row.user as any)?.avatar_url || null, started_at: row.started_at })));
      }
    } catch (error) { console.error('Error loading live status:', error); }
  }

  async function checkUserReview() {
    if (!user || !session) return;
    try {
      const { data } = await supabase.from('reviews').select('id').eq('session_id', session.id).eq('reviewer_id', user.id).single();
      if (data) setHasReviewed(true);
    } catch {}
  }

  async function checkGuestParticipation() {
    const storedGuestPhone = localStorage.getItem(`guest_phone_${params.id}`);
    const storedGuestEmail = localStorage.getItem(`guest_email_${params.id}`);
    if (!storedGuestPhone && !storedGuestEmail) return;
    try {
      let query = supabase.from('session_participants').select('id').eq('session_id', params.id).eq('is_guest', true);
      if (storedGuestPhone) query = query.eq('guest_phone', storedGuestPhone);
      else if (storedGuestEmail) query = query.eq('guest_email', storedGuestEmail);
      const { data, error } = await query.single();
      if (!error && data) { setGuestHasJoined(true); setGuestParticipantId(data.id); }
      else { localStorage.removeItem(`guest_phone_${params.id}`); localStorage.removeItem(`guest_email_${params.id}`); setGuestHasJoined(false); setGuestParticipantId(null); }
    } catch (error) { console.error('Error checking guest participation:', error); }
  }

  // --- Handlers ---
  async function handleJoin() {
    if (!user) { setShowGuestModal(true); return; }
    if (joining) return;
    setJoining(true);
    try {
      const result = await joinSession({ supabase, sessionId: session.id, userId: user.id, userName: user.user_metadata?.name || user.email || 'Someone' });
      if (!result.success) {
        const errorMessages: Record<string, string> = {
          session_not_found: language === 'es' ? 'Sesión no encontrada' : 'Session not found',
          session_not_active: language === 'es' ? 'Esta sesión ya no está activa' : 'This session is no longer active',
          self_join: language === 'es' ? '¡No puedes unirte a tu propia sesión!' : 'You cannot join your own session!',
          already_joined: language === 'es' ? '¡Ya te uniste a esta sesión!' : 'You already joined this session!',
          capacity_full: language === 'es' ? 'Esta sesión está llena' : 'This session is full',
          invite_only: language === 'es' ? 'Sesión privada. Necesitas una invitación del organizador.' : 'This is a private session. You need a direct invitation from the host.',
        };
        showInfo(errorMessages[result.error!] || result.error || 'Could not join session');
        return;
      }
      if (result.status === 'pending') {
        showSuccess(language === 'es' ? '¡Solicitud enviada! El organizador revisará tu perfil.' : 'Request sent! The host will review your profile and decide.');
      } else {
        celebrateJoin();
        showSuccess(language === 'es' ? '¡Estás dentro! Nunca entrenarás solo.' : "You're in! You'll never train alone.");
      }
      await loadSession();
    } catch (error: any) {
      showError(getErrorMessage(error, 'join_session', language));
    } finally { setJoining(false); }
  }

  async function handleGuestJoin() {
    if (!guestData.name || !guestData.phone) { showError(language === "es" ? "Completa nombre y teléfono" : "Fill in name and phone"); return; }
    try {
      setJoiningAsGuest(true);
      const { data, error } = await supabase.from("session_participants").insert({ session_id: session.id, user_id: null, is_guest: true, guest_name: guestData.name, guest_phone: guestData.phone, guest_email: guestData.email || null, status: "confirmed" }).select('id').single();
      if (error) throw error;
      await supabase.from("sessions").update({ current_participants: session.current_participants + 1 }).eq("id", session.id);
      localStorage.setItem(`guest_phone_${session.id}`, guestData.phone);
      if (guestData.email) localStorage.setItem(`guest_email_${session.id}`, guestData.email);
      setGuestHasJoined(true);
      setGuestParticipantId(data.id);
      fetch('/api/notifications/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: session.creator_id, title: '🎉 New Training Partner!', body: `${guestData.name} (guest) joined your ${session.sport} session`, url: `/session/${session.id}`, data: { sessionId: session.id, type: 'guest_join' } }) }).catch(err => console.error('Failed to notify host:', err));
      showSuccess(language === "es" ? "¡Confirmado! Te esperamos" : "Confirmed! See you there");
      setShowGuestModal(false);
      celebrateJoin();
      loadSession();
    } catch (error: any) { showError(getErrorMessage(error, 'join_session', language)); }
    finally { setJoiningAsGuest(false); }
  }

  async function handleGuestLeave() {
    if (!confirm(language === 'es' ? '¿Seguro que quieres salir de esta sesión?' : 'Are you sure you want to leave this session?')) return;
    const storedGuestPhone = localStorage.getItem(`guest_phone_${params.id}`);
    if (!storedGuestPhone) { showError(language === 'es' ? 'No se encontró la información del invitado' : 'Guest information not found'); return; }
    try {
      const { error } = await supabase.from('session_participants').delete().eq('session_id', params.id).eq('is_guest', true).eq('guest_phone', storedGuestPhone);
      if (error) throw error;
      await supabase.from('sessions').update({ current_participants: Math.max(0, session.current_participants - 1) }).eq('id', session.id);
      localStorage.removeItem(`guest_phone_${params.id}`);
      localStorage.removeItem(`guest_email_${params.id}`);
      setGuestHasJoined(false); setGuestParticipantId(null);
      showSuccess(language === 'es' ? 'Has salido de la sesión' : 'You have left the session');
      loadSession();
    } catch (error: any) { showError(getErrorMessage(error, 'join_session', language)); }
  }

  async function handleLeave() {
    if (!confirm('Are you sure you want to leave this session?')) return;
    try {
      const { error } = await supabase.from('session_participants').delete().eq('session_id', session.id).eq('user_id', user.id);
      if (error) throw error;
      await supabase.from('sessions').update({ current_participants: session.current_participants - 1 }).eq('id', session.id);
      showSuccess(language === 'es' ? 'Has salido de la sesión' : 'You have left the session');
      router.push('/sessions');
    } catch (error: any) { showError(getErrorMessage(error, 'join_session', language)); }
  }

  async function handleCancel() {
    if (!confirm('⚠️ Cancel this session? All participants will be notified. This cannot be undone.')) return;
    try {
      const result = await cancelSession(supabase, session.id);
      if (!result.success) throw new Error(result.error);
      showSuccess(language === 'es' ? 'Sesión cancelada' : 'Session cancelled');
      router.push('/sessions');
    } catch (error: any) { showError(getErrorMessage(error, 'delete_session', language)); }
  }

  async function handleKickUser(userId: string, userName: string) {
    if (!confirm(`Remove ${userName} from this session?`)) return;
    try {
      const { error: deleteError } = await supabase.from('session_participants').delete().eq('session_id', session.id).eq('user_id', userId);
      if (deleteError) throw deleteError;
      await supabase.from('sessions').update({ current_participants: Math.max(0, session.current_participants - 1) }).eq('id', session.id);
      setParticipants(prev => prev.filter(p => p.user_id !== userId));
      setSession((prev: any) => ({ ...prev, current_participants: Math.max(0, prev.current_participants - 1) }));
      showSuccess('User removed from session');
    } catch (error: any) { showError(getErrorMessage(error, 'join_session', language)); }
  }

  async function generateInviteLink() {
    if (!user || !session) return;
    try {
      setCreatingInvite(true);
      const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      const { error } = await supabase.from('invite_tokens').insert({ session_id: session.id, token, created_by: user.id });
      if (error) throw error;
      setInviteLink(`${window.location.origin}/invite/${token}`);
      setShowInviteModal(true);
    } catch (error: any) { showError(getErrorMessage(error, 'create_session', language)); }
    finally { setCreatingInvite(false); }
  }

  function copyInviteLink() { navigator.clipboard.writeText(inviteLink); showSuccess(language === 'es' ? '¡Enlace copiado!' : 'Link copied!'); }

  function shareInviteLink() {
    if (navigator.share) {
      navigator.share({ title: language === 'es' ? `Únete a mi sesión de ${session.sport}` : `Join me for ${session.sport}`, text: language === 'es' ? `Voy a entrenar ${session.sport} en ${session.location}. ¡Únete!` : `I'm training ${session.sport} at ${session.location}. Join me!`, url: inviteLink }).catch(() => {});
    } else copyInviteLink();
  }

  async function handleGoLive() {
    if (!user) return;
    setGoingLive(true);
    try {
      const { error } = await supabase.from('live_status').upsert({ user_id: user.id, session_id: params.id as string, started_at: new Date().toISOString(), expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(), last_ping: new Date().toISOString() }, { onConflict: 'user_id,session_id' });
      if (error) throw error;
      setIsLive(true); setLiveExpiresAt(new Date(Date.now() + 15 * 60 * 1000));
      showSuccess(language === 'es' ? '¡Estás en vivo!' : "You're live!");
      await loadLiveStatus();
    } catch (error: any) { showError(language === 'es' ? 'Error al iniciar live' : 'Failed to go live'); }
    finally { setGoingLive(false); }
  }

  async function handleEndLive() {
    if (!user) return;
    try {
      await supabase.from('live_status').delete().eq('user_id', user.id).eq('session_id', params.id as string);
      setIsLive(false); setLiveExpiresAt(null); setLiveCountdown('');
      showInfo(language === 'es' ? 'Live terminado' : 'Live ended');
      await loadLiveStatus();
    } catch { showError(language === 'es' ? 'Error al terminar live' : 'Failed to end live'); }
  }

  async function handleRenewLive() {
    if (!user) return;
    try {
      const { error } = await supabase.from('live_status').update({ expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(), last_ping: new Date().toISOString() }).eq('user_id', user.id).eq('session_id', params.id as string);
      if (error) throw error;
      setLiveExpiresAt(new Date(Date.now() + 15 * 60 * 1000));
      showSuccess(language === 'es' ? '¡Live renovado 15 min!' : 'Live renewed 15 min!');
    } catch { showError(language === 'es' ? 'Error al renovar' : 'Failed to renew'); }
  }

  function openLightbox(index: number, type: 'location' | 'recap') {
    setCurrentPhotoIndex(index); setPhotoType(type); setLightboxOpen(true);
    history.pushState({ lightbox: true }, '');
  }

  function handleTouchStart(e: React.TouchEvent) { setTouchStart(e.targetTouches[0].clientX); }
  function handleTouchMove(e: React.TouchEvent) { setTouchEnd(e.targetTouches[0].clientX); }
  function handleTouchEnd() {
    const photos = photoType === 'location' ? session.photos : recapPhotos.map(p => p.photo_url);
    if (!photos) return;
    const minSwipeDistance = 50;
    const distance = touchStart - touchEnd;
    if (distance > minSwipeDistance && currentPhotoIndex < photos.length - 1) setCurrentPhotoIndex(prev => prev + 1);
    if (distance < -minSwipeDistance && currentPhotoIndex > 0) setCurrentPhotoIndex(prev => prev - 1);
  }

  // --- Computed values ---
  if (loading) return <div className="min-h-screen bg-stone-50 dark:bg-[#52575D] flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-tribe-green"></div></div>;
  if (!session) return <div className="min-h-screen bg-stone-50 dark:bg-[#52575D] flex items-center justify-center"><p className="text-stone-900 dark:text-white">Session not found</p></div>;

  const isPast = (() => {
    const sessionDate = new Date(session.date + 'T00:00:00');
    if (session.start_time) { const [hours, minutes] = session.start_time.split(':').map(Number); sessionDate.setHours(hours, minutes, 0, 0); sessionDate.setMinutes(sessionDate.getMinutes() + (session.duration || 60)); }
    else sessionDate.setHours(23, 59, 59, 999);
    return sessionDate < new Date();
  })();
  const isFull = session.current_participants >= session.max_participants;
  const isCreator = session.creator_id === user?.id;
  const canKick = isCreator || userIsAdmin;
  const canUploadRecap = user && (isCreator || wasMarkedAttended) && isPast && userPhotoCount < 3;
  const canModerate = isCreator || userIsAdmin;
  const shouldPromptUpload = user && isPast && wasMarkedAttended && userPhotoCount === 0;
  const isToday = (() => { const now = new Date(); return session.date === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; })();
  const canGoLive = user && (hasJoined || isCreator) && isToday && !isPast;
  const currentPhotos = photoType === 'location' ? session.photos : recapPhotos.map(p => p.photo_url);

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-[#52575D] pb-32">
      {/* Lightbox */}
      {lightboxOpen && currentPhotos && (
        <div className="fixed inset-0 bg-black z-[60] flex items-center justify-center overflow-hidden">
          <button onClick={() => history.back()} className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full transition z-10">
            <X className="w-6 h-6 text-white" />
          </button>
          <div className="w-full h-full flex items-center justify-center touch-none" onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
            <img loading="lazy" src={currentPhotos[currentPhotoIndex]} alt={`Photo ${currentPhotoIndex + 1}`} className="max-w-[90%] max-h-[90%] object-contain transition-opacity duration-300 select-none" draggable={false} />
          </div>
          <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 flex gap-2">
            {currentPhotos.map((_: any, idx: number) => (
              <button key={idx} onClick={() => setCurrentPhotoIndex(idx)} className={`w-2 h-2 rounded-full transition-all ${idx === currentPhotoIndex ? 'bg-white w-6' : 'bg-white/40'}`} />
            ))}
          </div>
          <div className="absolute bottom-4 text-white text-sm">{currentPhotoIndex + 1} / {currentPhotos.length}</div>
        </div>
      )}

      <SessionHeader language={language} isCreator={isCreator} hasJoined={hasJoined} user={user} sessionStories={sessionStories} onAddStory={() => setShowStoryUpload(true)} />

      <div className="pt-header max-w-2xl mx-auto p-4 space-y-4">
        <SessionDetails session={session} creator={creator} participants={participants} isFull={isFull} language={language} onOpenLightbox={openLightbox} />

        {/* Live Status */}
        <LiveStatusSection canGoLive={canGoLive} isLive={isLive} liveCountdown={liveCountdown} liveUsers={liveUsers} goingLive={goingLive} language={language} onGoLive={handleGoLive} onEndLive={handleEndLive} onRenewLive={handleRenewLive} onShareMoment={() => setShowStoryUpload(true)} />

        {/* Action Buttons */}
        <div className="space-y-2">
          {!user ? (
            guestHasJoined ? (
              <button onClick={handleGuestLeave} className="w-full py-3 bg-orange-500 text-white font-bold rounded-lg hover:bg-orange-600 transition flex items-center justify-center gap-2">
                <LogOut className="w-5 h-5" />{language === 'es' ? 'Salir de Sesión' : 'Leave Session'}
              </button>
            ) : isPast ? (
              <button disabled className="w-full py-3 bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-400 font-bold rounded-lg cursor-not-allowed">{language === 'es' ? 'Sesión Terminada' : 'Session Ended'}</button>
            ) : isFull ? (
              <button disabled className="w-full py-3 bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-400 font-bold rounded-lg cursor-not-allowed">{language === 'es' ? 'Sesión Llena' : 'Session Full'}</button>
            ) : (
              <button onClick={() => setShowGuestModal(true)} className="w-full py-3 bg-tribe-green text-slate-900 font-bold rounded-lg hover:bg-lime-500 transition">{language === 'es' ? 'Unirse como Invitado' : 'Join as Guest'}</button>
            )
          ) : isCreator ? (
            <>
              <div className="w-full py-3 bg-blue-100 text-blue-800 font-bold rounded-lg text-center">👤 You're hosting this session</div>
              {!isPast && (
                <>
                  <button onClick={() => router.push(`/session/${params.id}/edit`)} className="w-full py-3 bg-tribe-green text-slate-900 font-bold rounded-lg hover:bg-lime-500 transition flex items-center justify-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    {language === 'es' ? 'Editar Sesión' : 'Edit Session'}
                  </button>
                  <button onClick={handleCancel} className="w-full py-3 bg-red-500 text-white font-bold rounded-lg hover:bg-red-600 transition flex items-center justify-center gap-2">
                    <Trash2 className="w-5 h-5" />{language === 'es' ? 'Cancelar Sesión' : 'Cancel Session'}
                  </button>
                </>
              )}
            </>
          ) : hasJoined ? (
            <button onClick={handleLeave} className="w-full py-3 bg-orange-500 text-white font-bold rounded-lg hover:bg-orange-600 transition flex items-center justify-center gap-2">
              <LogOut className="w-5 h-5" />{language === 'es' ? 'Salir de Sesión' : 'Leave Session'}
            </button>
          ) : isPast ? (
            <button disabled className="w-full py-3 bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-400 font-bold rounded-lg cursor-not-allowed">Session Ended</button>
          ) : isFull ? (
            <button disabled className="w-full py-3 bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-400 font-bold rounded-lg cursor-not-allowed">Session Full</button>
          ) : (
            <button onClick={handleJoin} disabled={joining} className="w-full py-3 bg-tribe-green text-slate-900 font-bold rounded-lg hover:bg-lime-500 disabled:opacity-50 transition">
              {joining ? (language === 'es' ? 'Uniéndose...' : 'Joining...') : (language === 'es' ? 'Unirse a la Sesión' : 'Join Session')}
            </button>
          )}

          {hasJoined && !isPast && (
            <Link href={`/session/${params.id}/chat`} className="w-full py-3 bg-stone-700 text-white font-bold rounded-lg hover:bg-stone-600 transition flex items-center justify-center gap-2">
              <MessageCircle className="w-5 h-5" />{language === "es" ? "Chat de Grupo" : "Group Chat"}
            </Link>
          )}
          {hasJoined && !isPast && (
            <button onClick={generateInviteLink} disabled={creatingInvite} className="w-full py-3 bg-blue-500 text-white font-bold rounded-lg hover:bg-blue-600 transition disabled:opacity-50">
              {creatingInvite ? (language === "es" ? "Generando..." : "Generating...") : (language === "es" ? "👥 Invitar Amigo" : "👥 Invite Friend")}
            </button>
          )}
          {hasJoined && (
            <button onClick={() => window.open(`/api/generate-calendar?sessionId=${params.id}`, '_blank')} className="w-full py-3 border-2 border-tribe-green text-tribe-green dark:text-tribe-green font-bold rounded-lg hover:bg-tribe-green hover:text-slate-900 transition flex items-center justify-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              {language === 'es' ? '📅 Añadir al Calendario' : '📅 Add to Calendar'}
            </button>
          )}
        </div>

        {/* Recap Photos */}
        <RecapPhotos session={session} recapPhotos={recapPhotos} user={user} isPast={isPast} canUploadRecap={canUploadRecap} canModerate={canModerate} shouldPromptUpload={shouldPromptUpload} userPhotoCount={userPhotoCount} language={language} onOpenLightbox={openLightbox} onPhotosChanged={loadRecapPhotos} />

        {/* Review Section */}
        <ReviewSection session={session} user={user} isCreator={isCreator} hasJoined={hasJoined} isPast={isPast} hasReviewed={hasReviewed} language={language} onReviewSubmitted={() => { setHasReviewed(true); loadSession(); }} />

        {/* Session Stories Thumbnails */}
        {sessionStories.length > 0 && (
          <div className="bg-white dark:bg-[#6B7178] rounded-xl p-4 shadow-lg">
            <h2 className="text-sm font-bold text-stone-900 dark:text-white mb-3">{language === 'es' ? 'Historias' : 'Stories'} ({sessionStories.length})</h2>
            <div className="flex gap-2 overflow-x-auto pb-1" style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
              {sessionStories.map((story: any) => (
                <button key={story.id} onClick={() => setShowStoryViewer(true)} className="flex-shrink-0 w-20 h-20 rounded-xl overflow-hidden border-2 border-stone-200 dark:border-gray-600 hover:border-tribe-green transition active:scale-95 relative">
                  {story.media_type === 'video' && story.thumbnail_url ? <img src={story.thumbnail_url} alt="" className="w-full h-full object-cover" /> : story.media_type === 'video' ? <div className="w-full h-full bg-stone-800 flex items-center justify-center"><span className="text-white text-xl">▶</span></div> : <img src={story.media_url} alt="" className="w-full h-full object-cover" />}
                  <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5"><span className="text-white text-[9px] truncate block">{(story.user as any)?.name}</span></div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Participants */}
        <ParticipantList creator={creator} participants={participants} canKick={canKick} language={language} onKickUser={handleKickUser} />

        {/* Attendance Tracker */}
        {user && <AttendanceTracker sessionId={params.id as string} isHost={isCreator} isAdmin={userIsAdmin} sessionDate={session.date} />}
      </div>

      {/* Guest Join Modal */}
      {showGuestModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#6B7178] rounded-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-theme-primary">{language === "es" ? "Unirse como Invitado" : "Join as Guest"}</h3>
              <button onClick={() => setShowGuestModal(false)} className="p-2 hover:bg-stone-100 dark:hover:bg-[#52575D] rounded"><X className="w-5 h-5 text-theme-primary" /></button>
            </div>
            <p className="text-sm text-stone-600 dark:text-gray-300 mb-4">{language === "es" ? "Ingresa tus datos para confirmar tu asistencia" : "Enter your details to confirm attendance"}</p>
            <div className="space-y-3">
              <input type="text" placeholder={language === "es" ? "Nombre completo *" : "Full name *"} value={guestData.name} onChange={(e) => setGuestData({...guestData, name: e.target.value})} className="w-full px-4 py-3 border border-stone-300 dark:border-[#52575D] rounded-lg bg-white dark:bg-[#52575D] text-theme-primary" />
              <input type="tel" placeholder={language === "es" ? "Teléfono *" : "Phone *"} value={guestData.phone} onChange={(e) => setGuestData({...guestData, phone: e.target.value})} className="w-full px-4 py-3 border border-stone-300 dark:border-[#52575D] rounded-lg bg-white dark:bg-[#52575D] text-theme-primary" />
              <input type="email" placeholder={language === "es" ? "Email (opcional)" : "Email (optional)"} value={guestData.email} onChange={(e) => setGuestData({...guestData, email: e.target.value})} className="w-full px-4 py-3 border border-stone-300 dark:border-[#52575D] rounded-lg bg-white dark:bg-[#52575D] text-theme-primary" />
            </div>
            <button onClick={handleGuestJoin} disabled={joiningAsGuest} className="w-full mt-4 py-3 bg-tribe-green text-slate-900 font-bold rounded-lg hover:bg-lime-500 disabled:opacity-50">
              {joiningAsGuest ? (language === "es" ? "Confirmando..." : "Confirming...") : (language === "es" ? "Confirmar Asistencia" : "Confirm Attendance")}
            </button>
            <p className="text-xs text-center text-stone-500 dark:text-gray-400 mt-3">{language === "es" ? "¿Ya tienes cuenta?" : "Already have an account?"} <a href="/auth" className="text-tribe-green hover:underline">{language === "es" ? "Inicia sesión" : "Sign in"}</a></p>
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#6B7178] rounded-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-theme-primary">{language === "es" ? "Invitar Amigo" : "Invite Friend"}</h3>
              <button onClick={() => setShowInviteModal(false)} className="p-2 hover:bg-stone-100 dark:hover:bg-[#52575D] rounded"><X className="w-5 h-5 text-theme-primary" /></button>
            </div>
            <p className="text-sm text-stone-600 dark:text-gray-300 mb-4">{language === "es" ? "Comparte este enlace con amigos para que se unan sin necesidad de crear cuenta" : "Share this link with friends so they can join without creating an account"}</p>
            <div className="bg-stone-50 dark:bg-[#52575D] p-3 rounded-lg mb-4 break-all text-sm">{inviteLink}</div>
            <div className="flex gap-3">
              <button onClick={copyInviteLink} className="flex-1 py-3 bg-stone-200 dark:bg-[#52575D] text-theme-primary font-medium rounded-lg hover:bg-stone-300 dark:hover:bg-[#6B7178]">📋 {language === "es" ? "Copiar" : "Copy"}</button>
              <button onClick={shareInviteLink} className="flex-1 py-3 bg-tribe-green text-slate-900 font-medium rounded-lg hover:bg-lime-500">📤 {language === "es" ? "Compartir" : "Share"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Story Upload Modal */}
      {showStoryUpload && user && <StoryUpload sessionId={session.id} userId={user.id} onClose={() => setShowStoryUpload(false)} onUploaded={() => loadSessionStories()} />}

      {/* Story Viewer */}
      {showStoryViewer && sessionStories.length > 0 && session && (
        <StoryViewer
          groups={[{ sessionId: session.id, sport: session.sport, stories: sessionStories.map((s: any) => ({ id: s.id, media_url: s.media_url, media_type: s.media_type, thumbnail_url: s.thumbnail_url, caption: s.caption, created_at: s.created_at, user_id: s.user_id, user_name: (s.user as any)?.name || '?', user_avatar: (s.user as any)?.avatar_url || null })) }]}
          startGroupIndex={0} currentUserId={user?.id}
          onClose={() => setShowStoryViewer(false)}
          onStorySeen={(ids: string[]) => markStoriesSeen(ids)}
          onStoryDeleted={() => loadSessionStories()}
        />
      )}
    </div>
  );
}
