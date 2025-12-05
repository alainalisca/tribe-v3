'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/LanguageContext';
import { showSuccess, showError } from '@/lib/toast';
import { Calendar, MapPin, Users, Clock } from 'lucide-react';
import Link from 'next/link';

export default function InvitePage() {
  const router = useRouter();
  const params = useParams();
  const token = params.token as string;
  const supabase = createClient();
  const { language } = useLanguage();
  
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<any>(null);
  const [inviter, setInviter] = useState<any>(null);
  const [isGuest, setIsGuest] = useState(true);
  const [joining, setJoining] = useState(false);
  
  const [guestData, setGuestData] = useState({
    name: '',
    phone: '',
    email: '',
  });

  useEffect(() => {
    loadInvite();
  }, [token]);

  async function loadInvite() {
    try {
      // Check if user is logged in
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setIsGuest(false);
      }

      // Load invite token
      const { data: inviteData, error: inviteError } = await supabase
        .from('invite_tokens')
        .select('*, session:sessions(*)')
        .eq('token', token)
        .single();

      if (inviteError) throw inviteError;

      // Check if token expired
      if (new Date(inviteData.expires_at) < new Date()) {
        showError(language === 'es' ? 'Invitación expirada' : 'Invite expired');
        return;
      }

      setSession(inviteData.session);

      // Load inviter info
      const { data: inviterData } = await supabase
        .from('users')
        .select('name, avatar_url')
        .eq('id', inviteData.created_by)
        .single();

      setInviter(inviterData);
    } catch (error) {
      console.error('Error loading invite:', error);
      showError(language === 'es' ? 'Invitación inválida' : 'Invalid invite');
    } finally {
      setLoading(false);
    }
  }

  async function handleGuestJoin() {
    if (!guestData.name || !guestData.phone) {
      showError(language === 'es' ? 'Completa nombre y teléfono' : 'Fill in name and phone');
      return;
    }

    try {
      setJoining(true);

      // Check if session is full
      if (session.current_participants >= session.max_participants) {
        showError(language === 'es' ? 'Sesión llena' : 'Session full');
        return;
      }

      // Add guest to participants
      const { error } = await supabase
        .from('session_participants')
        .insert({
          session_id: session.id,
          user_id: null,
          is_guest: true,
          guest_name: guestData.name,
          guest_phone: guestData.phone,
          guest_email: guestData.email || null,
          status: 'confirmed',
        });

      if (error) throw error;

      // Update participant count
      await supabase
        .from('sessions')
        .update({ current_participants: session.current_participants + 1 })
        .eq('id', session.id);

      showSuccess(language === 'es' ? '¡Confirmado! Te esperamos' : 'Confirmed! See you there');
      
      // Show success message with session details
      setTimeout(() => {
        router.push('/');
      }, 3000);
    } catch (error: any) {
      showError('Error: ' + error.message);
    } finally {
      setJoining(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-[#52575D] flex items-center justify-center">
        <p className="text-theme-primary">Loading...</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-[#52575D] flex items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-theme-primary mb-2">
            {language === 'es' ? 'Invitación no encontrada' : 'Invite not found'}
          </h1>
          <Link href="/" className="text-tribe-green hover:underline">
            {language === 'es' ? 'Ir a inicio' : 'Go home'}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-[#52575D] pb-20">
      <div className="bg-tribe-green p-6 text-center">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">
          {language === 'es' ? '¡Estás invitado!' : "You're Invited!"}
        </h1>
        {inviter && (
          <p className="text-slate-800">
            {language === 'es' ? 'Por' : 'By'} {inviter.name}
          </p>
        )}
      </div>

      <div className="max-w-md mx-auto p-4">
        {/* Session Details */}
        <div className="bg-white dark:bg-[#6B7178] rounded-xl p-4 mb-4 shadow">
          <h2 className="text-xl font-bold text-theme-primary mb-3">{session.sport}</h2>
          
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2 text-stone-600 dark:text-gray-300">
              <Calendar className="w-4 h-4" />
              <span>{new Date(session.date).toLocaleDateString()}</span>
            </div>
            <div className="flex items-center gap-2 text-stone-600 dark:text-gray-300">
              <Clock className="w-4 h-4" />
              <span>{session.start_time} • {session.duration} min</span>
            </div>
            <div className="flex items-center gap-2 text-stone-600 dark:text-gray-300">
              <MapPin className="w-4 h-4" />
              <span>{session.location}</span>
            </div>
            <div className="flex items-center gap-2 text-stone-600 dark:text-gray-300">
              <Users className="w-4 h-4" />
              <span>{session.current_participants}/{session.max_participants} {language === 'es' ? 'confirmados' : 'confirmed'}</span>
            </div>
          </div>

          {session.description && (
            <p className="text-sm text-stone-600 dark:text-gray-300 mt-3 pt-3 border-t border-stone-200 dark:border-[#52575D]">
              {session.description}
            </p>
          )}
        </div>

        {/* Join Form */}
        {isGuest ? (
          <div className="bg-white dark:bg-[#6B7178] rounded-xl p-4 shadow">
            <h3 className="text-lg font-bold text-theme-primary mb-3">
              {language === 'es' ? 'Confirma tu asistencia' : 'Confirm your spot'}
            </h3>
            
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-theme-primary mb-1">
                  {language === 'es' ? 'Nombre completo' : 'Full name'} *
                </label>
                <input
                  type="text"
                  value={guestData.name}
                  onChange={(e) => setGuestData({ ...guestData, name: e.target.value })}
                  placeholder={language === 'es' ? 'Juan Pérez' : 'John Smith'}
                  className="w-full px-4 py-3 border border-stone-300 dark:border-[#52575D] rounded-lg bg-white dark:bg-[#52575D] text-theme-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-theme-primary mb-1">
                  {language === 'es' ? 'Teléfono' : 'Phone'} *
                </label>
                <input
                  type="tel"
                  value={guestData.phone}
                  onChange={(e) => setGuestData({ ...guestData, phone: e.target.value })}
                  placeholder="+57 300 123 4567"
                  className="w-full px-4 py-3 border border-stone-300 dark:border-[#52575D] rounded-lg bg-white dark:bg-[#52575D] text-theme-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-theme-primary mb-1">
                  {language === 'es' ? 'Email (opcional)' : 'Email (optional)'}
                </label>
                <input
                  type="email"
                  value={guestData.email}
                  onChange={(e) => setGuestData({ ...guestData, email: e.target.value })}
                  placeholder="email@example.com"
                  className="w-full px-4 py-3 border border-stone-300 dark:border-[#52575D] rounded-lg bg-white dark:bg-[#52575D] text-theme-primary"
                />
              </div>

              <button
                onClick={handleGuestJoin}
                disabled={joining}
                className="w-full py-3 bg-tribe-green text-slate-900 font-bold rounded-lg hover:bg-lime-500 transition disabled:opacity-50"
              >
                {joining 
                  ? (language === 'es' ? 'Confirmando...' : 'Confirming...') 
                  : (language === 'es' ? 'Confirmar asistencia' : 'Confirm attendance')}
              </button>

              <p className="text-xs text-center text-stone-500 dark:text-gray-400 mt-3">
                {language === 'es' 
                  ? 'Tu info se compartirá con el organizador'
                  : 'Your info will be shared with the organizer'}
              </p>
            </div>
          </div>
        ) : (
          <div className="bg-white dark:bg-[#6B7178] rounded-xl p-4 shadow text-center">
            <p className="text-theme-primary mb-4">
              {language === 'es' 
                ? 'Ya tienes cuenta. ¡Únete desde la app!'
                : 'You have an account. Join from the app!'}
            </p>
            <Link 
              href={`/session/${session.id}`}
              className="inline-block px-6 py-3 bg-tribe-green text-slate-900 font-bold rounded-lg hover:bg-lime-500 transition"
            >
              {language === 'es' ? 'Ver sesión' : 'View session'}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
