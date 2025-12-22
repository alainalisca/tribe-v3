'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Check, X } from 'lucide-react';

interface AttendanceTrackerProps {
  sessionId: string;
  isHost: boolean;
  isAdmin: boolean;
  sessionDate: string;
}

export default function AttendanceTracker({ sessionId, isHost, isAdmin, sessionDate }: AttendanceTrackerProps) {
  const supabase = createClient();
  const [participants, setParticipants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingEmail, setSendingEmail] = useState<string | null>(null);

  const canManageAttendance = isHost || isAdmin;
  const sessionHasPassed = new Date(sessionDate) < new Date();

  useEffect(() => {
    if (canManageAttendance && sessionHasPassed) {
      loadParticipants();
    } else {
      setLoading(false);
    }
  }, [sessionId, canManageAttendance, sessionHasPassed]);

  async function loadParticipants() {
    try {
      const { data: participantsData } = await supabase
        .from('session_participants')
        .select(`
          user_id,
          user:users(id, name, avatar_url)
        `)
        .eq('session_id', sessionId)
        .eq('status', 'confirmed');

      if (!participantsData) {
        setParticipants([]);
        return;
      }

      const participantsWithAttendance = await Promise.all(
        participantsData.map(async (p) => {
          const { data: attendanceData } = await supabase
            .from('session_attendance')
            .select('attended')
            .eq('session_id', sessionId)
            .eq('user_id', p.user_id)
            .single();

          return {
            ...p,
            attended: attendanceData?.attended || false
          };
        })
      );

      setParticipants(participantsWithAttendance);
    } catch (error) {
      console.error('Error loading participants:', error);
    } finally {
      setLoading(false);
    }
  }

  async function markAttendance(userId: string, attended: boolean) {
    try {
      setSendingEmail(userId);
      
      const { data: existing } = await supabase
        .from('session_attendance')
        .select('id')
        .eq('session_id', sessionId)
        .eq('user_id', userId)
        .single();

      if (existing) {
        await supabase
          .from('session_attendance')
          .update({ attended })
          .eq('session_id', sessionId)
          .eq('user_id', userId);
      } else {
        await supabase
          .from('session_attendance')
          .insert({
            session_id: sessionId,
            user_id: userId,
            attended
          });
      }

      // Send email notification if marking as attended
      if (attended) {
        try {
          await fetch('/api/send-attendance-notification', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, userId })
          });
        } catch (emailError) {
          console.error('Failed to send email:', emailError);
          // Don't fail the whole operation if email fails
        }
      }

      await loadParticipants();
    } catch (error: any) {
      alert('Error: ' + error.message);
    } finally {
      setSendingEmail(null);
    }
  }

  if (!canManageAttendance || !sessionHasPassed) {
    return null;
  }

  if (loading) {
    return (
      <div className="bg-white dark:bg-[#6B7178] rounded-xl p-6 shadow-lg">
        <p className="text-stone-500 dark:text-gray-400">Loading attendance...</p>
      </div>
    );
  }

  if (participants.length === 0) {
    return null;
  }

  return (
    <div className="bg-white dark:bg-[#6B7178] rounded-xl p-6 shadow-lg">
      <h2 className="text-lg font-bold text-stone-900 dark:text-white mb-4">
        Mark Attendance
      </h2>
      <p className="text-sm text-stone-600 dark:text-gray-300 mb-4">
        Mark who attended to allow them to upload photos
      </p>
      <div className="space-y-2">
        {participants.map((participant) => (
          <div
            key={participant.user_id}
            className="flex items-center justify-between p-3 bg-stone-50 dark:bg-[#52575D] rounded-lg"
          >
            <div className="flex items-center gap-3">
              {participant.user?.avatar_url ? (
                <img
                  src={participant.user.avatar_url}
                  alt={participant.user.name}
                  className="w-10 h-10 rounded-full object-cover"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-tribe-green flex items-center justify-center text-slate-900 font-bold">
                  {participant.user?.name?.[0]?.toUpperCase()}
                </div>
              )}
              <span className="font-medium text-stone-900 dark:text-white">
                {participant.user?.name}
              </span>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => markAttendance(participant.user_id, true)}
                disabled={participant.attended || sendingEmail === participant.user_id}
                className={`p-2 rounded-lg transition ${
                  participant.attended
                    ? 'bg-green-500 text-white'
                    : 'bg-stone-200 dark:bg-[#6B7178] text-stone-600 dark:text-gray-400 hover:bg-green-500 hover:text-white'
                }`}
                title="Mark as attended"
              >
                {sendingEmail === participant.user_id ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                ) : (
                  <Check className="w-5 h-5" />
                )}
              </button>
              <button
                onClick={() => markAttendance(participant.user_id, false)}
                disabled={!participant.attended || sendingEmail === participant.user_id}
                className={`p-2 rounded-lg transition ${
                  !participant.attended
                    ? 'bg-red-500 text-white'
                    : 'bg-stone-200 dark:bg-[#6B7178] text-stone-600 dark:text-gray-400 hover:bg-red-500 hover:text-white'
                }`}
                title="Mark as not attended"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
