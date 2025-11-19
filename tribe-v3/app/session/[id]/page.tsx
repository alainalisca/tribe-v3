'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Calendar, Clock, MapPin, Users, ArrowLeft, Trash2, LogOut, UserX, X, Upload, Camera } from 'lucide-react';
import Link from 'next/link';
import AttendanceTracker from '@/components/AttendanceTracker';

const ADMIN_EMAIL = 'alainalisca@aplusfitnessllc.com';

export default function SessionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClient();
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

  useEffect(() => {
    checkUser();
    loadSession();
  }, [params.id]);

  useEffect(() => {
    if (lightboxOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [lightboxOpen]);

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
    } catch (error) {
      console.error('Error loading session:', error);
    } finally {
      setLoading(false);
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

    const currentRecapCount = session.recap_photos?.length || 0;
    if (currentRecapCount + files.length > 5) {
      alert('Maximum 5 recap photos allowed per session');
      return;
    }

    setUploadingRecap(true);
    try {
      const uploadedUrls: string[] = [];

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

        uploadedUrls.push(publicUrl);
      }

      const updatedRecapPhotos = [...(session.recap_photos || []), ...uploadedUrls];

      const { error: updateError } = await supabase
        .from('sessions')
        .update({ recap_photos: updatedRecapPhotos })
        .eq('id', session.id);

      if (updateError) throw updateError;

      setSession(prev => ({ ...prev, recap_photos: updatedRecapPhotos }));
      alert('✅ Recap photos uploaded!');
    } catch (error: any) {
      alert('Error uploading photos: ' + error.message);
    } finally {
      setUploadingRecap(false);
    }
  }

  async function handleJoin() {
    if (!user) {
      router.push('/auth');
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
        alert('You already joined this session!');
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

      alert('✅ Successfully joined the session!');
      await loadSession();
    } catch (error: any) {
      alert('Error: ' + error.message);
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

      alert('✅ You have left the session');
      router.push('/sessions');
    } catch (error: any) {
      alert('❌ Error: ' + error.message);
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

      alert('✅ Session cancelled');
      router.push('/sessions');
    } catch (error: any) {
      alert('❌ Error: ' + error.message);
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

      alert('✅ User removed from session');
    } catch (error: any) {
      console.error('Kick error:', error);
      alert('❌ Error: ' + error.message);
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
    const photos = photoType === 'location' ? session.photos : session.recap_photos;
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
  const canUploadRecap = user && (hasJoined || isCreator) && isPast;

  const currentPhotos = photoType === 'location' ? session.photos : session.recap_photos;

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-[#52575D] pb-20">
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
            <img
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
          <h1 className="text-xl font-bold text-stone-900 dark:text-white">Session Details</h1>
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
                    <img
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
              <span>{session.start_time} • {session.duration} min</span>
            </div>

            <div className="flex items-start text-stone-900 dark:text-white">
              <MapPin className="w-5 h-5 mr-3 mt-0.5 text-stone-500 dark:text-gray-400" />
              <span>{session.location}</span>
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
              <Link href="/auth">
                <button className="w-full py-3 bg-tribe-green text-slate-900 font-bold rounded-lg hover:bg-lime-500 transition">
                  Sign in to Join
                </button>
              </Link>
            ) : isCreator ? (
              <>
                <div className="w-full py-3 bg-blue-100 text-blue-800 font-bold rounded-lg text-center">
                  👤 You're hosting this session
                </div>
                {!isPast && (
                  <button 
                    onClick={handleCancel}
                    className="w-full py-3 bg-red-500 text-white font-bold rounded-lg hover:bg-red-600 transition flex items-center justify-center gap-2"
                  >
                    <Trash2 className="w-5 h-5" />
                    Cancel Session
                  </button>
                )}
              </>
            ) : hasJoined ? (
              <button 
                onClick={handleLeave}
                className="w-full py-3 bg-orange-500 text-white font-bold rounded-lg hover:bg-orange-600 transition flex items-center justify-center gap-2"
              >
                <LogOut className="w-5 h-5" />
                Leave Session
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
          </div>
        </div>

        {/* Session Recap Section */}
        {isPast && (
          <div className="bg-white dark:bg-[#6B7178] rounded-xl p-6 shadow-lg">
            <div className="flex items-center gap-2 mb-4">
              <Camera className="w-5 h-5 text-tribe-green" />
              <h2 className="text-lg font-bold text-stone-900 dark:text-white">
                Session Recap
              </h2>
            </div>

            {session.recap_photos && session.recap_photos.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mb-4">
                {session.recap_photos.map((photo: string, idx: number) => (
                  <button
                    key={idx}
                    onClick={() => openLightbox(idx, 'recap')}
                    className="aspect-square rounded-lg overflow-hidden border-2 border-stone-200 hover:border-tribe-green transition active:scale-95"
                  >
                    <img
                      src={photo}
                      alt={`Recap ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}

            {canUploadRecap && (
              <div>
                {(!session.recap_photos || session.recap_photos.length < 5) ? (
                  <label className="w-full py-3 bg-tribe-green text-slate-900 font-bold rounded-lg hover:bg-lime-500 transition cursor-pointer flex items-center justify-center gap-2">
                    {uploadingRecap ? (
                      <>
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-slate-900"></div>
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="w-5 h-5" />
                        Upload Recap Photos ({session.recap_photos?.length || 0}/5)
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
                ) : (
                  <p className="text-sm text-center text-stone-500">
                    Maximum recap photos reached (5/5)
                  </p>
                )}
              </div>
            )}

            {!canUploadRecap && (!session.recap_photos || session.recap_photos.length === 0) && (
              <p className="text-sm text-center text-stone-500 py-4">
                No recap photos yet. Participants can upload after the session ends.
              </p>
            )}
          </div>
        )}

        {(creator || participants.length > 0) && (
          <div className="bg-white dark:bg-[#6B7178] rounded-xl p-6 shadow-lg">
            <h2 className="text-lg font-bold text-stone-900 dark:text-white mb-4">
              Participants ({participants.length + 1})
            </h2>
            <div className="grid grid-cols-1 gap-3">
              {creator && (
                <div className="flex items-center justify-between p-3 bg-stone-50 dark:bg-[#52575D] rounded-lg">
                  <Link href={`/profile/${creator.id}`} className="flex items-center gap-3 flex-1">
                    {creator.avatar_url ? (
                      <img
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
                      <p className="text-xs text-tribe-green font-semibold">Host</p>
                    </div>
                  </Link>
                </div>
              )}
              
              {participants.map((participant: any) => (
                <div key={participant.user_id} className="flex items-center justify-between p-3 bg-stone-50 dark:bg-[#52575D] rounded-lg">
                  <Link href={`/profile/${participant.user_id}`} className="flex items-center gap-3 flex-1">
                    {participant.user?.avatar_url ? (
                      <img
                        src={participant.user.avatar_url}
                        alt={participant.user.name}
                        className="w-12 h-12 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-tribe-green flex items-center justify-center text-slate-900 font-bold text-lg">
                        {participant.user?.name?.[0]?.toUpperCase() || 'U'}
                      </div>
                    )}
                    <p className="font-medium text-stone-900 dark:text-white">
                      {participant.user?.name || 'Unknown'}
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
    </div>
  );
}
