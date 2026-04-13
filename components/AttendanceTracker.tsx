'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Check, X } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { logError } from '@/lib/logger';
import { showError } from '@/lib/toast';
import { getErrorMessage } from '@/lib/errorMessages';
import { useLanguage } from '@/lib/LanguageContext';
import { fetchConfirmedParticipantsWithUsers, fetchAttendanceForSession, upsertAttendance } from '@/lib/dal';

interface AttendanceParticipant {
  user_id: string;
  user: { id: string; name: string; avatar_url: string | null } | null;
  attended: boolean;
}

interface AttendanceTrackerProps {
  sessionId: string;
  isHost: boolean;
  isAdmin: boolean;
  sessionDate: string;
}

export default function AttendanceTracker({ sessionId, isHost, isAdmin, sessionDate }: AttendanceTrackerProps) {
  const supabase = createClient();
  const { t, language } = useLanguage();
  const [participants, setParticipants] = useState<AttendanceParticipant[]>([]);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: depends on sessionId via closure
  }, [sessionId, canManageAttendance, sessionHasPassed]);

  async function loadParticipants() {
    try {
      const participantsResult = await fetchConfirmedParticipantsWithUsers(supabase, sessionId);
      if (!participantsResult.success || !participantsResult.data) {
        setParticipants([]);
        return;
      }
      const participantsData = participantsResult.data as Array<{
        user_id: string;
        user:
          | { id: string; name: string; avatar_url: string | null }
          | Array<{ id: string; name: string; avatar_url: string | null }>;
      }>;

      const userIds = participantsData.map((p) => p.user_id).filter(Boolean);
      const attendanceResult = await fetchAttendanceForSession(supabase, sessionId, userIds);
      const allAttendance = attendanceResult.success ? (attendanceResult.data ?? []) : [];

      const attendanceByUser = allAttendance.reduce(
        (acc, row) => {
          acc[row.user_id] = row.attended;
          return acc;
        },
        {} as Record<string, boolean>
      );

      const participantsWithAttendance = participantsData.map((p) => {
        const rawUser = p.user;
        const userObj = Array.isArray(rawUser) ? rawUser[0] : rawUser;
        return {
          user_id: p.user_id,
          user: userObj as { id: string; name: string; avatar_url: string | null },
          attended: attendanceByUser[p.user_id] || false,
        };
      });

      setParticipants(participantsWithAttendance);
    } catch (error) {
      logError(error, { action: 'loadParticipants', sessionId });
    } finally {
      setLoading(false);
    }
  }

  async function markAttendance(userId: string, attended: boolean) {
    try {
      setSendingEmail(userId);

      const result = await upsertAttendance(supabase, sessionId, userId, attended);
      if (!result.success) throw new Error(result.error);

      // Send email notification if marking as attended
      if (attended) {
        try {
          await fetch('/api/send-attendance-notification', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, userId }),
          });
        } catch (emailError) {
          logError(emailError, { action: 'sendAttendanceEmail', sessionId, userId });
          // Don't fail the whole operation if email fails
        }
      }

      await loadParticipants();
    } catch (error: unknown) {
      showError(getErrorMessage(error, 'admin_action', language));
    } finally {
      setSendingEmail(null);
    }
  }

  if (!canManageAttendance || !sessionHasPassed) {
    return null;
  }

  if (loading) {
    return (
      <Card className="dark:bg-tribe-card shadow-lg">
        <CardContent className="p-6">
          <p className="text-stone-500 dark:text-gray-400">{t('loadingAttendance')}</p>
        </CardContent>
      </Card>
    );
  }

  if (participants.length === 0) {
    return null;
  }

  return (
    <Card className="dark:bg-tribe-card shadow-lg">
      <CardContent className="p-6">
        <h2 className="text-lg font-bold text-stone-900 dark:text-white mb-4">{t('markAttendance')}</h2>
        <p className="text-sm text-stone-600 dark:text-gray-300 mb-4">{t('markAttendanceDesc')}</p>
        <div className="space-y-2">
          {participants.map((participant) => (
            <div
              key={participant.user_id}
              className="flex items-center justify-between p-3 bg-stone-50 dark:bg-tribe-mid rounded-lg"
            >
              <div className="flex items-center gap-3">
                <Avatar className="w-10 h-10">
                  <AvatarImage src={participant.user?.avatar_url || undefined} alt={participant.user?.name || ''} />
                  <AvatarFallback className="bg-tribe-green text-slate-900 font-bold">
                    {participant.user?.name?.[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="font-medium text-stone-900 dark:text-white">{participant.user?.name}</span>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => markAttendance(participant.user_id, true)}
                  disabled={participant.attended || sendingEmail === participant.user_id}
                  className={`p-2 rounded-lg transition ${
                    participant.attended
                      ? 'bg-green-500 text-white'
                      : 'bg-stone-200 dark:bg-tribe-card text-stone-600 dark:text-gray-400 hover:bg-green-500 hover:text-white'
                  }`}
                  title="Mark as attended"
                  aria-label={`Mark ${participant.user?.name || 'athlete'} as attended`}
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
                      : 'bg-stone-200 dark:bg-tribe-card text-stone-600 dark:text-gray-400 hover:bg-red-500 hover:text-white'
                  }`}
                  title="Mark as not attended"
                  aria-label={`Mark ${participant.user?.name || 'athlete'} as not attended`}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
