'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ArrowLeft, Calendar, Clock, MapPin, Users, Award, UserPlus, UserMinus, MessageCircle, X } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import Link from 'next/link';

export default function SessionDetailPage() {
  const router = useRouter();
  const params = useParams();
  const sessionId = params.id as string;
  const supabase = createClient();
  
  const [session, setSession] = useState<any>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const [user, setUser] = useState<any>(null);
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

      // Get session details
      const { data: sessionData, error: sessionError } = await supabase
        .from('sessions')
        .select('*')
        .eq('id', sessionId)
        .single();

      if (sessionError) throw sessionError;

      // Get creator details
      const { data: creator, error: creatorError } = await supabase
        .from('users')
        .select('id, name, avatar_url')
        .eq('id', sessionData.creator_id)
        .single();

      if (creatorError) throw creatorError;

      setSession({ ...sessionData, creator });

      // Get participants
      const { data: participantData, error: partError } = await supabase
        .from('session_participants')
        .select('user_id, joined_at, status')
        .eq('session_id', sessionId)
        .eq('status', 'confirmed');

      if (partError) throw partError;

      if (participantData && participantData.length > 0) {
        const userIds = participantData.map(p => p.user_id);
        
        const { data: users, error: usersError } = await supabase
          .from('users')
          .select('id, name, avatar_url')
          .in('id', userIds);

        if (usersError) throw usersError;

        const enrichedParticipants = participantData.map(p => ({
          ...p,
          user: users?.find(u => u.id === p.user_id)
        }));

        setParticipants(enrichedParticipants);
      }
    } catch (error) {
      console.error('Error loading session:', error);
      alert('Error loading session');
    } finally {
      setLoading(false);
    }
  }

  async function handleJoinSession() {
    if (!user || !session) return;

    try {
      setActionLoading(true);

      // Check if already joined
      const { data: existing } = await supabase
        .from('session_participants')
        .select('id')
        .eq('session_id', sessionId)
        .eq('user_id', user.id)
        .single();

      if (existing) {
        alert('You already joined this session!');
        return;
      }

      // Check if full
      if (session.current_participants >= session.max_participants) {
        alert('This session is full!');
        return;
      }

      // Join session
      const { error: joinError } = await supabase
        .from('session_participants')
        .insert({
          session_id: sessionId,
          user_id: user.id,
          status: 'confirmed',
        });

      if (joinError) throw joinError;

      // Update participant count
      const { error: updateError } = await supabase
        .from('sessions')
        .update({ current_participants: session.current_participants + 1 })
        .eq('id', sessionId);

      if (updateError) throw updateError;

      alert('Successfully joined session!');
      await loadSession();
    } catch (error: any) {
      console.error('Error joining session:', error);
      alert('Error joining session: ' + error.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleLeaveSession() {
    if (!user || !session) return;

    if (!confirm('Are you sure you want to leave this session?')) return;

    try {
      setActionLoading(true);

      // Remove from participants
      const { error: deleteError } = await supabase
        .from('session_participants')
        .delete()
        .eq('session_id', sessionId)
        .eq('user_id', user.id);

      if (deleteError) throw deleteError;

      // Update participant count
      const { error: updateError } = await supabase
        .from('sessions')
        .update({ current_participants: Math.max(0, session.current_participants - 1) })
        .eq('id', sessionId);

      if (updateError) throw updateError;

      alert('Successfully left session');
      router.push('/');
    } catch (error: any) {
      console.error('Error leaving session:', error);
      alert('Error leaving session: ' + error.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCancelSession() {
    if (!confirm('Are you sure you want to cancel this session? This cannot be undone.')) return;

    try {
      setActionLoading(true);

      const { error } = await supabase
        .from('sessions')
        .update({ status: 'cancelled' })
        .eq('id', sessionId);

      if (error) throw error;

      alert('Session cancelled');
      router.push('/sessions');
    } catch (error: any) {
      console.error('Error cancelling session:', error);
      alert('Error cancelling session: ' + error.message);
    } finally {
      setActionLoading(false);
    }
  }

  if (loading || !session) {
    return (
      <div className="min-h-screen bg-tribe-darker flex items-center justify-center">
        <p className="text-white">Loading...</p>
      </div>
    );
  }

  const isCreator = user?.id === session.creator_id;
  const hasJoined = participants.some(p => p.user_id === user?.id);
  const isFull = session.current_participants >= session.max_participants;

  const date = format(parseISO(session.date), 'EEEE, MMMM d, yyyy');
  const startTime = format(parseISO(`2000-01-01T${session.start_time}`), 'h:mm a');
  const endTime = session.end_time ? format(parseISO(`2000-01-01T${session.end_time}`), 'h:mm a') : null;

  const sportColors: Record<string, string> = {
    football: 'bg-gray-700',
    basketball: 'bg-blue-500',
    crossfit: 'bg-orange-500',
    bjj: 'bg-purple-600',
    running: 'bg-green-500',
    swimming: 'bg-cyan-500',
    tennis: 'bg-yellow-500',
    volleyball: 'bg-pink-500',
    soccer: 'bg-green-600',
  };

  const sportColor = sportColors[session.sport?.toLowerCase()] || 'bg-gray-600';

  const getColorFromName = (name: string) => {
    const colors = [
      'bg-red-500',
      'bg-blue-500',
      'bg-green-500',
      'bg-yellow-500',
      'bg-purple-500',
      'bg-pink-500',
      'bg-indigo-500',
      'bg-orange-500',
    ];
    const index = name?.charCodeAt(0) % colors.length || 0;
    return colors[index];
  };

  return (
    <div className="min-h-screen bg-tribe-darker pb-20">
      {/* Header */}
      <div className="bg-tribe-dark p-4 sticky top-0 z-10 border-b border-slate-700">
        <div className="max-w-2xl mx-auto flex items-center">
          <Link href="/">
            <button className="p-2 hover:bg-slate-700 rounded-lg transition mr-3">
              <ArrowLeft className="w-6 h-6 text-white" />
            </button>
          </Link>
          <h1 className="text-xl font-bold text-white">Session Details</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-4">
        {/* Main Info Card */}
        <div className="bg-tribe-dark rounded-xl p-6 border border-slate-700">
          <span className={`inline-block px-4 py-2 rounded-full text-sm font-bold text-white ${sportColor} mb-4`}>
            {session.sport}
          </span>

          <div className="space-y-3">
            <div className="flex items-center text-gray-300">
              <Calendar className="w-5 h-5 mr-3 text-tribe-green" />
              <span className="font-medium">{date}</span>
            </div>

            <div className="flex items-center text-gray-300">
              <Clock className="w-5 h-5 mr-3 text-tribe-green" />
              <span className="font-medium">
                {startTime} {endTime && `- ${endTime}`}
              </span>
            </div>

            <div className="flex items-start text-gray-300">
              <MapPin className="w-5 h-5 mr-3 mt-0.5 text-tribe-green flex-shrink-0" />
              <span className="font-medium">{session.location}</span>
            </div>

            <div className="flex items-center text-gray-300">
              <Users className="w-5 h-5 mr-3 text-tribe-green" />
              <span className="font-medium">
                {session.current_participants}/{session.max_participants} participants
              </span>
              {isFull && <span className="ml-2 text-xs text-red-400">(Full)</span>}
            </div>

            {session.skill_level && (
              <div className="flex items-center text-gray-300">
                <Award className="w-5 h-5 mr-3 text-tribe-green" />
                <span className="font-medium capitalize">{session.skill_level}</span>
              </div>
            )}
          </div>

          {session.description && (
            <div className="mt-4 pt-4 border-t border-slate-600">
              <p className="text-gray-300 text-sm leading-relaxed">{session.description}</p>
            </div>
          )}
        </div>

        {/* Host Card */}
        <div className="bg-tribe-dark rounded-xl p-4 border border-slate-700">
          <h3 className="text-white font-semibold mb-3">Host</h3>
          <div className="flex items-center">
            <div className={`w-12 h-12 rounded-full ${getColorFromName(session.creator?.name || '')} flex items-center justify-center flex-shrink-0`}>
              {session.creator?.avatar_url ? (
                <img src={session.creator.avatar_url} alt="Host" className="w-full h-full rounded-full object-cover" />
              ) : (
                <span className="text-lg font-bold text-white">
                  {session.creator?.name?.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <div className="ml-3">
              <p className="text-white font-medium">{session.creator?.name}</p>
              <p className="text-xs text-gray-400">Session organizer</p>
            </div>
          </div>
        </div>

        {/* Participants Card */}
        <div className="bg-tribe-dark rounded-xl p-4 border border-slate-700">
          <h3 className="text-white font-semibold mb-3">
            Participants ({participants.length})
          </h3>
          {participants.length === 0 ? (
            <p className="text-gray-400 text-sm">No participants yet. Be the first to join!</p>
          ) : (
            <div className="space-y-2">
              {participants.map((participant) => (
                <div key={participant.user_id} className="flex items-center">
                  <div className={`w-10 h-10 rounded-full ${getColorFromName(participant.user?.name || '')} flex items-center justify-center flex-shrink-0`}>
                    {participant.user?.avatar_url ? (
                      <img src={participant.user.avatar_url} alt={participant.user.name} className="w-full h-full rounded-full object-cover" />
                    ) : (
                      <span className="text-sm font-bold text-white">
                        {participant.user?.name?.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="ml-3">
                    <p className="text-white text-sm font-medium">{participant.user?.name}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="space-y-3">
          {isCreator ? (
            <>
              <button className="w-full py-3 bg-tribe-green text-slate-900 font-bold rounded-xl hover:bg-lime-500 transition flex items-center justify-center gap-2">
                <MessageCircle className="w-5 h-5" />
                Open Group Chat
              </button>
              <button
                onClick={handleCancelSession}
                disabled={actionLoading}
                className="w-full py-3 bg-red-500/20 text-red-400 font-semibold rounded-xl hover:bg-red-500/30 transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <X className="w-5 h-5" />
                Cancel Session
              </button>
            </>
          ) : hasJoined ? (
            <>
              <button className="w-full py-3 bg-tribe-green text-slate-900 font-bold rounded-xl hover:bg-lime-500 transition flex items-center justify-center gap-2">
                <MessageCircle className="w-5 h-5" />
                Open Group Chat
              </button>
              <button
                onClick={handleLeaveSession}
                disabled={actionLoading}
                className="w-full py-3 bg-red-500/20 text-red-400 font-semibold rounded-xl hover:bg-red-500/30 transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <UserMinus className="w-5 h-5" />
                Leave Session
              </button>
            </>
          ) : (
            <button
              onClick={handleJoinSession}
              disabled={actionLoading || isFull}
              className={`w-full py-3 font-bold rounded-xl transition flex items-center justify-center gap-2 ${
                isFull
                  ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  : 'bg-tribe-green text-slate-900 hover:bg-lime-500'
              }`}
            >
              <UserPlus className="w-5 h-5" />
              {isFull ? 'Session Full' : 'Join Session'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
