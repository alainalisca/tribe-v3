'use client';
import { formatTime12Hour } from "@/lib/utils";
import { showSuccess, showError, showInfo } from '@/lib/toast';
import { getErrorMessage } from "@/lib/errorMessages";
import { celebrateJoin } from "@/lib/confetti";

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Calendar, Clock, MapPin, Users, ArrowLeft, Trash2, LogOut, UserX, X, Upload, Camera, Flag, MessageCircle } from 'lucide-react';
import Link from 'next/link';
import { useLanguage } from '@/lib/LanguageContext';
import AttendanceTracker from '@/components/AttendanceTracker';

import LocationMap from '@/components/LocationMap';
const ADMIN_EMAIL = 'alainalisca@aplusfitnessllc.com';

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
  const [hasJoined, setHasJoined] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [photoType, setPhotoType] = useState<'location' | 'recap'>('location');
  const [touchStart, setTouchStart] = useState(0);
  const [touchEnd, setTouchEnd] = useState(0);
  const [uploadingRecap, setUploadingRecap] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteLink, setInviteLink] = useState("");
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [wasMarkedAttended, setWasMarkedAttended] = useState(false);
  const [recapPhotos, setRecapPhotos] = useState<any[]>([]);
  const [showGuestModal, setShowGuestModal] = useState(false);
  const [guestData, setGuestData] = useState({ name: '', phone: '', email: '' });
  const [joiningAsGuest, setJoiningAsGuest] = useState(false);
  const [userPhotoCount, setUserPhotoCount] = useState(0);

  useEffect(() => {
    checkUser();
    loadSession();
  }, [params.id]);

  useEffect(() => {
    if (lightboxOpen || showGuestModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [lightboxOpen, showGuestModal]);


  async function checkUser() {

    const { data: { user } } = await supabase.auth.getUser();
    setUser(user);
  }

  async function loadSession() {
    try {
      setLoading(true);
      const { data: sessionData, error } = await supabase
        .from('sessions')
        .select('*')
        .eq('id', params.id)
        .single();

      if (error) throw error;
      setSession(sessionData);

      const { data: creatorData } = await supabase
        .from('users')
        .select('id, name, avatar_url')
        .eq('id', sessionData.creator_id)
        .single();

      setCreator(creatorData);

      const { data: participantsData } = await supabase
        .from('session_participants')
        .select(`
          user_id,
          status,
          user:users(id, name, avatar_url)
        `)
        .eq('session_id', params.id)
        .eq('status', 'confirmed');

      setParticipants(participantsData || []);

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const joined = participantsData?.some(p => p.user_id === user.id);
        setHasJoined(!!joined);
      }

      await checkAttendance();
      await loadRecapPhotos();
    } catch (error) {
      console.error('Error loading session:', error);
    } finally {
      setLoading(false);
    }
  }

  async function checkAttendance() {
    if (!user) return;
    
    const { data: attendanceData } = await supabase
      .from("session_attendance")
      .select("attended")
      .eq("session_id", params.id)
      .eq("user_id", user.id)
      .single();
    
    setWasMarkedAttended(attendanceData?.attended === true);
  }

  async function loadRecapPhotos() {
    try {
      // Fetch photos
      const { data: photosData, error } = await supabase
        .from('session_recap_photos')
        .select('*')
        .eq('session_id', params.id)
        .order('uploaded_at', { ascending: true });

      if (error) throw error;

      // Fetch user info for each photo
      if (photosData && photosData.length > 0) {
        const userIds = [...new Set(photosData.map(p => p.user_id))];
        const { data: usersData } = await supabase
          .from('users')
          .select('id, name, avatar_url')
          .in('id', userIds);

        // Merge user data into photos
        const photosWithUsers = photosData.map(photo => ({
          ...photo,
          user: usersData?.find(u => u.id === photo.user_id)
        }));

        setRecapPhotos(photosWithUsers);
      } else {
        setRecapPhotos([]);
      }

      if (user) {
        const userPhotos = photosData?.filter(p => p.user_id === user.id) || [];
        setUserPhotoCount(userPhotos.length);
      }
    } catch (error) {
      console.error('Error loading recap photos:', error);
    }
  }

  async function compressImage(file: File): Promise<Blob> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 1200;
          const MAX_HEIGHT = 1200;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          
          canvas.toBlob((blob) => {
            resolve(blob as Blob);
          }, 'image/jpeg', 0.8);
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  }

  async function handleRecapUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (userPhotoCount + files.length > 3) {
      showInfo('You can upload maximum 3 photos per session');
      return;
    }


    setUploadingRecap(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const compressedBlob = await compressImage(file);
        const fileExt = file.name.split('.').pop();
        const fileName = `${user.id}/${Date.now()}-recap-${i}.${fileExt}`;

        const { data, error } = await supabase.storage
          .from('session-photos')
          .upload(fileName, compressedBlob, {
            cacheControl: '3600',
            upsert: false
          });

        if (error) throw error;

        const { data: { publicUrl } } = supabase.storage
          .from('session-photos')
          .getPublicUrl(fileName);

        const { error: insertError } = await supabase
          .from('session_recap_photos')
          .insert({
            session_id: session.id,
            user_id: user.id,
            photo_url: publicUrl
          });

        if (insertError) throw insertError;
      }

      showSuccess('Recap photos uploaded!');
      await loadRecapPhotos();
      showError(getErrorMessage(error, 'upload_photo', language));
      showError('Error uploading photos: ' + error.message);
    } finally {
      setUploadingRecap(false);
    }
  }

  async function deleteRecapPhoto(photoId: string) {
    if (!confirm('Delete this photo?')) return;

    try {
      const { error } = await supabase
        .from('session_recap_photos')
        .delete()
        .eq('id', photoId);

      if (error) throw error;

      showSuccess('Photo deleted');
      await loadRecapPhotos();
    } catch (error: any) {
      showError(getErrorMessage(error, 'delete_session', language));
    }
  }

  async function reportRecapPhoto(photoId: string) {
    const reason = prompt('Report reason (optional):');
    
    try {
      const { error } = await supabase
        .from('session_recap_photos')
        .update({
          reported: true,
          reported_by: user.id,
          reported_reason: reason || 'No reason provided'
        })
        .eq('id', photoId);

      if (error) throw error;

      showSuccess('Photo reported. Admin will review.');
      await loadRecapPhotos();
    } catch (error: any) {
      showError(getErrorMessage(error, 'send_message', language));
    }
  }

  async function handleJoin() {
    if (!user) {
      setShowGuestModal(true);
      return;
    }

    try {
      const { data: existing } = await supabase
        .from('session_participants')
        .select('id')
        .eq('session_id', session.id)
        .eq('user_id', user.id)
        .single();

      if (existing) {
        showInfo(language === 'es' ? '¡Ya te uniste a esta sesión!' : 'You already joined this session!');
        return;
      }

      await supabase.from('session_participants').insert({
        session_id: session.id,
        user_id: user.id,
        status: 'confirmed'
      });

      await supabase
        .from('sessions')
        .update({ current_participants: session.current_participants + 1 })
        .eq('id', session.id);

      celebrateJoin();
      showSuccess(language === 'es' ? '¡Estás dentro! Nunca entrenarás solo.' : "You're in! You'll never train alone.");
      await loadSession();
    } catch (error: any) {
      showError(getErrorMessage(error, 'join_session', language));
    }
  }


  async function handleGuestJoin() {
    if (!guestData.name || !guestData.phone) {
      showError(language === "es" ? "Completa nombre y teléfono" : "Fill in name and phone");
      return;
    }
    try {
      setJoiningAsGuest(true);
      const { error } = await supabase
        .from("session_participants")
        .insert({
          session_id: session.id,
          user_id: null,
          is_guest: true,
          guest_name: guestData.name,
          guest_phone: guestData.phone,
          guest_email: guestData.email || null,
          status: "confirmed",
        });
      if (error) throw error;
      await supabase
        .from("sessions")
        .update({ current_participants: session.current_participants + 1 })
        .eq("id", session.id);
      showSuccess(language === "es" ? "¡Confirmado! Te esperamos" : "Confirmed! See you there");
      setShowGuestModal(false);
      celebrateJoin();
      loadSession();
    } catch (error: any) {
      showError(error.message);
    } finally {
      setJoiningAsGuest(false);
    }
  }
  async function handleLeave() {
    if (!confirm('Are you sure you want to leave this session?')) return;

    try {
      const { error } = await supabase
        .from('session_participants')
        .delete()
        .eq('session_id', session.id)
        .eq('user_id', user.id);

      if (error) throw error;

      await supabase
        .from('sessions')
        .update({ current_participants: session.current_participants - 1 })
        .eq('id', session.id);

      showSuccess(language === 'es' ? 'Has salido de la sesión' : 'You have left the session');
      router.push('/sessions');
    } catch (error: any) {
      showError(getErrorMessage(error, 'join_session', language));
    }
  }

  async function generateInviteLink() {
    if (!user || !session) return;

    try {
      setCreatingInvite(true);

      // Generate unique token
      const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

      // Save invite token
      const { error } = await supabase
        .from('invite_tokens')
        .insert({
          session_id: session.id,
          token: token,
          created_by: user.id,
        });

      if (error) throw error;

      const link = `${window.location.origin}/invite/${token}`;
      setInviteLink(link);
      setShowInviteModal(true);
    } catch (error: any) {
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
      navigator.share({
        title: language === 'es' ? `Únete a mi sesión de ${session.sport}` : `Join me for ${session.sport}`,
        text: language === 'es' 
          ? `Voy a entrenar ${session.sport} en ${session.location}. ¡Únete!`
          : `I'm training ${session.sport} at ${session.location}. Join me!`,
        url: inviteLink,
      }).catch(() => {});
    } else {
      copyInviteLink();
    }
  }

  async function handleCancel() {
    if (!confirm('⚠️ Cancel this session? All participants will be notified. This cannot be undone.')) return;

    try {
      const { error } = await supabase
        .from('sessions')
        .update({ status: 'cancelled' })
        .eq('id', session.id);

      if (error) throw error;

      showSuccess(language === 'es' ? 'Sesión cancelada' : 'Session cancelled');
      router.push('/sessions');
    } catch (error: any) {
      showError(getErrorMessage(error, 'delete_session', language));
    }
  }

  async function handleKickUser(userId: string, userName: string) {
    if (!confirm(`Remove ${userName} from this session?`)) return;

    try {
      const { error: deleteError } = await supabase
        .from('session_participants')
        .delete()
        .eq('session_id', session.id)
        .eq('user_id', userId);

      if (deleteError) throw deleteError;

      const { error: updateError } = await supabase
        .from('sessions')
        .update({ current_participants: Math.max(0, session.current_participants - 1) })
        .eq('id', session.id);

      if (updateError) throw updateError;

      setParticipants(prev => prev.filter(p => p.user_id !== userId));
      setSession(prev => ({
        ...prev,
        current_participants: Math.max(0, prev.current_participants - 1)
      }));

      showSuccess('User removed from session');
    } catch (error: any) {
      console.error('Kick error:', error);
      showError(getErrorMessage(error, 'join_session', language));
    }
  }

  function openLightbox(index: number, type: 'location' | 'recap') {
    setCurrentPhotoIndex(index);
    setPhotoType(type);
    setLightboxOpen(true);
  }

  function handleTouchStart(e: React.TouchEvent) {
    setTouchStart(e.targetTouches[0].clientX);
  }

  function handleTouchMove(e: React.TouchEvent) {
    setTouchEnd(e.targetTouches[0].clientX);
  }

  function handleTouchEnd() {
    const photos = photoType === 'location' ? session.photos : recapPhotos.map(p => p.photo_url);
    if (!photos) return;
    
    const minSwipeDistance = 50;
    const distance = touchStart - touchEnd;
    
    if (distance > minSwipeDistance && currentPhotoIndex < photos.length - 1) {
      setCurrentPhotoIndex(prev => prev + 1);
    }
    
    if (distance < -minSwipeDistance && currentPhotoIndex > 0) {
      setCurrentPhotoIndex(prev => prev - 1);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-[#52575D] flex items-center justify-center">
        <p className="text-stone-900 dark:text-white">Loading...</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-[#52575D] flex items-center justify-center">
        <p className="text-stone-900 dark:text-white">Session not found</p>
      </div>
    );
  }

  const isPast = new Date(session.date) < new Date();
  const isFull = session.current_participants >= session.max_participants;
  const isCreator = session.creator_id === user?.id;
  const isAdmin = user?.email === ADMIN_EMAIL;
  const canKick = isCreator || isAdmin;
  const canUploadRecap = user && (isCreator || wasMarkedAttended) && isPast && userPhotoCount < 3;
  const canModerate = isCreator || isAdmin;
  const shouldPromptUpload = user && isPast && wasMarkedAttended && userPhotoCount === 0;

  const currentPhotos = photoType === 'location' 
    ? session.photos 
    : recapPhotos.map(p => p.photo_url);

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-[#52575D] pb-32">
      {lightboxOpen && currentPhotos && (
        <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center overflow-hidden">
          <button
            onClick={() => setLightboxOpen(false)}
            className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full transition z-10"
          >
            <X className="w-6 h-6 text-white" />
          </button>

          <div 
            className="w-full h-full flex items-center justify-center touch-none"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <img loading="lazy" loading="lazy"
              src={currentPhotos[currentPhotoIndex]}
              alt={`Photo ${currentPhotoIndex + 1}`}
              className="max-w-[90%] max-h-[90%] object-contain transition-opacity duration-300 select-none"
              draggable={false}
            />
          </div>

          <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 flex gap-2">
            {currentPhotos.map((_: any, idx: number) => (
              <button
                key={idx}
                onClick={() => setCurrentPhotoIndex(idx)}
                className={`w-2 h-2 rounded-full transition-all ${
                  idx === currentPhotoIndex 
                    ? 'bg-white w-6' 
                    : 'bg-white/40'
                }`}
              />
            ))}
          </div>

          <div className="absolute bottom-4 text-white text-sm">
            {currentPhotoIndex + 1} / {currentPhotos.length}
          </div>
        </div>
      )}

      <div className="bg-stone-200 dark:bg-[#272D34] p-4 border-b border-stone-300 dark:border-black">
        <div className="max-w-2xl mx-auto flex items-center gap-4">
          <Link href="/">
            <button className="p-2 hover:bg-stone-300 dark:hover:bg-[#52575D] rounded-lg transition">
              <ArrowLeft className="w-6 h-6 text-stone-900 dark:text-white" />
            </button>
          </Link>
          <h1 className="text-xl font-bold text-stone-900 dark:text-white">{language === 'es' ? 'Detalles de Sesión' : 'Session Details'}</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-4">
        <div className="bg-white dark:bg-[#6B7178] rounded-xl p-6 shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <span className="px-4 py-2 bg-tribe-green text-slate-900 rounded-full text-lg font-bold">
              {session.sport}
            </span>
            <div className="text-right">
              <div className="text-stone-600 dark:text-gray-300 text-sm mb-1">
                {participants.length}/{session.max_participants} joined
              </div>
              <div className="w-24 h-2 bg-stone-200 dark:bg-[#52575D] rounded-full overflow-hidden">
                <div 
                  className={`h-full ${isFull ? 'bg-red-500' : 'bg-tribe-green'}`}
                  style={{ width: `${(participants.length / session.max_participants) * 100}%` }}
                />
              </div>
            </div>
          </div>

          {session.photos && session.photos.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-2">
                <MapPin className="w-4 h-4 text-tribe-green" />
                <p className="text-sm font-medium text-stone-700 dark:text-gray-300">
                  Location Photos
                </p>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {session.photos.map((photo: string, idx: number) => (
                  <button
                    key={idx}
                    onClick={() => openLightbox(idx, 'location')}
                    className="w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden border-2 border-stone-200 hover:border-tribe-green transition active:scale-95"
                  >
                    <img loading="lazy" loading="lazy"
                      src={photo}
                      alt={`Location ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-3 mb-6">
            <div className="flex items-center text-stone-900 dark:text-white">
              <Calendar className="w-5 h-5 mr-3 text-stone-500 dark:text-gray-400" />
              <span className="font-medium">
                {new Date(session.date).toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric'
                })}
              </span>
            </div>

            <div className="flex items-center text-stone-900 dark:text-white">
              <Clock className="w-5 h-5 mr-3 text-stone-500 dark:text-gray-400" />
              <span>{formatTime12Hour(session.start_time)} • {session.duration} min</span>
            </div>

            <div className="flex items-start text-stone-900 dark:text-white">
              <MapPin className="w-5 h-5 mr-3 mt-0.5 text-stone-500 dark:text-gray-400" />
              <span>{session.location}</span>
            </div>

            {/* Map Section */}
            <div className="mt-4">
              <LocationMap
                latitude={session.latitude}
                longitude={session.longitude}
                location={session.location}
              />
            </div>

            {creator && (
              <div className="flex items-center text-stone-900 dark:text-white">
                <Users className="w-5 h-5 mr-3 text-stone-500 dark:text-gray-400" />
                <span>Hosted by {creator.name}</span>
              </div>
            )}
          </div>

          {session.description && (
            <div className="mb-6 p-4 bg-stone-50 dark:bg-[#52575D] rounded-lg">
              <p className="text-stone-700 dark:text-gray-300">{session.description}</p>
            </div>
          )}

          <div className="space-y-2">
            {!user ? (
              <button 
                onClick={() => setShowGuestModal(true)}
                className="w-full py-3 bg-tribe-green text-slate-900 font-bold rounded-lg hover:bg-lime-500 transition"
              >
                {language === 'es' ? 'Unirse como Invitado' : 'Join as Guest'}
              </button>
            ) : isCreator ? (
              <>
                <div className="w-full py-3 bg-blue-100 text-blue-800 font-bold rounded-lg text-center">
                  👤 You're hosting this session
                </div>
                {!isPast && (
                  <>
                    <button 
                      onClick={() => router.push(`/session/${params.id}/edit`)}
                      className="w-full py-3 bg-tribe-green text-slate-900 font-bold rounded-lg hover:bg-lime-500 transition flex items-center justify-center gap-2"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      {language === 'es' ? 'Editar Sesión' : 'Edit Session'}
                    </button>
                    <button 
                      onClick={handleCancel}
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
                onClick={handleLeave}
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
                Session Ended
              </button>
            ) : isFull ? (
              <button 
                disabled
                className="w-full py-3 bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-400 font-bold rounded-lg cursor-not-allowed"
              >
                Session Full
              </button>
            ) : (
              <button 
                onClick={handleJoin}
                className="w-full py-3 bg-tribe-green text-slate-900 font-bold rounded-lg hover:bg-lime-500 transition"
              >
                Join Session
              </button>
            )}

            {/* Chat Button */}
            {hasJoined && !isPast && (
              <Link
                href={`/session/${params.id}/chat`}
                className="w-full py-3 bg-stone-700 text-white font-bold rounded-lg hover:bg-stone-600 transition flex items-center justify-center gap-2"
              >
                <MessageCircle className="w-5 h-5" />
                {language === "es" ? "Chat de Grupo" : "Group Chat"}
              </Link>
            )}

            {/* Invite Friend Button */}
            {hasJoined && !isPast && (
              <button
                onClick={generateInviteLink}
                disabled={creatingInvite}
                className="w-full py-3 bg-blue-500 text-white font-bold rounded-lg hover:bg-blue-600 transition disabled:opacity-50"
              >
                {creatingInvite
                  ? (language === "es" ? "Generando..." : "Generating...")
                  : (language === "es" ? "👥 Invitar Amigo" : "👥 Invite Friend")}
              </button>
            )}

            {/* Add to Calendar Button */}
            {hasJoined && (
              <button
                onClick={() => window.open(`/api/generate-calendar?sessionId=${params.id}`, '_blank')}
                className="w-full py-3 border-2 border-tribe-green text-tribe-green dark:text-tribe-green font-bold rounded-lg hover:bg-tribe-green hover:text-slate-900 transition flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {language === 'es' ? '📅 Añadir al Calendario' : '📅 Add to Calendar'}
              </button>
            )}
        </div>

        </div>

        {/* Upload Prompt Banner */}
        {shouldPromptUpload && (
          <div className="bg-gradient-to-r from-tribe-green to-lime-400 rounded-xl p-6 shadow-lg">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                <Camera className="w-6 h-6 text-slate-900" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-slate-900 mb-1">
                  Share Your Experience! 📸
                </h3>
                <p className="text-sm text-slate-800">
                  You attended this session - upload up to 3 photos to share with the community!
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Session Recap Section with Moderation */}
        {isPast && (
          <div className="bg-white dark:bg-[#6B7178] rounded-xl p-6 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Camera className="w-5 h-5 text-tribe-green" />
                <h2 className="text-lg font-bold text-stone-900 dark:text-white">
                  Session Recap
                </h2>
              </div>
              {canUploadRecap && (
                <span className="text-xs text-stone-500">
                  {userPhotoCount}/3 uploaded
                </span>
              )}
            </div>

            {recapPhotos.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mb-4">
                {recapPhotos.map((photo: any, idx: number) => (
                  <div key={photo.id} className="relative aspect-square group">
                    <button
                      onClick={() => openLightbox(idx, 'recap')}
                      className="w-full h-full rounded-lg overflow-hidden border-2 border-stone-200 hover:border-tribe-green transition active:scale-95"
                    >
                      <img loading="lazy" loading="lazy"
                        src={photo.photo_url}
                        alt={`Recap ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </button>
                    
                    {/* Attribution badge */}
                    <div className="absolute bottom-1 left-1 bg-black/70 text-white text-xs px-2 py-0.5 rounded">
                      {photo.user?.name}
                    </div>

                    {/* Moderation buttons */}
                    <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                      {(photo.user_id === user?.id || canModerate) && (
                        <button
                          onClick={() => deleteRecapPhoto(photo.id)}
                          className="p-1 bg-red-500 text-white rounded hover:bg-red-600"
                          title="Delete"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                      {canModerate && photo.user_id !== user?.id && (
                        <button
                          onClick={() => reportRecapPhoto(photo.id)}
                          className="p-1 bg-orange-500 text-white rounded hover:bg-orange-600"
                          title="Report"
                        >
                          <Flag className="w-3 h-3" />
                        </button>
                      )}
                    </div>

                    {photo.reported && (
                      <div className="absolute top-1 left-1 bg-red-500 text-white text-xs px-1 py-0.5 rounded">
                        Reported
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {canUploadRecap && (
              <label className="w-full py-3 bg-tribe-green text-slate-900 font-bold rounded-lg hover:bg-lime-500 transition cursor-pointer flex items-center justify-center gap-2">
                {uploadingRecap ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-slate-900"></div>
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="w-5 h-5" />
                    Upload Photos ({userPhotoCount}/3)
                  </>
                )}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleRecapUpload}
                  disabled={uploadingRecap}
                  className="hidden"
                />
              </label>
            )}

            {!canUploadRecap && recapPhotos.length === 0 && (
              <p className="text-sm text-center text-stone-500 py-4">
                {isPast 
                  ? 'No recap photos yet. Verified attendees can upload.'
                  : 'Recap photos will be available after the session ends.'}
              </p>
            )}
          </div>
        )}

        {(creator || participants.length > 0) && (
          <div className="bg-white dark:bg-[#6B7178] rounded-xl p-6 shadow-lg">
            <h2 className="text-lg font-bold text-stone-900 dark:text-white mb-4">
              {language === 'es' ? 'Participantes' : 'Participants'} ({participants.length + 1})
            </h2>
            <div className="grid grid-cols-1 gap-3">
              {creator && (
                <div className="flex items-center justify-between p-3 bg-stone-50 dark:bg-[#52575D] rounded-lg">
                  <Link href={`/profile/${creator.id}`} className="flex items-center gap-3 flex-1">
                    {creator.avatar_url ? (
                      <img loading="lazy" loading="lazy"
                        src={creator.avatar_url}
                        alt={creator.name}
                        className="w-12 h-12 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-tribe-green flex items-center justify-center text-slate-900 font-bold text-lg">
                        {creator.name[0]?.toUpperCase()}
                      </div>
                    )}
                    <div>
                      <p className="font-medium text-stone-900 dark:text-white">{creator.name}</p>
                      <p className="text-xs text-tribe-green font-semibold">{language === 'es' ? 'Anfitrión' : 'Host'}</p>
                    </div>
                  </Link>
                </div>
              )}
              
              {participants.map((participant: any) => (
                <div key={participant.user_id} className="flex items-center justify-between p-3 bg-stone-50 dark:bg-[#52575D] rounded-lg">
                  <Link href={`/profile/${participant.user_id}`} className="flex items-center gap-3 flex-1">
                    {participant.user?.avatar_url ? (
                      <img loading="lazy" loading="lazy"
                        src={participant.user.avatar_url}
                        alt={participant.user.name}
                        className="w-12 h-12 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-tribe-green flex items-center justify-center text-slate-900 font-bold text-lg">
                        {participant.is_guest ? participant.guest_name?.[0]?.toUpperCase() : participant.user?.name?.[0]?.toUpperCase() || 'U'}
                      </div>
                    )}
                    <p className="font-medium text-stone-900 dark:text-white">
                      {participant.is_guest ? participant.guest_name : participant.user?.name || 'Unknown'}
                    </p>
                  </Link>
                  
                  {canKick && (
                    <button
                      onClick={() => handleKickUser(participant.user_id, participant.user?.name)}
                      className="p-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition"
                      title="Remove from session"
                    >
                      <UserX className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {user && (
          <AttendanceTracker
            sessionId={params.id as string}
            isHost={session.creator_id === user.id}
            isAdmin={user.email === ADMIN_EMAIL}
            sessionDate={session.date}
          />
        )}
      </div>

      {/* Guest Join Modal */}
      {showGuestModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#6B7178] rounded-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-theme-primary">
                {language === "es" ? "Unirse como Invitado" : "Join as Guest"}
              </h3>
              <button onClick={() => setShowGuestModal(false)} className="p-2 hover:bg-stone-100 dark:hover:bg-[#52575D] rounded">
                <X className="w-5 h-5 text-theme-primary" />
              </button>
            </div>
            <p className="text-sm text-stone-600 dark:text-gray-300 mb-4">
              {language === "es" ? "Ingresa tus datos para confirmar tu asistencia" : "Enter your details to confirm attendance"}
            </p>
            <div className="space-y-3">
              <input type="text" placeholder={language === "es" ? "Nombre completo *" : "Full name *"} value={guestData.name} onChange={(e) => setGuestData({...guestData, name: e.target.value})} className="w-full px-4 py-3 border border-stone-300 dark:border-[#52575D] rounded-lg bg-white dark:bg-[#52575D] text-theme-primary" />
              <input type="tel" placeholder={language === "es" ? "Teléfono *" : "Phone *"} value={guestData.phone} onChange={(e) => setGuestData({...guestData, phone: e.target.value})} className="w-full px-4 py-3 border border-stone-300 dark:border-[#52575D] rounded-lg bg-white dark:bg-[#52575D] text-theme-primary" />
              <input type="email" placeholder={language === "es" ? "Email (opcional)" : "Email (optional)"} value={guestData.email} onChange={(e) => setGuestData({...guestData, email: e.target.value})} className="w-full px-4 py-3 border border-stone-300 dark:border-[#52575D] rounded-lg bg-white dark:bg-[#52575D] text-theme-primary" />
            </div>
            <button onClick={handleGuestJoin} disabled={joiningAsGuest} className="w-full mt-4 py-3 bg-tribe-green text-slate-900 font-bold rounded-lg hover:bg-lime-500 disabled:opacity-50">
              {joiningAsGuest ? (language === "es" ? "Confirmando..." : "Confirming...") : (language === "es" ? "Confirmar Asistencia" : "Confirm Attendance")}
            </button>
            <p className="text-xs text-center text-stone-500 dark:text-gray-400 mt-3">
              {language === "es" ? "¿Ya tienes cuenta?" : "Already have an account?"} <a href="/auth" className="text-tribe-green hover:underline">{language === "es" ? "Inicia sesión" : "Sign in"}</a>
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
                {language === "es" ? "Invitar Amigo" : "Invite Friend"}
              </h3>
              <button onClick={() => setShowInviteModal(false)} className="p-2 hover:bg-stone-100 dark:hover:bg-[#52575D] rounded">
                <X className="w-5 h-5 text-theme-primary" />
              </button>
            </div>
            
            <p className="text-sm text-stone-600 dark:text-gray-300 mb-4">
              {language === "es"
                ? "Comparte este enlace con amigos para que se unan sin necesidad de crear cuenta"
                : "Share this link with friends so they can join without creating an account"}
            </p>
            
            <div className="bg-stone-50 dark:bg-[#52575D] p-3 rounded-lg mb-4 break-all text-sm">
              {inviteLink}
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={copyInviteLink}
                className="flex-1 py-3 bg-stone-200 dark:bg-[#52575D] text-theme-primary font-medium rounded-lg hover:bg-stone-300 dark:hover:bg-[#6B7178]"
              >
                📋 {language === "es" ? "Copiar" : "Copy"}
              </button>
              <button
                onClick={shareInviteLink}
                className="flex-1 py-3 bg-tribe-green text-slate-900 font-medium rounded-lg hover:bg-lime-500"
              >
                📤 {language === "es" ? "Compartir" : "Share"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
