'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ArrowLeft, Calendar, Clock, MapPin, Users, UserPlus, UserMinus, X, Edit2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import Link from 'next/link';
import { useLanguage } from '@/lib/LanguageContext';
import BottomNav from '@/components/BottomNav';

export default function SessionDetailPage() {
  const router = useRouter();
  const params = useParams();
  const sessionId = params.id as string;
  const supabase = createClient();
  const { t } = useLanguage();
  
  const [session, setSession] = useState<any>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const [user, setUser] = useState<any>(null);
  const [hasJoined, setHasJoined] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    checkUser();
  }, []);

  useEffect(() => {
    if (user && sessionId) {
      loadSession();
    }
  }, [user, sessionId]);

  async function checkUser() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/auth');
    } else {
      setUser(user);
    }
  }

  async function loadSession() {
    try {
      setLoading(true);

      const { data: sessionData, error: sessionError } = await supabase
        .from('sessions')
        .select('*')
        .eq('id', sessionId)
        .single();

      if (sessionError) throw sessionError;
      setSession(sessionData);

      const { data: participantsData, error: participantsError } = await supabase
        .from('session_participants')
        .select(`
          *,
          user:users(id, name, avatar_url)
        `)
        .eq('session_id', sessionId);

      if (participantsError) throw participantsError;
      setParticipants(participantsData || []);

      const isParticipant = participantsData?.some((p) => p.user_id === user.id);
      setHasJoined(isParticipant || false);
    } catch (error) {
      console.error('Error loading session:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleJoinSession() {
    if (!session || !user) return;

    if (session.current_participants >= session.max_participants) {
      alert('Session is full');
      return;
    }

    try {
      setActionLoading(true);

      const { error: joinError } = await supabase
        .from('session_participants')
        .insert({
          session_id: sessionId,
          user_id: user.id,
          status: 'confirmed',
        });

      if (joinError) throw joinError;

      const { error: updateError } = await supabase
        .from('sessions')
        .update({ current_participants: session.current_participants + 1 })
        .eq('id', sessionId);

      if (updateError) throw updateError;

      await loadSession();
      alert('Successfully joined session!');
    } catch (error: any) {
      console.error('Error joining session:', error);
      alert('Error: ' + error.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleLeaveSession() {
    if (!session || !user) return;

    try {
      setActionLoading(true);

      const { error: deleteError } = await supabase
        .from('session_participants')
        .delete()
        .eq('session_id', sessionId)
        .eq('user_id', user.id);

      if (deleteError) throw deleteError;

      const { error: updateError } = await supabase
        .from('sessions')
        .update({ current_participants: session.current_participants - 1 })
        .eq('id', sessionId);

      if (updateError) throw updateError;

      await loadSession();
      alert('You have left the session');
    } catch (error: any) {
      console.error('Error leaving session:', error);
      alert('Error: ' + error.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCancelSession() {
    if (!confirm('Are you sure you want to cancel this session?')) return;

    try {
      setActionLoading(true);

      const { error } = await supabase
        .from('sessions')
        .update({ status: 'cancelled' })
        .eq('id', sessionId);

      if (error) throw error;

      alert('Session cancelled');
      router.push('/');
    } catch (error: any) {
      console.error('Error cancelling session:', error);
      alert('Error: ' + error.message);
    } finally {
      setActionLoading(false);
    }
  }

  if (!user || loading) {
    return (
      <div className="min-h-screen bg-theme-page flex items-center justify-center">
        <p className="text-theme-primary">{t('loading')}</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-theme-page flex items-center justify-center">
        <p className="text-theme-primary">Session not found</p>
      </div>
    );
  }

  const isCreator = session.creator_id === user.id;
  const isFull = session.current_participants >= session.max_participants;
  const date = format(parseISO(session.date), 'EEEE, MMMM d, yyyy');
  const startTime = session.start_time;

  return (
    <div className="min-h-screen bg-theme-page pb-20">
      {/* Header */}
      <div className="bg-theme-card p-4 sticky top-0 z-10 border-b border-theme">
        <div className="max-w-2xl mx-auto flex items-center">
          <Link href="/">
            <button className="p-2 hover:bg-stone-200 rounded-lg transition mr-3">
              <ArrowLeft className="w-6 h-6 text-theme-primary" />
            </button>
          </Link>
          <h1 className="text-xl font-bold text-theme-primary">{t('sessionDetails')}</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-4">
        {/* Main Info Card */}
        <div className="bg-theme-card rounded-xl p-6 border border-theme">
          <span className="inline-block px-4 py-2 rounded-full text-sm font-bold bg-tribe-green text-slate-900 mb-4">
            {session.sport}
          </span>

          <div className="space-y-3">
            <div className="flex items-center text-theme-secondary">
              <Calendar className="w-5 h-5 mr-3 text-tribe-green" />
              <span className="font-medium">{date}</span>
            </div>

            <div className="flex items-center text-theme-secondary">
              <Clock className="w-5 h-5 mr-3 text-tribe-green" />
              <span className="font-medium">{startTime}</span>
            </div>

            <div className="flex items-start text-theme-secondary">
              <MapPin className="w-5 h-5 mr-3 mt-0.5 text-tribe-green flex-shrink-0" />
              <span className="font-medium">{session.location}</span>
            </div>

            <div className="flex items-center text-theme-secondary">
              <Users className="w-5 h-5 mr-3 text-tribe-green" />
              <span className="font-medium">
                {session.current_participants}/{session.max_participants} participants
              </span>
            </div>

            {session.description && (
              <div className="pt-3 border-t border-theme">
                <p className="text-theme-secondary">{session.description}</p>
              </div>
            )}
          </div>
        </div>

        {/* Participants - CLICKABLE */}
        {participants.length > 0 && (
          <div className="bg-theme-card rounded-xl p-6 border border-theme">
            <h2 className="text-lg font-bold text-theme-primary mb-4">Participants</h2>
            <div className="space-y-2">
              {participants.map((participant) => (
                <Link
                  key={participant.user_id}
                  href={`/profile/${participant.user_id}`}
                  className="flex items-center p-3 rounded-lg hover:bg-stone-100 transition cursor-pointer"
                >
                  <div className="w-12 h-12 rounded-full bg-tribe-green flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {participant.user?.avatar_url ? (
                      <img src={participant.user.avatar_url} alt={participant.user.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-lg font-bold text-slate-900">
                        {participant.user?.name?.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="ml-3">
                    <p className="text-theme-primary text-base font-semibold hover:text-tribe-green">
                      {participant.user?.name}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-3">
          {isCreator ? (
            <>
              <Link href={`/session/${sessionId}/edit`}>
                <button className="w-full py-3 bg-tribe-green text-slate-900 font-bold rounded-xl hover:opacity-90 transition flex items-center justify-center gap-2">
                  <Edit2 className="w-5 h-5" />
                  {t('editSession')}
                </button>
              </Link>
              <button
                onClick={handleCancelSession}
                disabled={actionLoading}
                className="w-full py-3 bg-red-500/20 text-red-600 font-semibold rounded-xl hover:bg-red-500/30 transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <X className="w-5 h-5" />
                {actionLoading ? t('saving') : t('cancelSession')}
              </button>
            </>
          ) : hasJoined ? (
            <button
              onClick={handleLeaveSession}
              disabled={actionLoading}
              className="w-full py-3 bg-red-500/20 text-red-600 font-semibold rounded-xl hover:bg-red-500/30 transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <UserMinus className="w-5 h-5" />
              {t('leaveSession')}
            </button>
          ) : (
            <button
              onClick={handleJoinSession}
              disabled={actionLoading || isFull}
              className={`w-full py-3 font-bold rounded-xl transition flex items-center justify-center gap-2 ${
                isFull
                  ? 'bg-gray-400 text-gray-600 cursor-not-allowed'
                  : 'bg-tribe-green text-slate-900 hover:opacity-90'
              }`}
            >
              <UserPlus className="w-5 h-5" />
              {isFull ? t('sessionFull') : t('joinSession')}
            </button>
          )}
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
