'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Calendar, Clock, MapPin, Users, ArrowLeft, Trash2, LogOut } from 'lucide-react';
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

  useEffect(() => {
    checkUser();
    loadSession();
  }, [params.id]);

  async function checkUser() {
    const { data: { user } } = await supabase.auth.getUser();
    setUser(user);
  }

  async function loadSession() {
    try {
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

      // Check if current user has joined
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
      loadSession();
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

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-[#52575D] pb-20">
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
        {/* Session Info Card */}
        <div className="bg-white dark:bg-[#6B7178] rounded-xl p-6 shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <span className="px-4 py-2 bg-tribe-green text-slate-900 rounded-full text-lg font-bold">
              {session.sport}
            </span>
            <div className="text-right">
              <div className="text-stone-600 dark:text-gray-300 text-sm mb-1">
                {session.current_participants}/{session.max_participants} participants
              </div>
              <div className="w-24 h-2 bg-stone-200 dark:bg-[#52575D] rounded-full overflow-hidden">
                <div 
                  className={`h-full ${isFull ? 'bg-red-500' : 'bg-tribe-green'}`}
                  style={{ width: `${(session.current_participants / session.max_participants) * 100}%` }}
                />
              </div>
            </div>
          </div>

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

          {/* Action Buttons */}
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

        {/* Participants Card */}
        {participants.length > 0 && (
          <div className="bg-white dark:bg-[#6B7178] rounded-xl p-6 shadow-lg">
            <h2 className="text-lg font-bold text-stone-900 dark:text-white mb-4">
              Participants ({participants.length})
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {creator && (
                <Link href={`/profile/${creator.id}`}>
                  <div className="flex flex-col items-center p-3 bg-stone-50 dark:bg-[#52575D] rounded-lg hover:bg-stone-100 dark:hover:bg-[#404549] transition cursor-pointer">
                    {creator.avatar_url ? (
                      <img
                        src={creator.avatar_url}
                        alt={creator.name}
                        className="w-16 h-16 rounded-full object-cover mb-2"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-full bg-tribe-green flex items-center justify-center text-slate-900 font-bold text-xl mb-2">
                        {creator.name[0]?.toUpperCase()}
                      </div>
                    )}
                    <p className="text-sm font-medium text-stone-900 dark:text-white text-center truncate w-full">
                      {creator.name}
                    </p>
                    <p className="text-xs text-tribe-green font-semibold">Host</p>
                  </div>
                </Link>
              )}
              
              {participants.map((participant: any) => (
                <Link key={participant.user_id} href={`/profile/${participant.user_id}`}>
                  <div className="flex flex-col items-center p-3 bg-stone-50 dark:bg-[#52575D] rounded-lg hover:bg-stone-100 dark:hover:bg-[#404549] transition cursor-pointer">
                    {participant.user?.avatar_url ? (
                      <img
                        src={participant.user.avatar_url}
                        alt={participant.user.name}
                        className="w-16 h-16 rounded-full object-cover mb-2"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-full bg-tribe-green flex items-center justify-center text-slate-900 font-bold text-xl mb-2">
                        {participant.user?.name?.[0]?.toUpperCase() || 'U'}
                      </div>
                    )}
                    <p className="text-sm font-medium text-stone-900 dark:text-white text-center truncate w-full">
                      {participant.user?.name || 'Unknown'}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Attendance Tracker */}
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
