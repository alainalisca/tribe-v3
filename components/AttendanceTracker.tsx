'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { logError } from '@/lib/logger';
import { showError } from '@/lib/toast';
import { getErrorMessage } from '@/lib/errorMessages';
import { useLanguage } from '@/lib/LanguageContext';
import { fetchConfirmedParticipantsWithUsers, fetchAttendanceMarks, markAttendance } from '@/lib/dal';
import type { AttendanceStatus, MarkAttendanceError } from '@/lib/dal/attendanceMarks';
import { athleteParticipants } from '@/lib/sessionRoster';
import { markingWindowState } from '@/lib/attendance/markingWindow';
import { useAthleteValueFeature } from '@/lib/features/useAthleteValueFeature';
import { LegacyAttendanceRow, MarkAttendanceRow, type AttendanceRowPerson } from './AttendanceRows';

interface AttendanceTrackerProps {
  /**
   * sessions.creator_id. The host marks attendance; they are not an item on
   * their own checklist. See lib/sessionRoster.
   */
  creatorId: string | null;
  sessionId: string;
  isHost: boolean;
  isAdmin: boolean;
  sessionDate: string;
  sessionStartTime: string;
  sessionEndTime: string | null;
  /** sessions.duration, for the marking window when there is no end time. */
  sessionDurationMinutes?: number | null;
}

/** The athlete_value feature name for T-AV2's host attendance card. */
export const ATTENDANCE_FEATURE = 'attendance';

/**
 * Whether a session's END has come and gone, evaluated in the viewer's local
 * time. The app's market is Medellin, so on a Medellin device this is Medellin
 * local. `date + time` is parsed as a local wall-clock instant, the same idiom
 * the session reminder crons use.
 *
 * end_time is nullable. When it is missing we fall back to the START time rather
 * than silently treating the session as never-ended: a missing end is a data gap
 * we degrade around by opening attendance at the session start (a little early)
 * instead of blocking it forever. We deliberately do NOT default to "not passed".
 */
export function sessionHasEnded(
  dateIso: string,
  startTime: string,
  endTime: string | null,
  now: Date = new Date()
): boolean {
  const endClock = endTime || startTime;
  return new Date(`${dateIso}T${endClock}`) < now;
}

function refusalMessage(code: MarkAttendanceError | undefined, language: 'en' | 'es'): string | null {
  if (code === 'outside_window') {
    return language === 'es'
      ? 'La asistencia se marca desde 30 minutos antes de empezar hasta 72 horas después de terminar.'
      : 'Attendance can be marked from 30 minutes before the start until 72 hours after the end.';
  }
  if (code === 'not_participant') {
    return language === 'es'
      ? 'Esta persona ya no está confirmada en la sesión.'
      : 'This person is no longer confirmed for the session.';
  }
  return null;
}

export default function AttendanceTracker({
  sessionId,
  creatorId,
  isHost,
  isAdmin,
  sessionDate,
  sessionStartTime,
  sessionEndTime,
  sessionDurationMinutes = null,
}: AttendanceTrackerProps) {
  const supabase = createClient();
  const { t, language } = useLanguage();
  const threeState = useAthleteValueFeature(ATTENDANCE_FEATURE);
  const [participants, setParticipants] = useState<AttendanceRowPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const canManageAttendance = isHost || isAdmin;
  const windowState = markingWindowState({
    date: sessionDate,
    startTime: sessionStartTime,
    endTime: sessionEndTime,
    durationMinutes: sessionDurationMinutes,
  });
  // Flag off: the card as main shows it, after the session ends. Flag on: the
  // T-AV2 window, and an admin may still correct after it closes.
  const visible = threeState
    ? windowState === 'open' || (isAdmin && windowState === 'closed')
    : sessionHasEnded(sessionDate, sessionStartTime, sessionEndTime);

  useEffect(() => {
    if (canManageAttendance && visible) {
      loadParticipants();
    } else {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: depends on sessionId via closure
  }, [sessionId, creatorId, canManageAttendance, visible]);

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

      // Athletes only. A host row here would render the host as a checkbox on
      // their own roster and pull a host attendance row into the totals.
      // The DAL already returns confirmed rows only, so this is the host filter
      // alone rather than athleteRoster.
      const athletes = athleteParticipants(participantsData, creatorId);

      const userIds = athletes.map((p) => p.user_id).filter(Boolean);
      const marksResult = await fetchAttendanceMarks(supabase, sessionId, userIds);
      const statusByUser = new Map(
        (marksResult.success ? (marksResult.data ?? []) : []).map((r) => [r.user_id, r.status])
      );

      setParticipants(
        athletes.map((p) => {
          const rawUser = p.user;
          const userObj = Array.isArray(rawUser) ? rawUser[0] : rawUser;
          return {
            user_id: p.user_id,
            user: userObj as { id: string; name: string; avatar_url: string | null },
            status: statusByUser.get(p.user_id) ?? null,
          };
        })
      );
    } catch (error) {
      logError(error, { action: 'loadParticipants', sessionId });
    } finally {
      setLoading(false);
    }
  }

  /** Marks one person; returns whether the server accepted it. */
  async function markOne(userId: string, status: AttendanceStatus | null): Promise<boolean> {
    const result = await markAttendance(supabase, sessionId, userId, status);
    if (!result.success) {
      showError(
        refusalMessage(result.code, language) ?? getErrorMessage(new Error(result.error), 'admin_action', language)
      );
      return false;
    }
    if (status === 'attended') {
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
    return true;
  }

  async function handleMark(userId: string, status: AttendanceStatus | null) {
    setBusy(userId);
    try {
      await markOne(userId, status);
      await loadParticipants();
    } finally {
      setBusy(null);
    }
  }

  /** "Todos asistieron": everyone not yet marked becomes attended. Explicit marks are kept. */
  async function handleMarkAll() {
    setBusy('all');
    try {
      for (const p of participants.filter((x) => x.status === null)) {
        if (!(await markOne(p.user_id, 'attended'))) break;
      }
      await loadParticipants();
    } finally {
      setBusy(null);
    }
  }

  if (!canManageAttendance || !visible) return null;

  if (loading) {
    return (
      <Card className="dark:bg-tribe-card shadow-lg">
        <CardContent className="p-6">
          <p className="text-stone-500 dark:text-gray-400">{t('loadingAttendance')}</p>
        </CardContent>
      </Card>
    );
  }

  if (participants.length === 0) return null;

  const anyUnmarked = participants.some((p) => p.status === null);

  return (
    <Card className="dark:bg-tribe-card shadow-lg">
      <CardContent className="p-6">
        <h2 className="text-lg font-bold text-stone-900 dark:text-white mb-4">{t('markAttendance')}</h2>
        <p className="text-sm text-stone-600 dark:text-gray-300 mb-4">{t('markAttendanceDesc')}</p>
        {threeState && anyUnmarked && (
          <button
            type="button"
            onClick={handleMarkAll}
            disabled={busy !== null}
            className="w-full mb-3 py-3 rounded-lg bg-tribe-green text-tribe-dark font-bold disabled:opacity-60"
          >
            {language === 'es' ? 'Todos asistieron' : 'Everyone attended'}
          </button>
        )}
        <div className="space-y-2">
          {participants.map((p) =>
            threeState ? (
              <MarkAttendanceRow
                key={p.user_id}
                person={p}
                busy={busy !== null}
                language={language}
                onMark={(s) => handleMark(p.user_id, s)}
              />
            ) : (
              <LegacyAttendanceRow
                key={p.user_id}
                person={p}
                busy={busy === p.user_id}
                onMark={(s) => handleMark(p.user_id, s)}
              />
            )
          )}
        </div>
      </CardContent>
    </Card>
  );
}
