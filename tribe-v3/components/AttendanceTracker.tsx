'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { CheckCircle, XCircle, Users } from 'lucide-react';
import Link from 'next/link';

interface AttendanceTrackerProps {
  sessionId: string;
  isHost: boolean;
  isAdmin: boolean;
  sessionDate: string;
}

export default function AttendanceTracker({ sessionId, isHost, isAdmin, sessionDate }: AttendanceTrackerProps) {
  const supabase = createClient();
  const [participants, setParticipants] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasMarked, setHasMarked] = useState(false);

  const canMark = isHost || isAdmin;
  const sessionPassed = new Date(sessionDate) < new Date();

  useEffect(() => {
    loadParticipants();
  }, [sessionId]);

  async function loadParticipants() {
    try {
      // Get confirmed participants
      const { data: participants, error } = await supabase
        .from('session_participants')
        .select(`
          user_id,
          user:users(id, name, avatar_url)
        `)
        .eq('session_id', sessionId)
        .eq('status', 'confirmed');

      if (error) throw error;

      // Get existing attendance records
      const { data: attendanceData } = await supabase
        .from('session_attendance')
        .select('user_id, attended, marked_at')
        .eq('session_id', sessionId);

      const attendanceMap: Record<string, boolean> = {};
      let marked = false;

      attendanceData?.forEach(a => {
        attendanceMap[a.user_id] = a.attended;
        if (a.marked_at) marked = true;
      });

      setParticipants(participants || []);
      setAttendance(attendanceMap);
      setHasMarked(marked);
    } catch (error) {
      console.error('Error loading participants:', error);
    } finally {
      setLoading(false);
    }
  }

  async function toggleAttendance(userId: string) {
    const newStatus = !attendance[userId];
    
    setAttendance(prev => ({
      ...prev,
      [userId]: newStatus
    }));
  }

  async function saveAttendance() {
    if (!canMark) return;

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Upsert attendance for all participants
      const records = participants.map(p => ({
        session_id: sessionId,
        user_id: p.user_id,
        attended: attendance[p.user_id] || false,
        marked_by: user?.id,
        marked_at: new Date().toISOString()
      }));

      const { error } = await supabase
        .from('session_attendance')
        .upsert(records, { onConflict: 'session_id,user_id' });

      if (error) throw error;

      alert('✅ Attendance saved!');
      setHasMarked(true);
    } catch (error: any) {
      alert('❌ Error: ' + error.message);
    } finally {
      setSaving(false);
    }
  }

  if (!sessionPassed && !isAdmin) {
    return (
      <div className="bg-stone-100 dark:bg-[#52575D] rounded-xl p-6 text-center">
        <Users className="w-12 h-12 text-stone-400 mx-auto mb-2" />
        <p className="text-sm text-stone-600 dark:text-gray-300">
          Attendance tracking will be available after the session ends
        </p>
      </div>
    );
  }

  if (!canMark) {
    return null;
  }

  if (loading) {
    return (
      <div className="bg-white dark:bg-[#6B7178] rounded-xl p-6">
        <p className="text-center text-stone-600">Loading...</p>
      </div>
    );
  }

  if (participants.length === 0) {
    return (
      <div className="bg-white dark:bg-[#6B7178] rounded-xl p-6 text-center">
        <p className="text-sm text-stone-600">No confirmed participants yet</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-[#6B7178] rounded-xl p-6 shadow-lg">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-stone-900 dark:text-white">
          Mark Attendance
        </h2>
        {hasMarked && (
          <span className="text-xs px-2 py-1 bg-green-100 text-green-800 rounded">
            ✓ Marked
          </span>
        )}
      </div>

      <div className="space-y-2 mb-4">
        {participants.map((participant) => {
          const attended = attendance[participant.user_id];
          
          return (
            <div
              key={participant.user_id}
              className="flex items-center justify-between p-3 bg-stone-50 dark:bg-[#52575D] rounded-lg"
            >
              <Link href={`/profile/${participant.user_id}`} className="flex items-center gap-3 flex-1">
                {participant.user?.avatar_url ? (
                  <img
                    src={participant.user.avatar_url}
                    alt={participant.user.name}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-tribe-green flex items-center justify-center text-slate-900 font-bold">
                    {participant.user?.name?.[0]?.toUpperCase() || 'U'}
                  </div>
                )}
                <div>
                  <p className="font-medium text-stone-900 dark:text-white">
                    {participant.user?.name || 'Unknown'}
                  </p>
                </div>
              </Link>

              <div className="flex gap-2">
                <button
                  onClick={() => toggleAttendance(participant.user_id)}
                  className={`px-4 py-2 rounded-lg font-medium transition ${
                    attended === true
                      ? 'bg-green-500 text-white'
                      : 'bg-stone-200 text-stone-600 hover:bg-stone-300'
                  }`}
                >
                  <CheckCircle className="w-5 h-5" />
                </button>
                <button
                  onClick={() => toggleAttendance(participant.user_id)}
                  className={`px-4 py-2 rounded-lg font-medium transition ${
                    attended === false
                      ? 'bg-red-500 text-white'
                      : 'bg-stone-200 text-stone-600 hover:bg-stone-300'
                  }`}
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <button
        onClick={saveAttendance}
        disabled={saving}
        className="w-full py-3 bg-tribe-green text-slate-900 font-bold rounded-lg hover:bg-lime-500 transition disabled:opacity-50"
      >
        {saving ? 'Saving...' : hasMarked ? 'Update Attendance' : 'Save Attendance'}
      </button>

      <p className="text-xs text-stone-500 text-center mt-2">
        Mark who actually showed up to the session
      </p>
    </div>
  );
}
