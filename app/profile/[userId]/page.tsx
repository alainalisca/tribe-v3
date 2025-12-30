'use client';
import { showSuccess, showError, showInfo } from '@/lib/toast';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, MapPin, Shield, Flag, X, ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import BottomNav from '@/components/BottomNav';
import { useLanguage } from '@/lib/LanguageContext';
import { sportTranslations } from '@/lib/translations';

export default function PublicProfilePage() {
  const router = useRouter();
  const params = useParams();
  const userId = params.userId as string;
  const supabase = createClient();
  const { language } = useLanguage();
  
  const [profile, setProfile] = useState<any>(null);
  const [stats, setStats] = useState({
    sessionsCreated: 0,
    sessionsJoined: 0,
    totalSessions: 0,
    attendanceRate: 0,
    totalAttendance: 0,
  });
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isBlocked, setIsBlocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportDescription, setReportDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const t = language === 'es' ? {
    loading: 'Cargando...',
    userNotFound: 'Usuario no encontrado',
    goBack: 'Volver',
    block: 'Bloquear',
    unblock: 'Desbloquear',
    report: 'Reportar',
    sessionsCreated: 'Sesiones Creadas',
    sessionsJoined: 'Sesiones Unidas',
    totalSessions: 'Total Sesiones',
    attendanceRate: 'Tasa de Asistencia',
    photos: 'Fotos',
    lowAttendance: 'Baja tasa de asistencia - Este usuario tiene una tasa de asistencia del',
    reportUser: 'Reportar Usuario',
    reason: 'Razón',
    selectReason: 'Selecciona una razón',
    harassment: 'Acoso',
    inappropriate: 'Comportamiento inapropiado',
    spam: 'Spam',
    fake: 'Cuenta falsa',
    noShow: 'Ausencias repetidas',
    other: 'Otro',
    additionalDetails: 'Detalles adicionales (opcional)',
    provideContext: 'Proporciona más contexto...',
    cancel: 'Cancelar',
    submit: 'Enviar Reporte',
    submitting: 'Enviando...',
    blockConfirm: '¿Bloquear a este usuario? No verás sus sesiones ni mensajes.',
    userBlocked: 'Usuario bloqueado',
    userUnblocked: 'Usuario desbloqueado',
    selectReasonError: 'Por favor selecciona una razón',
    reportSuccess: 'Reporte enviado. Nuestro equipo lo revisará.',
  } : {
    loading: 'Loading...',
    userNotFound: 'User not found',
    goBack: 'Go back',
    block: 'Block',
    unblock: 'Unblock',
    report: 'Report',
    sessionsCreated: 'Sessions Created',
    sessionsJoined: 'Sessions Joined',
    totalSessions: 'Total Sessions',
    attendanceRate: 'Attendance Rate',
    photos: 'Photos',
    lowAttendance: 'Low attendance rate - This user has a show-up rate of',
    reportUser: 'Report User',
    reason: 'Reason',
    selectReason: 'Select a reason',
    harassment: 'Harassment',
    inappropriate: 'Inappropriate behavior',
    spam: 'Spam',
    fake: 'Fake account',
    noShow: 'Repeated no-shows',
    other: 'Other',
    additionalDetails: 'Additional details (optional)',
    provideContext: 'Provide more context...',
    cancel: 'Cancel',
    submit: 'Submit Report',
    submitting: 'Submitting...',
    blockConfirm: "Block this user? You won't see their sessions or messages.",
    userBlocked: 'User blocked',
    userUnblocked: 'User unblocked',
    selectReasonError: 'Please select a reason',
    reportSuccess: 'Report submitted. Our team will review it.',
  };

  useEffect(() => {
    loadProfile();
    checkCurrentUser();
  }, [userId]);

  async function checkCurrentUser() {
    const { data: { user } } = await supabase.auth.getUser();
    setCurrentUser(user);
    
    if (user) {
      const { data } = await supabase
        .from('blocked_users')
        .select('id')
        .eq('user_id', user.id)
        .eq('blocked_user_id', userId)
        .single();
      
      setIsBlocked(!!data);
    }
  }

  async function loadProfile() {
    try {
      const { data: profileData } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      setProfile(profileData);

      const { count: created } = await supabase
        .from('sessions')
        .select('*', { count: 'exact', head: true })
        .eq('creator_id', userId)
        .eq('status', 'active');

      const { count: joined } = await supabase
        .from('session_participants')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

      const { data: attendanceData } = await supabase
        .rpc('get_user_attendance_stats', { user_uuid: userId });

      const attendance = attendanceData?.[0] || { 
        total_sessions: 0, 
        attended_sessions: 0, 
        attendance_rate: 0 
      };

      setStats({
        sessionsCreated: created || 0,
        sessionsJoined: joined || 0,
        totalSessions: (created || 0) + (joined || 0),
        attendanceRate: Number(attendance.attendance_rate) || 0,
        totalAttendance: Number(attendance.total_sessions) || 0,
      });
    } catch (error) {
      console.error('Error loading profile:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleBlock() {
    if (!currentUser) return;

    try {
      if (isBlocked) {
        await supabase
          .from('blocked_users')
          .delete()
          .eq('user_id', currentUser.id)
          .eq('blocked_user_id', userId);
        
        setIsBlocked(false);
        showSuccess(t.userUnblocked);
      } else {
        if (!confirm(t.blockConfirm)) return;
        
        await supabase
          .from('blocked_users')
          .insert({
            user_id: currentUser.id,
            blocked_user_id: userId,
          });
        
        setIsBlocked(true);
        showSuccess(t.userBlocked);
      }
    } catch (error: any) {
      showError('Error: ' + error.message);
    }
  }

  async function handleReport() {
    if (!reportReason.trim()) {
      showInfo(t.selectReasonError);
      return;
    }

    setSubmitting(true);
    try {
      await supabase
        .from('reported_users')
        .insert({
          reporter_id: currentUser.id,
          reported_user_id: userId,
          reason: reportReason,
          description: reportDescription,
        });

      showSuccess(t.reportSuccess);
      setShowReportModal(false);
      setReportReason('');
      setReportDescription('');
    } catch (error: any) {
      showError('Error: ' + error.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-theme-page flex items-center justify-center">
        <p className="text-theme-primary">{t.loading}</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-theme-page flex flex-col items-center justify-center">
        <p className="text-theme-primary mb-4">{t.userNotFound}</p>
        <button 
          onClick={() => router.back()}
          className="text-tribe-green hover:underline"
        >
          {t.goBack}
        </button>
      </div>
    );
  }

  const isOwnProfile = currentUser?.id === userId;
  const sports = profile.sports || [];
  const hasLowAttendance = stats.totalAttendance >= 3 && stats.attendanceRate < 50;

  return (
    <div className="min-h-screen bg-theme-page pb-32">
      <div className="bg-theme-card p-4 border-b border-theme">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
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
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  isBlocked 
                    ? 'bg-stone-200 text-stone-700 hover:bg-stone-300' 
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                }`}
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

      <div className="max-w-2xl mx-auto p-4">
        <div className="bg-theme-card rounded-2xl p-6 border border-theme">
          {profile.avatar_url && (
            <div className="flex justify-center mb-4">
              <img loading="lazy"
                src={profile.avatar_url}
                alt={profile.name}
                onClick={() => setLightboxPhoto(profile.avatar_url)}
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
              {profile?.username && (
                <span className="text-sm text-theme-secondary">@{profile.username}</span>
              )}
              {profile?.location && (
                <div className="flex items-center gap-1">
                  <MapPin className="w-4 h-4 text-tribe-green" />
                  <span className="text-sm text-theme-secondary">{profile.location}</span>
                </div>
              )}
            </div>
          </div>

          {/* Stats - 2x2 Grid Layout */}
          <div className="grid grid-cols-2 gap-3 mt-6">
            <div className="bg-white dark:bg-[#3D4349] rounded-2xl p-4 text-center border border-stone-200 dark:border-[#52575D]">
              <p className="text-4xl font-bold text-theme-primary">{stats.sessionsCreated}</p>
              <p className="text-sm text-theme-secondary mt-1">{t.sessionsCreated}</p>
            </div>
            <div className="bg-white dark:bg-[#3D4349] rounded-2xl p-4 text-center border border-stone-200 dark:border-[#52575D]">
              <p className="text-4xl font-bold text-theme-primary">{stats.sessionsJoined}</p>
              <p className="text-sm text-theme-secondary mt-1">{t.sessionsJoined}</p>
            </div>
            <div className="bg-white dark:bg-[#3D4349] rounded-2xl p-4 text-center border border-stone-200 dark:border-[#52575D]">
              <p className="text-4xl font-bold text-theme-primary">{stats.totalSessions}</p>
              <p className="text-sm text-theme-secondary mt-1">{t.totalSessions}</p>
            </div>
            <div className={`bg-white rounded-2xl p-4 text-center border ${
              hasLowAttendance ? 'border-orange-300 bg-orange-50' : 'border-stone-200'
            }`}>
              <p className={`text-4xl font-bold ${
                hasLowAttendance ? 'text-orange-600' : 'text-theme-primary'
              }`}>
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


          {/* Social Media Links */}
          {(profile?.instagram_username || profile?.facebook_url) && (
            <div className="mt-6 bg-white rounded-2xl p-5 border border-stone-200">
              <h3 className="text-sm font-bold text-theme-primary mb-3 flex items-center gap-2">
                🔗 {language === 'es' ? 'Redes Sociales' : 'Social Media'}
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
                    📘 Facebook Profile
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
                    }}
                  >
                    <img loading="lazy"
                      src={photo}
                      alt={`Photo ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
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

      {/* Photo Lightbox */}
      {lightboxPhoto && (
        <div
          className="fixed inset-0 bg-black/90 flex items-center justify-center z-50"
          onClick={() => setLightboxPhoto(null)}
        >
          <button
            onClick={() => setLightboxPhoto(null)}
            className="absolute top-4 right-4 p-2 text-white hover:bg-white/10 rounded-full transition z-10"
          >
            <X className="w-8 h-8" />
          </button>

          {profile?.photos && profile.photos.length > 1 && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const newIndex = (lightboxIndex - 1 + profile.photos.length) % profile.photos.length;
                  setLightboxIndex(newIndex);
                  setLightboxPhoto(profile.photos[newIndex]);
                }}
                className="absolute left-4 p-2 text-white hover:bg-white/10 rounded-full transition"
              >
                <ChevronLeft className="w-8 h-8" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const newIndex = (lightboxIndex + 1) % profile.photos.length;
                  setLightboxIndex(newIndex);
                  setLightboxPhoto(profile.photos[newIndex]);
                }}
                className="absolute right-4 p-2 text-white hover:bg-white/10 rounded-full transition"
              >
                <ChevronRight className="w-8 h-8" />
              </button>
            </>
          )}

          <img
            src={lightboxPhoto}
            alt="Full size"
            onClick={(e) => e.stopPropagation()}
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
          />
        </div>
      )}

      {showReportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-xl font-bold mb-4">{t.reportUser}</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">{t.reason} *</label>
                <select
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  className="w-full p-2 border rounded-lg text-stone-900"
                >
                  <option value="">{t.selectReason}</option>
                  <option value="harassment">{t.harassment}</option>
                  <option value="inappropriate">{t.inappropriate}</option>
                  <option value="spam">{t.spam}</option>
                  <option value="fake">{t.fake}</option>
                  <option value="no-show">{t.noShow}</option>
                  <option value="other">{t.other}</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">{t.additionalDetails}</label>
                <textarea
                  value={reportDescription}
                  onChange={(e) => setReportDescription(e.target.value)}
                  placeholder={t.provideContext}
                  className="w-full p-2 border rounded-lg h-24 resize-none text-stone-900"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowReportModal(false)}
                className="flex-1 px-4 py-2 border border-stone-300 rounded-lg hover:bg-stone-50"
                disabled={submitting}
              >
                {t.cancel}
              </button>
              <button
                onClick={handleReport}
                disabled={submitting || !reportReason}
                className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50"
              >
                {submitting ? t.submitting : t.submit}
              </button>
            </div>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}
